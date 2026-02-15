export function requireUserId(userId: string | null): asserts userId is string {
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
}

export function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value.trim();
}

export function ensureOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }
  return ensureString(value, fieldName);
}

export function ensureNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
}

export function ensureOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return ensureNumber(value, fieldName);
}

export function ensureEnum(value: unknown, fieldName: string, allowed: string[]): string {
  const normalized = ensureString(value, fieldName);
  if (!allowed.includes(normalized)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return normalized;
}

export function ensureOptionalEnum(
  value: unknown,
  fieldName: string,
  allowed: string[]
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return ensureEnum(value, fieldName, allowed);
}

export function ensureNumberInRange(
  value: unknown,
  fieldName: string,
  min: number,
  max: number
): number {
  const numberValue = ensureNumber(value, fieldName);
  if (numberValue < min || numberValue > max) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return numberValue;
}

export function ensureOptionalNumberInRange(
  value: unknown,
  fieldName: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return ensureNumberInRange(value, fieldName, min, max);
}

export function ensureBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
}

export function ensureOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return ensureBoolean(value, fieldName);
}
