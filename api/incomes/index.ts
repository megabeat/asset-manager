import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureEnum,
  ensureNumberInRange,
  ensureOptionalEnum,
  ensureOptionalNumberInRange,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";


const incomeCycles = ["monthly", "yearly", "one_time"];

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
  try {
    container = getContainer("incomes");
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
        const income = {
          id: randomUUID(),
          userId,
          type: "Income",
          name: ensureString(body.name, "name"),
          amount: ensureNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER),
          cycle: ensureEnum(body.cycle, "cycle", incomeCycles),
          category: ensureOptionalString(body.category, "category") ?? "",
          note: ensureOptionalString(body.note, "note") ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(income);
        return ok(resource, 201);
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

        const updated = {
          ...resource,
          name: ensureOptionalString(body.name, "name") ?? resource.name,
          amount:
            ensureOptionalNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
            resource.amount,
          cycle: ensureOptionalEnum(body.cycle, "cycle", incomeCycles) ?? resource.cycle,
          category: ensureOptionalString(body.category, "category") ?? resource.category,
          note: ensureOptionalString(body.note, "note") ?? resource.note,
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

