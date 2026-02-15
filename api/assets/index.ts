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

export async function assetsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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
        const category = req.query.get("category");
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
        body = (await req.json()) as Record<string, unknown>;
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
          exchange: ensureOptionalString(body.exchange, "exchange") ?? "",
          priceSource: ensureOptionalString(body.priceSource, "priceSource") ?? "",
          autoUpdate: ensureOptionalBoolean(body.autoUpdate, "autoUpdate") ?? false,
          note: ensureOptionalString(body.note, "note") ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(asset);
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
        body = (await req.json()) as Record<string, unknown>;
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
          exchange: ensureOptionalString(body.exchange, "exchange") ?? resource.exchange,
          priceSource: ensureOptionalString(body.priceSource, "priceSource") ?? resource.priceSource,
          autoUpdate: ensureOptionalBoolean(body.autoUpdate, "autoUpdate") ?? resource.autoUpdate,
          note: ensureOptionalString(body.note, "note") ?? resource.note,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(assetId, userId).replace(updated);
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

