import { CosmosClient, Container } from "@azure/cosmos";

let client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (!client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error("Missing Cosmos DB configuration");
    }
    client = new CosmosClient({ endpoint, key });
  }
  return client;
}

export function getContainer(containerName: string): Container {
  const databaseId = process.env.COSMOS_DATABASE_ID;
  if (!databaseId) {
    throw new Error("Missing Cosmos database id");
  }
  return getClient().database(databaseId).container(containerName);
}
