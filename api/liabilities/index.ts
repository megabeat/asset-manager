import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureNumberInRange,
  ensureOptionalNumberInRange,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";

export async function liabilitiesHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const container = getContainer("liabilities");
  const liabilityId = req.params.liabilityId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (liabilityId) {
        try {
          const { resource } = await container.item(liabilityId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Liability not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Liability not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch liability", 500);
        }
      }

      try {
        const query = {
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Liability'",
          parameters: [{ name: "@userId", value: userId }]
        };
        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list liabilities", 500);
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
        const liability = {
          id: randomUUID(),
          userId,
          type: "Liability",
          name: ensureString(body.name, "name"),
          amount: ensureNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER),
          category: ensureOptionalString(body.category, "category") ?? "",
          note: ensureOptionalString(body.note, "note") ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(liability);
        return ok(resource, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create liability", 500);
      }
    }
    case "PUT": {
      if (!liabilityId) {
        return fail("VALIDATION_ERROR", "Missing liabilityId", 400);
      }

      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(liabilityId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Liability not found", 404);
        }

        const updated = {
          ...resource,
          name: ensureOptionalString(body.name, "name") ?? resource.name,
          amount:
            ensureOptionalNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
            resource.amount,
          category: ensureOptionalString(body.category, "category") ?? resource.category,
          note: ensureOptionalString(body.note, "note") ?? resource.note,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(liabilityId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Liability not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update liability", 500);
      }
    }
    case "DELETE": {
      if (!liabilityId) {
        return fail("VALIDATION_ERROR", "Missing liabilityId", 400);
      }

      try {
        await container.item(liabilityId, userId).delete();
        return ok({ id: liabilityId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Liability not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete liability", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

