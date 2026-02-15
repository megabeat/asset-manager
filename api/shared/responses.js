"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
function ok(data, status = 200) {
    return {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({ data, error: null })
    };
}
function fail(code, message, status = 400, details) {
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
