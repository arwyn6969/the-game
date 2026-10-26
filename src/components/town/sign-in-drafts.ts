import { AGENT_IDS, type AgentId } from "../../game/types.ts";

const KEY = "the-game-sign-in-drafts";
type Drafts = Partial<Record<AgentId, string>>;

/** Keep unsent lines in this tab through the full-page OAuth round trip. */
export function saveSignInDrafts(worldId: string, drafts: Drafts, storage: Storage): void {
  storage.setItem(KEY, JSON.stringify({ worldId, drafts, expiresAt: Date.now() + 30 * 60_000 }));
}

export function readSignInDrafts(worldId: string | undefined, storage: Storage): Drafts {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!worldId || saved?.worldId !== worldId || !(saved.expiresAt > Date.now())) return {};
    return Object.fromEntries(
      AGENT_IDS.flatMap((id) =>
        typeof saved.drafts?.[id] === "string" ? [[id, saved.drafts[id].slice(0, 400)]] : [],
      ),
    );
  } catch {
    return {};
  }
}

export function clearSignInDrafts(storage: Storage): void {
  storage.removeItem(KEY);
}
