type ClientPrincipal = {
  userId?: string;
  userDetails?: string;
  identityProvider?: string;
  userRoles?: string[];
};

export type AuthContext = {
  userId: string | null;
  roles: string[];
  userDetails: string | null;
};

type HeaderMap = { get(name: string): string | null } | Record<string, string | undefined> | null | undefined;

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function isDevHeaderAuthEnabled(): boolean {
  const explicit = (process.env.ALLOW_DEV_HEADER_AUTH ?? "").toLowerCase();
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }
  return true;
}

function parseAllowedUsers(): string[] {
  const raw = process.env.AUTH_ALLOWED_USERS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function isAllowedUser(userId: string | null, userDetails: string | null): boolean {
  const allowedUsers = parseAllowedUsers();
  if (allowedUsers.length === 0) {
    return true;
  }

  const candidates = [userId ?? "", userDetails ?? ""]
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  return candidates.some((value) => allowedUsers.includes(value));
}

function defaultAuthContext(): AuthContext {
  if (isDevHeaderAuthEnabled()) {
    const demoUserId = process.env.DEFAULT_USER_ID ?? "demo-user";
    return { userId: demoUserId, roles: ["authenticated"], userDetails: demoUserId };
  }

  return { userId: null, roles: [], userDetails: null };
}

function readHeader(headers: HeaderMap, key: string): string | undefined {
  if (!headers) return undefined;

  if (typeof (headers as { get?: (name: string) => string | null }).get === "function") {
    try {
      return (
        (headers as { get(name: string): string | null }).get(key) ??
        (headers as { get(name: string): string | null }).get(key.toLowerCase()) ??
        undefined
      );
    } catch {
      return undefined;
    }
  }

  const record = headers as Record<string, string | undefined>;
  return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
}

export function getAuthContext(headers: HeaderMap): AuthContext {
  const principal = readHeader(headers, "x-ms-client-principal");
  if (principal) {
    try {
      const decoded = Buffer.from(principal, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as ClientPrincipal;
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
    } catch {
      return defaultAuthContext();
    }
  }

  const explicitUserId = readHeader(headers, "x-user-id");
  if (explicitUserId && explicitUserId.trim().length > 0 && isDevHeaderAuthEnabled()) {
    return { userId: explicitUserId.trim(), roles: ["authenticated"], userDetails: explicitUserId.trim() };
  }

  return defaultAuthContext();
}
