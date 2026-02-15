import { HttpResponseInit } from "@azure/functions";

export function ok(data: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: { data, error: null }
  };
}

export function fail(code: string, message: string, status = 400, details?: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: {
      data: null,
      error: { code, message, details: details ?? null }
    }
  };
}
