"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthContext = getAuthContext;
function readHeader(headers, key) {
    if (typeof headers.get === "function") {
        return headers.get(key) ?? undefined;
    }
    const record = headers;
    return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
}
function getAuthContext(headers) {
    const principal = readHeader(headers, "x-ms-client-principal");
    if (!principal) {
        return { userId: null, roles: [], userDetails: null };
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
        return { userId: null, roles: [], userDetails: null };
    }
}
