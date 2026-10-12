import type { Agent, AgentId, Town } from "./types";
import { NPC_IDS } from "./types";
import { beatAt, goalFor } from "./plan";
import { findPath } from "./path";
import { mentionsSeed } from "./text";
import { cell, nearestWalkable, placeOfZone, placeTitle, walkable, zoneAt } from "./world";

type Tile = { x: number; y: number };
const STEP = 3;
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const yieldCooldown = new WeakMap<Town, Map<AgentId, number>>();
const key = (p: Tile) => `${p.x},${p.y}`;
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;

function occupant(town: Town, point: Tile, except: AgentId) {
  return town.agents.find((a) => a.id !== except && same(a.tile, point));
}

function blockedTiles(town: Town, except: AgentId, playerOnly = false) {
  return new Set(
    town.agents
      .filter((a) => a.id !== except && (!playerOnly || a.id === "player"))
      .map((a) => key(a.tile)),
  );
}

function routeFor(town: Town, agent: Agent, goal: Tile): Tile[] {
  const route = findPath(agent.tile, goal, blockedTiles(town, agent.id));
  if (route.length) return route;
  // Approach a distant NPC obstruction before asking them to yield.
  const approach = findPath(agent.tile, goal, blockedTiles(town, agent.id, true));
  const blockedAt = approach.findIndex((point) => occupant(town, point, agent.id));
  return blockedAt < 0 ? approach : approach.slice(0, blockedAt);
}

function stepTo(agent: Agent, next: Tile) {
  const dx = next.x - agent.tile.x;
  const dy = next.y - agent.tile.y;
  agent.face = dx > 0 ? "e" : dx < 0 ? "w" : dy > 0 ? "s" : "n";
  agent.tile = { ...next };
}

/** Find a short legal retreat, never swapping through another person. */
function yieldPath(town: Town, blocker: Agent, route: Tile[], budget: number): Tile[] {
  const avoid = new Set(route.map(key));
  const occupied = blockedTiles(town, blocker.id);
  const seen = new Set([key(blocker.tile)]);
  const queue: { point: Tile; path: Tile[] }[] = [{ point: blocker.tile, path: [] }];
  for (let index = 0; index < queue.length; index++) {
    const { point, path } = queue[index]!;
    if (path.length && !avoid.has(key(point)) && cell(point.x, point.y)?.ground !== "door")
      return path;
    if (path.length >= budget) continue;
    for (const [dx, dy] of directions) {
      const next = { x: point.x + dx, y: point.y + dy };
      const nextKey = key(next);
      if (!walkable(next.x, next.y) || occupied.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push({ point: next, path: [...path, next] });
    }
  }
  return [];
}

/** Refresh after a plan/load as well as movement; intentions alone do not prove arrival. */
export function refreshResidentStatus(
  town: Town,
  agent: Agent,
  motion?: "moved" | "yielded" | "waiting",
) {
  if (agent.id === "player") return;
  const beat = beatAt(agent, town.minute);
  const goal = goalFor(agent, beat);
  const nearbySharedGoal =
    beat.spot !== "home" &&
    occupant(town, goal, agent.id) &&
    placeOfZone(zoneAt(agent.tile.x, agent.tile.y)) === beat.place &&
    Math.abs(agent.tile.x - goal.x) + Math.abs(agent.tile.y - goal.y) <= 2;
  if (same(agent.tile, goal) || nearbySharedGoal) {
    agent.status =
      agent.id === "kevin" && mentionsSeed(beat.status)
        ? "on the floor, not saying much"
        : beat.status;
    return;
  }
  const destination = beat.spot === "home" ? "home" : placeTitle(beat.place);
  const walking = motion === "moved" || (!motion && routeFor(town, agent, goal).length > 0);
  agent.status =
    motion === "yielded"
      ? `making room on the way ${destination === "home" ? "home" : `to ${destination}`}`
      : walking
        ? `walking ${destination === "home" ? "home" : `to ${destination}`}`
        : `waiting for a clear path ${destination === "home" ? "home" : `to ${destination}`}`;
}

/** Move residents within their usual budget; an NPC can make room for another NPC. */
export function moveResidents(town: Town, hourStart: boolean) {
  const residents = NPC_IDS.flatMap((id) => town.agents.find((a) => a.id === id) ?? []);
  const budget = new Map(residents.map((a) => [a.id, STEP]));
  const yielded = new Set<AgentId>();
  const moved = new Set<AgentId>();
  const now = (town.day - 1) * 1440 + town.minute;
  let cooldown = yieldCooldown.get(town);
  if (!cooldown) {
    cooldown = new Map();
    yieldCooldown.set(town, cooldown);
  }

  const giveWay = (agent: Agent, goal: Tile): boolean => {
    // The player remains a real obstruction even when asking an NPC to make room.
    const route = findPath(agent.tile, goal, blockedTiles(town, agent.id, true));
    const next = route[0];
    if (!next || same(next, goal)) return false;
    const blocker = occupant(town, next, agent.id);
    if (
      !blocker ||
      blocker.id === "player" ||
      yielded.has(blocker.id) ||
      (cooldown!.get(blocker.id) ?? -1) > now
    )
      return false;
    const path = yieldPath(town, blocker, route, budget.get(blocker.id) ?? 0);
    if (!path.length) return false;
    for (const point of path) stepTo(blocker, point);
    budget.set(blocker.id, (budget.get(blocker.id) ?? 0) - path.length);
    blocker.path = [];
    yielded.add(blocker.id);
    moved.add(blocker.id);
    cooldown!.set(blocker.id, now + 2);
    return true;
  };

  for (const agent of residents) {
    if (yielded.has(agent.id)) continue;
    if (!Array.isArray(agent.path)) agent.path = [];
    if (!walkable(agent.tile.x, agent.tile.y)) {
      agent.tile = nearestWalkable(agent.tile.x, agent.tile.y);
      agent.path = [];
    }
    const goal = goalFor(agent, beatAt(agent, town.minute));
    if (same(agent.tile, goal)) {
      agent.path = [];
      continue;
    }
    if (hourStart || !agent.path.length || !same(agent.path.at(-1)!, goal))
      agent.path = routeFor(town, agent, goal);
    // Replanning/yielding cannot create an unbounded retry or spend another resident's steps.
    for (let attempts = 0; attempts < STEP * 2 && (budget.get(agent.id) ?? 0) > 0; attempts++) {
      let next = agent.path[0];
      if (
        next &&
        (Math.abs(next.x - agent.tile.x) + Math.abs(next.y - agent.tile.y) !== 1 ||
          !walkable(next.x, next.y) ||
          occupant(town, next, agent.id))
      ) {
        agent.path = routeFor(town, agent, goal);
        next = agent.path[0];
      }
      if (!next || occupant(town, next, agent.id)) {
        if (!giveWay(agent, goal)) {
          agent.path = [];
          break;
        }
        agent.path = routeFor(town, agent, goal);
        next = agent.path[0];
      }
      if (!next || occupant(town, next, agent.id)) break;
      stepTo(agent, next);
      agent.path.shift();
      budget.set(agent.id, (budget.get(agent.id) ?? 0) - 1);
      moved.add(agent.id);
      if (same(agent.tile, goal)) break;
    }
  }

  for (const agent of residents) {
    refreshResidentStatus(
      town,
      agent,
      yielded.has(agent.id) ? "yielded" : moved.has(agent.id) ? "moved" : "waiting",
    );
  }
}
