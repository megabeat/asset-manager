import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureEnum,
  ensureNumberInRange,
  ensureOptionalBoolean,
  ensureOptionalEnum,
  ensureOptionalNumberInRange,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";


const expenseTypes = ["fixed", "subscription"];
const billingCycles = ["monthly", "yearly"];

type ExpenseRecord = {
  id: string;
  userId: string;
  amount: number;
  occurredAt?: string;
  reflectToLiquidAsset?: boolean;
  reflectedAmount?: number;
  reflectedAssetId?: string;
  reflectedAt?: string;
};

type AssetRecord = {
  id: string;
  userId: string;
  type: "Asset";
  category: string;
  name: string;
  currentValue: number;
  valuationDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

function resolveOccurredAt(value: unknown): string {
  const candidate = ensureOptionalString(value, "occurredAt") ?? new Date().toISOString().slice(0, 10);
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid occurredAt");
  }
  return date.toISOString().slice(0, 10);
}

function shouldReflectNow(reflectToLiquidAsset: boolean, occurredAt: string): boolean {
  if (!reflectToLiquidAsset) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return occurredAt <= today;
}

async function resolveLiquidAsset(
  assetsContainer: ReturnType<typeof getContainer>,
  userId: string,
  preferredAssetId?: string
): Promise<AssetRecord> {
  if (preferredAssetId) {
    const { resource } = await assetsContainer.item(preferredAssetId, userId).read();
    if (resource) {
      return resource as AssetRecord;
    }
  }

  const query = {
    query:
      "SELECT TOP 1 * FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND (c.category = 'deposit' OR c.category = 'cash') ORDER BY c.updatedAt DESC",
    parameters: [{ name: "@userId", value: userId }]
  };

  const { resources } = await assetsContainer.items.query(query).fetchAll();
  if (resources.length > 0) {
    return resources[0] as AssetRecord;
  }

  const nowIso = new Date().toISOString();
  const newLiquidAsset: AssetRecord = {
    id: randomUUID(),
    userId,
    type: "Asset",
    category: "deposit",
    name: "입출금 통장",
    currentValue: 0,
    valuationDate: nowIso.slice(0, 10),
    note: "지출 반영용 자동 생성",
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const { resource } = await assetsContainer.items.create(newLiquidAsset);
  return resource as AssetRecord;
}

async function applyLiquidAssetDelta(
  assetsContainer: ReturnType<typeof getContainer>,
  userId: string,
  delta: number,
  preferredAssetId?: string
): Promise<{ assetId: string; appliedDelta: number } | null> {
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const liquidAsset = await resolveLiquidAsset(assetsContainer, userId, preferredAssetId);
  const nextValue = Math.max(0, Number(liquidAsset.currentValue ?? 0) + delta);
  const nowIso = new Date().toISOString();

  const updated = {
    ...liquidAsset,
    currentValue: nextValue,
    valuationDate: nowIso.slice(0, 10),
    updatedAt: nowIso
  };

  await assetsContainer.item(liquidAsset.id, userId).replace(updated);
  return { assetId: liquidAsset.id, appliedDelta: delta };
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

export async function expensesHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  let container;
  let assetsContainer;
  try {
    container = getContainer("expenses");
    assetsContainer = getContainer("assets");
  } catch (error: unknown) {
    context.log(error);
    return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
  }
  const expenseId = req.params.expenseId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (expenseId) {
        try {
          const { resource } = await container.item(expenseId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Expense not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Expense not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch expense", 500);
        }
      }

      try {
        const type = getQueryValue(req, "type");
        const query = type
          ? {
              query:
                "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.expenseType = @expenseType",
              parameters: [
                { name: "@userId", value: userId },
                { name: "@expenseType", value: type }
              ]
            }
          : {
              query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense'",
              parameters: [{ name: "@userId", value: userId }]
            };

        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list expenses", 500);
      }
    }
    case "POST": {
      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(req);
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const amount = ensureNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER);
        const reflectToLiquidAsset = ensureOptionalBoolean(body.reflectToLiquidAsset, "reflectToLiquidAsset") ?? false;
        const occurredAt = resolveOccurredAt(body.occurredAt);

        const expense = {
          id: randomUUID(),
          userId,
          type: "Expense",
          expenseType: ensureEnum(body.type, "type", expenseTypes),
          name: ensureString(body.name, "name"),
          amount,
          cycle: ensureEnum(body.cycle, "cycle", billingCycles),
          billingDay: ensureOptionalNumberInRange(body.billingDay, "billingDay", 1, 31) ?? null,
          occurredAt,
          reflectToLiquidAsset,
          reflectedAmount: 0,
          reflectedAssetId: "",
          reflectedAt: "",
          category: ensureOptionalString(body.category, "category") ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(expense);

        if (!resource) {
          return fail("SERVER_ERROR", "Failed to create expense", 500);
        }

        if (!shouldReflectNow(reflectToLiquidAsset, occurredAt)) {
          return ok(resource, 201);
        }

        const reflected = await applyLiquidAssetDelta(assetsContainer, userId, -amount);
        const nowIso = new Date().toISOString();
        const updatedExpense = {
          ...resource,
          reflectedAmount: reflected ? amount : 0,
          reflectedAssetId: reflected?.assetId ?? "",
          reflectedAt: reflected ? nowIso : "",
          updatedAt: nowIso
        };

        const { resource: savedExpense } = await container.item(updatedExpense.id, userId).replace(updatedExpense);
        return ok(savedExpense ?? updatedExpense, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create expense", 500);
      }
    }
    case "PUT": {
      if (!expenseId) {
        return fail("VALIDATION_ERROR", "Missing expenseId", 400);
      }

      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(req);
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(expenseId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Expense not found", 404);
        }

        const existing = resource as ExpenseRecord & Record<string, unknown>;
        const nextAmount =
          ensureOptionalNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
          Number(existing.amount ?? 0);
        const nextOccurredAt = resolveOccurredAt(body.occurredAt ?? existing.occurredAt);
        const nextReflectSetting =
          ensureOptionalBoolean(body.reflectToLiquidAsset, "reflectToLiquidAsset") ??
          (existing.reflectToLiquidAsset ?? false);

        const prevReflectedAmount = Number(existing.reflectedAmount ?? 0);
        const nextReflectedAmount = shouldReflectNow(nextReflectSetting, nextOccurredAt) ? nextAmount : 0;
        const reflectDelta = nextReflectedAmount - prevReflectedAmount;

        let reflectedAssetId = (existing.reflectedAssetId ?? "") as string;
        let reflectedAt = (existing.reflectedAt ?? "") as string;
        if (reflectDelta !== 0) {
          const reflected = await applyLiquidAssetDelta(
            assetsContainer,
            userId,
            -reflectDelta,
            reflectedAssetId || undefined
          );
          reflectedAssetId = reflected?.assetId ?? reflectedAssetId;
          reflectedAt = reflected ? new Date().toISOString() : reflectedAt;
        }

        if (nextReflectedAmount === 0) {
          reflectedAt = "";
        }

        const updated = {
          ...existing,
          expenseType: ensureOptionalEnum(body.type, "type", expenseTypes) ?? existing.expenseType,
          name: ensureOptionalString(body.name, "name") ?? existing.name,
          amount: nextAmount,
          cycle: ensureOptionalEnum(body.cycle, "cycle", billingCycles) ?? existing.cycle,
          billingDay:
            ensureOptionalNumberInRange(body.billingDay, "billingDay", 1, 31) ??
            existing.billingDay,
          occurredAt: nextOccurredAt,
          reflectToLiquidAsset: nextReflectSetting,
          reflectedAmount: nextReflectedAmount,
          reflectedAssetId,
          reflectedAt,
          category: ensureOptionalString(body.category, "category") ?? existing.category,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(expenseId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Expense not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update expense", 500);
      }
    }
    case "DELETE": {
      if (!expenseId) {
        return fail("VALIDATION_ERROR", "Missing expenseId", 400);
      }

      try {
        const { resource } = await container.item(expenseId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Expense not found", 404);
        }

        const expense = resource as ExpenseRecord;
        const reflectedAmount = Number(expense.reflectedAmount ?? 0);
        if (reflectedAmount > 0) {
          await applyLiquidAssetDelta(
            assetsContainer,
            userId,
            reflectedAmount,
            expense.reflectedAssetId || undefined
          );
        }

        await container.item(expenseId, userId).delete();
        return ok({ id: expenseId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Expense not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete expense", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

