import { AzureOpenAI } from "@azure/openai";

let client: AzureOpenAI | null = null;

export function getOpenAIClient(): AzureOpenAI {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    
    if (!endpoint || !apiKey) {
      throw new Error("Missing Azure OpenAI configuration");
    }
    
    client = new AzureOpenAI({
      endpoint,
      apiKey
    });
  }
  
  return client;
}

export function getDeploymentName(): string {
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  if (!deploymentName) {
    throw new Error("Missing Azure OpenAI deployment name");
  }
  return deploymentName;
}
