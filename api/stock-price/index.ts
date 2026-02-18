import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

const TIMEOUT_MS = 10000;

function buildStooqSymbol(symbol: string, market: string): string {
  const m = market.toUpperCase();
  if (m === "KR" || m === "KRX" || m === "KOSPI" || m === "KOSDAQ") {
    return `${symbol}.kr`;
  }
  if (m === "US" || m === "NASDAQ" || m === "NYSE") {
    return `${symbol.toLowerCase()}.us`;
  }
  return symbol.toLowerCase();
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

export async function stockPriceHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const q = req.query as unknown as Record<string, string | undefined>;
  const symbol = (q["symbol"] ?? "").trim();
  const market = (q["market"] ?? "").trim();

  if (!symbol) {
    return json(400, { error: "symbol is required" });
  }
  if (!market) {
    return json(400, { error: "market is required (KR or US)" });
  }

  const stooqSymbol = buildStooqSymbol(symbol, market);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return json(502, { error: "Stooq returned non-OK response" });
    }

    const text = await response.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      return json(404, { error: "No price data available", symbol: stooqSymbol });
    }

    const headers = lines[0].split(",");
    const values = lines[1].split(",");
    const closeIdx = headers.findIndex((h) => h.trim().toLowerCase() === "close");
    const closeValue = Number(values[closeIdx >= 0 ? closeIdx : 6]);

    if (Number.isNaN(closeValue) || closeValue <= 0) {
      return json(404, { error: "Invalid price data", symbol: stooqSymbol, raw: lines[1] });
    }

    // Also get USD/KRW rate if this is a US stock
    let fxRate: number | null = null;
    if (market.toUpperCase() === "US" || market.toUpperCase() === "NASDAQ" || market.toUpperCase() === "NYSE") {
      try {
        const fxUrl = `https://stooq.com/q/l/?s=usdkrw&f=sd2t2ohlcv&h&e=csv`;
        const fxResp = await fetch(fxUrl, { signal: controller.signal });
        if (fxResp.ok) {
          const fxText = await fxResp.text();
          const fxLines = fxText.trim().split("\n");
          if (fxLines.length >= 2) {
            const fxHeaders = fxLines[0].split(",");
            const fxValues = fxLines[1].split(",");
            const fxCloseIdx = fxHeaders.findIndex((h) => h.trim().toLowerCase() === "close");
            const fxClose = Number(fxValues[fxCloseIdx >= 0 ? fxCloseIdx : 6]);
            if (!Number.isNaN(fxClose) && fxClose > 0) {
              fxRate = Math.round(fxClose * 100) / 100;
            }
          }
        }
      } catch {
        // ignore FX fetch failure
      }
    }

    context.log(`Stock price lookup: ${stooqSymbol} = ${closeValue}${fxRate ? `, FX=${fxRate}` : ""}`);

    return json(200, {
      data: {
        symbol: symbol.toUpperCase(),
        market: market.toUpperCase(),
        price: closeValue,
        fxRate,
        stooqSymbol
      },
      error: null
    });
  } catch (err: unknown) {
    context.log("Stock price lookup error:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  } finally {
    clearTimeout(timeout);
  }
}
