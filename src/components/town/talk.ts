export type ChatMark = { id: string; type: string; with?: string };

export type FocusLike = {
  tagName?: string;
  role?: string | null;
  closest?: (selector: string) => unknown;
} | null;

const CONTROLS = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"]);

export function playerChatIds(memories: ChatMark[]): string[] {
  return memories.filter((m) => m.type === "chat" && m.with === "player").map((m) => m.id);
}

/** True when this send added a chat with the player, regardless of how the text was stored. */
export function exchangeLanded(before: string[], after: string[]): boolean {
  const seen = new Set(before);
  return after.some((id) => !seen.has(id));
}

export function nextDraft(current: string, sent: string, sameContext: boolean, landed: boolean): string {
  if (landed && sameContext && current.trim() === sent) return "";
  return current;
}

export function interactiveControl(target: FocusLike): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (CONTROLS.has(tag)) return true;
  if (target.role === "button" || target.role === "link") return true;
  return Boolean(target.closest?.("button, a, input, textarea, select, [role='button'], [role='link']"));
}

/** Enter / E open talk only from the town itself, not from a focused control, and not during a conversation. */
export function opensTalk(code: string, interactive: boolean, alreadyTalking: boolean): boolean {
  if (alreadyTalking) return false;
  if (code !== "Enter" && code !== "KeyE") return false;
  return !interactive;
}
