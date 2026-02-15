import { CosmosClient, Container } from "@azure/cosmos";

let client: CosmosClient | null = null;

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function resolveDatabaseId(): string | undefined {
  return firstDefined(
    process.env.COSMOS_DATABASE_ID,
    process.env.COSMOS_DATABASE,
    process.env.COSMOSDB_DATABASE,
    process.env.COSMOSDB_DATABASE_ID,
    process.env.DATABASE_ID
  );
}

function normalizeKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) return undefined;
  const normalized = rawKey.replace(/\s+/g, "");
  return normalized.length > 0 ? normalized : undefined;
}

function getClient(): CosmosClient {
  if (!client) {
    const connectionString = firstDefined(
      process.env.COSMOS_CONNECTION_STRING,
      process.env.COSMOSDB_CONNECTION_STRING
    );

    if (connectionString) {
      client = new CosmosClient(connectionString);
      return client;
    }

    const endpoint = firstDefined(
      process.env.COSMOS_ENDPOINT,
      process.env.COSMOSDB_ENDPOINT,
      process.env.ACCOUNT_ENDPOINT,
      process.env.COSMOS_URI
    );
    const key = normalizeKey(firstDefined(
      process.env.COSMOS_KEY,
      process.env.COSMOSDB_KEY,
      process.env.ACCOUNT_KEY,
      process.env.COSMOS_MASTER_KEY
    ));

    if (!endpoint || !key) {
      throw new Error(
        "Missing Cosmos DB configuration. Set COSMOS_CONNECTION_STRING or COSMOS_ENDPOINT + COSMOS_KEY."
      );
    }

    client = new CosmosClient({ endpoint, key });
  }

  return client;
}

export function getContainer(containerName: string): Container {
  const databaseId = resolveDatabaseId();
  if (!databaseId) {
    throw new Error("Missing Cosmos database id. Set COSMOS_DATABASE_ID.");
  }
  return getClient().database(databaseId).container(containerName);
}
