import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureNumber,
  ensureOptionalBoolean,
  ensureOptionalNumber,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";

type AssetRecord = {
  id: string;
  userId: string;
  currentValue?: number;
};

function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthStartIso(date: Date): string {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  return monthStart.toISOString();
}

function isInLastThreeDaysWindow(date: Date): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day >= lastDay - 2;
}

async function createMonthEndHistorySnapshot(
  userId: string,
  asset: AssetRecord,
  now: Date
): Promise<void> {
  let historyContainer;
  try {
    historyContainer = getContainer("assetHistory");
  } catch {
    return;
  }

  const monthKey = getMonthKey(now);
  const recordedAt = now.toISOString();
  const monthStartIso = getMonthStartIso(now);
  const value = Number(asset.currentValue ?? 0);

  const trendItem = {
    id: randomUUID(),
    userId,
    assetId: asset.id,
    type: "AssetHistory",
    value,
    quantity: null,
    recordedAt,
    note: "asset update",
    isWindowRecord: false,
    createdAt: recordedAt
  };

  await historyContainer.items.create(trendItem);

  if (!isInLastThreeDaysWindow(now)) {
    return;
  }

  const previousSnapshotQuery = {
    query:
      "SELECT TOP 1 c[\"value\"] FROM c WHERE c.userId = @userId AND c.assetId = @assetId AND c.type = 'AssetHistory' AND c.isWindowRecord = true AND c.recordedAt < @monthStart ORDER BY c.recordedAt DESC",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@assetId", value: asset.id },
      { name: "@monthStart", value: monthStartIso }
    ]
  };

  const thisMonthSnapshotQuery = {
    query:
      "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.assetId = @assetId AND c.type = 'AssetHistory' AND c.isWindowRecord = true AND c.windowMonth = @windowMonth ORDER BY c.recordedAt DESC",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@assetId", value: asset.id },
      { name: "@windowMonth", value: monthKey }
    ]
  };

  const [{ resources: previousResources }, { resources: thisMonthResources }] = await Promise.all([
    historyContainer.items.query(previousSnapshotQuery).fetchAll(),
    historyContainer.items.query(thisMonthSnapshotQuery).fetchAll()
  ]);

  if ((thisMonthResources?.length ?? 0) > 0) {
    return;
  }

  const previousValue = Number((previousResources?.[0] as { value?: number } | undefined)?.value ?? 0);
  const monthlyDelta = value - previousValue;

  const historyItem = {
    id: randomUUID(),
    userId,
    assetId: asset.id,
    type: "AssetHistory",
    value,
    quantity: null,
    recordedAt,
    note: "month-end window snapshot",
    isWindowRecord: true,
    windowMonth: monthKey,
    monthlyDelta,
    createdAt: recordedAt
  };

  await historyContainer.items.create(historyItem);
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

export async function assetsHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  let container;
  try {
    container = getContainer("assets");
  } catch (error: unknown) {
    context.log(error);
    return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
  }
  const assetId = req.params.assetId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (assetId) {
        try {
          const { resource } = await container.item(assetId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Asset not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Asset not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch asset", 500);
        }
      }

      try {
        const category = getQueryValue(req, "category");
        const query = category
          ? {
              query:
                "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND c.category = @category",
              parameters: [
                { name: "@userId", value: userId },
                { name: "@category", value: category }
              ]
            }
          : {
              query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
              parameters: [{ name: "@userId", value: userId }]
            };

        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list assets", 500);
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
        const asset = {
          id: randomUUID(),
          userId,
          type: "Asset",
          category: ensureString(body.category, "category"),
          name: ensureString(body.name, "name"),
          currentValue: ensureNumber(body.currentValue, "currentValue"),
          acquiredValue: ensureOptionalNumber(body.acquiredValue, "acquiredValue") ?? null,
          quantity: ensureOptionalNumber(body.quantity, "quantity") ?? null,
          valuationDate: ensureString(body.valuationDate, "valuationDate"),
          symbol: ensureOptionalString(body.symbol, "symbol") ?? "",
          exchangeRate: ensureOptionalNumber(body.exchangeRate, "exchangeRate") ?? null,
          usdAmount: ensureOptionalNumber(body.usdAmount, "usdAmount") ?? null,
          pensionMonthlyContribution:
            ensureOptionalNumber(body.pensionMonthlyContribution, "pensionMonthlyContribution") ?? null,
          pensionReceiveStart: ensureOptionalString(body.pensionReceiveStart, "pensionReceiveStart") ?? "",
          pensionReceiveAge: ensureOptionalNumber(body.pensionReceiveAge, "pensionReceiveAge") ?? null,
          carYear: ensureOptionalNumber(body.carYear, "carYear") ?? null,
          exchange: ensureOptionalString(body.exchange, "exchange") ?? "",
          priceSource: ensureOptionalString(body.priceSource, "priceSource") ?? "",
          autoUpdate: ensureOptionalBoolean(body.autoUpdate, "autoUpdate") ?? false,
          note: ensureOptionalString(body.note, "note") ?? "",
          owner: ensureOptionalString(body.owner, "owner") ?? "본인",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(asset);

        if (resource) {
          try {
            await createMonthEndHistorySnapshot(userId, resource as AssetRecord, new Date());
          } catch (historyError: unknown) {
            context.log(historyError);
          }
        }

        return ok(resource, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create asset", 500);
      }
    }
    case "PUT": {
      if (!assetId) {
        return fail("VALIDATION_ERROR", "Missing assetId", 400);
      }

      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(req);
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(assetId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Asset not found", 404);
        }

        const updated = {
          ...resource,
          category: ensureOptionalString(body.category, "category") ?? resource.category,
          name: ensureOptionalString(body.name, "name") ?? resource.name,
          currentValue: ensureOptionalNumber(body.currentValue, "currentValue") ?? resource.currentValue,
          acquiredValue: ensureOptionalNumber(body.acquiredValue, "acquiredValue") ?? resource.acquiredValue,
          quantity: ensureOptionalNumber(body.quantity, "quantity") ?? resource.quantity,
          valuationDate: ensureOptionalString(body.valuationDate, "valuationDate") ?? resource.valuationDate,
          symbol: ensureOptionalString(body.symbol, "symbol") ?? resource.symbol,
          exchangeRate: ensureOptionalNumber(body.exchangeRate, "exchangeRate") ?? resource.exchangeRate,
          usdAmount: ensureOptionalNumber(body.usdAmount, "usdAmount") ?? resource.usdAmount,
          pensionMonthlyContribution:
            ensureOptionalNumber(body.pensionMonthlyContribution, "pensionMonthlyContribution") ??
            resource.pensionMonthlyContribution,
          pensionReceiveStart:
            ensureOptionalString(body.pensionReceiveStart, "pensionReceiveStart") ??
            resource.pensionReceiveStart,
          pensionReceiveAge:
            ensureOptionalNumber(body.pensionReceiveAge, "pensionReceiveAge") ?? resource.pensionReceiveAge,
          carYear: ensureOptionalNumber(body.carYear, "carYear") ?? resource.carYear,
          exchange: ensureOptionalString(body.exchange, "exchange") ?? resource.exchange,
          priceSource: ensureOptionalString(body.priceSource, "priceSource") ?? resource.priceSource,
          autoUpdate: ensureOptionalBoolean(body.autoUpdate, "autoUpdate") ?? resource.autoUpdate,
          note: ensureOptionalString(body.note, "note") ?? resource.note,
          owner: ensureOptionalString(body.owner, "owner") ?? resource.owner ?? "본인",
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(assetId, userId).replace(updated);

        if (saved) {
          try {
            await createMonthEndHistorySnapshot(userId, saved as AssetRecord, new Date());
          } catch (historyError: unknown) {
            context.log(historyError);
          }
        }

        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Asset not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update asset", 500);
      }
    }
    case "DELETE": {
      if (!assetId) {
        return fail("VALIDATION_ERROR", "Missing assetId", 400);
      }

      try {
        await container.item(assetId, userId).delete();
        return ok({ id: assetId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Asset not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete asset", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

