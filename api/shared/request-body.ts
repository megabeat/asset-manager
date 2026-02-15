import { HttpRequest } from "@azure/functions";

export async function parseJsonBody(req: HttpRequest): Promise<Record<string, unknown>> {
  const request = req as unknown as {
    json?: () => Promise<unknown>;
    body?: unknown;
    rawBody?: string;
  };

  if (typeof request.json === "function") {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Invalid JSON body");
  }

  const body = request.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  if (typeof body === "string" && body.trim().length > 0) {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  if (typeof request.rawBody === "string" && request.rawBody.trim().length > 0) {
    const parsed = JSON.parse(request.rawBody) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error("Invalid JSON body");
}
