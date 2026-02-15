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
  incomesContainer: Container
): Promise<UserContext> {
  const [assetsResult, liabilitiesResult, expensesResult, incomesResult, assetsByCategory] =
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
            "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.cycle = 'monthly'",
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
            "SELECT c.category, SUM(c.currentValue) as value FROM c WHERE c.userId = @userId AND c.type = 'Asset' GROUP BY c.category",
          parameters: [{ name: "@userId", value: userId }]
        })
        .fetchAll()
    ]);

  const totalAssets = assetsResult.resources[0] ?? 0;
  const totalLiabilities = liabilitiesResult.resources[0] ?? 0;
  const monthlyExpenses = expensesResult.resources[0] ?? 0;
  const monthlyIncome = incomesResult.resources[0] ?? 0;

  const assetBreakdown = (assetsByCategory.resources as Array<{ category: string; value: number }>).map(
    (item) => ({
      category: item.category,
      value: item.value
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
