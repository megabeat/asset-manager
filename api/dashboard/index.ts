import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import { requireUserId } from "../shared/validators";

type TrendPoint = {
  time: string;
  value: number;
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

export async function dashboardHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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
        const assetsContainer = getContainer("assets");
        const expensesContainer = getContainer("expenses");
        const liabilitiesContainer = getContainer("liabilities");

        const assetsQuery = {
          query: "SELECT VALUE SUM(c.currentValue) FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
          parameters: [{ name: "@userId", value: userId }]
        };

        const expensesQuery = {
          query:
            "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.expenseType = 'fixed' AND c.cycle = 'monthly'",
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
      const range = resolveRange(req.query.get("range"));
      if (!range) {
        return fail("VALIDATION_ERROR", "Invalid range", 400);
      }

      try {
        const container = getContainer("assetHistory");
        const query = {
          query:
            "SELECT c.recordedAt, c.value FROM c WHERE c.userId = @userId AND c.recordedAt >= @from AND c.recordedAt <= @to",
          parameters: [
            { name: "@userId", value: userId },
            { name: "@from", value: range.from },
            { name: "@to", value: range.to }
          ]
        };

        const { resources } = await container.items.query(query).fetchAll();
        const buckets = new Map<string, number>();

        for (const entry of resources as Array<{ recordedAt: string; value: number }>) {
          const bucket = toHourBucket(entry.recordedAt);
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
    default:
      context.log(`Unsupported dashboard action: ${action}`);
      return fail("NOT_FOUND", "Unknown dashboard action", 404);
  }
}

