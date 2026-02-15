"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContainer = getContainer;
const cosmos_1 = require("@azure/cosmos");
let client = null;
function getClient() {
    if (!client) {
        const endpoint = process.env.COSMOS_ENDPOINT;
        const key = process.env.COSMOS_KEY;
        if (!endpoint || !key) {
            throw new Error("Missing Cosmos DB configuration");
        }
        client = new cosmos_1.CosmosClient({ endpoint, key });
    }
    return client;
}
function getContainer(containerName) {
    const databaseId = process.env.COSMOS_DATABASE_ID;
    if (!databaseId) {
        throw new Error("Missing Cosmos database id");
    }
    return getClient().database(databaseId).container(containerName);
}
