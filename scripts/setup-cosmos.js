const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = process.env.COSMOS_DATABASE_ID || "AssetManagement";

if (!endpoint || !key) {
  console.error("Missing COSMOS_ENDPOINT or COSMOS_KEY environment variables");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });

const containers = [
  {
    id: "users",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "children",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "assets",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "assetHistory",
    partitionKey: {
      paths: ["/userId", "/assetId"],
      kind: "MultiHash",
      version: 2
    }
  },
  {
    id: "expenses",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "educationPlans",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "aiConversations",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "aiMessages",
    partitionKey: {
      paths: ["/userId", "/conversationId"],
      kind: "MultiHash",
      version: 2
    }
  },
  {
    id: "liabilities",
    partitionKey: { paths: ["/userId"] }
  },
  {
    id: "incomes",
    partitionKey: { paths: ["/userId"] }
  }
];

async function createDatabase() {
  console.log(`Creating database: ${databaseId}`);
  const { database } = await client.databases.createIfNotExists({
    id: databaseId
  });
  console.log(`Database ${databaseId} ready`);
  return database;
}

async function createContainers(database) {
  for (const containerDef of containers) {
    console.log(`Creating container: ${containerDef.id}`);
    try {
      const { container } = await database.containers.createIfNotExists({
        id: containerDef.id,
        partitionKey: containerDef.partitionKey
      });
      console.log(`✓ Container ${containerDef.id} ready`);
    } catch (error) {
      console.error(`✗ Failed to create container ${containerDef.id}:`, error.message);
    }
  }
}

async function main() {
  try {
    console.log("Starting Cosmos DB setup...\n");
    const database = await createDatabase();
    await createContainers(database);
    console.log("\n✓ Cosmos DB setup complete!");
  } catch (error) {
    console.error("Setup failed:", error);
    process.exit(1);
  }
}

main();
