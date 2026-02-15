"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthContext = getAuthContext;
function isProduction() {
    return (process.env.NODE_ENV ?? "").toLowerCase() === "production";
}
function isDevHeaderAuthEnabled() {
    const explicit = (process.env.ALLOW_DEV_HEADER_AUTH ?? "").toLowerCase();
    if (explicit === "true") {
        return true;
    }
    if (explicit === "false") {
        return false;
    }
    return !isProduction();
}
function parseAllowedUsers() {
    const raw = process.env.AUTH_ALLOWED_USERS ?? "";
    return raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);
}
function isAllowedUser(userId, userDetails) {
    const allowedUsers = parseAllowedUsers();
    if (allowedUsers.length === 0) {
        return true;
    }
    const candidates = [userId ?? "", userDetails ?? ""]
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);
    return candidates.some((value) => allowedUsers.includes(value));
}
function defaultAuthContext() {
    if (isDevHeaderAuthEnabled()) {
        const demoUserId = process.env.DEFAULT_USER_ID ?? "demo-user";
        return { userId: demoUserId, roles: ["authenticated"], userDetails: demoUserId };
    }
    return { userId: null, roles: [], userDetails: null };
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
    if (explicitUserId && explicitUserId.trim().length > 0 && isDevHeaderAuthEnabled()) {
        return { userId: explicitUserId.trim(), roles: ["authenticated"], userDetails: explicitUserId.trim() };
    }
    const principal = readHeader(headers, "x-ms-client-principal");
    if (!principal) {
        return defaultAuthContext();
    }
    try {
        const decoded = Buffer.from(principal, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        const userId = parsed.userId ?? null;
        const userDetails = parsed.userDetails ?? null;
        if (!isAllowedUser(userId, userDetails)) {
            return {
                userId: null,
                roles: parsed.userRoles ?? [],
                userDetails
            };
        }
        return {
            userId,
            roles: parsed.userRoles ?? [],
            userDetails
        };
    }
    catch {
        return defaultAuthContext();
    }
}
