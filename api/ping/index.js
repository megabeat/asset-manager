"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingHandler = pingHandler;
async function pingHandler(_req, _context) {
    return {
        status: 200,
        jsonBody: {
            ok: true,
            service: "api",
            timestamp: new Date().toISOString()
        }
    };
}
