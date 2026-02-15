import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import {
  ensureNumber,
  ensureOptionalNumber,
  ensureOptionalString,
  ensureString,
  requireUserId
} from "../shared/validators";

export async function profileHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const container = getContainer("users");

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
        body = (await req.json()) as Record<string, unknown>;
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
          householdSize: ensureNumber(body.householdSize, "householdSize"),
          currency: ensureString(body.currency, "currency"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(profile);
        return ok(resource, 201);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
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
        body = (await req.json()) as Record<string, unknown>;
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
          householdSize: ensureOptionalNumber(body.householdSize, "householdSize") ?? resource.householdSize,
          currency: ensureOptionalString(body.currency, "currency") ?? resource.currency,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(userId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
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

app.http("profile", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "profile",
  handler: profileHandler
});
