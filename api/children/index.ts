import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
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

export async function childrenHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers as Record<string, string | undefined>);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const container = getContainer("children");
  const childId = req.params.childId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (childId) {
        try {
          const { resource } = await container.item(childId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Child not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Child not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch child", 500);
        }
      }

      try {
        const query = {
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Child'",
          parameters: [{ name: "@userId", value: userId }]
        };
        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list children", 500);
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
        const child = {
          id: randomUUID(),
          userId,
          type: "Child",
          name: ensureString(body.name, "name"),
          birthYear: ensureNumber(body.birthYear, "birthYear"),
          grade: ensureString(body.grade, "grade"),
          targetUniversityYear: ensureNumber(body.targetUniversityYear, "targetUniversityYear"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const { resource } = await container.items.create(child, { partitionKey: userId });
        return ok(resource, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create child", 500);
      }
    }
    case "PUT": {
      if (!childId) {
        return fail("VALIDATION_ERROR", "Missing childId", 400);
      }

      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      try {
        const { resource } = await container.item(childId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Child not found", 404);
        }

        const updated = {
          ...resource,
          name: ensureOptionalString(body.name, "name") ?? resource.name,
          birthYear: ensureOptionalNumber(body.birthYear, "birthYear") ?? resource.birthYear,
          grade: ensureOptionalString(body.grade, "grade") ?? resource.grade,
          targetUniversityYear:
            ensureOptionalNumber(body.targetUniversityYear, "targetUniversityYear") ??
            resource.targetUniversityYear,
          updatedAt: new Date().toISOString()
        };

        const { resource: saved } = await container.item(childId, userId).replace(updated);
        return ok(saved);
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Child not found", 404);
        }
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to update child", 500);
      }
    }
    case "DELETE": {
      if (!childId) {
        return fail("VALIDATION_ERROR", "Missing childId", 400);
      }

      try {
        await container.item(childId, userId).delete();
        return ok({ id: childId });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Child not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete child", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

app.http("children", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "children/{childId?}",
  handler: childrenHandler
});
