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


const incomeCycles = ["monthly", "yearly", "one_time"];
const REFLECTABLE_CYCLES = new Set(["yearly", "one_time"]);

type IncomeRecord = {
  id: string;
  userId: string;
  cycle: "monthly" | "yearly" | "one_time";
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

function isReflectableCycle(cycle: string): boolean {
  return REFLECTABLE_CYCLES.has(cycle);
}

function resolveOccurredAt(value: unknown): string {
  const candidate = ensureOptionalString(value, "occurredAt") ?? new Date().toISOString().slice(0, 10);
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid occurredAt");
  }
  return date.toISOString().slice(0, 10);
}

function shouldReflectNow(cycle: string, reflectToLiquidAsset: boolean, occurredAt: string): boolean {
  if (!reflectToLiquidAsset || !isReflectableCycle(cycle)) {
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
    note: "수입 반영용 자동 생성",
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

export async function incomesHandler(
  context: InvocationContext,
  req: HttpRequest
): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  let container;
  let assetsContainer;
  try {
    container = getContainer("incomes");
    assetsContainer = getContainer("assets");
  } catch (error: unknown) {
    context.log(error);
    return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
  }
  const incomeId = req.params.incomeId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (incomeId) {
        try {
          const { resource } = await container.item(incomeId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Income not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Income not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch income", 500);
        }
      }

      try {
        const query = {
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Income'",
          parameters: [{ name: "@userId", value: userId }]
        };
        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list incomes", 500);
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
        const cycle = ensureEnum(body.cycle, "cycle", incomeCycles) as "monthly" | "yearly" | "one_time";
        const amount = ensureNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER);
        const occurredAt = resolveOccurredAt(body.occurredAt);
        const reflectToLiquidAsset = ensureOptionalBoolean(body.reflectToLiquidAsset, "reflectToLiquidAsset") ?? (cycle !== "monthly");

        const income = {
          id: randomUUID(),
          userId,
          type: "Income",
          name: ensureString(body.name, "name"),
          amount,
          cycle,
          occurredAt,
          reflectToLiquidAsset,
          reflectedAmount: 0,
          reflectedAssetId: "",
          reflectedAt: "",
          category: ensureOptionalString(body.category, "category") ?? "",
          note: ensureOptionalString(body.note, "note") ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(income);

        if (!resource) {
          return fail("SERVER_ERROR", "Failed to create income", 500);
        }

        const shouldReflect = shouldReflectNow(cycle, reflectToLiquidAsset, occurredAt);
        if (!shouldReflect) {
          return ok(resource, 201);
        }

        const reflected = await applyLiquidAssetDelta(assetsContainer, userId, amount);
        const nowIso = new Date().toISOString();
        const updatedIncome = {
          ...resource,
          reflectedAmount: reflected?.appliedDelta ?? 0,
          reflectedAssetId: reflected?.assetId ?? "",
          reflectedAt: reflected ? nowIso : "",
          updatedAt: nowIso
        };

        const { resource: savedIncome } = await container.item(updatedIncome.id, userId).replace(updatedIncome);
        return ok(savedIncome ?? updatedIncome, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create income", 500);
      }
    }
    case "PUT": {
      if (!incomeId) {
        return fail("VALIDATION_ERROR", "Missing incomeId", 400);
      }

      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(req);
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(incomeId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Income not found", 404);
        }

        const existing = resource as IncomeRecord & Record<string, unknown>;

        const nextCycle =
          (ensureOptionalEnum(body.cycle, "cycle", incomeCycles) as "monthly" | "yearly" | "one_time" | undefined) ??
          existing.cycle;
        const nextAmount =
          ensureOptionalNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
          Number(existing.amount ?? 0);
        const nextOccurredAt = resolveOccurredAt(body.occurredAt ?? existing.occurredAt);
        const nextReflectSetting =
          ensureOptionalBoolean(body.reflectToLiquidAsset, "reflectToLiquidAsset") ??
          (existing.reflectToLiquidAsset ?? existing.cycle !== "monthly");

        const prevReflectedAmount = Number(existing.reflectedAmount ?? 0);
        const nextReflectedAmount = shouldReflectNow(nextCycle, nextReflectSetting, nextOccurredAt) ? nextAmount : 0;
        const reflectDelta = nextReflectedAmount - prevReflectedAmount;

        let reflectedAssetId = (existing.reflectedAssetId ?? "") as string;
        let reflectedAt = (existing.reflectedAt ?? "") as string;
        if (reflectDelta !== 0) {
          const reflected = await applyLiquidAssetDelta(
            assetsContainer,
            userId,
            reflectDelta,
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
          name: ensureOptionalString(body.name, "name") ?? existing.name,
          amount: nextAmount,
          cycle: nextCycle,
          occurredAt: nextOccurredAt,
          reflectToLiquidAsset: nextReflectSetting,
          reflectedAmount: nextReflectedAmount,
          reflectedAssetId,
          reflectedAt,
          category: ensureOptionalString(body.category, "category") ?? existing.category,
          note: ensureOptionalString(body.note, "note") ?? existing.note,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(incomeId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Income not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update income", 500);
      }
    }
    case "DELETE": {
      if (!incomeId) {
        return fail("VALIDATION_ERROR", "Missing incomeId", 400);
      }

      try {
        const { resource } = await container.item(incomeId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Income not found", 404);
        }

        const income = resource as IncomeRecord;
        const reflectedAmount = Number(income.reflectedAmount ?? 0);
        if (reflectedAmount > 0) {
          await applyLiquidAssetDelta(
            assetsContainer,
            userId,
            -reflectedAmount,
            income.reflectedAssetId || undefined
          );
        }

        await container.item(incomeId, userId).delete();
        return ok({ id: incomeId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Income not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete income", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

