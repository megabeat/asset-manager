import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import { requireUserId } from "../shared/validators";

type TrendPoint = {
  time: string;
  value: number;
};

type MonthlyAssetChange = {
  month: string;
  totalValue: number;
  delta: number;
};

type AssetIdentity = {
  id: string;
};

type AssetHistoryRow = {
  assetId?: string;
  recordedAt?: string;
  value?: number;
  windowMonth?: string;
  monthlyDelta?: number;
  isWindowRecord?: boolean;
};

function toHourBucket(isoString: string): string | null {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function resolveRange(range: string | null): { from: string; to: string } | null {
  const now = new Date();
  const to = now.toISOString();
  const fromDate = new Date(now);

  switch (range) {
    case "24h":
      fromDate.setHours(fromDate.getHours() - 24);
      break;
    case "7d":
      fromDate.setDate(fromDate.getDate() - 7);
      break;
    case "30d":
      fromDate.setDate(fromDate.getDate() - 30);
      break;
    default:
      return null;
  }

  return { from: fromDate.toISOString(), to };
}

function getQueryValue(req: HttpRequest, key: string): string | undefined {
  const query = req.query as unknown;

  if (query && typeof (query as URLSearchParams).get === "function") {
    return (query as URLSearchParams).get(key) ?? undefined;
  }

  if (query && typeof query === "object") {
    const record = query as Record<string, string | undefined>;
    return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
  }

  return undefined;
}

async function listUserAssetIds(userId: string): Promise<string[]> {
  const assetsContainer = getContainer("assets");
  const query = {
    query: "SELECT c.id FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
    parameters: [{ name: "@userId", value: userId }]
  };

  const { resources } = await assetsContainer.items.query(query).fetchAll();
  return (resources as AssetIdentity[])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function queryAssetHistoryRows(
  container: ReturnType<typeof getContainer>,
  userId: string,
  querySpec: { query: string; parameters: Array<{ name: string; value: any }> }
): Promise<AssetHistoryRow[]> {
  const partitionCandidates: Array<string | [string] | undefined> = [[userId], userId, undefined];
  let lastError: unknown = null;

  for (const partitionKey of partitionCandidates) {
    try {
      const options = partitionKey === undefined ? undefined : { partitionKey };
      const { resources } = await container.items.query(querySpec, options).fetchAll();
      return resources as AssetHistoryRow[];
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to query asset history");
}

export async function dashboardHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const action = req.params.action?.toLowerCase();

  switch (action) {
    case "summary":
      try {
        let assetsContainer;
        let expensesContainer;
        let liabilitiesContainer;
        try {
          assetsContainer = getContainer("assets");
          expensesContainer = getContainer("expenses");
          liabilitiesContainer = getContainer("liabilities");
        } catch (error: unknown) {
          context.log(error);
          return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
        }

        const assetsQuery = {
          query:
            "SELECT VALUE SUM(c.currentValue) FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND NOT (c.category = 'pension' OR c.category = 'pension_national' OR c.category = 'pension_personal' OR c.category = 'pension_retirement')",
          parameters: [{ name: "@userId", value: userId }]
        };

        const expensesQuery = {
          query:
            "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND (c.expenseType = '고정' OR c.expenseType = 'fixed') AND (c.cycle = '매월' OR c.cycle = 'monthly') AND (NOT IS_DEFINED(c.isInvestmentTransfer) OR c.isInvestmentTransfer = false)",
          parameters: [{ name: "@userId", value: userId }]
        };

        const liabilitiesQuery = {
          query: "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Liability'",
          parameters: [{ name: "@userId", value: userId }]
        };

        const [assetsResult, expensesResult, liabilitiesResult] = await Promise.all([
          assetsContainer.items.query(assetsQuery).fetchAll(),
          expensesContainer.items.query(expensesQuery).fetchAll(),
          liabilitiesContainer.items.query(liabilitiesQuery).fetchAll()
        ]);

        const totalAssets = assetsResult.resources[0] ?? 0;
        const monthlyFixedExpense = expensesResult.resources[0] ?? 0;
        const totalLiabilities = liabilitiesResult.resources[0] ?? 0;
        const netWorth = totalAssets - totalLiabilities;

        return ok({ totalAssets, totalLiabilities, netWorth, monthlyFixedExpense });
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to build summary", 500);
      }
    case "asset-trend": {
      const range = resolveRange(getQueryValue(req, "range") ?? null);
      if (!range) {
        return fail("VALIDATION_ERROR", "Invalid range", 400);
      }

      try {
        let container;
        try {
          container = getContainer("assetHistory");
        } catch (error: unknown) {
          context.log(error);
          return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
        }
        const assetIds = await listUserAssetIds(userId);
        if (assetIds.length === 0) {
          return ok([]);
        }

        const query = {
          query:
            "SELECT c.recordedAt, c.value, c.assetId FROM c WHERE c.userId = @userId AND c.type = 'AssetHistory' AND c.recordedAt >= @from AND c.recordedAt <= @to AND (NOT IS_DEFINED(c.isWindowRecord) OR c.isWindowRecord = false) AND ARRAY_CONTAINS(@assetIds, c.assetId)",
          parameters: [
            { name: "@userId", value: userId },
            { name: "@from", value: range.from },
            { name: "@to", value: range.to },
            { name: "@assetIds", value: assetIds }
          ]
        };

        const resources = await queryAssetHistoryRows(container, userId, query);
        const buckets = new Map<string, number>();

        for (const entry of resources) {
          const recordedAt = typeof entry.recordedAt === "string" ? entry.recordedAt : "";
          const bucket = toHourBucket(recordedAt);
          if (!bucket) {
            continue;
          }
          const current = buckets.get(bucket) ?? 0;
          buckets.set(bucket, current + (typeof entry.value === "number" ? entry.value : 0));
        }

        const points: TrendPoint[] = Array.from(buckets.entries())
          .map(([time, value]) => ({ time, value }))
          .sort((a, b) => a.time.localeCompare(b.time));

        return ok(points);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to build asset trend", 500);
      }
    }
    case "monthly-change": {
      try {
        let container;
        try {
          container = getContainer("assetHistory");
        } catch (error: unknown) {
          context.log(error);
          return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
        }

        const assetIds = await listUserAssetIds(userId);
        if (assetIds.length === 0) {
          return ok([]);
        }

        const query = {
          query:
            "SELECT c.assetId, c.windowMonth, c.value, c.monthlyDelta, c.recordedAt FROM c WHERE c.userId = @userId AND c.type = 'AssetHistory' AND c.isWindowRecord = true AND ARRAY_CONTAINS(@assetIds, c.assetId)",
          parameters: [
            { name: "@userId", value: userId },
            { name: "@assetIds", value: assetIds }
          ]
        };

        const resources = (await queryAssetHistoryRows(container, userId, query))
          .sort((a, b) => String(a.recordedAt ?? "").localeCompare(String(b.recordedAt ?? "")));
        const latestByMonthAndAsset = new Map<string, { month: string; value: number; delta: number }>();

        for (const row of resources) {
          if (!row.assetId || !row.windowMonth) {
            continue;
          }

          const mapKey = `${row.windowMonth}|${row.assetId}`;
          latestByMonthAndAsset.set(mapKey, {
            month: row.windowMonth,
            value: Number(row.value ?? 0),
            delta: Number(row.monthlyDelta ?? 0)
          });
        }

        const aggregateByMonth = new Map<string, MonthlyAssetChange>();

        for (const entry of latestByMonthAndAsset.values()) {
          const existing = aggregateByMonth.get(entry.month) ?? {
            month: entry.month,
            totalValue: 0,
            delta: 0
          };

          existing.totalValue += entry.value;
          existing.delta += entry.delta;
          aggregateByMonth.set(entry.month, existing);
        }

        const monthlyChanges = Array.from(aggregateByMonth.values()).sort((a, b) =>
          a.month.localeCompare(b.month)
        );

        return ok(monthlyChanges);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to build monthly changes", 500);
      }
    }
    default:
      context.log(`Unsupported dashboard action: ${action}`);
      return fail("NOT_FOUND", "Unknown dashboard action", 404);
  }
}

