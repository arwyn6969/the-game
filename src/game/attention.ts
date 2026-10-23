import type { AgentId, Town } from "./types";
import { cell, zoneAt } from "./world";

export const DISCUSSION_EARSHOT = 6;
type Tile = { x: number; y: number };
const outdoors = new Set(["green", "plaza", "noticeboard", "park", "street"]);
export function acousticArea(tile: Tile): string | null {
  if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) return null;
  const ground = cell(tile.x, tile.y);
  if (!ground || ground.ground === "wall" || ground.ground === "water") return null;
  const zone = zoneAt(tile.x, tile.y);
  return outdoors.has(zone) ? "outdoors" : zone;
}

/** A maximum opportunity to hear. Furniture does not block sound; buildings do. */
export function canHear(speaker: Tile, listener: Tile, reach = DISCUSSION_EARSHOT): boolean {
  const area = acousticArea(speaker);
  if (!area || area !== acousticArea(listener)) return false;
  if (Math.abs(speaker.x - listener.x) + Math.abs(speaker.y - listener.y) > reach) return false;
  // A wall between two nearby points still blocks sound even if a map label is shared.
  const steps = Math.max(Math.abs(speaker.x - listener.x), Math.abs(speaker.y - listener.y));
  for (let index = 1; index < steps; index++) {
    const point = cell(
      Math.round(speaker.x + ((listener.x - speaker.x) * index) / steps),
      Math.round(speaker.y + ((listener.y - speaker.y) * index) / steps),
    );
    if (!point || point.ground === "wall") return false;
  }
  return true;
}

/** Knowledge delivery requires deliberate attention to this exact context. */
export function attentiveDiscussionRecipients(
  town: Town,
  speaker: AgentId,
  contextId: string,
): AgentId[] {
  const session = town.discussions?.sessions.find((meeting) => meeting.id === contextId);
  const source = town.agents.find((agent) => agent.id === speaker);
  if (!session || !source || session.status !== "active") return [];
  return session.members
    .filter((member) => {
      const listener = town.agents.find((agent) => agent.id === member.id);
      return (
        member.id !== speaker &&
        member.choice === "accepted" &&
        member.arrived &&
        member.mode !== "off" &&
        listener &&
        canHear(source.tile, listener.tile)
      );
    })
    .map((member) => member.id);
}
