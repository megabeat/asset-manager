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
  annualFixedExtra?: number;
  annualBonus?: number;
  annualRsu?: number;
  rsuShares?: number;
  rsuVestingPriceUsd?: number;
  rsuVestingCycle?: "monthly" | "quarterly" | "yearly" | "irregular";
  annualRaiseRatePct?: number;
  child1Name?: string;
  child1BirthDate?: string;
  child1TargetUniversityYear?: number;
  child2Name?: string;
  child2BirthDate?: string;
  child2TargetUniversityYear?: number;
  retirementTargetAge?: number;
  spouseName?: string;
  spouseBirthDate?: string;
  spouseEmployerName?: string;
  spouseJobTitle?: string;
  spouseAnnualIncome?: number;
  spouseRetirementTargetAge?: number;
};

type UserContext = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  assetBreakdown: Array<{ category: string; value: number }>;
  topExpenses: Array<{ name: string; amount: number }>;
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

function clampText(text: string, maxChars: number): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeHistory(
  rows: Array<{ role: string; content: string }>,
  maxItems: number,
  maxCharsPerItem: number,
  maxTotalChars: number
): Array<{ role: "user" | "assistant"; content: string }> {
  const trimmed = rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .slice(-maxItems)
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: clampText(String(row.content ?? ""), maxCharsPerItem)
    }));

  let total = 0;
  const bounded: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const item = trimmed[index];
    const nextTotal = total + item.content.length;
    if (nextTotal > maxTotalChars) {
      break;
    }
    bounded.push(item);
    total = nextTotal;
  }

  return bounded.reverse();
}

function buildFallbackAdvice(
  question: string,
  userContext: UserContext,
  profileContextText: string,
  diagnostic?: string
): string {
  const monthlySurplus = userContext.monthlyIncome - userContext.monthlyExpenses;
  const topAssetCategory =
    userContext.assetBreakdown.sort((a, b) => b.value - a.value)[0]?.category ?? "미확인";
  const netWorth = userContext.netWorth;

  const lines = [
    "현재 AI 모델 응답이 지연되어, 보유 데이터 기준으로 먼저 핵심 가이드를 드립니다.",
    "",
    "1) 현재 상태 요약",
    `- 순자산: ${netWorth.toLocaleString()}원`,
    `- 월 수입/지출: ${userContext.monthlyIncome.toLocaleString()}원 / ${userContext.monthlyExpenses.toLocaleString()}원`,
    `- 월 잉여자금: ${monthlySurplus.toLocaleString()}원`,
    `- 최대 자산 비중 카테고리: ${topAssetCategory}`,
    "",
    "2) 바로 실행할 액션",
    "- 잉여자금의 최소 20~30%는 비상금(입출금 가능 자산)으로 먼저 확보",
    "- 고정/구독 지출 결제일을 점검해 월초/월말 현금흐름 변동을 완화",
    "- 자산 비중이 한 카테고리에 쏠려 있다면 분산 비중(현금/채권/주식)을 재조정",
    "",
    "3) 다음 질문 추천",
    `- 방금 질문("${clampText(question, 80)}")을 기준으로, 목표 기간(예: 3년/10년)과 위험 성향(보수/중립/공격)을 알려주시면 구체 시나리오로 이어서 제안드릴게요.`,
    "",
    "(참고) 일시적인 AI 응답 지연 상황에서도 상담이 끊기지 않도록 기본 가이드로 우선 응답했습니다."
  ];

  if (profileContextText && profileContextText !== "프로필 정보 없음") {
    lines.splice(
      8,
      0,
      "",
      "프로필 반영 메모",
      "- 설정한 가족/은퇴/소득 정보는 다음 상세 시나리오 계산에 계속 반영됩니다."
    );
  }

  if (diagnostic) {
    lines.push("", `진단코드: ${clampText(diagnostic, 180)}`);
  }

  return lines.join("\n");
}

function serializeUnknownError(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractObjectMessage(errorObject: Record<string, unknown>): string {
  const directMessage = errorObject.message;
  if (typeof directMessage === "string" && directMessage.trim().length > 0) {
    return directMessage;
  }

  const nestedError = errorObject.error;
  if (nestedError && typeof nestedError === "object") {
    const nestedMessage = (nestedError as { message?: unknown }).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
      return nestedMessage;
    }
  }

  const details = errorObject.details;
  if (typeof details === "string" && details.trim().length > 0) {
    return details;
  }

  const name = typeof errorObject.name === "string" ? errorObject.name : "ObjectError";
  const code = errorObject.code ?? "NA";
  return `${name} code=${String(code)} payload=${serializeUnknownError(errorObject)}`;
}

function extractErrorInfo(error: unknown): { statusCode?: number; message: string } {
  if (!error) {
    return { message: "Unknown error" };
  }

  const errorObject =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;

  const statusCode = Number(
    (errorObject?.statusCode as number | string | undefined) ??
      (errorObject?.code as number | string | undefined)
  );

  if (error instanceof Error) {
    return {
      statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
      message: error.message
    };
  }

  if (errorObject) {
    return {
      statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
      message: extractObjectMessage(errorObject)
    };
  }

  return {
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    message: String(error)
  };
}

function compactDiagnosticMessage(message: string): string {
  if (!message) return "unknown";
  const sanitized = message
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .trim();
  return clampText(sanitized, 80);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
        let userContext: UserContext = {
          totalAssets: 0,
          totalLiabilities: 0,
          netWorth: 0,
          monthlyExpenses: 0,
          monthlyIncome: 0,
          assetBreakdown: [],
          topExpenses: []
        };

        try {
          const assetsContainer = getContainer("assets");
          const liabilitiesContainer = getContainer("liabilities");
          const expensesContainer = getContainer("expenses");
          const incomesContainer = getContainer("incomes");
          const usersContainer = getContainer("users");

          userContext = await withTimeout(
            buildUserContext(
              userId,
              assetsContainer,
              liabilitiesContainer,
              expensesContainer,
              incomesContainer,
              usersContainer
            ),
            5000,
            "User context timeout"
          );
        } catch (contextError: unknown) {
          context.log("User context build error:", contextError);
        }

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
            const annualFixedExtra = Number(profile.annualFixedExtra ?? 0);
            const annualBonus = Number(profile.annualBonus ?? 0);
            const annualRsu = Number(profile.annualRsu ?? 0);
            const rsuShares = Number(profile.rsuShares ?? 0);
            const rsuVestingPriceUsd = Number(profile.rsuVestingPriceUsd ?? 0);
            const totalAnnualComp = annualBase + annualFixedExtra + annualBonus + annualRsu;
            const annualRaiseRate = Number(profile.annualRaiseRatePct ?? 0);
            const projectedBaseNextYear =
              annualBase > 0 ? Math.round(annualBase * (1 + annualRaiseRate / 100)) : 0;
            const projectedCompNextYear =
              projectedBaseNextYear > 0 || annualFixedExtra > 0 || annualBonus > 0 || annualRsu > 0
                ? projectedBaseNextYear + annualFixedExtra + annualBonus + annualRsu
                : 0;
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
              `- 추가지급-고정(연): ${annualFixedExtra > 0 ? `${annualFixedExtra.toLocaleString()}원` : "미설정"}`,
              `- 연간 보너스: ${annualBonus > 0 ? `${annualBonus.toLocaleString()}원` : "미설정"}`,
              `- 연간 RSU: ${annualRsu > 0 ? `${annualRsu.toLocaleString()}원` : "미설정"}`,
              `- RSU 주식수: ${rsuShares > 0 ? `${rsuShares.toLocaleString()}주` : "미설정"}`,
              `- RSU 베스팅 시가(USD): ${rsuVestingPriceUsd > 0 ? `${rsuVestingPriceUsd.toLocaleString()} USD` : "미설정"}`,
              `- RSU 베스팅 주기: ${profile.rsuVestingCycle ?? "미설정"}`,
              `- 연봉 상승률(기본급 기준): ${profile.annualRaiseRatePct !== undefined ? `${annualRaiseRate}%` : "미설정"}`,
              `- 연 총보상(기본급+고정추가지급+보너스+RSU): ${totalAnnualComp > 0 ? `${totalAnnualComp.toLocaleString()}원` : "미설정"}`,
              `- 내년 예상 기본급(상승률 반영): ${projectedBaseNextYear > 0 ? `${projectedBaseNextYear.toLocaleString()}원` : "미설정"}`,
              `- 내년 예상 총보상: ${projectedCompNextYear > 0 ? `${projectedCompNextYear.toLocaleString()}원` : "미설정"}`,
              `- 은퇴 목표 연령: ${typeof profile.retirementTargetAge === "number" ? `${profile.retirementTargetAge}세` : "미설정"}`,
              `- 은퇴까지 남은 기간: ${typeof yearsToRetirement === "number" ? `${yearsToRetirement}년` : "미설정"}`,
              `- 자녀1: ${profile.child1Name ?? "미설정"} / ${typeof child1Age === "number" ? `${child1Age}세` : "나이 미설정"} / 예상 대학 진학년도: ${typeof profile.child1TargetUniversityYear === "number" ? `${profile.child1TargetUniversityYear}년` : "미설정"}`,
              `- 자녀2: ${profile.child2Name ?? "미설정"} / ${typeof child2Age === "number" ? `${child2Age}세` : "나이 미설정"} / 예상 대학 진학년도: ${typeof profile.child2TargetUniversityYear === "number" ? `${profile.child2TargetUniversityYear}년` : "미설정"}`
            ];
            // Spouse info
            if (profile.spouseName) {
              const spouseAge = getAgeFromBirthDate(profile.spouseBirthDate);
              lines.push(`- 배우자: ${profile.spouseName}`);
              if (typeof spouseAge === "number") lines.push(`- 배우자 나이: ${spouseAge}세`);
              if (profile.spouseEmployerName) lines.push(`- 배우자 직장: ${profile.spouseEmployerName}`);
              if (profile.spouseJobTitle) lines.push(`- 배우자 직무: ${profile.spouseJobTitle}`);
              if (profile.spouseAnnualIncome && profile.spouseAnnualIncome > 0) lines.push(`- 배우자 연수입: ${profile.spouseAnnualIncome.toLocaleString()}원`);
              if (typeof profile.spouseRetirementTargetAge === "number") {
                const spouseAge = getAgeFromBirthDate(profile.spouseBirthDate);
                lines.push(`- 배우자 은퇴 목표 연령: ${profile.spouseRetirementTargetAge}세`);
                if (typeof spouseAge === "number") lines.push(`- 배우자 은퇴까지 남은 기간: ${profile.spouseRetirementTargetAge - spouseAge}년`);
              }
            }
            profileContextText = lines.join("\n");
          }
        } catch (profileError: unknown) {
          context.log("Profile context read error:", profileError);
        }

        profileContextText = clampText(profileContextText, 2200);

        // --- Fetch detailed asset, expense, income, children, education, goal fund data ---
        type AssetDetail = { name: string; category: string; currentValue: number; acquiredValue?: number; quantity?: number; symbol?: string; note?: string; pensionMonthlyContribution?: number; pensionReceiveAge?: number; autoUpdate?: boolean; owner?: string };
        type ExpenseDetail = { name: string; amount: number; cycle: string; expenseType: string; billingDay?: number; isInvestmentTransfer?: boolean; investmentTargetCategory?: string; category?: string; owner?: string };
        type IncomeDetail = { name: string; amount: number; cycle: string; isFixedIncome?: boolean; category?: string; note?: string; owner?: string };
        type ChildDetail = { name: string; birthYear: number; grade: string; targetUniversityYear: number };
        type EduPlanDetail = { childId: string; annualCost: number; inflationRate: number; startYear: number; endYear: number };
        type GoalFundDetail = { name: string; horizon: string; vehicle: string; targetAmount: number; currentAmount: number; monthlyContribution: number; targetDate?: string; status: string; note?: string };

        let assetDetails: AssetDetail[] = [];
        let expenseDetails: ExpenseDetail[] = [];
        let incomeDetails: IncomeDetail[] = [];
        let childDetails: ChildDetail[] = [];
        let eduPlanDetails: EduPlanDetail[] = [];
        let goalFundDetails: GoalFundDetail[] = [];

        try {
          const [assetsRes, expensesRes, incomesRes, childrenRes, eduRes, goalRes] = await Promise.all([
            getContainer("assets").items.query({
              query: "SELECT c.name, c.category, c.currentValue, c.acquiredValue, c.quantity, c.symbol, c.note, c.pensionMonthlyContribution, c.pensionReceiveAge, c.autoUpdate, c.owner FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
              parameters: [{ name: "@userId", value: userId }]
            }).fetchAll(),
            getContainer("expenses").items.query({
              query: "SELECT c.name, c.amount, c.cycle, c.expenseType, c.billingDay, c.isInvestmentTransfer, c.investmentTargetCategory, c.category, c.owner FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.entrySource != 'auto_settlement'",
              parameters: [{ name: "@userId", value: userId }]
            }).fetchAll(),
            getContainer("incomes").items.query({
              query: "SELECT c.name, c.amount, c.cycle, c.isFixedIncome, c.category, c.note, c.owner FROM c WHERE c.userId = @userId AND c.type = 'Income' AND c.entrySource != 'auto_settlement'",
              parameters: [{ name: "@userId", value: userId }]
            }).fetchAll(),
            getContainer("children").items.query({
              query: "SELECT c.id, c.name, c.birthYear, c.grade, c.targetUniversityYear FROM c WHERE c.userId = @userId AND c.type = 'Child'",
              parameters: [{ name: "@userId", value: userId }]
            }).fetchAll(),
            getContainer("educationPlans").items.query({
              query: "SELECT c.childId, c.annualCost, c.inflationRate, c.startYear, c.endYear FROM c WHERE c.userId = @userId AND c.type = 'EducationPlan'",
              parameters: [{ name: "@userId", value: userId }]
            }).fetchAll(),
            getContainer("goalFunds").items.query({
              query: "SELECT c.name, c.horizon, c.vehicle, c.targetAmount, c.currentAmount, c.monthlyContribution, c.targetDate, c.status, c.note FROM c WHERE c.userId = @userId AND c.type = 'GoalFund'",
              parameters: [{ name: "@userId", value: userId }]
            }).fetchAll()
          ]);

          assetDetails = assetsRes.resources as AssetDetail[];
          expenseDetails = expensesRes.resources as ExpenseDetail[];
          incomeDetails = incomesRes.resources as IncomeDetail[];
          childDetails = childrenRes.resources as ChildDetail[];
          eduPlanDetails = eduRes.resources as EduPlanDetail[];
          goalFundDetails = goalRes.resources as GoalFundDetail[];
        } catch (detailError: unknown) {
          context.log("Detail context fetch error:", detailError);
        }

        const categoryLabels: Record<string, string> = {
          deposit: "예적금", savings: "저축", stock_kr: "한국주식", stock_us: "미국주식",
          etf: "ETF", bond: "채권", fund: "펀드", crypto: "암호화폐", pension: "연금", pension_national: "국민연금", pension_personal: "개인연금", pension_retirement: "퇴직연금", pension_government: "공무원연금",
          insurance: "보험", real_estate: "부동산", cash: "현금", car: "자동차", other: "기타"
        };
        const cycleLabelsMap: Record<string, string> = { monthly: "매월", yearly: "매년", one_time: "일회성" };
        const horizonLabels: Record<string, string> = { short: "단기", mid: "중기", long: "장기" };
        const vehicleLabels: Record<string, string> = {
          savings: "저축", deposit: "예금", etf: "ETF", stock: "주식",
          fund: "펀드", crypto: "암호화폐", cash: "현금", other: "기타"
        };

        const formatAssetList = (assets: AssetDetail[]): string => {
          if (assets.length === 0) return "등록된 자산 없음";
          return assets.map((a, i) => {
            const parts = [`${i + 1}. ${a.name} (${categoryLabels[a.category] ?? a.category}): 현재가치 ${a.currentValue.toLocaleString()}원`];
            if (a.owner && a.owner !== '본인') parts.push(`소유: ${a.owner}`);
            if (a.acquiredValue) parts.push(`매입가 ${a.acquiredValue.toLocaleString()}원`);
            if (a.quantity) parts.push(`수량 ${a.quantity}`);
            if (a.symbol) parts.push(`종목코드 ${a.symbol}`);
            if (a.pensionMonthlyContribution) parts.push(`월 납입 ${a.pensionMonthlyContribution.toLocaleString()}원`);
            if (a.pensionReceiveAge) parts.push(`수령 시작 ${a.pensionReceiveAge}세`);
            if (a.note) parts.push(`메모: ${a.note}`);
            return parts.join(" / ");
          }).join("\n");
        };

        const formatExpenseList = (expenses: ExpenseDetail[]): string => {
          if (expenses.length === 0) return "등록된 지출 없음";
          const sorted = [...expenses].sort((a, b) => b.amount - a.amount);
          return sorted.map((e, i) => {
            const typeLabel = e.expenseType === "fixed" ? "고정" : e.expenseType === "subscription" ? "구독" : "일회성";
            const parts = [`${i + 1}. ${e.name}: ${e.amount.toLocaleString()}원 (${typeLabel}, ${cycleLabelsMap[e.cycle] ?? e.cycle})`];
            if (e.billingDay) parts.push(`결제일 ${e.billingDay}일`);
            if (e.isInvestmentTransfer) parts.push(`[투자이체→${categoryLabels[e.investmentTargetCategory ?? ""] ?? e.investmentTargetCategory ?? "미지정"}]`);
            if (e.category) parts.push(`분류: ${e.category}`);
            if (e.owner && e.owner !== '본인') parts.push(`소유: ${e.owner}`);
            return parts.join(" / ");
          }).join("\n");
        };

        const formatIncomeList = (incomes: IncomeDetail[]): string => {
          if (incomes.length === 0) return "등록된 수입 없음";
          return incomes.map((inc, i) => {
            const parts = [`${i + 1}. ${inc.name}: ${inc.amount.toLocaleString()}원 (${cycleLabelsMap[inc.cycle] ?? inc.cycle})`];
            if (inc.isFixedIncome) parts.push("[고정수입]");
            if (inc.category) parts.push(`분류: ${inc.category}`);
            if (inc.note) parts.push(`메모: ${inc.note}`);
            if (inc.owner && inc.owner !== '본인') parts.push(`소유: ${inc.owner}`);
            return parts.join(" / ");
          }).join("\n");
        };

        const formatChildAndEdu = (children: ChildDetail[], eduPlans: EduPlanDetail[]): string => {
          if (children.length === 0) return "등록된 자녀 정보 없음";
          return children.map((child, i) => {
            const age = new Date().getFullYear() - child.birthYear;
            const plans = eduPlans.filter(p => p.childId === (child as unknown as { id: string }).id);
            const planText = plans.length > 0
              ? plans.map(p => `교육비 연 ${p.annualCost.toLocaleString()}원 (${p.startYear}~${p.endYear}년, 물가상승률 ${(p.inflationRate * 100).toFixed(1)}%)`).join("; ")
              : "교육 플랜 미설정";
            return `${i + 1}. ${child.name} (${age}세, ${child.grade}) / 대학 진학 ${child.targetUniversityYear}년 / ${planText}`;
          }).join("\n");
        };

        const formatGoalFunds = (goals: GoalFundDetail[]): string => {
          if (goals.length === 0) return "등록된 목표자금 없음";
          const statusLabels: Record<string, string> = { active: "진행중", paused: "일시정지", completed: "완료", cancelled: "취소" };
          return goals.map((g, i) => {
            const progress = g.targetAmount > 0 ? ((g.currentAmount / g.targetAmount) * 100).toFixed(1) : "0";
            const parts = [`${i + 1}. ${g.name} (${horizonLabels[g.horizon] ?? g.horizon}, ${vehicleLabels[g.vehicle] ?? g.vehicle}, ${statusLabels[g.status] ?? g.status})`];
            parts.push(`목표 ${g.targetAmount.toLocaleString()}원 / 현재 ${g.currentAmount.toLocaleString()}원 (${progress}%)`);
            parts.push(`월 납입 ${g.monthlyContribution.toLocaleString()}원`);
            if (g.targetDate) parts.push(`목표일 ${g.targetDate}`);
            if (g.note) parts.push(`메모: ${g.note}`);
            return parts.join(" / ");
          }).join("\n");
        };

        const detailedAssetsText = clampText(formatAssetList(assetDetails), 3000);
        const detailedExpensesText = clampText(formatExpenseList(expenseDetails), 2000);
        const detailedIncomesText = clampText(formatIncomeList(incomeDetails), 1000);
        const detailedChildEduText = clampText(formatChildAndEdu(childDetails, eduPlanDetails), 1000);
        const detailedGoalFundsText = clampText(formatGoalFunds(goalFundDetails), 1500);

        let webSearchContext = "웹 검색 결과 없음";
        try {
          const webResults = await withTimeout(
            searchWeb(content, 4),
            5000,
            "Web search timeout"
          );
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

        webSearchContext = clampText(webSearchContext, 2000);

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

자산 구성(카테고리별 합계):
${(userContext.assetBreakdown.length > 0 ? userContext.assetBreakdown : [{ category: "기타", value: 0 }])
  .map((a) => `- ${a.category}: ${a.value.toLocaleString()}원`)
  .join("\n")}

보유 자산 개별 상세:
${detailedAssetsText}

전체 지출 내역:
${detailedExpensesText}

전체 수입 내역:
${detailedIncomesText}

사용자 프로필/가족/은퇴 정보:
${profileContextText}

자녀 및 교육 플랜 상세:
${detailedChildEduText}

목표 자금(Goal Funds):
${detailedGoalFundsText}

웹 검색 결과(최신 정보 참고용):
${webSearchContext}

중요: 위 데이터는 사용자가 직접 등록한 실제 자산/지출/수입/가족 정보입니다. 상담 시 이 구체적인 데이터를 적극 활용하여 맞춤형 조언을 제공하세요. 각 자산의 이름, 금액, 카테고리를 정확히 언급하며, 사용자의 전체 재무 그림을 기반으로 답변하세요.`;

        // Fetch conversation history
        let history: Array<{ role: string; content: string }> = [];
        try {
          const historyQuery = await withTimeout(
            messagesContainer.items
              .query(
                {
                  query:
                    "SELECT TOP 6 c.role, c.content FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage' ORDER BY c.createdAt DESC",
                  parameters: [
                    { name: "@userId", value: userId },
                    { name: "@conversationId", value: conversationId }
                  ]
                },
                { partitionKey }
              )
              .fetchAll(),
            4000,
            "History query timeout"
          );

          history = (
            historyQuery.resources as Array<{ role: string; content: string }>
          ).reverse();
        } catch (historyError: unknown) {
          context.log("History query error:", historyError);
        }

        // Call Azure OpenAI
        let assistantContent = "죄송합니다. 현재 AI 서비스를 이용할 수 없습니다.";
        
        try {
          const client = getOpenAIClient();
          const deploymentName = getDeploymentName();

          const boundedHistory = normalizeHistory(history, 6, 1200, 5000);

          const messages = [
            { role: "system" as const, content: systemPrompt },
            ...boundedHistory
          ];

          const completion = await withTimeout(
            client.getChatCompletions(deploymentName, messages),
            45000,
            "OpenAI completion timeout"
          );

          assistantContent = completion.choices[0]?.message?.content ?? assistantContent;
        } catch (aiError: unknown) {
          const primaryError = extractErrorInfo(aiError);
          context.log("OpenAI primary error:", primaryError.statusCode, primaryError.message);

          try {
            const client = getOpenAIClient();
            const deploymentName = getDeploymentName();
            const compactMessages = [
              {
                role: "system" as const,
                content:
                  "당신은 한국어 금융 상담 도우미입니다. 답변은 간결하고 실행 가능한 항목 중심으로 작성하세요."
              },
              { role: "user" as const, content: clampText(content, 1200) }
            ];

            const retryCompletion = await withTimeout(
              client.getChatCompletions(deploymentName, compactMessages),
              20000,
              "OpenAI compact retry timeout"
            );

            assistantContent =
              retryCompletion.choices[0]?.message?.content ??
              buildFallbackAdvice(content, userContext, profileContextText);

            context.log("OpenAI compact retry succeeded after primary failure");
          } catch (retryError: unknown) {
            const retryErrorInfo = extractErrorInfo(retryError);
            context.log("OpenAI compact retry error:", retryErrorInfo.statusCode, retryErrorInfo.message);
            const primaryCode = primaryError.statusCode ?? "NA";
            const retryCode = retryErrorInfo.statusCode ?? "NA";
            const primaryDiag =
              primaryError.statusCode === undefined
                ? ` msg=${compactDiagnosticMessage(primaryError.message)}`
                : "";
            const retryDiag =
              retryErrorInfo.statusCode === undefined
                ? ` msg=${compactDiagnosticMessage(retryErrorInfo.message)}`
                : "";
            assistantContent = buildFallbackAdvice(
              content,
              userContext,
              profileContextText,
              `OPENAI_FAIL primary=${primaryCode}${primaryDiag} retry=${retryCode}${retryDiag}`
            );
          }
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

