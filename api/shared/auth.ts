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

export function getAuthContext(headers: Record<string, string | undefined>): AuthContext {
  const principal = headers["x-ms-client-principal"];
  if (!principal) {
    return { userId: null, roles: [], userDetails: null };
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
