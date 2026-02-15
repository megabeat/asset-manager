import { webcrypto } from "crypto";

if (!(globalThis as { crypto?: Crypto }).crypto) {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

type Container = import("@azure/cosmos").Container;

let client: import("@azure/cosmos").CosmosClient | null = null;

function createClient(config: { endpoint: string; key: string } | string): import("@azure/cosmos").CosmosClient {
  const cosmosModule = require("@azure/cosmos") as typeof import("@azure/cosmos");
  return new cosmosModule.CosmosClient(config as never);
}

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

function getClient(): import("@azure/cosmos").CosmosClient {
  if (!client) {
    const connectionString = firstDefined(
      process.env.COSMOS_CONNECTION_STRING,
      process.env.COSMOSDB_CONNECTION_STRING
    );

    if (connectionString) {
      client = createClient(connectionString);
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

    client = createClient({ endpoint, key });
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
