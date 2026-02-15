import { HttpResponseInit } from "@azure/functions";

export function ok(data: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ data, error: null })
  };
}

export function fail(code: string, message: string, status = 400, details?: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      data: null,
      error: { code, message, details: details ?? null }
    })
  };
}
