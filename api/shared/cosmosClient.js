"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContainer = getContainer;
const node_crypto_1 = require("node:crypto");
if (!globalThis.crypto) {
    globalThis.crypto = node_crypto_1.webcrypto;
}
let client = null;
function createClient(config) {
    const cosmosModule = require("@azure/cosmos");
    return new cosmosModule.CosmosClient(config);
}
function firstDefined(...values) {
    return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}
function resolveDatabaseId() {
    return firstDefined(process.env.COSMOS_DATABASE_ID, process.env.COSMOS_DATABASE, process.env.COSMOSDB_DATABASE, process.env.COSMOSDB_DATABASE_ID, process.env.DATABASE_ID);
}
function normalizeKey(rawKey) {
    if (!rawKey)
        return undefined;
    const normalized = rawKey.replace(/\s+/g, "");
    return normalized.length > 0 ? normalized : undefined;
}
function getClient() {
    if (!client) {
        const connectionString = firstDefined(process.env.COSMOS_CONNECTION_STRING, process.env.COSMOSDB_CONNECTION_STRING);
        if (connectionString) {
            client = createClient(connectionString);
            return client;
        }
        const endpoint = firstDefined(process.env.COSMOS_ENDPOINT, process.env.COSMOSDB_ENDPOINT, process.env.ACCOUNT_ENDPOINT, process.env.COSMOS_URI);
        const key = normalizeKey(firstDefined(process.env.COSMOS_KEY, process.env.COSMOSDB_KEY, process.env.ACCOUNT_KEY, process.env.COSMOS_MASTER_KEY));
        if (!endpoint || !key) {
            throw new Error("Missing Cosmos DB configuration. Set COSMOS_CONNECTION_STRING or COSMOS_ENDPOINT + COSMOS_KEY.");
        }
        client = createClient({ endpoint, key });
    }
    return client;
}
function getContainer(containerName) {
    const databaseId = resolveDatabaseId();
    if (!databaseId) {
        throw new Error("Missing Cosmos database id. Set COSMOS_DATABASE_ID.");
    }
    return getClient().database(databaseId).container(containerName);
}
