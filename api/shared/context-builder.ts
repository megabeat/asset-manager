import { Container } from "@azure/cosmos";

type UserContext = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  assetBreakdown: Array<{ category: string; value: number }>;
  topExpenses: Array<{ name: string; amount: number }>;
};

export async function buildUserContext(
  userId: string,
  assetsContainer: Container,
  liabilitiesContainer: Container,
  expensesContainer: Container,
  incomesContainer: Container,
  usersContainer?: Container
): Promise<UserContext> {
  const [assetsResult, liabilitiesResult, expensesResult, incomesResult, assetsByCategory, profileResult] =
    await Promise.all([
      assetsContainer.items
        .query({
          query: "SELECT VALUE SUM(c.currentValue) FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
          parameters: [{ name: "@userId", value: userId }]
        })
        .fetchAll(),
      liabilitiesContainer.items
        .query({
          query: "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Liability'",
          parameters: [{ name: "@userId", value: userId }]
        })
        .fetchAll(),
      expensesContainer.items
        .query({
          query:
            "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.cycle = 'monthly' AND (NOT IS_DEFINED(c.isInvestmentTransfer) OR c.isInvestmentTransfer = false)",
          parameters: [{ name: "@userId", value: userId }]
        })
        .fetchAll(),
      incomesContainer.items
        .query({
          query:
            "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Income' AND c.cycle = 'monthly'",
          parameters: [{ name: "@userId", value: userId }]
        })
        .fetchAll(),
      assetsContainer.items
        .query({
          query:
            "SELECT c.category, SUM(c.currentValue) as totalValue FROM c WHERE c.userId = @userId AND c.type = 'Asset' GROUP BY c.category",
          parameters: [{ name: "@userId", value: userId }]
        })
        .fetchAll(),
      usersContainer ? usersContainer.item(userId, userId).read() : Promise.resolve({ resource: null })
    ]);

  const totalAssets = assetsResult.resources[0] ?? 0;
  const totalLiabilities = liabilitiesResult.resources[0] ?? 0;
  const monthlyExpenses = expensesResult.resources[0] ?? 0;
  const monthlyIncomeFromRecords = incomesResult.resources[0] ?? 0;
  const profile = profileResult.resource as
    | {
        baseSalaryAnnual?: number;
        annualFixedExtra?: number;
        annualBonus?: number;
        annualRsu?: number;
      }
    | null;
  const estimatedMonthlyIncomeFromProfile = profile
    ?
        ((Number(profile.baseSalaryAnnual ?? 0) +
          Number(profile.annualFixedExtra ?? 0) +
          Number(profile.annualBonus ?? 0) +
          Number(profile.annualRsu ?? 0)) /
          12)
    : 0;
  const monthlyIncome =
    monthlyIncomeFromRecords > 0 ? monthlyIncomeFromRecords : estimatedMonthlyIncomeFromProfile;

  const assetBreakdown = (assetsByCategory.resources as Array<{ category: string; totalValue: number }>).map(
    (item) => ({
      category: item.category,
      value: item.totalValue
    })
  );

  const topExpensesQuery = await expensesContainer.items
    .query({
      query:
        "SELECT TOP 5 c.name, c.amount FROM c WHERE c.userId = @userId AND c.type = 'Expense' ORDER BY c.amount DESC",
      parameters: [{ name: "@userId", value: userId }]
    })
    .fetchAll();

  const topExpenses = (topExpensesQuery.resources as Array<{ name: string; amount: number }>).map(
    (item) => ({
      name: item.name,
      amount: item.amount
    })
  );

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    monthlyExpenses,
    monthlyIncome,
    assetBreakdown,
    topExpenses
  };
}
