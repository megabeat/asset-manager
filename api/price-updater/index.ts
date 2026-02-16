import { InvocationContext, Timer } from "@azure/functions";
import { getContainer } from "../shared/cosmosClient";

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

export async function priceUpdater(timer: Timer, context: InvocationContext): Promise<void> {
  if (timer.isPastDue) {
    context.log("Price updater is running late.");
  }

  const assetsContainer = getContainer("assets");
  const historyContainer = getContainer("assetHistory");

  // ── 1. Auto-update investment prices (existing) ──
  const query = {
    query:
      "SELECT * FROM c WHERE c.type = 'Asset' AND c.category = 'investment' AND c.autoUpdate = true AND c.priceSource = 'stooq'",
    parameters: []
  };

  const { resources } = await assetsContainer.items.query(query).fetchAll();
  const assets = resources as AssetItem[];

  for (const asset of assets) {
    const price = await resolvePrice(asset);
    if (price === null) {
      continue;
    }

    const quantity = asset.quantity ?? 1;
    const newValue = price * quantity;
    const updatedAt = new Date().toISOString();

    const updatedAsset = {
      ...asset,
      currentValue: newValue,
      valuationDate: updatedAt.slice(0, 10),
      updatedAt
    };

    await assetsContainer.item(asset.id, asset.userId).replace(updatedAsset);

    const historyItem = {
      id: `${asset.id}-${updatedAt}`,
      userId: asset.userId,
      assetId: asset.id,
      type: "AssetHistory",
      value: newValue,
      quantity,
      recordedAt: updatedAt,
      note: "auto price update",
      createdAt: updatedAt
    };

    await historyContainer.items.create(historyItem);
  }

  // ── 2. Update USD/KRW exchange rate for stock_us assets ──
  const fxRate = await fetchUsdKrwRate();
  if (fxRate === null) {
    context.log("Failed to fetch USD/KRW rate, skipping FX update.");
    return;
  }

  context.log(`Fetched USD/KRW rate: ${fxRate}`);

  const fxQuery = {
    query:
      "SELECT * FROM c WHERE c.type = 'Asset' AND c.category = 'stock_us' AND c.usdAmount > 0",
    parameters: []
  };

  const { resources: usAssets } = await assetsContainer.items.query(fxQuery).fetchAll();
  const stockUsAssets = usAssets as AssetItem[];

  for (const asset of stockUsAssets) {
    const usd = asset.usdAmount ?? 0;
    if (usd <= 0) continue;

    const oldRate = asset.exchangeRate ?? 0;
    const newValue = Math.round(usd * fxRate);
    const updatedAt = new Date().toISOString();

    // Skip if rate barely changed (< 0.1%)
    if (oldRate > 0 && Math.abs(fxRate - oldRate) / oldRate < 0.001) {
      continue;
    }

    const updatedAsset = {
      ...asset,
      exchangeRate: Math.round(fxRate * 100) / 100,
      currentValue: newValue,
      valuationDate: updatedAt.slice(0, 10),
      updatedAt
    };

    await assetsContainer.item(asset.id, asset.userId).replace(updatedAsset);

    const historyItem = {
      id: `${asset.id}-fx-${updatedAt}`,
      userId: asset.userId,
      assetId: asset.id,
      type: "AssetHistory",
      value: newValue,
      quantity: asset.quantity ?? 1,
      recordedAt: updatedAt,
      note: `auto FX update (${oldRate.toFixed(2)} → ${fxRate.toFixed(2)} KRW/USD)`,
      createdAt: updatedAt
    };

    await historyContainer.items.create(historyItem);

    context.log(`Updated ${asset.id}: rate ${oldRate} → ${fxRate}, value → ${newValue}`);
  }
}

