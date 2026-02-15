"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthContext = getAuthContext;
function defaultAuthContext() {
    const demoUserId = process.env.DEFAULT_USER_ID ?? "demo-user";
    return { userId: demoUserId, roles: ["authenticated"], userDetails: demoUserId };
}
function readHeader(headers, key) {
    if (!headers)
        return undefined;
    if (typeof headers.get === "function") {
        try {
            return (headers.get(key) ??
                headers.get(key.toLowerCase()) ??
                undefined);
        }
        catch {
            return undefined;
        }
    }
    const record = headers;
    return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
}
function getAuthContext(headers) {
    const explicitUserId = readHeader(headers, "x-user-id");
    if (explicitUserId && explicitUserId.trim().length > 0) {
        return { userId: explicitUserId.trim(), roles: ["authenticated"], userDetails: explicitUserId.trim() };
    }
    const principal = readHeader(headers, "x-ms-client-principal");
    if (!principal) {
        return defaultAuthContext();
    }
    try {
        const decoded = Buffer.from(principal, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        return {
            userId: parsed.userId ?? null,
            roles: parsed.userRoles ?? [],
            userDetails: parsed.userDetails ?? null
        };
    }
    catch {
        return defaultAuthContext();
    }
}
