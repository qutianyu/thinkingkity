const AUTH_TOKEN_KEY_PREFIX = "thinkingkity:api-token";
const AUTH_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

interface StoredAuthToken {
  token: string;
  expiresAt: number;
}

export function getAuthSessionKey(username?: string | null): string {
  return username ? `${AUTH_TOKEN_KEY_PREFIX}:${username}` : AUTH_TOKEN_KEY_PREFIX;
}

export function getAuthToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(AUTH_TOKEN_KEY_PREFIX)) {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;

      try {
        const stored = JSON.parse(raw) as StoredAuthToken;
        if (stored.expiresAt <= Date.now()) {
          sessionStorage.removeItem(key);
          continue;
        }
        if (stored.token) return stored.token;
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function setAuthToken(token: string | null, username?: string | null): void {
  if (typeof sessionStorage === "undefined" || !token) return;
  const stored: StoredAuthToken = {
    token,
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS,
  };
  sessionStorage.setItem(getAuthSessionKey(username), JSON.stringify(stored));
}

export function clearAuthTokens(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(AUTH_TOKEN_KEY_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => sessionStorage.removeItem(key));
}

export function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { "X-ThinkingKity-Auth": token } : {};
}
