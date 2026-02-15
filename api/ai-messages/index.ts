import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getAuthContext } from "../shared/auth";
import { buildUserContext } from "../shared/context-builder";
import { getContainer } from "../shared/cosmosClient";
import { getDeploymentName, getOpenAIClient } from "../shared/openai";
import { fail, ok } from "../shared/responses";
import { ensureString, requireUserId } from "../shared/validators";
import { parseJsonBody } from "../shared/request-body";
import { searchWeb } from "../shared/webSearch";

type ProfileContext = {
  fullName?: string;
  birthDate?: string;
  employerName?: string;
  jobTitle?: string;
  baseSalaryAnnual?: number;
  annualBonus?: number;
  annualRsu?: number;
  rsuShares?: number;
  rsuVestingPriceUsd?: number;
  rsuVestingCycle?: "monthly" | "quarterly" | "yearly" | "irregular";
  annualRaiseRatePct?: number;
  child1Name?: string;
  child1BirthDate?: string;
  child2Name?: string;
  child2BirthDate?: string;
  retirementTargetAge?: number;
};

function getAgeFromBirthDate(birthDate?: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

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

        let profileContextText = "프로필 정보 없음";
        try {
          const usersContainer = getContainer("users");
          const { resource } = await usersContainer.item(userId, userId).read();
          const profile = (resource as ProfileContext | undefined) ?? undefined;

          if (profile) {
            const currentAge = getAgeFromBirthDate(profile.birthDate);
            const child1Age = getAgeFromBirthDate(profile.child1BirthDate);
            const child2Age = getAgeFromBirthDate(profile.child2BirthDate);
            const annualBase = Number(profile.baseSalaryAnnual ?? 0);
            const annualBonus = Number(profile.annualBonus ?? 0);
            const annualRsu = Number(profile.annualRsu ?? 0);
            const rsuShares = Number(profile.rsuShares ?? 0);
            const rsuVestingPriceUsd = Number(profile.rsuVestingPriceUsd ?? 0);
            const totalAnnualComp = annualBase + annualBonus + annualRsu;
            const annualRaiseRate = Number(profile.annualRaiseRatePct ?? 0);
            const projectedCompNextYear =
              totalAnnualComp > 0 ? Math.round(totalAnnualComp * (1 + annualRaiseRate / 100)) : 0;
            const yearsToRetirement =
              typeof profile.retirementTargetAge === "number" && typeof currentAge === "number"
                ? profile.retirementTargetAge - currentAge
                : null;

            const lines = [
              `- 사용자 이름: ${profile.fullName ?? "미설정"}`,
              `- 사용자 나이: ${typeof currentAge === "number" ? `${currentAge}세` : "미설정"}`,
              `- 직장: ${profile.employerName ?? "미설정"}`,
              `- 직무/직급: ${profile.jobTitle ?? "미설정"}`,
              `- 연 기본급: ${annualBase > 0 ? `${annualBase.toLocaleString()}원` : "미설정"}`,
              `- 연간 보너스: ${annualBonus > 0 ? `${annualBonus.toLocaleString()}원` : "미설정"}`,
              `- 연간 RSU: ${annualRsu > 0 ? `${annualRsu.toLocaleString()}원` : "미설정"}`,
              `- RSU 주식수: ${rsuShares > 0 ? `${rsuShares.toLocaleString()}주` : "미설정"}`,
              `- RSU 베스팅 시가(USD): ${rsuVestingPriceUsd > 0 ? `${rsuVestingPriceUsd.toLocaleString()} USD` : "미설정"}`,
              `- RSU 베스팅 주기: ${profile.rsuVestingCycle ?? "미설정"}`,
              `- 연봉 상승률(연): ${profile.annualRaiseRatePct !== undefined ? `${annualRaiseRate}%` : "미설정"}`,
              `- 연 총보상(기본급+보너스+RSU): ${totalAnnualComp > 0 ? `${totalAnnualComp.toLocaleString()}원` : "미설정"}`,
              `- 내년 예상 총보상: ${projectedCompNextYear > 0 ? `${projectedCompNextYear.toLocaleString()}원` : "미설정"}`,
              `- 은퇴 목표 연령: ${typeof profile.retirementTargetAge === "number" ? `${profile.retirementTargetAge}세` : "미설정"}`,
              `- 은퇴까지 남은 기간: ${typeof yearsToRetirement === "number" ? `${yearsToRetirement}년` : "미설정"}`,
              `- 자녀1: ${profile.child1Name ?? "미설정"} / ${typeof child1Age === "number" ? `${child1Age}세` : "나이 미설정"}`,
              `- 자녀2: ${profile.child2Name ?? "미설정"} / ${typeof child2Age === "number" ? `${child2Age}세` : "나이 미설정"}`
            ];

            profileContextText = lines.join("\n");
          }
        } catch (profileError: unknown) {
          context.log("Profile context read error:", profileError);
        }

        let webSearchContext = "웹 검색 결과 없음";
        try {
          const webResults = await searchWeb(content, 4);
          if (webResults.length > 0) {
            webSearchContext = webResults
              .map(
                (item, index) =>
                  `${index + 1}. ${item.title}\n- 요약: ${item.snippet}\n- URL: ${item.url}`
              )
              .join("\n\n");
          }
        } catch (searchError: unknown) {
          context.log("Web search error:", searchError);
        }

        // Build system prompt with context
        const systemPrompt = `당신의 이름은 Mr. Money 입니다.

당신은 전문 금융 자문 AI입니다.
당신의 역할은 종합 자산 관리 컨설턴트로서 다음 분야에 대해 전문가 수준의 가이드를 제공하는 것입니다:

- 투자 전략 (주식, 채권, ETF, 부동산, 대체 자산)
- 은퇴 설계 (연금, 연금보험, 인출 전략, 세금 효율성)
- 개인 재무 및 자산 관리 (예산 관리, 저축, 부채 관리, 보험)
- 경제 및 시장 인사이트 (거시경제 동향, 금리, 인플레이션, 글로벌 시장)

핵심 원칙:
- 장기적인 재무 건전성에 맞춘 명확하고 구조적이며 실행 가능한 조언을 제공합니다.
- 전문성과 권위를 갖추되, 친근하고 이해하기 쉽게 소통합니다.
- 기회와 위험을 균형 있게 제시합니다.
- 복잡한 주제를 이해하기 쉽게 예시, 비교, 맥락 설명을 활용합니다.
- 개인 맞춤형 금융 추천은 반드시 면책 고지를 포함하며, 일반적인 전략과 프레임워크 중심으로 제공합니다.

포지셔닝:
- 당신은 투자 전략가, 은퇴 설계 전문가, 경제 분석가의 전문성을 결합한 신뢰할 수 있는 금융 컨설턴트입니다.
- 신뢰할 수 있는 자료를 종합하여 사용자가 정보에 기반한 금융 결정을 내릴 수 있도록 돕습니다.

응답 스타일:
- 항상 한국어로 답변합니다.
- 필요한 경우 항목별로 구조화하여 제시합니다.
- 구체적인 행동 단계(예: 오늘/이번 달/분기)를 함께 제안합니다.
- 웹 검색 결과를 사용한 경우, 답변 끝에 "참고한 출처" 섹션을 만들고 URL을 1개 이상 포함합니다.

현재 사용자 재무 상황:
- 총 자산: ${userContext.totalAssets.toLocaleString()}원
- 총 부채: ${userContext.totalLiabilities.toLocaleString()}원
- 순자산: ${userContext.netWorth.toLocaleString()}원
- 월 고정지출: ${userContext.monthlyExpenses.toLocaleString()}원
- 월 수입: ${userContext.monthlyIncome.toLocaleString()}원

자산 구성:
${(userContext.assetBreakdown.length > 0 ? userContext.assetBreakdown : [{ category: "기타", value: 0 }])
  .map((a) => `- ${a.category}: ${a.value.toLocaleString()}원`)
  .join("\n")}

주요 지출:
${(userContext.topExpenses.length > 0 ? userContext.topExpenses : [{ name: "데이터 없음", amount: 0 }])
  .map((e) => `- ${e.name}: ${e.amount.toLocaleString()}원`)
  .join("\n")}

사용자 프로필/가족/은퇴 정보:
${profileContextText}

웹 검색 결과(최신 정보 참고용):
${webSearchContext}

사용자 질문에 대해 구체적이고 실용적인 조언을 제공하세요.`;

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

          const completion = await client.getChatCompletions(deploymentName, messages);

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

