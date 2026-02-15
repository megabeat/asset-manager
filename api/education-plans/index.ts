import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureNumber,
  ensureNumberInRange,
  ensureOptionalNumber,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";

export async function educationPlansHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const action = req.params.action?.toLowerCase();

  const container = getContainer("educationPlans");
  const planId = req.params.planId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (planId) {
        try {
          const { resource } = await container.item(planId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Education plan not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Education plan not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch education plan", 500);
        }
      }

      try {
        const query = {
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'EducationPlan'",
          parameters: [{ name: "@userId", value: userId }]
        };
        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list education plans", 500);
      }
    }
    case "POST": {
      if (action === "simulate") {
        let body: Record<string, unknown>;
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          return fail("INVALID_JSON", "Invalid JSON body", 400);
        }

        try {
          const inflationRate = ensureNumberInRange(body.inflationRate, "inflationRate", 0, 1);
          const startYear = ensureNumber(body.startYear, "startYear");
          const endYear = ensureNumber(body.endYear, "endYear");
          const annualCost = ensureNumber(body.annualCost, "annualCost");

          if (endYear < startYear) {
            return fail("VALIDATION_ERROR", "endYear must be >= startYear", 400);
          }

          const yearly: Array<{ year: number; cost: number }> = [];
          let totalCost = 0;
          for (let year = startYear; year <= endYear; year += 1) {
            const yearsFromStart = year - startYear;
            const cost = Math.round(annualCost * Math.pow(1 + inflationRate, yearsFromStart));
            yearly.push({ year, cost });
            totalCost += cost;
          }

          return ok({ totalCost, yearly });
        } catch (error: unknown) {
          if (error instanceof Error && error.message.startsWith("Invalid")) {
            return fail("VALIDATION_ERROR", error.message, 400);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to simulate education plan", 500);
        }
      }

      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const startYear = ensureNumber(body.startYear, "startYear");
        const endYear = ensureNumber(body.endYear, "endYear");
        if (endYear < startYear) {
          return fail("VALIDATION_ERROR", "endYear must be >= startYear", 400);
        }

        const plan = {
          id: randomUUID(),
          userId,
          type: "EducationPlan",
          childId: ensureString(body.childId, "childId"),
          annualCost: ensureNumber(body.annualCost, "annualCost"),
          inflationRate: ensureNumberInRange(body.inflationRate, "inflationRate", 0, 1),
          startYear,
          endYear,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(plan);
        return ok(resource, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create education plan", 500);
      }
    }
    case "PUT": {
      if (!planId) {
        return fail("VALIDATION_ERROR", "Missing planId", 400);
      }

      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(planId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Education plan not found", 404);
        }

        const updated = {
          ...resource,
          childId: ensureOptionalString(body.childId, "childId") ?? resource.childId,
          annualCost: ensureOptionalNumber(body.annualCost, "annualCost") ?? resource.annualCost,
          inflationRate:
            ensureOptionalNumber(body.inflationRate, "inflationRate") ?? resource.inflationRate,
          startYear: ensureOptionalNumber(body.startYear, "startYear") ?? resource.startYear,
          endYear: ensureOptionalNumber(body.endYear, "endYear") ?? resource.endYear,
          updatedAt: new Date().toISOString()
        };

        if (updated.inflationRate < 0 || updated.inflationRate > 1) {
          return fail("VALIDATION_ERROR", "Invalid inflationRate", 400);
        }

        if (updated.endYear < updated.startYear) {
          return fail("VALIDATION_ERROR", "endYear must be >= startYear", 400);
        }

        const { resource: saved } = await container.item(planId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Education plan not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update education plan", 500);
      }
    }
    case "DELETE": {
      if (!planId) {
        return fail("VALIDATION_ERROR", "Missing planId", 400);
      }

      try {
        await container.item(planId, userId).delete();
        return ok({ id: planId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Education plan not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete education plan", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

