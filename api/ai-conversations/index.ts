import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { getContainer } from "../shared/cosmosClient";
import { fail, ok } from "../shared/responses";
import { ensureOptionalString, requireUserId } from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";

async function deleteConversationWithMessages(
  userId: string,
  conversationId: string,
  conversationsContainer: ReturnType<typeof getContainer>,
  messagesContainer: ReturnType<typeof getContainer>
): Promise<void> {
  const messagesQuery = {
    query:
      "SELECT c.id FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage'",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@conversationId", value: conversationId }
    ]
  };

  const partitionKey = [userId, conversationId];
  const { resources: messages } = await messagesContainer.items
    .query(messagesQuery, { partitionKey })
    .fetchAll();

  for (const message of messages as Array<{ id?: string }>) {
    if (!message.id) {
      continue;
    }
    await messagesContainer.item(message.id, partitionKey).delete();
  }

  await conversationsContainer.item(conversationId, userId).delete();
}


export async function aiConversationsHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  let container;
  try {
    container = getContainer("aiConversations");
  } catch (error: unknown) {
    context.log(error);
    return fail("SERVER_ERROR", "Cosmos DB configuration error", 500);
  }
  const conversationId = req.params.conversationId;
  const messagesContainer = getContainer("aiMessages");

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
        body = await parseJsonBody(req);
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

        const { resource } = await container.items.create(conversation);

        const greetingMessage = {
          id: randomUUID(),
          userId,
          conversationId: conversation.id,
          type: "AiMessage",
          role: "assistant",
          content:
            "Kevin님, 안녕하세요! 저는 Mr. Money입니다. 현재 자산/지출 데이터를 바탕으로 실행 가능한 전략을 같이 정리해드릴게요. 우선 가장 고민되는 목표(예: 투자 비중, 은퇴 준비, 현금흐름 개선)를 한 가지만 알려주세요.",
          createdAt: now
        };

        await messagesContainer.items.create(greetingMessage);

        const listQuery = {
          query:
            "SELECT c.id, c.createdAt FROM c WHERE c.userId = @userId AND c.type = 'AiConversation' ORDER BY c.createdAt ASC",
          parameters: [{ name: "@userId", value: userId }]
        };

        const { resources: allConversations } = await container.items.query(listQuery).fetchAll();
        const maxConversations = 8;
        const overflowCount = Math.max(0, allConversations.length - maxConversations);

        if (overflowCount > 0) {
          const toDelete = (allConversations as Array<{ id?: string }>).slice(0, overflowCount);

          for (const oldConversation of toDelete) {
            const oldConversationId = oldConversation.id;
            if (!oldConversationId || oldConversationId === conversation.id) {
              continue;
            }
            await deleteConversationWithMessages(
              userId,
              oldConversationId,
              container,
              messagesContainer
            );
          }
        }

        return ok(
          {
            ...(resource ?? {}),
            greetingMessage
          },
          201
        );
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith("Invalid")) {
          return fail("VALIDATION_ERROR", error.message, 400);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create conversation", 500);
      }
    }
    case "DELETE": {
      if (!conversationId) {
        return fail("VALIDATION_ERROR", "Missing conversationId", 400);
      }

      try {
        const { resource } = await container.item(conversationId, userId).read();
        if (!resource) {
          return fail("NOT_FOUND", "Conversation not found", 404);
        }

        await deleteConversationWithMessages(userId, conversationId, container, messagesContainer);
        return ok({ id: conversationId, deleted: true });
      } catch (error: unknown) {
        const status = (error as { code?: number; statusCode?: number }).statusCode;
        if (status === 404) {
          return fail("NOT_FOUND", "Conversation not found", 404);
        }
        context.log(error);
        return fail("SERVER_ERROR", "Failed to delete conversation", 500);
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

