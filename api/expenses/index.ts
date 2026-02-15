import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
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

const expenseTypes = ["fixed", "subscription"];
const billingCycles = ["monthly", "yearly"];

export async function expensesHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const container = getContainer("expenses");
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
        const type = req.query.get("type");
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
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const expense = {
          id: randomUUID(),
          userId,
          type: "Expense",
          expenseType: ensureEnum(body.type, "type", expenseTypes),
          name: ensureString(body.name, "name"),
          amount: ensureNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER),
          cycle: ensureEnum(body.cycle, "cycle", billingCycles),
          billingDay: ensureOptionalNumberInRange(body.billingDay, "billingDay", 1, 31) ?? null,
          category: ensureOptionalString(body.category, "category") ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(expense);
        return ok(resource, 201);
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
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(expenseId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Expense not found", 404);
        }

        const updated = {
          ...resource,
          expenseType: ensureOptionalEnum(body.type, "type", expenseTypes) ?? resource.expenseType,
          name: ensureOptionalString(body.name, "name") ?? resource.name,
          amount:
            ensureOptionalNumberInRange(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
            resource.amount,
          cycle: ensureOptionalEnum(body.cycle, "cycle", billingCycles) ?? resource.cycle,
          billingDay:
            ensureOptionalNumberInRange(body.billingDay, "billingDay", 1, 31) ??
            resource.billingDay,
          category: ensureOptionalString(body.category, "category") ?? resource.category,
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

app.http("expenses", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "expenses/{expenseId?}",
  handler: expensesHandler
});
