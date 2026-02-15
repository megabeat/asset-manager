import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import { ensureNumber, ensureOptionalNumber, ensureOptionalString, requireUserId } from "../shared/validators";

export async function assetHistoryHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const container = getContainer("assetHistory");
  const assetId = req.params.assetId;
  const historyId = req.params.historyId;
  const partitionKey = [userId, assetId];

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (!assetId) {
        return fail("VALIDATION_ERROR", "Missing assetId", 400);
      }

      if (historyId) {
        try {
          const { resource } = await container.item(historyId, partitionKey).read();
          if (!resource) {
            return fail("NOT_FOUND", "History item not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "History item not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch history item", 500);
        }
      }

      const from = req.query.get("from");
      const to = req.query.get("to");
      const parameters = [
        { name: "@userId", value: userId },
        { name: "@assetId", value: assetId }
      ];

      let queryText = "SELECT * FROM c WHERE c.userId = @userId AND c.assetId = @assetId";
      if (from) {
        queryText += " AND c.recordedAt >= @from";
        parameters.push({ name: "@from", value: from });
      }
      if (to) {
        queryText += " AND c.recordedAt <= @to";
        parameters.push({ name: "@to", value: to });
      }
      queryText += " ORDER BY c.recordedAt ASC";

      try {
        const { resources } = await container.items
          .query({ query: queryText, parameters }, { partitionKey })
          .fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list asset history", 500);
      }
    }
    case "POST": {
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
        const historyItem = {
          id: randomUUID(),
          userId,
          assetId,
          type: "AssetHistory",
          value: ensureNumber(body.value, "value"),
          quantity: ensureOptionalNumber(body.quantity, "quantity") ?? null,
          recordedAt: ensureOptionalString(body.recordedAt, "recordedAt") ?? new Date().toISOString(),
          note: ensureOptionalString(body.note, "note") ?? "",
          createdAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(historyItem);
        return ok(resource, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create history item", 500);
      }
    }
    case "DELETE": {
      if (!assetId || !historyId) {
        return fail("VALIDATION_ERROR", "Missing assetId or historyId", 400);
      }

      try {
        await container.item(historyId, partitionKey).delete();
        return ok({ id: historyId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "History item not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete history item", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

app.http("assetHistory", {
  methods: ["GET", "POST", "DELETE"],
  authLevel: "anonymous",
  route: "assets/{assetId}/history/{historyId?}",
  handler: assetHistoryHandler
});
