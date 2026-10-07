import type { Agent, AgentId, ThinkJob, Town } from "./types";
import { NPC_IDS } from "./types";
import { applyResult } from "./effects";
import { absMinute, agentById, makeMemory, pushMemory } from "./memory";
import { offlineResult } from "./offline";
import { beatAt, goalFor } from "./plan";
import { findPath } from "./path";
import { formatClock, mentionsSeed, purse } from "./text";
import { canConverse, nearestWalkable, placeTitle, walkable, zoneAt } from "./world";

const STEP = 3;
const MEET = 4;
const GAP = 20 * 60;

export function pairKey(a: AgentId, b: AgentId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function npcs(town: Town): Agent[] {
  const out: Agent[] = [];
  for (const id of NPC_IDS) {
    const found = town.agents.find((a) => a.id === id);
    if (found) out.push(found);
  }
  return out;
}

function together(a: Agent, b: Agent): boolean {
  const za = zoneAt(a.tile.x, a.tile.y);
  const zb = zoneAt(b.tile.x, b.tile.y);
  if (za !== zb || !canConverse(za)) return false;
  const dist = Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y);
  const limit = za === "plaza" || za === "park" || za === "noticeboard" ? 5 : 14;
  return dist <= limit;
}

function moveNpc(town: Town, agent: Agent, hourStart: boolean) {
  if (!Array.isArray(agent.path)) agent.path = [];
  if (!walkable(agent.tile.x, agent.tile.y)) {
    agent.tile = nearestWalkable(agent.tile.x, agent.tile.y);
    agent.path = [];
  }
  const beat = beatAt(agent, town.minute);
  agent.status = agent.id === "kevin" && mentionsSeed(beat.status) ? "on the floor, not saying much" : beat.status;
  const goal = goalFor(agent, beat);
  const at = agent.tile.x === goal.x && agent.tile.y === goal.y;
  if (hourStart || agent.path.length === 0) {
    agent.path = at ? [] : findPath(agent.tile, goal);
  }
  let steps = STEP;
  while (steps-- > 0 && agent.path.length) {
    const next = agent.path[0]!;
    const beside = Math.abs(next.x - agent.tile.x) + Math.abs(next.y - agent.tile.y) === 1;
    if (!beside || !walkable(next.x, next.y)) {
      agent.path = findPath(agent.tile, goal);
      break;
    }
    const dx = next.x - agent.tile.x;
    const dy = next.y - agent.tile.y;
    if (dx > 0) agent.face = "e";
    else if (dx < 0) agent.face = "w";
    else if (dy > 0) agent.face = "s";
    else if (dy < 0) agent.face = "n";
    agent.tile = { x: next.x, y: next.y };
    agent.path.shift();
  }
}

function observe(town: Town) {
  const clock = formatClock(town.minute);
  for (const agent of npcs(town)) {
    const zone = zoneAt(agent.tile.x, agent.tile.y);
    if (!canConverse(zone)) continue;
    let nearest: Agent | undefined;
    let best = Infinity;
    for (const other of town.agents) {
      if (other.id === agent.id) continue;
      if (!together(agent, other)) continue;
      const dist = Math.abs(agent.tile.x - other.tile.x) + Math.abs(agent.tile.y - other.tile.y);
      if (dist < best) {
        best = dist;
        nearest = other;
      }
    }
    if (!nearest) continue;
    pushMemory(
      agent,
      makeMemory(
        town,
        town.day,
        town.minute,
        "observe",
        `At ${clock} in ${placeTitle(zone)}, I saw ${nearest.name} — ${nearest.id === "kevin" && mentionsSeed(nearest.status) ? "on the floor, not saying much" : nearest.status}.`,
        4,
        { mind: "offline" },
      ),
    );
  }
}

function tillsOf(town: Town) {
  if (!town.tills || typeof town.tills !== "object") town.tills = { cafe: 0, grocery: 0 };
  return town.tills;
}

function working(agent: Agent, zone: string, hour: number): "cafe" | "grocery" | null {
  if (agent.id === "kevin" && zone === "cafe" && hour >= 8 && hour < 17) return "cafe";
  if (agent.id === "baba" && zone === "grocery" && hour >= 8 && hour < 18) return "grocery";
  const projects = Array.isArray(agent.projects) ? agent.projects : [];
  const shift = projects.find((p) => p.status === "open" && p.kind === "shift");
  if (shift && zone === "cafe" && hour >= 8 && hour < 17 && (shift.place === "cafe" || !shift.place)) return "cafe";
  if (shift && zone === "grocery" && hour >= 8 && hour < 18 && shift.place === "grocery") return "grocery";
  return null;
}

function wages(town: Town) {
  const hour = Math.floor(town.minute / 60);
  for (const agent of npcs(town)) {
    if (agent.paidToday) continue;
    if (!Number.isFinite(agent.shiftHours) || agent.shiftHours < 0) agent.shiftHours = 0;
    const where = working(agent, zoneAt(agent.tile.x, agent.tile.y), hour);
    if (!where) continue;
    agent.shiftHours += 1;
    if (agent.shiftHours < 3) continue;
    const wage = where === "cafe" ? 5 : 4;
    const tills = tillsOf(town);
    const till = purse(tills[where], 999);
    const paid = Math.min(wage, till);
    tills[where] = till - paid;
    agent.money = purse(agent.money + paid);
    agent.paidToday = true;
    const line =
      paid > 0
        ? `${placeTitle(where)} paid me ${paid} for a shift I actually worked.`
        : `I worked a shift at ${placeTitle(where)} and the till was empty.`;
    pushMemory(agent, makeMemory(town, town.day, town.minute, "favor", line, 6, { protected: true }));
  }
  const player = town.agents.find((a) => a.id === "player");
  if (player && !player.paidToday && hour >= 8 && hour < 17) {
    const zone = zoneAt(player.tile.x, player.tile.y);
    const where = zone === "cafe" ? "cafe" : zone === "grocery" && hour < 18 ? "grocery" : null;
    if (where) {
      if (!Number.isFinite(player.shiftHours) || player.shiftHours < 0) player.shiftHours = 0;
      player.shiftHours += 1;
      if (player.shiftHours >= 3) {
        const wage = where === "cafe" ? 5 : 4;
        const tills = tillsOf(town);
        const till = purse(tills[where], 999);
        const paid = Math.min(wage, till);
        tills[where] = till - paid;
        player.money = purse(player.money + paid);
        player.paidToday = true;
        const line =
          paid > 0
            ? `${placeTitle(where)} paid me ${paid}. I stood the shift.`
            : `I stood a shift at ${placeTitle(where)} and the till was empty.`;
        pushMemory(player, makeMemory(town, town.day, town.minute, "favor", line, 6, { protected: true }));
      }
    }
  }
  if (hour === 12 && player && zoneAt(player.tile.x, player.tile.y) !== "cafe") {
    const already = player.memories?.some((m) => m.day === town.day && m.text.includes("missed Hobbs"));
    if (!already) {
      pushMemory(
        player,
        makeMemory(town, town.day, town.minute, "observe", "I missed Hobbs at noon. The day I wrote for myself went on without me.", 4),
      );
    }
  }
}

function updateColocation(town: Town) {
  if (!town.colocation || typeof town.colocation !== "object") town.colocation = {};
  const agents = town.agents;
  const seen = new Set<string>();
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i]!;
      const b = agents[j]!;
      const key = pairKey(a.id, b.id);
      seen.add(key);
      town.colocation[key] = together(a, b) ? (town.colocation[key] ?? 0) + 1 : 0;
    }
  }
  for (const key of Object.keys(town.colocation)) if (!seen.has(key)) delete town.colocation[key];
}

function pickPair(town: Town): [AgentId, AgentId] | null {
  if (!town.colocation || typeof town.colocation !== "object") town.colocation = {};
  const now = absMinute(town.day, town.minute);
  let best: { pair: [AgentId, AgentId]; score: number } | null = null;
  for (const a of npcs(town)) {
    if (a.callUsed) continue;
    for (const b of npcs(town)) {
      if (b.id <= a.id || b.callUsed) continue;
      if (!a.lastTalk || typeof a.lastTalk !== "object") a.lastTalk = {};
      if (!b.lastTalk || typeof b.lastTalk !== "object") b.lastTalk = {};
      if (!Array.isArray(a.memories)) a.memories = [];
      if (!Array.isArray(b.memories)) b.memories = [];
      const key = pairKey(a.id, b.id);
      if ((town.colocation[key] ?? 0) < MEET) continue;
      const lastRaw = Math.max(a.lastTalk[b.id] ?? -GAP, b.lastTalk[a.id] ?? -GAP);
      const last = Number.isFinite(lastRaw) ? lastRaw : -GAP;
      if (now - last < GAP) continue;
      const other = a.id === "kevin" ? b : b.id === "kevin" ? a : null;
      const fresh = other && !other.memories.some((m) => m.seed || mentionsSeed(m.text));
      const score = (town.colocation[key] ?? 0) + (fresh ? 50 : 0);
      if (!best || score > best.score) best = { pair: [a.id, b.id], score };
    }
  }
  return best?.pair ?? null;
}

function askForMind(town: Town) {
  const agent = town.agents.find((a) => a.id === "arwyn");
  if (!agent) return;
  const place = placeTitle(zoneAt(agent.tile.x, agent.tile.y));
  const threads = Array.isArray(agent.threads) ? agent.threads : [];
  const thread =
    threads.find((t) => t.open && !t.hidden && !mentionsSeed(t.text))?.text ?? "the work in front of me";
  const text = `In the ${place} at ${formatClock(town.minute)}, I am still only what I retrieved and this open thread: ${thread}. If you can switch a mind on, I am asking.`;
  pushMemory(agent, makeMemory(town, town.day, town.minute, "observe", text, 5, { mind: "offline" }));
  agent.bubble = {
    text: "If you can switch a mind on, I am still speaking from memory.",
    until: absMinute(town.day, town.minute) + 45,
  };
  town.askedMindDay = town.day;
}

function recordScrub(town: Town) {
  if (!Array.isArray(town.scrub)) town.scrub = [];
  const p = town.agents.flatMap((a) => [a.tile?.x ?? 0, a.tile?.y ?? 0]);
  const last = town.scrub[town.scrub.length - 1];
  if (last && (last.d ?? town.day) === town.day && last.m === town.minute) last.p = p;
  else town.scrub.push({ d: town.day, m: town.minute, p });
  if (town.scrub.length > 10080) town.scrub.splice(0, town.scrub.length - 10080);
}

export function stepMinute(town: Town, online: boolean): ThinkJob | null {
  if (!Array.isArray(town.agents) || town.agents.length === 0) return null;
  if (!Number.isFinite(town.day) || town.day < 1) town.day = 1;
  if (!Number.isFinite(town.minute)) town.minute = 0;
  town.minute += 1;
  if (town.minute >= 1440) {
    town.minute = 0;
    town.day += 1;
    for (const agent of town.agents) {
      agent.shiftHours = 0;
      agent.paidToday = false;
      agent.money = purse(agent.money);
    }
    town.tills = tillsOf(town);
    town.tills.cafe = Math.min(40, purse(town.tills.cafe) + 12);
    town.tills.grocery = Math.min(32, purse(town.tills.grocery) + 8);
  }
  const hourStart = town.minute % 60 === 0;
  let job: ThinkJob | null = null;
  if (hourStart) {
    for (const agent of npcs(town)) agent.callUsed = false;
    observe(town);
    wages(town);
    if (town.minute === 5 * 60) {
      for (const agent of npcs(town)) agent.callUsed = true;
      job = { kind: "plan", day: town.day, minute: town.minute, weekly: town.day % 7 === 0 };
    } else if (town.minute % 240 === 0) {
      const agents = npcs(town)
        .filter((a) => {
          if (!Number.isFinite(a.newMemories)) a.newMemories = 0;
          return a.newMemories >= 6;
        })
        .map((a) => a.id);
      if (agents.length) {
        for (const id of agents) agentById(town, id).callUsed = true;
        job = { kind: "reflect", day: town.day, minute: town.minute, agents, weekly: false };
      }
    }
    if (!online && town.askedMindDay !== town.day && town.minute === 8 * 60) askForMind(town);
  }
  for (const agent of npcs(town)) moveNpc(town, agent, hourStart);
  updateColocation(town);
  if (!job) {
    const pair = pickPair(town);
    if (pair) {
      agentById(town, pair[0]).callUsed = true;
      agentById(town, pair[1]).callUsed = true;
      job = { kind: "talk", day: town.day, minute: town.minute, a: pair[0], b: pair[1] };
    }
  }
  recordScrub(town);
  return job;
}

export function advanceTown(town: Town, minutes: number) {
  const n = Math.max(0, Math.min(20000, Math.floor(minutes)));
  for (let i = 0; i < n; i++) {
    const job = stepMinute(town, true);
    if (job) applyResult(town, offlineResult(town, job));
  }
}

export function frameAt(town: Town, minute: number, day = town.day): number[] | null {
  let found: number[] | null = null;
  for (const frame of town.scrub ?? []) {
    const frameDay = frame.d ?? town.day;
    if (frameDay < day || (frameDay === day && frame.m <= minute)) found = frame.p;
    if (frameDay > day || (frameDay === day && frame.m > minute)) break;
  }
  return found;
}
