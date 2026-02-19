/**
 * seed-demo-data.js
 *
 * Populates Cosmos DB with fabricated demo data for the "demo-user" account.
 * All data is purely fictional and intended for demonstration purposes.
 *
 * Usage:
 *   COSMOS_ENDPOINT=... COSMOS_KEY=... COSMOS_DATABASE_ID=... node seed-demo-data.js
 *
 * Optional:
 *   DEMO_USER_ID=demo-user   (override the target userId)
 *   --clean                   (delete existing demo-user data before seeding)
 */

const crypto = require("crypto");
if (!global.crypto) global.crypto = crypto;

const { CosmosClient } = require("@azure/cosmos");

// ---------- config ----------
const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = process.env.COSMOS_DATABASE_ID || "AssetManagement";
const userId = process.env.DEMO_USER_ID || "demo-visitor";
const doClean = process.argv.includes("--clean");

if (!endpoint || !key) {
  console.error("Missing COSMOS_ENDPOINT or COSMOS_KEY");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const db = client.database(databaseId);

function uuid() {
  return crypto.randomUUID();
}
function isoNow() {
  return new Date().toISOString();
}
function isoDate(y, m, d) {
  return new Date(y, m - 1, d).toISOString().split("T")[0];
}

// ============================================================
// DEMO DATA
// ============================================================

const now = isoNow();

// ---- Profile ----
const profile = {
  id: uuid(),
  userId,
  type: "Profile",
  fullName: "김데모",
  birthDate: "1985-06-15",
  employerName: "데모기업(주)",
  jobTitle: "시니어 엔지니어",
  baseSalaryAnnual: 72000000,
  annualFixedExtra: 6000000,
  annualBonus: 8000000,
  annualRsu: 12000000,
  annualRaiseRatePct: 3.5,
  rsuShares: 150,
  rsuVestingPriceUsd: 180,
  rsuVestingCycle: "quarterly",
  spouseName: "이데모",
  spouseBirthDate: "1987-03-22",
  spouseEmployerName: "헬스케어(주)",
  spouseJobTitle: "PM",
  spouseAnnualIncome: 55000000,
  spouseRetirementTargetAge: 58,
  retirementTargetAge: 60,
  householdSize: 4,
  currency: "KRW",
  createdAt: now,
  updatedAt: now,
};

// ---- Assets ----
const assets = [
  {
    id: uuid(), userId, type: "Asset",
    name: "삼성전자", category: "stock_kr",
    currentValue: 45000000, quantity: 600, acquiredValue: 38000000,
    valuationDate: isoDate(2026, 2, 18), symbol: "005930", owner: "본인",
    note: "장기 보유 종목",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "SK하이닉스", category: "stock_kr",
    currentValue: 22000000, quantity: 100, acquiredValue: 18000000,
    valuationDate: isoDate(2026, 2, 18), symbol: "000660", owner: "본인",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "Apple Inc.", category: "stock_us",
    currentValue: 35000000, quantity: 80, acquiredValue: 28000000,
    valuationDate: isoDate(2026, 2, 18), symbol: "AAPL", exchangeRate: 1320, usdAmount: 26515, owner: "본인",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "NVIDIA Corp.", category: "stock_us",
    currentValue: 28000000, quantity: 40, acquiredValue: 15000000,
    valuationDate: isoDate(2026, 2, 18), symbol: "NVDA", exchangeRate: 1320, usdAmount: 21212, owner: "본인",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "서울 아파트 (마포구)", category: "realestate_kr",
    currentValue: 980000000, acquiredValue: 720000000,
    valuationDate: isoDate(2026, 1, 1), owner: "공동명의",
    note: "34평형, 2019년 매수",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "비상금 통장", category: "deposit",
    currentValue: 30000000, acquiredValue: 30000000,
    valuationDate: isoDate(2026, 2, 1), owner: "본인",
    note: "CMA 계좌",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "정기예금 (12개월)", category: "deposit",
    currentValue: 50000000, acquiredValue: 50000000,
    valuationDate: isoDate(2026, 2, 1), owner: "배우자",
    note: "연 4.2% 금리, 2026-08 만기",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "생활비 현금", category: "cash",
    currentValue: 5000000, acquiredValue: 5000000,
    valuationDate: isoDate(2026, 2, 18), owner: "공동",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "그랜저 IG", category: "car",
    currentValue: 18000000, acquiredValue: 38000000,
    valuationDate: isoDate(2026, 1, 1), carYear: 2020, owner: "본인",
    note: "2020년식, 8만km",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "국민연금", category: "pension_national",
    currentValue: 42000000, acquiredValue: 42000000,
    valuationDate: isoDate(2026, 1, 1),
    pensionMonthlyContribution: 450000, pensionReceiveAge: 65, owner: "본인",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "개인연금 IRP", category: "pension_personal",
    currentValue: 35000000, acquiredValue: 28000000,
    valuationDate: isoDate(2026, 1, 1),
    pensionMonthlyContribution: 300000, pensionReceiveAge: 60, owner: "본인",
    note: "TDF 2045 펀드 운용",
  },
  {
    id: uuid(), userId, type: "Asset",
    name: "퇴직연금 DC", category: "pension_retirement",
    currentValue: 65000000, acquiredValue: 52000000,
    valuationDate: isoDate(2026, 1, 1),
    pensionMonthlyContribution: 500000, pensionReceiveAge: 60, owner: "본인",
  },
];

// ---- Incomes ----
const incomes = [
  { id: uuid(), userId, type: "Income", name: "본인 월급", amount: 6000000, cycle: "monthly", isFixedIncome: true, billingDay: 25, category: "salary", owner: "본인" },
  { id: uuid(), userId, type: "Income", name: "배우자 월급", amount: 4580000, cycle: "monthly", isFixedIncome: true, billingDay: 25, category: "salary", owner: "배우자" },
  { id: uuid(), userId, type: "Income", name: "상여금", amount: 8000000, cycle: "yearly", isFixedIncome: false, category: "bonus", owner: "본인", note: "설/추석" },
  { id: uuid(), userId, type: "Income", name: "RSU 베스팅", amount: 3000000, cycle: "yearly", isFixedIncome: false, category: "rsu", owner: "본인", note: "분기별 배분" },
  { id: uuid(), userId, type: "Income", name: "배당소득", amount: 1200000, cycle: "yearly", isFixedIncome: false, category: "dividend", owner: "본인" },
  { id: uuid(), userId, type: "Income", name: "부업 수입", amount: 500000, cycle: "monthly", isFixedIncome: false, category: "side", owner: "본인", note: "프리랜스 컨설팅" },
];

// ---- Expenses ----
const expenses = [
  { id: uuid(), userId, type: "Expense", name: "주택담보대출 원리금", amount: 2800000, expenseType: "fixed", cycle: "monthly", billingDay: 15, category: "housing", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "관리비", amount: 350000, expenseType: "fixed", cycle: "monthly", billingDay: 10, category: "housing", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "식비", amount: 1200000, expenseType: "fixed", cycle: "monthly", category: "food", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "교통비 (유류비)", amount: 250000, expenseType: "fixed", cycle: "monthly", category: "transport", owner: "본인" },
  { id: uuid(), userId, type: "Expense", name: "통신비 (가족)", amount: 180000, expenseType: "subscription", cycle: "monthly", billingDay: 1, category: "telecom", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "넷플릭스", amount: 17000, expenseType: "subscription", cycle: "monthly", billingDay: 5, category: "subscription", owner: "공동", isCardIncluded: true },
  { id: uuid(), userId, type: "Expense", name: "유튜브 프리미엄", amount: 14900, expenseType: "subscription", cycle: "monthly", billingDay: 12, category: "subscription", owner: "공동", isCardIncluded: true },
  { id: uuid(), userId, type: "Expense", name: "자녀 학원비 (수학)", amount: 450000, expenseType: "fixed", cycle: "monthly", billingDay: 1, category: "education", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "자녀 학원비 (영어)", amount: 380000, expenseType: "fixed", cycle: "monthly", billingDay: 1, category: "education", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "보험료 (종합)", amount: 420000, expenseType: "fixed", cycle: "monthly", billingDay: 20, category: "insurance", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "자동차보험", amount: 960000, expenseType: "fixed", cycle: "yearly", category: "insurance", owner: "본인" },
  { id: uuid(), userId, type: "Expense", name: "IRP 추가 납입", amount: 300000, expenseType: "fixed", cycle: "monthly", category: "investment", owner: "본인", isInvestmentTransfer: true, investmentTargetCategory: "pension_personal" },
  { id: uuid(), userId, type: "Expense", name: "의류/생활용품", amount: 300000, expenseType: "fixed", cycle: "monthly", category: "living", owner: "공동" },
  { id: uuid(), userId, type: "Expense", name: "여행 적립", amount: 200000, expenseType: "fixed", cycle: "monthly", category: "leisure", owner: "공동", note: "여름 가족여행 대비" },
  { id: uuid(), userId, type: "Expense", name: "재산세", amount: 1800000, expenseType: "fixed", cycle: "yearly", category: "tax", owner: "공동" },
];

// ---- Liabilities ----
const liabilities = [
  {
    id: uuid(), userId, type: "Liability",
    name: "주택담보대출", amount: 420000000, category: "mortgage",
    interestRate: 3.9, repaymentMethod: "원리금균등",
    maturityDate: "2044-03-15", monthlyPayment: 2800000,
    startDate: "2019-04-01", loanTerm: 300, owner: "공동명의",
    note: "마포구 아파트 담보",
  },
  {
    id: uuid(), userId, type: "Liability",
    name: "자동차 할부", amount: 8000000, category: "auto_loan",
    interestRate: 4.5, repaymentMethod: "원리금균등",
    maturityDate: "2027-06-01", monthlyPayment: 520000,
    startDate: "2024-07-01", loanTerm: 36, owner: "본인",
  },
  {
    id: uuid(), userId, type: "Liability",
    name: "마이너스 통장", amount: 3000000, category: "credit_line",
    interestRate: 5.2, repaymentMethod: "수시상환",
    owner: "본인", note: "비상자금 용도",
  },
];

// ---- Children ----
const children = [
  { id: uuid(), userId, type: "Child", name: "김하나", birthYear: 2016, grade: "초등4학년", targetUniversityYear: 2034 },
  { id: uuid(), userId, type: "Child", name: "김두리", birthYear: 2019, grade: "초등1학년", targetUniversityYear: 2037 },
];

// ---- Education Plans ----
const educationPlans = [
  {
    id: uuid(), userId, type: "EducationPlan",
    childId: children[0].id, annualCost: 15000000, inflationRate: 3.0,
    startYear: 2034, endYear: 2037,
    note: "김하나 대학 등록금 (4년)",
  },
  {
    id: uuid(), userId, type: "EducationPlan",
    childId: children[1].id, annualCost: 16000000, inflationRate: 3.0,
    startYear: 2037, endYear: 2040,
    note: "김두리 대학 등록금 (4년)",
  },
];

// ---- Goal Funds ----
const goalFunds = [
  {
    id: uuid(), userId, type: "GoalFund",
    name: "자녀 대학 교육비", horizon: "long", vehicle: "fund",
    targetAmount: 120000000, currentAmount: 28000000, monthlyContribution: 500000,
    targetDate: "2034-03-01", status: "active",
    note: "국내 채권형 펀드 + ETF 혼합",
    monthlyLogs: [
      { month: "2025-11", amount: 500000 },
      { month: "2025-12", amount: 500000 },
      { month: "2026-01", amount: 500000 },
      { month: "2026-02", amount: 500000 },
    ],
    createdAt: now, updatedAt: now,
  },
  {
    id: uuid(), userId, type: "GoalFund",
    name: "가족 여행 (유럽)", horizon: "short", vehicle: "savings",
    targetAmount: 10000000, currentAmount: 4200000, monthlyContribution: 200000,
    targetDate: "2026-07-01", status: "active",
    note: "여름 유럽 가족여행",
    monthlyLogs: [
      { month: "2025-09", amount: 200000 },
      { month: "2025-10", amount: 200000 },
      { month: "2025-11", amount: 200000 },
      { month: "2025-12", amount: 200000 },
      { month: "2026-01", amount: 200000 },
      { month: "2026-02", amount: 200000 },
    ],
    createdAt: now, updatedAt: now,
  },
  {
    id: uuid(), userId, type: "GoalFund",
    name: "은퇴 생활비 보충", horizon: "long", vehicle: "etf",
    targetAmount: 500000000, currentAmount: 85000000, monthlyContribution: 1000000,
    targetDate: "2045-06-01", status: "active",
    note: "S&P500 + KOSPI200 ETF 적립",
    monthlyLogs: [
      { month: "2025-12", amount: 1000000 },
      { month: "2026-01", amount: 1000000 },
      { month: "2026-02", amount: 1000000 },
    ],
    createdAt: now, updatedAt: now,
  },
  {
    id: uuid(), userId, type: "GoalFund",
    name: "자동차 교체 자금", horizon: "mid", vehicle: "deposit",
    targetAmount: 40000000, currentAmount: 12000000, monthlyContribution: 400000,
    targetDate: "2028-12-01", status: "active",
    note: "전기차 교체 목표",
    monthlyLogs: [
      { month: "2026-01", amount: 400000 },
      { month: "2026-02", amount: 400000 },
    ],
    createdAt: now, updatedAt: now,
  },
];

// ============================================================
// INSERTION LOGIC
// ============================================================

const containerMap = {
  users: [profile],
  assets: assets,
  incomes: incomes,
  expenses: expenses,
  liabilities: liabilities,
  children: children,
  educationPlans: educationPlans,
  goalFunds: goalFunds,
};

async function cleanExisting() {
  console.log(`\n🗑  Cleaning existing data for userId="${userId}" ...`);
  for (const [containerName] of Object.entries(containerMap)) {
    const container = db.container(containerName);
    try {
      const { resources } = await container.items
        .query({
          query: "SELECT c.id FROM c WHERE c.userId = @userId",
          parameters: [{ name: "@userId", value: userId }],
        })
        .fetchAll();

      for (const item of resources) {
        try {
          await container.item(item.id, userId).delete();
        } catch (e) {
          // Hierarchical partition key: try array form
          try {
            await container.item(item.id, [userId]).delete();
          } catch {
            console.warn(`  ⚠ Could not delete ${containerName}/${item.id}`);
          }
        }
      }
      if (resources.length) {
        console.log(`  ✓ Deleted ${resources.length} items from ${containerName}`);
      }
    } catch (e) {
      console.warn(`  ⚠ Skipped ${containerName}: ${e.message}`);
    }
  }
}

async function seedContainer(containerName, items) {
  const container = db.container(containerName);
  let ok = 0;
  let fail = 0;
  for (const item of items) {
    try {
      await container.items.upsert(item);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${containerName}/${item.name || item.id}: ${e.message}`);
      fail++;
    }
  }
  console.log(`  ✓ ${containerName}: ${ok} inserted` + (fail ? `, ${fail} failed` : ""));
}

async function main() {
  console.log("=== Demo Data Seed ===");
  console.log(`Target userId: ${userId}`);
  console.log(`Database: ${databaseId}\n`);

  if (doClean) {
    await cleanExisting();
  }

  console.log("\n📦 Seeding demo data ...\n");
  for (const [containerName, items] of Object.entries(containerMap)) {
    await seedContainer(containerName, items);
  }

  // Summary
  const totalAssets = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
  const monthlyIncome = incomes.filter(i => i.cycle === "monthly").reduce((s, i) => s + i.amount, 0);
  const monthlyExpense = expenses.filter(e => e.cycle === "monthly").reduce((s, e) => s + e.amount, 0);

  console.log("\n📊 Demo 데이터 요약:");
  console.log(`  총 자산:       ₩${totalAssets.toLocaleString()}`);
  console.log(`  총 부채:       ₩${totalLiabilities.toLocaleString()}`);
  console.log(`  순자산:        ₩${(totalAssets - totalLiabilities).toLocaleString()}`);
  console.log(`  월 수입:       ₩${monthlyIncome.toLocaleString()}`);
  console.log(`  월 지출:       ₩${monthlyExpense.toLocaleString()}`);
  console.log(`  자녀:          ${children.length}명`);
  console.log(`  교육 계획:     ${educationPlans.length}건`);
  console.log(`  목표 펀드:     ${goalFunds.length}건`);
  console.log("\n✅ Seed complete!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
