import type { Agent, Beat, Block, PlaceId, Plan } from "./types";
import { PLACE_IDS } from "./types";
import { ANCHORS, nearestWalkable } from "./world";

const PLACES = new Set<string>(PLACE_IDS);

export function isPlace(value: string): value is PlaceId {
  return PLACES.has(value);
}

export function blocksToBeats(blocks: Block[]): Beat[] {
  const safe = (Array.isArray(blocks) ? blocks : []).filter(
    (b) =>
      !!b &&
      isPlace(String(b.place ?? "")) &&
      Number.isFinite(b.from) &&
      Number.isFinite(b.to) &&
      b.to > b.from &&
      typeof b.status === "string" &&
      b.status.trim().length > 0,
  );
  if (!safe.length) return [];
  const beats: Beat[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const block =
      safe.find((b) => hour >= b.from && hour < b.to) ??
      safe[safe.length - 1] ??
      ({
        from: 0,
        to: 24,
        place: "plaza",
        status: "between places, not in a hurry",
        spot: "out",
      } satisfies Block);
    beats.push({
      hour,
      place: block.place,
      status: block.status.replace(/\s+/g, " ").trim().slice(0, 110),
      spot: block.spot === "home" ? "home" : "out",
    });
  }
  return beats;
}

export function planFromBlocks(day: number, summary: string, blocks: Block[]): Plan {
  const text = String(summary ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  return {
    day: Number.isFinite(day) ? day : 1,
    summary: text || "A day with no speech attached.",
    beats: blocksToBeats(blocks),
  };
}

export function beatAt(agent: Agent, minute: number): Beat {
  const hour = ((Math.floor(finiteMinute(minute) / 60) % 24) + 24) % 24;
  const beats = agent.plan?.beats;
  const beat = beats && beats[hour];
  if (beat && isPlace(String(beat.place)) && typeof beat.status === "string") return beat;
  return {
    hour,
    place: "street",
    status: "between places",
    spot: "out",
  };
}

function finiteMinute(minute: number): number {
  return Number.isFinite(minute) ? minute : 0;
}

export function goalFor(agent: Agent, beat: Beat): { x: number; y: number } {
  const home = agent.home ?? { x: 26, y: 22 };
  if (beat.spot === "home") return nearestWalkable(home.x, home.y);
  if (
    beat.place === "townhouses" &&
    (agent.id === "baba" || agent.id === "sub" || agent.id === "player")
  ) {
    return nearestWalkable(home.x, home.y);
  }
  const anchor = ANCHORS[beat.place] ?? ANCHORS.plaza;
  return nearestWalkable(anchor.x, anchor.y);
}
