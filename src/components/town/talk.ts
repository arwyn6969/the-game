export type ChatMark = { id: string; type: string; with?: string };

export type FocusLike = {
  tagName?: string;
  role?: string | null;
  closest?: (selector: string) => unknown;
} | null;

const CONTROLS = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "SUMMARY"]);

export function playerChatIds(memories: ChatMark[]): string[] {
  return memories.filter((m) => m.type === "chat" && m.with === "player").map((m) => m.id);
}

/** True when this send added a chat with the player, regardless of how the text was stored. */
export function exchangeLanded(before: string[], after: string[]): boolean {
  const seen = new Set(before);
  return after.some((id) => !seen.has(id));
}

export function nextDraft(
  current: string,
  sent: string,
  sameContext: boolean,
  landed: boolean,
): string {
  if (landed && sameContext && current.trim() === sent) return "";
  return current;
}

export function interactiveControl(target: FocusLike): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (CONTROLS.has(tag)) return true;
  if (target.role === "button" || target.role === "link") return true;
  return Boolean(
    target.closest?.("button, a, input, textarea, select, summary, [role='button'], [role='link']"),
  );
}

/** Enter / E open talk only from the town itself, not from a focused control, and not during a conversation. */
export function opensTalk(code: string, interactive: boolean, alreadyTalking: boolean): boolean {
  if (alreadyTalking) return false;
  if (code !== "Enter" && code !== "KeyE") return false;
  return !interactive;
}

/** Same two-tile reach as walking up and pressing Enter. */
export function inTalkRange(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) + Math.abs(ay - by) <= 2;
}

/** The schedule status is only true when the player is actually in that place. */
export function activityStatus(zone: string, plannedPlace: string, plannedStatus: string): string {
  if (zone === plannedPlace) return plannedStatus;
  return "exploring the town";
}

export function spokenTurns(text: string): { who: string; line: string }[] {
  const match = text.match(
    /([\p{L}][\p{L}0-9' ._-]{0,40}?) said: "([\s\S]*?)"\s+([\p{L}][\p{L}0-9' ._-]{0,40}?) answered: "([\s\S]*?)"\s*$/u,
  );
  if (!match) return [];
  const saidWho = match[1].trim();
  const answerWho = match[3].trim();
  if (!saidWho || !answerWho) return [];
  return [
    { who: saidWho, line: match[2] },
    { who: answerWho, line: match[4] },
  ];
}

/** True when the reader is already at the newest lines, so a new reply may scroll into view. */
export function followingLatest(
  scrollTop: number,
  latestBottom: number,
  clientHeight: number,
): boolean {
  return latestBottom >= scrollTop && latestBottom - scrollTop - clientHeight < 48;
}
