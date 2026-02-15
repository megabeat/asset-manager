import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { buildUserContext } from "../shared/context-builder";
import { getContainer } from "../shared/cosmosClient";
import { getDeploymentName, getOpenAIClient } from "../shared/openai";
import { fail, ok } from "../shared/responses";
import { ensureString, requireUserId } from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";

function toErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}


export async function aiMessagesHandler(context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const { userId } = getAuthContext(req.headers);

  try {
    requireUserId(userId);
  } catch {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const conversationId = req.params.conversationId;
  if (!conversationId) {
    return fail("VALIDATION_ERROR", "Missing conversationId", 400);
  }

  const messagesContainer = getContainer("aiMessages");
  const conversationsContainer = getContainer("aiConversations");
  const partitionKey = [userId, conversationId];

  switch (req.method.toUpperCase()) {
    case "GET": {
      try {
        const query = {
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage' ORDER BY c.createdAt ASC",
          parameters: [
            { name: "@userId", value: userId },
            { name: "@conversationId", value: conversationId }
          ]
        };

        const { resources } = await messagesContainer.items
          .query(query, { partitionKey })
          .fetchAll();
        return ok(resources);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to list messages", 500);
      }
    }
    case "POST": {
      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(req);
      } catch {
        return fail("INVALID_JSON", "Invalid JSON body", 400);
      }

      let content: string;
      try {
        content = ensureString(body.message, "message");
      } catch (error: unknown) {
        return fail("VALIDATION_ERROR", (error as Error).message, 400);
      }

      try {
        const { resource: conversation } = await conversationsContainer
          .item(conversationId, userId)
          .read();
        if (!conversation) {
          return fail("NOT_FOUND", "Conversation not found", 404);
        }

        const now = new Date().toISOString();
        const userMessage = {
          id: randomUUID(),
          userId,
          conversationId,
          type: "AiMessage",
          role: "user",
          content,
          createdAt: now
        };

        await messagesContainer.items.create(userMessage);

        // Fetch user context
        const assetsContainer = getContainer("assets");
        const liabilitiesContainer = getContainer("liabilities");
        const expensesContainer = getContainer("expenses");
        const incomesContainer = getContainer("incomes");

        const userContext = await buildUserContext(
          userId,
          assetsContainer,
          liabilitiesContainer,
          expensesContainer,
          incomesContainer
        );

        // Build system prompt with context
        const systemPrompt = `당신은 개인 자산관리 전문 AI 상담사입니다. 사용자의 재무 상황을 분석하고 실용적인 조언을 제공하세요.

현재 사용자 재무 상황:
- 총 자산: ${userContext.totalAssets.toLocaleString()}원
- 총 부채: ${userContext.totalLiabilities.toLocaleString()}원
- 순자산: ${userContext.netWorth.toLocaleString()}원
- 월 고정지출: ${userContext.monthlyExpenses.toLocaleString()}원
- 월 수입: ${userContext.monthlyIncome.toLocaleString()}원

자산 구성:
${userContext.assetBreakdown.map((a) => `- ${a.category}: ${a.value.toLocaleString()}원`).join("\n")}

주요 지출:
${userContext.topExpenses.map((e) => `- ${e.name}: ${e.amount.toLocaleString()}원`).join("\n")}

사용자 질문에 대해 구체적이고 실용적인 조언을 한국어로 제공하세요.`;

        // Fetch conversation history
        const historyQuery = await messagesContainer.items
          .query(
            {
              query:
                "SELECT TOP 10 c.role, c.content FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage' ORDER BY c.createdAt DESC",
              parameters: [
                { name: "@userId", value: userId },
                { name: "@conversationId", value: conversationId }
              ]
            },
            { partitionKey }
          )
          .fetchAll();

        const history = (
          historyQuery.resources as Array<{ role: string; content: string }>
        ).reverse();

        // Call Azure OpenAI
        let assistantContent = "죄송합니다. 현재 AI 서비스를 이용할 수 없습니다.";
        
        try {
          const client = getOpenAIClient();
          const deploymentName = getDeploymentName();

          const messages = [
            { role: "system" as const, content: systemPrompt },
            ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
            { role: "user" as const, content }
          ];

          const completion = await client.getChatCompletions(
            deploymentName,
            messages,
            {
              maxTokens: 800,
              temperature: 0.7
            }
          );

          assistantContent = completion.choices[0]?.message?.content ?? assistantContent;
        } catch (aiError: unknown) {
          context.log("OpenAI error:", aiError);
          assistantContent = "AI 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
        }

        const assistantMessage = {
          id: randomUUID(),
          userId,
          conversationId,
          type: "AiMessage",
          role: "assistant",
          content: assistantContent,
          createdAt: new Date().toISOString()
        };

        await messagesContainer.items.create(assistantMessage);

        return ok({ userMessage, assistantMessage }, 201);
      } catch (error: unknown) {
        context.log(error);
        return fail("SERVER_ERROR", "Failed to create message", 500, toErrorDetails(error));
      }
    }
    default:
      context.log(`Unsupported method: ${req.method}`);
      return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

