const crypto = require("crypto");
if (!global.crypto) {
  global.crypto = crypto;
}

const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = process.env.COSMOS_DATABASE_ID || "AssetManagement";
const applyMode = process.argv.includes("--apply");

if (!endpoint || !key) {
  console.error("Missing COSMOS_ENDPOINT or COSMOS_KEY environment variables");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const assetsContainer = client.database(databaseId).container("assets");

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CATEGORY_MAP = {
  cash: "cash",
  현금: "cash",

  deposit: "deposit",
  예금: "deposit",
  입출금: "deposit",
  입출금통장: "deposit",

  stock: "stock_kr",
  stocks: "stock_kr",
  주식: "stock_kr",
  국내주식: "stock_kr",
  korean_stock: "stock_kr",
  stock_kr: "stock_kr",

  us_stock: "stock_us",
  us_stocks: "stock_us",
  미국주식: "stock_us",
  해외주식: "stock_us",
  stock_us: "stock_us",

  real_estate: "real_estate",
  realestate: "real_estate",
  부동산: "real_estate",

  etc: "etc",
  기타: "etc",
  other: "etc",

  pension: "pension",
  연금: "pension",

  pension_national: "pension_national",
  국민연금: "pension_national",

  pension_personal: "pension_personal",
  개인연금: "pension_personal",

  pension_retirement: "pension_retirement",
  퇴직연금: "pension_retirement",
  ipa: "pension_retirement"
};

function toCanonicalCategory(category) {
  const normalized = normalizeCategory(category);
  return CATEGORY_MAP[normalized] || null;
}

async function loadAssets() {
  const querySpec = {
    query: "SELECT * FROM c WHERE IS_DEFINED(c.category)"
  };
  const { resources } = await assetsContainer.items.query(querySpec).fetchAll();
  return resources;
}

async function main() {
  console.log("Starting asset category normalization...");
  console.log(`Mode: ${applyMode ? "APPLY" : "DRY-RUN"}`);

  const assets = await loadAssets();
  let total = 0;
  let unchanged = 0;
  let unknown = 0;
  let changed = 0;
  const unknownCategories = new Set();

  for (const asset of assets) {
    total += 1;

    const originalCategory = String(asset.category || "");
    const canonicalCategory = toCanonicalCategory(originalCategory);

    if (!canonicalCategory) {
      unknown += 1;
      unknownCategories.add(originalCategory || "<empty>");
      continue;
    }

    if (originalCategory === canonicalCategory) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    console.log(`[CHANGE] ${asset.id} (${asset.userId}) : '${originalCategory}' -> '${canonicalCategory}'`);

    if (applyMode) {
      const updated = {
        ...asset,
        category: canonicalCategory,
        updatedAt: new Date().toISOString()
      };
      await assetsContainer.item(asset.id, asset.userId).replace(updated);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Total: ${total}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Changed: ${changed}`);
  console.log(`Unknown: ${unknown}`);

  if (unknownCategories.size > 0) {
    console.log("\nUnknown category values:");
    for (const value of [...unknownCategories].sort()) {
      console.log(`- ${value}`);
    }
  }

  if (!applyMode) {
    console.log("\nDry-run only. Run with --apply to persist changes.");
  } else {
    console.log("\nCategory normalization applied successfully.");
  }
}

main().catch((error) => {
  console.error("Normalization failed:", error.message);
  process.exit(1);
});
