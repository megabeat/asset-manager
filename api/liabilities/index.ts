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
import { parseJsonBody } from "../shared/request-body";


export async function liabilitiesHandler(
  context: InvocationContext,
  req: HttpRequest
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
        body = await parseJsonBody(req);
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
          interestRate: ensureOptionalNumberInRange(body.interestRate, "interestRate", 0, 100) ?? null,
          repaymentMethod: ensureOptionalString(body.repaymentMethod, "repaymentMethod") ?? "",
          maturityDate: ensureOptionalString(body.maturityDate, "maturityDate") ?? "",
          monthlyPayment: ensureOptionalNumberInRange(body.monthlyPayment, "monthlyPayment", 0, Number.MAX_SAFE_INTEGER) ?? null,
          startDate: ensureOptionalString(body.startDate, "startDate") ?? "",
          loanTerm: ensureOptionalNumberInRange(body.loanTerm, "loanTerm", 0, 600) ?? null,
          note: ensureOptionalString(body.note, "note") ?? "",
          owner: ensureOptionalString(body.owner, "owner") ?? "본인",
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
        body = await parseJsonBody(req);
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
          interestRate: body.interestRate !== undefined
            ? ensureOptionalNumberInRange(body.interestRate, "interestRate", 0, 100) ?? null
            : resource.interestRate ?? null,
          repaymentMethod: body.repaymentMethod !== undefined
            ? ensureOptionalString(body.repaymentMethod, "repaymentMethod") ?? ""
            : resource.repaymentMethod ?? "",
          maturityDate: body.maturityDate !== undefined
            ? ensureOptionalString(body.maturityDate, "maturityDate") ?? ""
            : resource.maturityDate ?? "",
          monthlyPayment: body.monthlyPayment !== undefined
            ? ensureOptionalNumberInRange(body.monthlyPayment, "monthlyPayment", 0, Number.MAX_SAFE_INTEGER) ?? null
            : resource.monthlyPayment ?? null,
          startDate: body.startDate !== undefined
            ? ensureOptionalString(body.startDate, "startDate") ?? ""
            : resource.startDate ?? "",
          loanTerm: body.loanTerm !== undefined
            ? ensureOptionalNumberInRange(body.loanTerm, "loanTerm", 0, 600) ?? null
            : resource.loanTerm ?? null,
          note: ensureOptionalString(body.note, "note") ?? resource.note,
          owner: ensureOptionalString(body.owner, "owner") ?? resource.owner ?? "본인",
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

