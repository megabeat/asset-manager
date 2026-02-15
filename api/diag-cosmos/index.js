"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagCosmosHandler = diagCosmosHandler;
function toErrorMessage(error) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
async function diagCosmosHandler(_context, req) {
    const results = [];
    try {
        const { getAuthContext } = require("../shared/auth");
        const auth = getAuthContext(req.headers);
        results.push({ step: "load-auth", ok: true, detail: `userId=${auth.userId ?? "null"}` });
    }
    catch (error) {
        results.push({ step: "load-auth", ok: false, detail: toErrorMessage(error) });
    }
    let getContainer = null;
    try {
        const cosmos = require("../shared/cosmosClient");
        getContainer = cosmos.getContainer;
        results.push({ step: "load-cosmos-module", ok: true });
    }
    catch (error) {
        results.push({ step: "load-cosmos-module", ok: false, detail: toErrorMessage(error) });
    }
    if (getContainer) {
        try {
            const container = getContainer("users");
            results.push({ step: "get-users-container", ok: true, detail: container.id });
        }
        catch (error) {
            results.push({ step: "get-users-container", ok: false, detail: toErrorMessage(error) });
        }
        try {
            const container = getContainer("users");
            const query = await container.items.query("SELECT VALUE COUNT(1) FROM c").fetchAll();
            const count = query.resources?.[0] ?? 0;
            results.push({ step: "query-users-count", ok: true, detail: `count=${count}` });
        }
        catch (error) {
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
