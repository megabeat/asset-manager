"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonBody = parseJsonBody;
async function parseJsonBody(req) {
    const request = req;
    if (typeof request.json === "function") {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        throw new Error("Invalid JSON body");
    }
    const body = request.body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
        return body;
    }
    if (typeof body === "string" && body.trim().length > 0) {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    if (typeof request.rawBody === "string" && request.rawBody.trim().length > 0) {
        const parsed = JSON.parse(request.rawBody);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    throw new Error("Invalid JSON body");
}
