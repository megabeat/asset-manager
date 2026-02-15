import { app, InvocationContext, Timer } from "@azure/functions";
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

export async function priceUpdater(timer: Timer, context: InvocationContext): Promise<void> {
  if (timer.isPastDue) {
    context.log("Price updater is running late.");
  }

  const assetsContainer = getContainer("assets");
  const historyContainer = getContainer("assetHistory");

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
}

app.timer("priceUpdater", {
  schedule: "0 0 22 * * *",
  handler: priceUpdater
});
