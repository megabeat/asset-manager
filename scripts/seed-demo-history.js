/**
 * seed-demo-history.js
 *
 * Generates 6 months of fabricated asset-history data for the demo user
 * so the dashboard charts (asset trend, monthly change, snapshots,
 * category trend, stock trends) show meaningful content.
 *
 * Usage:
 *   COSMOS_ENDPOINT=... COSMOS_KEY=... COSMOS_DATABASE_ID=... node seed-demo-history.js
 *
 * Optional:
 *   DEMO_USER_ID=demo-visitor
 *   --clean   (delete existing assetHistory for demo user first)
 */

const crypto = require("crypto");
if (!global.crypto) global.crypto = crypto;

const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = process.env.COSMOS_DATABASE_ID || "AssetManagement";
const userId = process.env.DEMO_USER_ID || "demo-visitor";
const doClean = process.argv.includes("--clean");

if (!endpoint || !key) {
  console.error("Missing COSMOS_ENDPOINT or COSMOS_KEY");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const db = client.database(databaseId);

function uuid() {
  return crypto.randomUUID();
}

// ============================================================
// CONFIG: 6 months back from today
// ============================================================
const MONTHS_BACK = 6;
const now = new Date();

function monthsAgo(n) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - n);
  return d;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Random walk: value fluctuates ±pct around base, trending upward
function generateTimeSeries(baseValue, months, pointsPerMonth, volatilityPct, trendPct) {
  const points = [];
  let value = baseValue;
  const dailyTrend = 1 + (trendPct / 100) / 30;
  const vol = volatilityPct / 100;

  for (let m = months; m >= 0; m--) {
    const monthDate = monthsAgo(m);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const step = Math.max(1, Math.floor(daysInMonth / pointsPerMonth));

    for (let d = 1; d <= daysInMonth; d += step) {
      const jitter = (Math.random() - 0.45) * vol; // slight upward bias
      value = value * (dailyTrend + jitter);
      value = Math.max(value * 0.5, value); // floor at 50% of current

      const date = new Date(year, month, d, 10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
      if (date > now) continue;

      points.push({
        date,
        value: Math.round(value)
      });
    }
  }
  return points;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=== Demo History Seed ===");
  console.log(`Target userId: ${userId}`);
  console.log(`Database: ${databaseId}`);
  console.log(`Months: ${MONTHS_BACK}\n`);

  // 1. Read existing assets for this user
  const assetsContainer = db.container("assets");
  const { resources: assets } = await assetsContainer.items.query({
    query: "SELECT c.id, c.name, c.category, c.currentValue FROM c WHERE c.userId = @u AND c.type = 'Asset'",
    parameters: [{ name: "@u", value: userId }]
  }).fetchAll();

  if (assets.length === 0) {
    console.error("No assets found for user. Run seed-demo-data.js first!");
    process.exit(1);
  }

  console.log(`Found ${assets.length} assets\n`);

  const historyContainer = db.container("assetHistory");

  // 2. Clean existing history if requested
  if (doClean) {
    console.log("🗑  Cleaning existing assetHistory ...");
    try {
      const { resources: existing } = await historyContainer.items.query({
        query: "SELECT c.id, c.assetId FROM c WHERE c.userId = @u",
        parameters: [{ name: "@u", value: userId }]
      }).fetchAll();

      let deleted = 0;
      for (const item of existing) {
        // Try different partition key forms (hierarchical vs simple)
        try {
          await historyContainer.item(item.id, [userId, item.assetId]).delete();
          deleted++;
        } catch {
          try {
            await historyContainer.item(item.id, userId).delete();
            deleted++;
          } catch {
            try {
              await historyContainer.item(item.id, [userId]).delete();
              deleted++;
            } catch (e) {
              // skip
            }
          }
        }
      }
      console.log(`  ✓ Deleted ${deleted} history items\n`);
    } catch (e) {
      console.warn("  ⚠ Clean failed:", e.message);
    }
  }

  // 3. Generate history per asset
  const allRecords = [];
  const volatilityByCategory = {
    stock_kr: { vol: 3.5, trend: 0.8, ppMonth: 20 },
    stock_us: { vol: 4.0, trend: 1.2, ppMonth: 20 },
    realestate_kr: { vol: 0.3, trend: 0.4, ppMonth: 4 },
    realestate_us: { vol: 0.5, trend: 0.5, ppMonth: 4 },
    deposit: { vol: 0.05, trend: 0.35, ppMonth: 4 },
    cash: { vol: 0.1, trend: 0.0, ppMonth: 4 },
    car: { vol: 0.1, trend: -0.5, ppMonth: 4 },
    pension_national: { vol: 0.2, trend: 0.5, ppMonth: 4 },
    pension_personal: { vol: 1.5, trend: 0.7, ppMonth: 8 },
    pension_retirement: { vol: 1.0, trend: 0.6, ppMonth: 8 },
    etc: { vol: 0.5, trend: 0.2, ppMonth: 4 },
  };

  for (const asset of assets) {
    const cat = asset.category || "etc";
    const config = volatilityByCategory[cat] || volatilityByCategory.etc;

    // Start value = current value adjusted back ~6 months of trend
    const startValue = asset.currentValue / Math.pow(1 + config.trend / 100, MONTHS_BACK * 30);

    const series = generateTimeSeries(startValue, MONTHS_BACK, config.ppMonth, config.vol, config.trend);

    // Create daily history records
    for (const point of series) {
      allRecords.push({
        id: uuid(),
        userId,
        assetId: asset.id,
        type: "AssetHistory",
        value: point.value,
        quantity: null,
        recordedAt: point.date.toISOString(),
        note: "price update",
        isWindowRecord: false,
        isMonthlySnapshot: false,
      });
    }

    console.log(`  ${asset.name} (${cat}): ${series.length} daily points`);
  }

  // 4. Generate monthly window records (for monthly-change chart)
  console.log("\n📊 Generating monthly window records ...");
  const monthKeys = [];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    monthKeys.push(getMonthKey(monthsAgo(m)));
  }

  for (const monthKey of monthKeys) {
    for (const asset of assets) {
      // Find the last data point in this month for this asset
      const monthRecords = allRecords.filter(
        r => r.assetId === asset.id && r.recordedAt.startsWith(monthKey) && !r.isWindowRecord
      );
      if (monthRecords.length === 0) continue;

      const last = monthRecords[monthRecords.length - 1];

      // Find previous month's last value
      const prevMonthIdx = monthKeys.indexOf(monthKey) - 1;
      let prevValue = 0;
      if (prevMonthIdx >= 0) {
        const prevMonth = monthKeys[prevMonthIdx];
        const prevRecords = allRecords.filter(
          r => r.assetId === asset.id && r.recordedAt.startsWith(prevMonth) && !r.isWindowRecord
        );
        if (prevRecords.length > 0) {
          prevValue = prevRecords[prevRecords.length - 1].value;
        }
      }

      allRecords.push({
        id: uuid(),
        userId,
        assetId: asset.id,
        type: "AssetHistory",
        value: last.value,
        quantity: null,
        recordedAt: last.recordedAt,
        windowMonth: monthKey,
        monthlyDelta: last.value - prevValue,
        note: "monthly window",
        isWindowRecord: true,
        isMonthlySnapshot: false,
      });
    }
  }

  // 5. Generate monthly snapshots (aggregate across all assets per month)
  console.log("📈 Generating monthly snapshots ...");
  for (const monthKey of monthKeys) {
    const windowRecords = allRecords.filter(
      r => r.windowMonth === monthKey && r.isWindowRecord
    );
    if (windowRecords.length === 0) continue;

    const totalValue = windowRecords.reduce((sum, r) => sum + r.value, 0);
    const totalDelta = windowRecords.reduce((sum, r) => sum + (r.monthlyDelta || 0), 0);
    const lastRecordedAt = windowRecords.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0].recordedAt;

    allRecords.push({
      id: uuid(),
      userId,
      assetId: "snapshot",
      type: "AssetHistory",
      value: totalValue,
      recordedAt: lastRecordedAt,
      windowMonth: monthKey,
      monthlyDelta: totalDelta,
      isWindowRecord: true,
      isMonthlySnapshot: true,
      note: "monthly snapshot",
    });
  }

  // 6. Insert all records
  const totalRecords = allRecords.length;
  console.log(`\n📦 Inserting ${totalRecords} history records ...`);

  let ok = 0;
  let fail = 0;
  const BATCH = 20;

  for (let i = 0; i < allRecords.length; i += BATCH) {
    const batch = allRecords.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(record => historyContainer.items.upsert(record))
    );
    for (const r of results) {
      if (r.status === "fulfilled") ok++;
      else {
        fail++;
        if (fail <= 3) console.error("  ✗", r.reason?.message?.slice(0, 100));
      }
    }

    // Progress
    if ((i + BATCH) % 200 === 0 || i + BATCH >= allRecords.length) {
      process.stdout.write(`  ${Math.min(i + BATCH, allRecords.length)}/${totalRecords}\r`);
    }
  }

  console.log(`\n\n✅ Done! ${ok} inserted, ${fail} failed`);

  // Summary
  const dailyCount = allRecords.filter(r => !r.isWindowRecord).length;
  const windowCount = allRecords.filter(r => r.isWindowRecord && !r.isMonthlySnapshot).length;
  const snapshotCount = allRecords.filter(r => r.isMonthlySnapshot).length;
  console.log(`  📅 Daily records:     ${dailyCount}`);
  console.log(`  📊 Window records:    ${windowCount}`);
  console.log(`  📈 Monthly snapshots: ${snapshotCount}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
