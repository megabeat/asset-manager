import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
    
    if (!endpoint || !apiKey) {
      throw new Error("Missing Azure OpenAI configuration");
    }

    const normalizedEndpoint = endpoint.replace(/\/+$/, "");
    
    client = new OpenAI({
      apiKey,
      baseURL: `${normalizedEndpoint}/openai/deployments`,
      defaultQuery: {
        "api-version": apiVersion
      },
      defaultHeaders: {
        "api-key": apiKey
      }
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
