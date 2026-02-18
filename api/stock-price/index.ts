import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

const TIMEOUT_MS = 10000;

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

/* ── Korean stock price via Naver Finance API ── */
async function fetchKrPrice(symbol: string, signal: AbortSignal): Promise<{ price: number; name: string } | null> {
  const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(symbol)}/basic`;
  const resp = await fetch(url, {
    signal,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!resp.ok) return null;
  const data = await resp.json() as Record<string, unknown>;
  const raw = String(data.closePrice ?? "").replace(/,/g, "");
  const price = Number(raw);
  if (Number.isNaN(price) || price <= 0) return null;
  return { price, name: String(data.stockName ?? "") };
}

/* ── US stock price via Stooq CSV API ── */
async function fetchUsPrice(symbol: string, signal: AbortSignal): Promise<number | null> {
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) return null;
  const text = await resp.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const headers = lines[0].split(",");
  const values = lines[1].split(",");
  const closeIdx = headers.findIndex((h) => h.trim().toLowerCase() === "close");
  const closeValue = Number(values[closeIdx >= 0 ? closeIdx : 6]);
  if (Number.isNaN(closeValue) || closeValue <= 0) return null;
  return closeValue;
}

/* ── USD/KRW exchange rate via Stooq ── */
async function fetchUsdKrw(signal: AbortSignal): Promise<number | null> {
  try {
    const url = `https://stooq.com/q/l/?s=usdkrw&f=sd2t2ohlcv&h&e=csv`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;
    const text = await resp.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(",");
    const values = lines[1].split(",");
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === "close");
    const val = Number(values[idx >= 0 ? idx : 6]);
    if (Number.isNaN(val) || val <= 0) return null;
    return Math.round(val * 100) / 100;
  } catch {
    return null;
  }
}

export async function stockPriceHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const q = req.query as unknown as Record<string, string | undefined>;
  const symbol = (q["symbol"] ?? "").trim();
  const market = (q["market"] ?? "").trim().toUpperCase();

  if (!symbol) {
    return json(400, { error: "symbol is required" });
  }
  if (!market) {
    return json(400, { error: "market is required (KR or US)" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    if (market === "KR" || market === "KRX" || market === "KOSPI" || market === "KOSDAQ") {
      /* ── Korean stock ── */
      const result = await fetchKrPrice(symbol, controller.signal);
      if (!result) {
        return json(404, { error: "No price data available", symbol });
      }
      context.log(`KR stock price: ${symbol} (${result.name}) = ${result.price}`);
      return json(200, {
        data: {
          symbol: symbol.toUpperCase(),
          market: "KR",
          price: result.price,
          fxRate: null,
          stockName: result.name
        },
        error: null
      });
    } else {
      /* ── US stock (Stooq) ── */
      const price = await fetchUsPrice(symbol, controller.signal);
      if (price === null) {
        return json(404, { error: "Invalid ticker", symbol });
      }
      const fxRate = await fetchUsdKrw(controller.signal);
      context.log(`US stock price: ${symbol} = ${price} USD${fxRate ? `, FX=${fxRate}` : ""}`);
      return json(200, {
        data: {
          symbol: symbol.toUpperCase(),
          market: "US",
          price,
          fxRate,
          stooqSymbol: `${symbol.toLowerCase()}.us`
        },
        error: null
      });
    }
  } catch (err: unknown) {
    context.log("Stock price lookup error:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  } finally {
    clearTimeout(timeout);
  }
}
