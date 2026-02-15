import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function pingHandler(_context: InvocationContext, _req: HttpRequest): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      ok: true,
      service: "api",
      timestamp: new Date().toISOString()
    }
  };
}
