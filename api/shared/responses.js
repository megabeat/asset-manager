"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
function ok(data, status = 200) {
    return {
        status,
        jsonBody: { data, error: null }
    };
}
function fail(code, message, status = 400, details) {
    return {
        status,
        jsonBody: {
            data: null,
            error: { code, message, details: details ?? null }
        }
    };
}
