import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureEnum,
  ensureNumber,
  ensureOptionalNumber,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";

const horizonTypes = ["short", "mid", "long"] as const;
const vehicleTypes = ["savings", "deposit", "etf", "stock", "fund", "crypto", "cash", "other"] as const;
const statusTypes = ["active", "paused", "completed", "cancelled"] as const;

type MonthlyLog = {
  month: string; // yyyy-MM
  amount: number;
  note?: string;
};

export async function goalFundsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { userId } = getAuthContext(req.headers);
    requireUserId(userId);

    const container = getContainer("goalFunds");
    const method = req.method.toUpperCase();
    const fundId = req.params.fundId;

    // GET - list all or single
    if (method === "GET") {
      if (fundId) {
        const { resource } = await container.item(fundId, userId).read();
        if (!resource || resource.userId !== userId) {
          return fail("NOT_FOUND", "Goal fund not found", 404);
        }
        return ok(resource);
      }

      const query = {
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'GoalFund' ORDER BY c.createdAt DESC",
        parameters: [{ name: "@userId", value: userId }]
      };
      const { resources } = await container.items.query(query).fetchAll();
      return ok(resources);
    }

    // POST - create
    if (method === "POST") {
      const body = await parseJsonBody(req);
      const name = ensureString(body.name, "name");
      const horizon = ensureEnum(body.horizon, "horizon", horizonTypes as unknown as string[]);
      const vehicle = ensureEnum(body.vehicle, "vehicle", vehicleTypes as unknown as string[]);
      const targetAmount = ensureNumber(body.targetAmount, "targetAmount");
      const currentAmount = body.currentAmount != null ? ensureNumber(body.currentAmount, "currentAmount") : 0;
      const monthlyContribution = body.monthlyContribution != null ? ensureNumber(body.monthlyContribution, "monthlyContribution") : 0;
      const targetDate = ensureOptionalString(body.targetDate, "targetDate");
      const note = ensureOptionalString(body.note, "note");
      const status = body.status ? ensureEnum(body.status, "status", statusTypes as unknown as string[]) : "active";

      const now = new Date().toISOString();
      const item = {
        id: randomUUID(),
        userId,
        type: "GoalFund",
        name,
        horizon,
        vehicle,
        targetAmount,
        currentAmount,
        monthlyContribution,
        targetDate: targetDate ?? null,
        note: note ?? null,
        status,
        monthlyLogs: [] as MonthlyLog[],
        createdAt: now,
        updatedAt: now
      };

      await container.items.create(item);
      return ok(item, 201);
    }

    // PUT - update
    if (method === "PUT") {
      if (!fundId) return fail("BAD_REQUEST", "Fund ID required", 400);

      const { resource: existing } = await container.item(fundId, userId).read();
      if (!existing || existing.userId !== userId) {
        return fail("NOT_FOUND", "Goal fund not found", 404);
      }

      const body = await parseJsonBody(req);

      // Allow updating monthlyLogs via special action
      if (body.action === "add-log") {
        const month = ensureString(body.month, "month");
        const amount = ensureNumber(body.amount, "amount");
        const logNote = ensureOptionalString(body.note, "note");

        const logs: MonthlyLog[] = existing.monthlyLogs || [];
        const existingLogIdx = logs.findIndex((l: MonthlyLog) => l.month === month);
        if (existingLogIdx >= 0) {
          logs[existingLogIdx] = { month, amount, note: logNote };
        } else {
          logs.push({ month, amount, note: logNote });
          logs.sort((a: MonthlyLog, b: MonthlyLog) => a.month.localeCompare(b.month));
        }

        // Recalculate currentAmount from logs
        const totalFromLogs = logs.reduce((s: number, l: MonthlyLog) => s + l.amount, 0);

        const updated = {
          ...existing,
          monthlyLogs: logs,
          currentAmount: totalFromLogs,
          updatedAt: new Date().toISOString()
        };
        await container.item(fundId, userId).replace(updated);
        return ok(updated);
      }

      if (body.action === "remove-log") {
        const month = ensureString(body.month, "month");
        const logs: MonthlyLog[] = (existing.monthlyLogs || []).filter((l: MonthlyLog) => l.month !== month);
        const totalFromLogs = logs.reduce((s: number, l: MonthlyLog) => s + l.amount, 0);

        const updated = {
          ...existing,
          monthlyLogs: logs,
          currentAmount: totalFromLogs,
          updatedAt: new Date().toISOString()
        };
        await container.item(fundId, userId).replace(updated);
        return ok(updated);
      }

      // General update
      const updated = {
        ...existing,
        name: body.name != null ? ensureString(body.name, "name") : existing.name,
        horizon: body.horizon != null ? ensureEnum(body.horizon, "horizon", horizonTypes as unknown as string[]) : existing.horizon,
        vehicle: body.vehicle != null ? ensureEnum(body.vehicle, "vehicle", vehicleTypes as unknown as string[]) : existing.vehicle,
        targetAmount: body.targetAmount != null ? ensureNumber(body.targetAmount, "targetAmount") : existing.targetAmount,
        currentAmount: body.currentAmount != null ? ensureNumber(body.currentAmount, "currentAmount") : existing.currentAmount,
        monthlyContribution: body.monthlyContribution != null ? ensureNumber(body.monthlyContribution, "monthlyContribution") : existing.monthlyContribution,
        targetDate: body.targetDate !== undefined ? (ensureOptionalString(body.targetDate, "targetDate") ?? null) : existing.targetDate,
        note: body.note !== undefined ? (ensureOptionalString(body.note, "note") ?? null) : existing.note,
        status: body.status != null ? ensureEnum(body.status, "status", statusTypes as unknown as string[]) : existing.status,
        updatedAt: new Date().toISOString()
      };

      await container.item(fundId, userId).replace(updated);
      return ok(updated);
    }

    // DELETE
    if (method === "DELETE") {
      if (!fundId) return fail("BAD_REQUEST", "Fund ID required", 400);

      const { resource: existing } = await container.item(fundId, userId).read();
      if (!existing || existing.userId !== userId) {
        return fail("NOT_FOUND", "Goal fund not found", 404);
      }

      await container.item(fundId, userId).delete();
      return ok({ deleted: true });
    }

    return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Unauthorized", 401);
    context.log("GoalFunds error:", message);
    return fail("BAD_REQUEST", message, 400);
  }
}
