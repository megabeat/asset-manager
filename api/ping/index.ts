import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function pingHandler(_req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      ok: true,
      service: "api",
      timestamp: new Date().toISOString()
    }
  };
}
