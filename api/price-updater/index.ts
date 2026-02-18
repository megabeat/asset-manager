import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../shared/cosmosClient";

/**
 * Price updater — called via GitHub Actions cron on weekdays.
 *
 * 1. Updates USD/KRW exchange rate for all stock_us assets with usdAmount > 0.
 * 2. Updates prices for investment assets with autoUpdate + priceSource = stooq.
 */

const DEFAULT_TIMEOUT_MS = 15000;

type AssetItem = {
  id: string;
  userId: string;
  category: string;
  symbol?: string;
  exchange?: string;
  priceSource?: string;
  autoUpdate?: boolean;
  quantity?: number | null;
  currentValue?: number;
  exchangeRate?: number | null;
  usdAmount?: number | null;
};

function buildStooqSymbol(symbol: string, exchange?: string): string {
  if (!exchange) {
    return symbol.toLowerCase();
  }

  const normalized = exchange.toUpperCase();
  if (normalized === "NASDAQ" || normalized === "NYSE") {
    return `${symbol.toLowerCase()}.us`;
  }
  if (normalized === "KRX" || normalized === "KOSPI" || normalized === "KOSDAQ") {
    return `${symbol}.kr`;
  }

  return symbol.toLowerCase();
}

async function fetchStooqPrice(symbol: string, exchange?: string): Promise<number | null> {
  const stooqSymbol = buildStooqSymbol(symbol, exchange);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      return null;
    }

    const fields = lines[1].split(",");
    const closeIndex = 6;
    const closeValue = Number(fields[closeIndex]);
    return Number.isNaN(closeValue) ? null : closeValue;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePrice(asset: AssetItem): Promise<number | null> {
  if (!asset.symbol) {
    return null;
  }

  const source = (asset.priceSource ?? "").toLowerCase();
  if (source === "stooq") {
    return fetchStooqPrice(asset.symbol, asset.exchange);
  }

  return null;
}

async function fetchUsdKrwRate(): Promise<number | null> {
  // stooq symbol for USD/KRW
  return fetchStooqPrice("usdkrw");
}

async function fetchNaverPrice(symbol: string): Promise<number | null> {
  const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(symbol)}/basic`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    const raw = String(data.closePrice ?? "").replace(/,/g, "");
    const price = Number(raw);
    return (Number.isNaN(price) || price <= 0) ? null : price;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function priceUpdater(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const h = req.headers as unknown as Record<string, string | undefined>;
  try {
  // ── Auth: require API_SECRET token when called without SWA auth ──
  const apiSecret = process.env.API_SECRET;
  if (apiSecret) {
    const authHeader = h["x-api-key"] ?? "";
    if (authHeader !== apiSecret) {
      return { status: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };
    }
  }

  const assetsContainer = getContainer("assets");
  const historyContainer = getContainer("assetHistory");
  const results: string[] = [];
  let updatedCount = 0;
  let errorCount = 0;

  // ── 1. Auto-update investment prices (stooq) ──
  try {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'Asset' AND c.category = 'investment' AND c.autoUpdate = true AND c.priceSource = 'stooq'",
      parameters: []
    };

    const { resources } = await assetsContainer.items.query(query).fetchAll();
    const assets = resources as AssetItem[];

    for (const asset of assets) {
      try {
        const price = await resolvePrice(asset);
        if (price === null) {
          results.push(`SKIP ${asset.id}: price fetch failed`);
          continue;
        }

        const quantity = asset.quantity ?? 1;
        const newValue = price * quantity;
        const updatedAt = new Date().toISOString();

        await assetsContainer.item(asset.id, asset.userId).replace({
          ...asset,
          currentValue: newValue,
          valuationDate: updatedAt.slice(0, 10),
          updatedAt
        });

        await historyContainer.items.create({
          id: `${asset.id}-${updatedAt}`,
          userId: asset.userId,
          assetId: asset.id,
          type: "AssetHistory",
          value: newValue,
          quantity,
          recordedAt: updatedAt,
          note: "auto price update",
          createdAt: updatedAt
        });

        updatedCount++;
        results.push(`OK ${asset.id}: ${asset.symbol} → ${newValue.toLocaleString()}원`);
      } catch (err: unknown) {
        errorCount++;
        results.push(`ERR ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (queryErr: unknown) {
    context.log("Investment query error:", queryErr);
    results.push(`ERR investment query: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`);
  }

  // ── 2. Auto-update Korean stock prices (stock_kr with autoUpdate) ──
  try {
    const krQuery = {
      query:
        "SELECT * FROM c WHERE c.type = 'Asset' AND c.category = 'stock_kr' AND c.autoUpdate = true",
      parameters: []
    };

    const { resources: krResources } = await assetsContainer.items.query(krQuery).fetchAll();
    const krAssets = krResources as AssetItem[];

    for (const asset of krAssets) {
      try {
        if (!asset.symbol) {
          results.push(`SKIP ${asset.id}: no symbol`);
          continue;
        }

        const price = await fetchNaverPrice(asset.symbol);
        if (price === null) {
          results.push(`SKIP ${asset.id}: KR price fetch failed for ${asset.symbol}`);
          continue;
        }

        const quantity = asset.quantity ?? 1;
        const newValue = Math.round(price * quantity);
        const updatedAt = new Date().toISOString();

        await assetsContainer.item(asset.id, asset.userId).replace({
          ...asset,
          currentValue: newValue,
          acquiredValue: price,
          valuationDate: updatedAt.slice(0, 10),
          updatedAt
        });

        await historyContainer.items.create({
          id: `${asset.id}-${updatedAt}`,
          userId: asset.userId,
          assetId: asset.id,
          type: "AssetHistory",
          value: newValue,
          quantity,
          recordedAt: updatedAt,
          note: `auto KR price update (${asset.symbol}: ${price.toLocaleString()}원)`,
          createdAt: updatedAt
        });

        updatedCount++;
        results.push(`OK ${asset.id}: ${asset.symbol} → ${price.toLocaleString()}원 × ${quantity} = ${newValue.toLocaleString()}원`);
      } catch (err: unknown) {
        errorCount++;
        results.push(`ERR ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (queryErr: unknown) {
    context.log("KR stock query error:", queryErr);
    results.push(`ERR KR stock query: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`);
  }

  // ── 3. Update USD/KRW exchange rate for stock_us assets ──
  const fxRate = await fetchUsdKrwRate();
  if (fxRate === null) {
    context.log("Failed to fetch USD/KRW rate, skipping FX update.");
    results.push("SKIP FX: USD/KRW rate fetch failed");
  } else {
    context.log(`Fetched USD/KRW rate: ${fxRate}`);
    results.push(`FX rate: 1 USD = ${fxRate.toFixed(2)} KRW`);

    try {
      const fxQuery = {
        query:
          "SELECT * FROM c WHERE c.type = 'Asset' AND c.category = 'stock_us' AND c.usdAmount > 0",
        parameters: []
      };

      const { resources: usAssets } = await assetsContainer.items.query(fxQuery).fetchAll();
      const stockUsAssets = usAssets as AssetItem[];

      for (const asset of stockUsAssets) {
        try {
          const usd = asset.usdAmount ?? 0;
          if (usd <= 0) continue;

          const oldRate = asset.exchangeRate ?? 0;
          const newValue = Math.round(usd * fxRate);
          const updatedAt = new Date().toISOString();

          // Skip if rate barely changed (< 0.1%)
          if (oldRate > 0 && Math.abs(fxRate - oldRate) / oldRate < 0.001) {
            results.push(`SKIP ${asset.id}: rate change < 0.1%`);
            continue;
          }

          await assetsContainer.item(asset.id, asset.userId).replace({
            ...asset,
            exchangeRate: Math.round(fxRate * 100) / 100,
            currentValue: newValue,
            valuationDate: updatedAt.slice(0, 10),
            updatedAt
          });

          await historyContainer.items.create({
            id: `${asset.id}-fx-${updatedAt}`,
            userId: asset.userId,
            assetId: asset.id,
            type: "AssetHistory",
            value: newValue,
            quantity: asset.quantity ?? 1,
            recordedAt: updatedAt,
            note: `auto FX update (${oldRate.toFixed(2)} → ${fxRate.toFixed(2)} KRW/USD)`,
            createdAt: updatedAt
          });

          updatedCount++;
          results.push(`OK ${asset.id}: ${usd} USD × ${fxRate.toFixed(2)} = ${newValue.toLocaleString()}원`);
        } catch (err: unknown) {
          errorCount++;
          results.push(`ERR ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (queryErr: unknown) {
      context.log("FX query error:", queryErr);
      results.push(`ERR FX query: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`);
    }
  }

  context.log(`Price updater done: ${updatedCount} updated, ${errorCount} errors`);

  return {
    status: errorCount > 0 ? 207 : 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      message: `Price update complete: ${updatedCount} updated, ${errorCount} errors`,
      updatedCount,
      errorCount,
      details: results
    })
  };
  } catch (fatalErr: unknown) {
    context.log("FATAL price-updater error:", fatalErr);
    return {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "Internal server error",
        message: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
        stack: fatalErr instanceof Error ? fatalErr.stack : undefined,
        envCheck: {
          hasCosmos: !!(process.env.COSMOS_CONNECTION_STRING || process.env.COSMOS_ENDPOINT),
          hasDbId: !!(process.env.COSMOS_DATABASE_ID || process.env.COSMOS_DATABASE),
          hasApiSecret: !!process.env.API_SECRET,
          nodeVersion: process.version,
        }
      })
    };
  }
}

