import { AzureKeyCredential, OpenAIClient } from "@azure/openai";

let client: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    
    const missingVars: string[] = [];
    if (!endpoint) missingVars.push("AZURE_OPENAI_ENDPOINT");
    if (!apiKey) missingVars.push("AZURE_OPENAI_API_KEY");

    if (missingVars.length > 0) {
      throw new Error(`Missing Azure OpenAI configuration: ${missingVars.join(", ")}`);
    }
    
    client = new OpenAIClient(endpoint!, new AzureKeyCredential(apiKey!));
  }
  
  return client;
}

export function getDeploymentName(): string {
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  if (!deploymentName) {
    throw new Error("Missing Azure OpenAI deployment name: AZURE_OPENAI_DEPLOYMENT_NAME");
  }
  return deploymentName;
}
