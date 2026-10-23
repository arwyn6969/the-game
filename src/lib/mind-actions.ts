import { PLACE_IDS } from "../game/types.ts";
import type { PlaceId } from "../game/types.ts";
import type { PhysicalDecision } from "../game/physical-types.ts";

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    value.trim().length > 0 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  );
}

/** Syntax only: the engine rechecks current item revision, custody and reach at commit. */
export function parsePhysicalDecision(value: unknown): PhysicalDecision | null {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!row) return null;
  if (row.kind === "wait") return exactKeys(row, ["kind"]) ? { kind: "wait" } : null;
  if (row.kind === "speak")
    return exactKeys(row, ["kind", "text"]) && boundedText(row.text, 400)
      ? { kind: "speak", text: row.text.trim() }
      : null;
  if (
    !boundedText(row.itemId, 96) ||
    row.itemId !== row.itemId.trim() ||
    !Number.isSafeInteger(row.itemRevision) ||
    Number(row.itemRevision) < 0
  )
    return null;
  const itemId = row.itemId;
  const itemRevision = row.itemRevision as number;
  if (row.kind === "pick-up" || row.kind === "put-down" || row.kind === "read")
    return exactKeys(row, ["kind", "itemId", "itemRevision"])
      ? { kind: row.kind, itemId, itemRevision }
      : null;
  if (row.kind === "bring")
    return exactKeys(row, ["kind", "itemId", "itemRevision", "destination"]) &&
      typeof row.destination === "string" &&
      (PLACE_IDS as readonly string[]).includes(row.destination)
      ? { kind: "bring", itemId, itemRevision, destination: row.destination as PlaceId }
      : null;
  if (row.kind === "write")
    return exactKeys(row, ["kind", "itemId", "itemRevision", "title", "text"]) &&
      boundedText(row.title, 80) &&
      boundedText(row.text, 1200)
      ? { kind: "write", itemId, itemRevision, title: row.title.trim(), text: row.text.trim() }
      : null;
  return null;
}
