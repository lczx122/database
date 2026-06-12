import type { MyinvoisConfig, TokenResponse } from "./types";
import { MyinvoisApiError } from "./types";

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
  cacheKey: string;
}

// Tokens are valid for 60 minutes; refresh 5 minutes early. Single-flight so
// concurrent submissions share one refresh request.
let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function cacheKeyFor(config: MyinvoisConfig): string {
  return `${config.apiBaseUrl}|${config.clientId}`;
}

async function fetchToken(config: MyinvoisConfig): Promise<string> {
  const res = await fetch(`${config.apiBaseUrl}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      scope: "InvoicingAPI",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new MyinvoisApiError(res.status, body, `MyInvois login failed (HTTP ${res.status}) — check Client ID/Secret and environment`);
  }

  const data = (await res.json()) as TokenResponse;
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    cacheKey: cacheKeyFor(config),
  };
  return data.access_token;
}

export async function getToken(config: MyinvoisConfig): Promise<string> {
  const key = cacheKeyFor(config);
  if (cached && cached.cacheKey === key && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }
  if (!inflight) {
    inflight = fetchToken(config).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function invalidateToken(): void {
  cached = null;
}
