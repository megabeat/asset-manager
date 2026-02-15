import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureNumber,
  ensureOptionalEnum,
  ensureOptionalNumber,
  ensureOptionalNumberInRange,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";

function getStatusCode(error: unknown): number | undefined {
  const candidate = error as { code?: number | string; statusCode?: number | string };
  const raw = candidate.statusCode ?? candidate.code;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}


export async function profileHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  let container;
  try {
    container = getContainer("users");
  } catch (error: unknown) {
    context.log(error);
    return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
  }

  switch (req.method.toUpperCase()) {
    case "GET": {
      try {
        const { resource } = await container.item(userId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Profile not found", 404);
        }
        return ok(resource);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Profile not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to fetch profile", 500);
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
        const profile = {
          id: userId,
          userId,
          type: "Profile",
          fullName: ensureString(body.fullName, "fullName"),
          birthDate: ensureString(body.birthDate, "birthDate"),
          employerName: ensureOptionalString(body.employerName, "employerName"),
          jobTitle: ensureOptionalString(body.jobTitle, "jobTitle"),
          baseSalaryAnnual: ensureOptionalNumber(body.baseSalaryAnnual, "baseSalaryAnnual"),
          annualBonus: ensureOptionalNumber(body.annualBonus, "annualBonus"),
          annualRsu: ensureOptionalNumber(body.annualRsu, "annualRsu"),
          rsuShares: ensureOptionalNumber(body.rsuShares, "rsuShares"),
          rsuVestingPriceUsd: ensureOptionalNumber(body.rsuVestingPriceUsd, "rsuVestingPriceUsd"),
          rsuVestingCycle: ensureOptionalEnum(body.rsuVestingCycle, "rsuVestingCycle", [
            "monthly",
            "quarterly",
            "yearly",
            "irregular"
          ]),
          annualRaiseRatePct: ensureOptionalNumberInRange(
            body.annualRaiseRatePct,
            "annualRaiseRatePct",
            -20,
            100
          ),
          child1Name: ensureOptionalString(body.child1Name, "child1Name"),
          child1BirthDate: ensureOptionalString(body.child1BirthDate, "child1BirthDate"),
          child2Name: ensureOptionalString(body.child2Name, "child2Name"),
          child2BirthDate: ensureOptionalString(body.child2BirthDate, "child2BirthDate"),
          retirementTargetAge: ensureOptionalNumberInRange(
            body.retirementTargetAge,
            "retirementTargetAge",
            45,
            90
          ),
          householdSize: ensureNumber(body.householdSize, "householdSize"),
          currency: ensureString(body.currency, "currency"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(profile);
        return ok(resource, 201);
      } catch (error: unknown) {
        const status = getStatusCode(error);
        if (status === 409) {
          return fail("CONFLICT", "Profile already exists", 409);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create profile", 500);
      }
    }
    case "PUT": {
      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(req);
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(userId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Profile not found", 404);
        }

        const updated = {
          ...resource,
          fullName: ensureOptionalString(body.fullName, "fullName") ?? resource.fullName,
          birthDate: ensureOptionalString(body.birthDate, "birthDate") ?? resource.birthDate,
          employerName: ensureOptionalString(body.employerName, "employerName") ?? resource.employerName,
          jobTitle: ensureOptionalString(body.jobTitle, "jobTitle") ?? resource.jobTitle,
          baseSalaryAnnual:
            ensureOptionalNumber(body.baseSalaryAnnual, "baseSalaryAnnual") ?? resource.baseSalaryAnnual,
          annualBonus: ensureOptionalNumber(body.annualBonus, "annualBonus") ?? resource.annualBonus,
          annualRsu: ensureOptionalNumber(body.annualRsu, "annualRsu") ?? resource.annualRsu,
          rsuShares: ensureOptionalNumber(body.rsuShares, "rsuShares") ?? resource.rsuShares,
          rsuVestingPriceUsd:
            ensureOptionalNumber(body.rsuVestingPriceUsd, "rsuVestingPriceUsd") ??
            resource.rsuVestingPriceUsd,
          rsuVestingCycle:
            ensureOptionalEnum(body.rsuVestingCycle, "rsuVestingCycle", [
              "monthly",
              "quarterly",
              "yearly",
              "irregular"
            ]) ?? resource.rsuVestingCycle,
          annualRaiseRatePct:
            ensureOptionalNumberInRange(body.annualRaiseRatePct, "annualRaiseRatePct", -20, 100) ??
            resource.annualRaiseRatePct,
          child1Name: ensureOptionalString(body.child1Name, "child1Name") ?? resource.child1Name,
          child1BirthDate:
            ensureOptionalString(body.child1BirthDate, "child1BirthDate") ?? resource.child1BirthDate,
          child2Name: ensureOptionalString(body.child2Name, "child2Name") ?? resource.child2Name,
          child2BirthDate:
            ensureOptionalString(body.child2BirthDate, "child2BirthDate") ?? resource.child2BirthDate,
          retirementTargetAge:
            ensureOptionalNumberInRange(body.retirementTargetAge, "retirementTargetAge", 45, 90) ??
            resource.retirementTargetAge,
          householdSize: ensureOptionalNumber(body.householdSize, "householdSize") ?? resource.householdSize,
          currency: ensureOptionalString(body.currency, "currency") ?? resource.currency,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(userId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = getStatusCode(error);
        if (status === 404) {
          return fail("NOT_FOUND", "Profile not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update profile", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

