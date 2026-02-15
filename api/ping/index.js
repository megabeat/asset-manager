"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingHandler = pingHandler;
async function pingHandler(_context, _req) {
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
