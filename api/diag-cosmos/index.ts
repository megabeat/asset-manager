import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

type StepResult = {
  step: string;
  ok: boolean;
  detail?: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

export async function diagCosmosHandler(_context: InvocationContext, req: HttpRequest): Promise<HttpResponseInit> {
  const results: StepResult[] = [];

  try {
    const { getAuthContext } = require("../shared/auth") as typeof import("../shared/auth");
    const auth = getAuthContext(req.headers as unknown as Record<string, string | undefined>);
    results.push({ step: "load-auth", ok: true, detail: `userId=${auth.userId ?? "null"}` });
  } catch (error: unknown) {
    results.push({ step: "load-auth", ok: false, detail: toErrorMessage(error) });
  }

  let getContainer: ((name: string) => import("@azure/cosmos").Container) | null = null;

  try {
    const cosmos = require("../shared/cosmosClient") as typeof import("../shared/cosmosClient");
    getContainer = cosmos.getContainer;
    results.push({ step: "load-cosmos-module", ok: true });
  } catch (error: unknown) {
    results.push({ step: "load-cosmos-module", ok: false, detail: toErrorMessage(error) });
  }

  if (getContainer) {
    try {
      const container = getContainer("users");
      results.push({ step: "get-users-container", ok: true, detail: container.id });
    } catch (error: unknown) {
      results.push({ step: "get-users-container", ok: false, detail: toErrorMessage(error) });
    }

    try {
      const container = getContainer("users");
      const query = await container.items.query("SELECT VALUE COUNT(1) FROM c").fetchAll();
      const count = query.resources?.[0] ?? 0;
      results.push({ step: "query-users-count", ok: true, detail: `count=${count}` });
    } catch (error: unknown) {
      results.push({ step: "query-users-count", ok: false, detail: toErrorMessage(error) });
    }
  }

  const hasFailure = results.some((result) => !result.ok);

  return {
    status: hasFailure ? 500 : 200,
    jsonBody: {
      ok: !hasFailure,
      runtime: process.version,
      results
    }
  };
}
