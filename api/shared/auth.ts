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

type HeaderMap = { get(name: string): string | null } | Record<string, string | undefined>;

function readHeader(headers: HeaderMap, key: string): string | undefined {
  if (typeof (headers as { get?: (name: string) => string | null }).get === "function") {
    return (headers as { get(name: string): string | null }).get(key) ?? undefined;
  }

  const record = headers as Record<string, string | undefined>;
  return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
}

export function getAuthContext(headers: HeaderMap): AuthContext {
  const explicitUserId = readHeader(headers, "x-user-id");
  if (explicitUserId && explicitUserId.trim().length > 0) {
    return { userId: explicitUserId.trim(), roles: ["authenticated"], userDetails: explicitUserId.trim() };
  }

  const principal = readHeader(headers, "x-ms-client-principal");
  if (!principal) {
    const demoUserId = process.env.DEFAULT_USER_ID ?? "demo-user";
    return { userId: demoUserId, roles: ["authenticated"], userDetails: demoUserId };
  }

  try {
    const decoded = Buffer.from(principal, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as ClientPrincipal;
    return {
      userId: parsed.userId ?? null,
      roles: parsed.userRoles ?? [],
      userDetails: parsed.userDetails ?? null
    };
  } catch {
    return { userId: null, roles: [], userDetails: null };
  }
}
