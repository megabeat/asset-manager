import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getContainer } from "../shared/cosmosClient";

const SETTLEMENT_TYPE = "monthly-recurring-26";

type ExpenseRecord = {
  id: string;
  userId: string;
  amount?: number;
};

type AssetRecord = {
  id: string;
  userId: string;
  type: "Asset";
  category: string;
  name: string;
  currentValue: number;
  valuationDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

function getKstDateParts(now: Date): { day: number; monthKey: string; isoDate: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = kst.getUTCDate();
  const date = String(day).padStart(2, "0");

  return {
    day,
    monthKey: `${year}-${month}`,
    isoDate: `${year}-${month}-${date}`
  };
}

async function resolveLiquidAsset(
  assetsContainer: ReturnType<typeof getContainer>,
  userId: string
): Promise<AssetRecord> {
  const query = {
    query:
      "SELECT TOP 1 * FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND (c.category = 'deposit' OR c.category = 'cash') ORDER BY c.updatedAt DESC",
    parameters: [{ name: "@userId", value: userId }]
  };

  const { resources } = await assetsContainer.items.query(query).fetchAll();
  if (resources.length > 0) {
    return resources[0] as AssetRecord;
  }

  const nowIso = new Date().toISOString();
  const newLiquidAsset: AssetRecord = {
    id: randomUUID(),
    userId,
    type: "Asset",
    category: "deposit",
    name: "입출금 통장",
    currentValue: 0,
    valuationDate: nowIso.slice(0, 10),
    note: "정기지출 자동 차감용 자동 생성",
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const { resource } = await assetsContainer.items.create(newLiquidAsset);
  return resource as AssetRecord;
}

async function hasSettledThisMonth(
  expensesContainer: ReturnType<typeof getContainer>,
  userId: string,
  monthKey: string
): Promise<boolean> {
  const query = {
    query:
      "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.type = 'ExpenseSettlement' AND c.settlementType = @settlementType AND c.monthKey = @monthKey",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@settlementType", value: SETTLEMENT_TYPE },
      { name: "@monthKey", value: monthKey }
    ]
  };

  const { resources } = await expensesContainer.items.query(query).fetchAll();
  return resources.length > 0;
}

async function createSettlementMarker(
  expensesContainer: ReturnType<typeof getContainer>,
  userId: string,
  monthKey: string,
  settlementDate: string,
  amount: number,
  reflectedAssetId: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const marker = {
    id: randomUUID(),
    userId,
    type: "ExpenseSettlement",
    settlementType: SETTLEMENT_TYPE,
    monthKey,
    settlementDate,
    amount,
    reflectedAssetId,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  await expensesContainer.items.create(marker);
}

export async function monthlyExpenseSettlement(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const now = new Date();
  const { day, monthKey, isoDate } = getKstDateParts(now);
  const forceRun = req.query.get("force") === "1";

  if (day !== 26 && !forceRun) {
    return {
      status: 200,
      jsonBody: {
        ok: true,
        skipped: true,
        reason: "not_settlement_day",
        settlementDayKst: 26,
        todayKstDay: day,
        monthKey
      }
    };
  }

  const expensesContainer = getContainer("expenses");
  const assetsContainer = getContainer("assets");

  const usersQuery = {
    query:
      "SELECT DISTINCT VALUE c.userId FROM c WHERE c.type = 'Expense' AND c.cycle = 'monthly' AND (c.expenseType = 'fixed' OR c.expenseType = 'subscription') AND c.amount > 0",
    parameters: []
  };

  const { resources: userIds } = await expensesContainer.items.query(usersQuery).fetchAll();
  let processedUsers = 0;
  let settledUsers = 0;
  let totalSettledAmount = 0;

  for (const userId of userIds as string[]) {
    if (!userId) {
      continue;
    }

    processedUsers += 1;

    const settled = await hasSettledThisMonth(expensesContainer, userId, monthKey);
    if (settled) {
      continue;
    }

    const recurringQuery = {
      query:
        "SELECT c.id, c.userId, c.amount FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.cycle = 'monthly' AND (c.expenseType = 'fixed' OR c.expenseType = 'subscription')",
      parameters: [{ name: "@userId", value: userId }]
    };

    const { resources } = await expensesContainer.items.query(recurringQuery).fetchAll();
    const recurringExpenses = resources as ExpenseRecord[];
    const totalAmount = recurringExpenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

    if (totalAmount <= 0) {
      await createSettlementMarker(expensesContainer, userId, monthKey, isoDate, 0, "");
      settledUsers += 1;
      continue;
    }

    const liquidAsset = await resolveLiquidAsset(assetsContainer, userId);
    const nextValue = Math.max(0, Number(liquidAsset.currentValue ?? 0) - totalAmount);
    const nowIso = new Date().toISOString();

    const updatedAsset = {
      ...liquidAsset,
      currentValue: nextValue,
      valuationDate: nowIso.slice(0, 10),
      updatedAt: nowIso
    };

    await assetsContainer.item(liquidAsset.id, userId).replace(updatedAsset);
    await createSettlementMarker(expensesContainer, userId, monthKey, isoDate, totalAmount, liquidAsset.id);
    settledUsers += 1;
    totalSettledAmount += totalAmount;
  }

  context.log(
    `monthly-expense-settlement complete: processed=${processedUsers}, settled=${settledUsers}, amount=${totalSettledAmount}, month=${monthKey}`
  );

  return {
    status: 200,
    jsonBody: {
      ok: true,
      skipped: false,
      monthKey,
      processedUsers,
      settledUsers,
      totalSettledAmount
    }
  };
}
