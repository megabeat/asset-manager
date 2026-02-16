"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthlySnapshot = monthlySnapshot;
const cosmosClient_1 = require("../shared/cosmosClient");
async function monthlySnapshot(timer, context) {
    if (timer.isPastDue) {
        context.log("Monthly snapshot is running late.");
    }
    // Timer fires on 28-31 at 03:00 UTC (12:00 KST).
    // Only proceed if today is actually the last day of the month.
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) {
        context.log(`Not last day of month (${now.toISOString()}), skipping.`);
        return;
    }
    const assetsContainer = (0, cosmosClient_1.getContainer)("assets");
    const historyContainer = (0, cosmosClient_1.getContainer)("assetHistory");
    // Fetch all assets grouped by user
    const query = {
        query: "SELECT c.userId, c.currentValue FROM c WHERE c.type = 'Asset'",
        parameters: []
    };
    const { resources } = await assetsContainer.items.query(query).fetchAll();
    const rows = resources;
    // Aggregate per user
    const userTotals = new Map();
    for (const row of rows) {
        const userId = row.userId;
        if (!userId)
            continue;
        const current = userTotals.get(userId) ?? 0;
        userTotals.set(userId, current + (Number(row.currentValue) || 0));
    }
    const recordedAt = now.toISOString();
    const windowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let snapshotCount = 0;
    for (const [userId, totalValue] of userTotals.entries()) {
        if (totalValue <= 0)
            continue;
        // Look up previous month's snapshot to compute delta
        const prevMonth = (() => {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        })();
        let prevTotal = 0;
        try {
            const prevQuery = {
                query: "SELECT c.value FROM c WHERE c.userId = @userId AND c.type = 'AssetHistory' AND c.isWindowRecord = true AND c.isMonthlySnapshot = true AND c.windowMonth = @prevMonth",
                parameters: [
                    { name: "@userId", value: userId },
                    { name: "@prevMonth", value: prevMonth }
                ]
            };
            const { resources: prevRows } = await historyContainer.items.query(prevQuery).fetchAll();
            if (prevRows.length > 0) {
                prevTotal = Number(prevRows[0].value ?? 0);
            }
        }
        catch {
            // ignore – delta will be 0
        }
        const delta = totalValue - prevTotal;
        // Use a deterministic ID so re-runs in the same month overwrite (upsert)
        const snapshotId = `snapshot-${userId}-${windowMonth}`;
        const historyItem = {
            id: snapshotId,
            userId,
            assetId: "__snapshot__",
            type: "AssetHistory",
            isWindowRecord: true,
            isMonthlySnapshot: true,
            windowMonth,
            value: Math.round(totalValue),
            monthlyDelta: Math.round(delta),
            recordedAt,
            note: `월말 자동 스냅샷 (${windowMonth})`,
            createdAt: recordedAt
        };
        try {
            await historyContainer.items.upsert(historyItem);
            snapshotCount++;
        }
        catch (error) {
            context.log(`Failed to upsert snapshot for ${userId}:`, error);
        }
    }
    context.log(`Monthly snapshot complete: ${snapshotCount} users processed for ${windowMonth}`);
}
