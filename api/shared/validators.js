"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireUserId = requireUserId;
exports.ensureString = ensureString;
exports.ensureOptionalString = ensureOptionalString;
exports.ensureNumber = ensureNumber;
exports.ensureOptionalNumber = ensureOptionalNumber;
exports.ensureEnum = ensureEnum;
exports.ensureOptionalEnum = ensureOptionalEnum;
exports.ensureNumberInRange = ensureNumberInRange;
exports.ensureOptionalNumberInRange = ensureOptionalNumberInRange;
exports.ensureBoolean = ensureBoolean;
exports.ensureOptionalBoolean = ensureOptionalBoolean;
function requireUserId(userId) {
    if (!userId) {
        throw new Error("UNAUTHORIZED");
    }
}
function ensureString(value, fieldName) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return value.trim();
}
function ensureOptionalString(value, fieldName) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return ensureString(value, fieldName);
}
function ensureNumber(value, fieldName) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return value;
}
function ensureOptionalNumber(value, fieldName) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return ensureNumber(value, fieldName);
}
function ensureEnum(value, fieldName, allowed) {
    const normalized = ensureString(value, fieldName);
    if (!allowed.includes(normalized)) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return normalized;
}
function ensureOptionalEnum(value, fieldName, allowed) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return ensureEnum(value, fieldName, allowed);
}
function ensureNumberInRange(value, fieldName, min, max) {
    const numberValue = ensureNumber(value, fieldName);
    if (numberValue < min || numberValue > max) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return numberValue;
}
function ensureOptionalNumberInRange(value, fieldName, min, max) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return ensureNumberInRange(value, fieldName, min, max);
}
function ensureBoolean(value, fieldName) {
    if (typeof value !== "boolean") {
        throw new Error(`Invalid ${fieldName}`);
    }
    return value;
}
function ensureOptionalBoolean(value, fieldName) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return ensureBoolean(value, fieldName);
}
