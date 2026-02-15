import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import { ensureOptionalString, requireUserId } from "../shared/validators";

export async function aiConversationsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers as Record<string, string | undefined>);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const container = getContainer("aiConversations");
  const conversationId = req.params.conversationId;

  switch (req.method.toUpperCase()) {
    case "GET": {
      if (conversationId) {
        try {
          const { resource } = await container.item(conversationId, userId).read();
          if (!resource) {
            return fail("NOT_FOUND", "Conversation not found", 404);
          }
          return ok(resource);
        } catch (error: unknown) {
          const status = (error as { code?: number; statusCode?: number }).statusCode;
          if (status === 404) {
            return fail("NOT_FOUND", "Conversation not found", 404);
          }
          context.log(error);
          return fail("SERVER_ERROR", "Failed to fetch conversation", 500);
        }
      }

      try {
        const query = {
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'AiConversation'",
          parameters: [{ name: "@userId", value: userId }]
        };
        const { resources } = await container.items.query(query).fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list conversations", 500);
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
        const now = new Date().toISOString();
        const conversation = {
          id: randomUUID(),
          userId,
          type: "AiConversation",
          title: ensureOptionalString(body.title, "title") ?? "",
          createdAt: now,
          updatedAt: now
        };

        const { resource } = await container.items.create(conversation, { partitionKey: userId });
        return ok(resource, 201);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create conversation", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

app.http("aiConversations", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "ai/conversations/{conversationId?}",
  handler: aiConversationsHandler
});
