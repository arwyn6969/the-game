import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "../auth/isolation.server";
import { stampRequestOrigin } from "../stamps/http.server";
import { resolveOwnerUser } from "./auth.server";
import { ownerReference } from "./proof.server";
import { AgentRegistryError, AgentRegistryService } from "./service.server";
import { SqlAgentRegistryStore } from "./store.server";
import type { OwnerAccess } from "./types";

export function registryStorageMode(
  env: Record<string, string | undefined>,
  origin: string,
): "shared" | "local" | "unavailable" {
  try {
    const url = new URL(origin);
    if (
      env.VITE_AUTH_ENABLED === "false" ||
      !env.BETTER_AUTH_SECRET ||
      env.BETTER_AUTH_SECRET.length < 32
    )
      return "unavailable";
    if (env.DATABASE_URL?.trim()) {
      if (
        !env.BETTER_AUTH_URL ||
        new URL(env.BETTER_AUTH_URL).origin !== origin ||
        url.protocol !== "https:" ||
        !env.GROK_AUTH_CLIENT_ID?.trim() ||
        !env.GROK_AUTH_CLIENT_SECRET?.trim()
      )
        return "unavailable";
      return "shared";
    }
    if (
      !env.VERCEL &&
      !env.GROK_PROJECT_ID &&
      env.AGENT_REGISTRY_LOCAL_DEV === "true" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return "local";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

function boundary() {
  setResponseHeader("Cache-Control", "private, no-store");
  assertSameSiteRequest();
  const origin = stampRequestOrigin(getRequest(), process.env.BETTER_AUTH_URL);
  const mode = registryStorageMode(process.env, origin);
  return { origin, mode };
}

export async function agentOwnerAccess(bearerToken?: string): Promise<OwnerAccess> {
  const { mode } = boundary();
  if (mode === "unavailable")
    return {
      available: false,
      authenticated: false,
      ownerRef: null,
      message:
        "Agent wallets need persistent storage and configured account sign-in. Your local town is still available.",
    };
  try {
    const owner = await resolveOwnerUser(bearerToken);
    return {
      available: true,
      authenticated: true,
      ownerRef: ownerReference(owner),
      message:
        mode === "local"
          ? "Local test registration; records reset when this server restarts."
          : "Private agent profiles are available to your signed-in account.",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "OwnerAuthenticationError")
      return {
        available: true,
        authenticated: false,
        ownerRef: null,
        message: "Sign in to manage a private copy and its receiving drafts.",
      };
    throw error;
  }
}

export function assertExpectedOwner(ownerId: string, expectedOwnerRef: string): void {
  if (ownerReference(ownerId) !== expectedOwnerRef)
    throw new AgentRegistryError(
      "owner-mismatch",
      "The signed-in account changed. Refresh account status before using private profiles.",
    );
}

export async function agentRegistryContext(
  expectedOwnerRef: string,
  bearerToken?: string,
): Promise<AgentRegistryService> {
  const { origin, mode } = boundary();
  if (mode === "unavailable")
    throw new AgentRegistryError(
      "unavailable",
      "Agent wallets aren't configured on this server yet. You can keep playing locally.",
    );
  const owner = await resolveOwnerUser(bearerToken);
  assertExpectedOwner(owner, expectedOwnerRef);
  const { getSql } = await import("../db");
  return new AgentRegistryService(new SqlAgentRegistryStore(await getSql()), owner, origin);
}

export async function agentObservationContext(expectedOwnerRef: string, bearerToken?: string) {
  const { mode } = boundary();
  if (mode === "unavailable")
    throw new AgentRegistryError(
      "unavailable",
      "Agent wallets aren't configured on this server yet.",
    );
  const owner = await resolveOwnerUser(bearerToken);
  assertExpectedOwner(owner, expectedOwnerRef);
  const { getSql } = await import("../db");
  const { SqlAgentObservationStore } = await import("./observation-store.server");
  const { AgentReceivingObservationService } = await import("./observation-service.server");
  const sql = await getSql();
  return new AgentReceivingObservationService(
    new SqlAgentRegistryStore(sql),
    new SqlAgentObservationStore(sql),
    owner,
  );
}
