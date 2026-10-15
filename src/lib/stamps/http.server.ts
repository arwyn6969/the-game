import { randomBytes } from "node:crypto";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "../auth/isolation.server";
import { StampIdentityError, StampIdentityService, stampSessionHash } from "./service.server";
import { SqlStampStore } from "./store.server";

export const STAMP_SESSION_COOKIE = "__Host-the-game.stamp-session";
export const STAMP_SESSION_MS = 30 * 60_000;

function loopback(origin: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}
export function stampStorageMode(
  env: Record<string, string | undefined>,
  origin: string,
): "shared" | "local" | "unavailable" {
  if (env.DATABASE_URL?.trim()) return "shared";
  if (
    !env.VERCEL &&
    !env.GROK_PROJECT_ID &&
    loopback(origin) &&
    (env.NODE_ENV !== "production" || env.STAMP_IDENTITY_LOCAL_DEV === "true")
  )
    return "local";
  return "unavailable";
}

/** Strict origin checks also cover browsers without Fetch Metadata headers. */
export function stampRequestOrigin(request: Request, configuredOrigin?: string): string {
  const expected = new URL(configuredOrigin || request.url).origin;
  const incoming = request.headers.get("origin");
  if ((request.method !== "GET" && !incoming) || (incoming && incoming !== expected))
    throw new StampIdentityError("invalid", "This wallet request must come from the game page.");
  if (
    new URL(expected).protocol !== "https:" &&
    !(loopback(expected) && new URL(expected).protocol === "http:")
  )
    throw new StampIdentityError(
      "unavailable",
      "A secure connection is required for wallet identity.",
    );
  return expected;
}

/** No game account or global character ownership is inferred from this cookie. */
export async function stampHttpContext(create = false) {
  assertSameSiteRequest();
  const request = getRequest();
  const origin = stampRequestOrigin(request, process.env.BETTER_AUTH_URL);
  if (stampStorageMode(process.env, origin) === "unavailable")
    throw new StampIdentityError(
      "unavailable",
      "Stamp identities aren't available on this server yet. You can keep playing.",
    );
  const existing = getCookie(STAMP_SESSION_COOKIE);
  const token =
    existing && /^[0-9a-f]{64}$/.test(existing)
      ? existing
      : create
        ? randomBytes(32).toString("hex")
        : null;
  if (!token) return null;
  const { getSql } = await import("../db");
  const store = new SqlStampStore(await getSql());
  const service = new StampIdentityService(store, stampSessionHash(token), origin);
  return {
    service,
    saveCookie() {
      setCookie(STAMP_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: STAMP_SESSION_MS / 1000,
      });
    },
  };
}
