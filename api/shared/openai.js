"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenAIClient = getOpenAIClient;
exports.getDeploymentName = getDeploymentName;
const openai_1 = require("@azure/openai");
let client = null;
function getOpenAIClient() {
    if (!client) {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_API_KEY;
        if (!endpoint || !apiKey) {
            throw new Error("Missing Azure OpenAI configuration");
        }
        client = new openai_1.OpenAIClient(endpoint, new openai_1.AzureKeyCredential(apiKey));
    }
    return client;
}
function getDeploymentName() {
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    if (!deploymentName) {
        throw new Error("Missing Azure OpenAI deployment name");
    }
    return deploymentName;
}
