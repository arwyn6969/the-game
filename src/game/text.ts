export function formatClock(minute: number): string {
  const safe = Number.isFinite(minute) ? minute : 0;
  const h = Math.floor(safe / 60) % 24;
  const m = ((safe % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function periodName(minute: number): "Dawn" | "Day" | "Dusk" | "Night" {
  const safe = Number.isFinite(minute) ? minute : 0;
  const h = ((Math.floor(safe / 60) % 24) + 24) % 24;
  if (h >= 5 && h < 7) return "Dawn";
  if (h >= 7 && h < 17) return "Day";
  if (h >= 17 && h < 20) return "Dusk";
  return "Night";
}

export function finite(n: unknown, fallback = 0): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

export function clamp(n: number, lo: number, hi: number): number {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(lo, Math.min(hi, x));
}

export function purse(n: unknown, cap = 999): number {
  return clamp(Math.round(finite(n)), 0, cap);
}

/** Whether a line is about Kevin's private question: who he is, and the help he needs. */
export function mentionsSeed(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes("who he is") || t.includes("who kevin is") || t.includes("man under the apron")) return true;
  if (t.includes("where i came") || t.includes("where he came") || t.includes("where kevin came")) return true;
  const aboutHim = t.includes("kevin") || t.includes("the cafe owner");
  if (
    aboutHim &&
    (t.includes("who i am") ||
      t.includes("came from") ||
      t.includes("make some money") ||
      t.includes("making some money") ||
      t.includes("need help") ||
      t.includes("needs help") ||
      t.includes("need friends") ||
      t.includes("needs friends") ||
      t.includes("earning a living"))
  )
    return true;
  if (t.includes("kevin") && (t.includes("origin") || t.includes("fortune he buried"))) return true;
  return false;
}

export function clip(text: string, n: number): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(1, n) - 1).trim()}…`;
}

export function plain(text: string, n: number): string {
  return clip(String(text ?? "").replace(/[\u0000-\u001f`"]/g, " "), n);
}
