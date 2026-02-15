import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function pingHandler(_context: InvocationContext, _req: HttpRequest): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      ok: true,
      service: "api",
      timestamp: new Date().toISOString()
    })
  };
}
