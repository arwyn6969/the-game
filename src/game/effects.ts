import type {
  Agent,
  AgentId,
  Block,
  Favor,
  FavorEdit,
  MindResult,
  PlanDraft,
  Project,
  ProjectEdit,
  ProjectKind,
  ThreadEdit,
  Town,
} from "./types";
import { AGENT_IDS } from "./types";
import { makeMemory, pushMemory } from "./memory";
import { beatAt, blocksToBeats, planFromBlocks } from "./plan";
import { clip, mentionsSeed, purse } from "./text";
import { formatClock } from "./text";
import { placeTitle, zoneAt } from "./world";

const KINDS = new Set<ProjectKind>([
  "shift",
  "rumor",
  "collab",
  "debt",
  "notes",
  "notice",
  "other",
]);

export function openThreadText(agent: Agent): string {
  const threads = Array.isArray(agent.threads) ? agent.threads : [];
  return (
    threads.find((t) => t.open && !t.hidden)?.text ??
    threads.find((t) => t.open && !t.seed)?.text ??
    agent.want ??
    "nothing open"
  );
}

export function adjustRelation(
  town: Town,
  owner: AgentId,
  about: AgentId,
  delta: number,
  note: string,
) {
  if (owner === about) return;
  const agent = maybeAgent(town, owner);
  if (!agent || !isAgent(about)) return;
  if (!agent.relationships || typeof agent.relationships !== "object") agent.relationships = {};
  const rel = agent.relationships[about] ?? { score: 0, note: "" };
  const current = Number.isFinite(rel.score) ? rel.score : 0;
  const step = Number.isFinite(delta) ? Math.max(-1, Math.min(1, delta)) : 0;
  rel.score = Math.max(-3, Math.min(3, current + step));
  if (note.trim()) rel.note = clip(note, 180);
  agent.relationships[about] = rel;
}

function isAgent(id: unknown): id is AgentId {
  return typeof id === "string" && (AGENT_IDS as readonly string[]).includes(id);
}

function maybeAgent(town: Town, id: unknown): Agent | null {
  if (!isAgent(id)) return null;
  return town.agents.find((a) => a.id === id) ?? null;
}

function pinNotice(town: Town, author: AgentId, text: string) {
  const clean = clip(text, 240);
  if (!clean || !maybeAgent(town, author)) return;
  if (!Array.isArray(town.notices)) town.notices = [];
  if (town.notices.some((n) => n.text === clean)) return;
  town.notices.push({
    id: `n${town.nextId++}`,
    author,
    day: town.day,
    minute: town.minute,
    text: clean,
  });
  while (town.notices.length > 48) {
    const idx = town.notices.findIndex((n) => !mentionsSeed(n.text));
    if (idx < 0) break;
    town.notices.splice(idx, 1);
  }
}

function applyThread(town: Town, edit: ThreadEdit | null | undefined) {
  if (!edit || edit.action == null) return;
  const owner = maybeAgent(town, edit.owner);
  if (!owner) return;
  if (!Array.isArray(owner.threads)) owner.threads = [];
  const text = clip(edit.text || "", 220);
  if (edit.action === "open") {
    if (!text) return;
    if (owner.threads.some((t) => t.open && t.text === text)) return;
    const openNotes = owner.threads.filter((t) => t.open && !t.seed).length;
    if (openNotes >= 8) return;
    owner.threads.push({ id: `th${town.nextId++}`, text, open: true });
    return;
  }
  const target = edit.id
    ? owner.threads.find((t) => t.id === edit.id)
    : owner.threads.find((t) => t.open && !t.seed);
  if (!target) {
    if (edit.action !== "close" && text && owner.threads.filter((t) => t.open && !t.seed).length < 8) {
      owner.threads.push({ id: `th${town.nextId++}`, text, open: true });
    }
    return;
  }
  if (edit.action === "close") {
    if (target.seed) return;
    target.open = false;
    return;
  }
  if (target.seed) {
    target.open = true;
    target.hidden = true;
    if (text && mentionsSeed(text)) target.text = text;
    return;
  }
  if (text) target.text = text;
  target.open = true;
}

function applyProject(town: Town, edit: ProjectEdit | null | undefined) {
  if (!edit) return;
  const owner = maybeAgent(town, edit.owner);
  if (!owner) return;
  if (!Array.isArray(owner.projects)) owner.projects = [];
  if (edit.action === "start") {
    const text = clip(edit.text || "", 220);
    if (!text) return;
    if (owner.projects.some((p) => p.status === "open" && p.text === text)) return;
    if (owner.projects.filter((p) => p.status === "open").length >= 4) return;
    const project: Project = {
      id: `p${town.nextId++}`,
      owner: owner.id,
      kind: KINDS.has(edit.kind) ? edit.kind : "other",
      text,
      place: edit.place,
      status: "open",
      day: town.day,
    };
    owner.projects.push(project);
    const settled = owner.projects.filter((p) => p.status !== "open");
    if (settled.length > 12) {
      const drop = new Set(settled.slice(0, settled.length - 12).map((p) => p.id));
      owner.projects = owner.projects.filter((p) => !drop.has(p.id));
    }
    return;
  }
  const found = edit.id
    ? owner.projects.find((p) => p.id === edit.id && p.status === "open")
    : owner.projects.find((p) => p.status === "open" && (!edit.kind || p.kind === edit.kind));
  if (!found) return;
  found.status = edit.action === "drop" ? "dropped" : "done";
}

function applyFavor(town: Town, edit: FavorEdit | null | undefined, allowed?: AgentId[]) {
  if (!edit) return;
  if (allowed && (!allowed.includes(edit.from) || !allowed.includes(edit.to))) return;
  if (edit.from === edit.to) return;
  const from = maybeAgent(town, edit.from);
  const to = maybeAgent(town, edit.to);
  if (!from || !to) return;
  if (!Array.isArray(town.favors)) town.favors = [];
  from.money = purse(from.money);
  to.money = purse(to.money);
  if (edit.action === "offer") {
    if (town.favors.filter((f) => f.status === "owed").length >= 24) return;
    const text = clip(edit.text || "A favor, still unnamed.", 180);
    if (town.favors.some((f) => f.status === "owed" && f.from === from.id && f.to === to.id && f.text === text))
      return;
    const amount = purse(edit.amount, 30);
    const favor: Favor = {
      id: `f${town.nextId++}`,
      from: from.id,
      to: to.id,
      text,
      amount,
      status: "owed",
      day: town.day,
    };
    town.favors.push(favor);
    const line = `${from.name} owes ${to.name}: ${text}${favor.amount ? ` (${favor.amount})` : ""}.`;
    pushMemory(from, makeMemory(town, town.day, town.minute, "favor", line, 7, { protected: true }));
    pushMemory(to, makeMemory(town, town.day, town.minute, "favor", line, 7, { protected: true }));
    return;
  }
  const favor = edit.id
    ? town.favors.find((f) => f.id === edit.id && f.status === "owed")
    : town.favors.find((f) => f.status === "owed" && f.from === from.id && f.to === to.id);
  if (!favor) return;
  if (edit.action === "pay") {
    const amount = purse(favor.amount, 30);
    if (amount <= 0) return;
    favor.amount = amount;
    if (from.money < amount) {
      pushMemory(
        from,
        makeMemory(
          town,
          town.day,
          town.minute,
          "favor",
          `I tried to pay ${to.name} and did not have ${amount}. The tab stays.`,
          6,
          { protected: true },
        ),
      );
      return;
    }
    from.money = purse(from.money - amount);
    to.money = purse(to.money + amount);
    favor.status = "paid";
  } else if (edit.action === "forgive") {
    favor.status = "forgiven";
  } else if (edit.action === "break") {
    favor.status = "broken";
    adjustRelation(town, from.id, to.id, -1, "A favor was broken.");
    adjustRelation(town, to.id, from.id, -1, "A favor was broken.");
  } else {
    return;
  }
  const line = `${from.name} → ${to.name}: ${favor.text} is ${favor.status}.`;
  pushMemory(from, makeMemory(town, town.day, town.minute, "favor", line, 7, { protected: true }));
  pushMemory(to, makeMemory(town, town.day, town.minute, "favor", line, 7, { protected: true }));
}

function applyBlocks(agent: Agent, blocks: Block[] | undefined, fromHour: number) {
  if (!blocks?.length || !agent.plan) return;
  const next = blocksToBeats(blocks);
  if (next.length !== 24) return;
  const start = Math.max(0, Math.min(23, Math.floor(fromHour)));
  for (let h = start; h < 24; h++) {
    const beat = next[h];
    if (beat) agent.plan.beats[h] = beat;
  }
}

function sayBubble(agent: Agent, text: string, until: number) {
  agent.bubble = { text: clip(text, 140), until };
}

function safely(fn: () => void) {
  try {
    fn();
  } catch {
    /* One bad edit cannot stop the hour or the seed. */
  }
}

export function applyResult(town: Town, result: MindResult) {
  if (!Number.isFinite(town.minute)) town.minute = 0;
  if (!Number.isFinite(town.day) || town.day < 1) town.day = 1;
  if (!Number.isFinite(town.nextId)) town.nextId = 1;
  try {
  const until = (town.day - 1) * 1440 + town.minute + 20;
  if (result.kind === "plan") {
    for (const draft of result.plans ?? []) safely(() => applyPlanDraft(town, draft, result.mind, result.weekly === true));
    return;
  }
  if (result.kind === "reflect") {
    for (const item of result.agents ?? []) {
      const agent = maybeAgent(town, item.id);
      if (!agent) continue;
      for (const line of (item.reflections ?? []).slice(0, 2)) {
        const text = clip(String(line ?? ""), 320);
        if (!text) continue;
        pushMemory(
          agent,
          makeMemory(town, town.day, town.minute, "reflect", text, 8, {
            protected: true,
            mind: result.mind,
          }),
        );
      }
      agent.newMemories = 0;
    }
    return;
  }
  if (result.kind === "talk") {
    const a = maybeAgent(town, result.a);
    const b = maybeAgent(town, result.b);
    if (!a || !b || a.id === b.id) return;
    const pair: AgentId[] = [a.id, b.id];
    const lines = (result.lines ?? [])
      .filter((l) => l?.text && (l.speaker === a.id || l.speaker === b.id))
      .slice(0, 4);
    const place = placeTitle(zoneAt(a.tile.x, a.tile.y));
    const script = lines
      .map((l) => `${maybeAgent(town, l.speaker)?.name ?? l.speaker}: ${clip(l.text, 220)}`)
      .join(" ");
    const wrapped = `In ${place} at ${formatClock(town.minute)}, ${a.name} and ${b.name} spoke. ${script}`;
    const revealed = Boolean(result.revealedSeed) || mentionsSeed(wrapped);
    for (const agent of [a, b]) {
      pushMemory(
        agent,
        makeMemory(town, town.day, town.minute, "chat", wrapped, revealed ? 8 : 6, {
          with: agent.id === a.id ? b.id : a.id,
          mind: result.mind,
          protected: revealed,
        }),
      );
      const own = [...lines].reverse().find((l) => l.speaker === agent.id);
      if (own) sayBubble(agent, own.text, until);
      if (!agent.lastTalk || typeof agent.lastTalk !== "object") agent.lastTalk = {};
      agent.lastTalk[agent.id === a.id ? b.id : a.id] = (town.day - 1) * 1440 + town.minute;
    }
    for (const rel of result.relationships ?? []) {
      if (rel.owner !== a.id && rel.owner !== b.id) continue;
      safely(() => adjustRelation(town, rel.owner, rel.about, rel.delta, rel.note));
    }
    safely(() => applyFavor(town, result.favor, pair));
    if (result.thread && pair.includes(result.thread.owner)) safely(() => applyThread(town, result.thread!));
    if (result.notice?.text && pair.includes(result.notice.author))
      safely(() => pinNotice(town, result.notice!.author, result.notice!.text));
    if (result.project && pair.includes(result.project.owner)) safely(() => applyProject(town, result.project!));
    const hour = Math.floor(town.minute / 60);
    for (const re of result.replan ?? []) {
      if (re.id !== a.id && re.id !== b.id) continue;
      const who = maybeAgent(town, re.id);
      if (who) safely(() => applyBlocks(who, re.blocks, hour));
    }
    return;
  }
  const agent = maybeAgent(town, result.agentId);
  const player = maybeAgent(town, "player");
  if (!agent || !player || agent.id === "player") return;
  const pair: AgentId[] = [agent.id, "player"];
  const place = placeTitle(zoneAt(agent.tile.x, agent.tile.y));
  const exchange = `In ${place} at ${formatClock(town.minute)}, ${player.name} said: "${clip(result.playerText, 180)}" ${agent.name} answered: "${clip(result.reply, 320)}"`;
  pushMemory(
    agent,
    makeMemory(town, town.day, town.minute, "chat", exchange, 7, {
      with: "player",
      mind: result.mind,
      protected: mentionsSeed(exchange),
    }),
  );
  pushMemory(
    player,
    makeMemory(town, town.day, town.minute, "chat", exchange, 7, {
      with: agent.id,
      mind: result.mind,
      protected: mentionsSeed(exchange),
    }),
  );
  sayBubble(agent, result.reply, until);
  safely(() => adjustRelation(town, agent.id, "player", result.delta, result.note));
  safely(() => adjustRelation(town, "player", agent.id, result.delta, result.note));
  safely(() => applyFavor(town, result.favor, pair));
  if (result.thread && pair.includes(result.thread.owner)) safely(() => applyThread(town, result.thread!));
  if (result.notice?.text && pair.includes(result.notice.author))
    safely(() => pinNotice(town, result.notice!.author, result.notice!.text));
  if (result.project && pair.includes(result.project.owner)) safely(() => applyProject(town, result.project!));
  } catch {
    /* A partial hour is kept. The clock still moves. */
  }
}

function applyPlanDraft(town: Town, draft: PlanDraft, mind: "grok" | "offline", weekly: boolean) {
  const agent = maybeAgent(town, draft.id);
  if (!agent || agent.id === "player") return;
  const next = planFromBlocks(town.day, draft.summary, draft.blocks);
  if (next.beats.length === 24) agent.plan = next;
  else if (next.summary && agent.plan) agent.plan.summary = next.summary;
  if (draft.want?.trim()) agent.want = clip(draft.want, 280);
  if (weekly && draft.selfSentence?.trim()) {
    agent.selfSentence = clip(draft.selfSentence, 220);
    pushMemory(
      agent,
      makeMemory(town, town.day, town.minute, "reflect", agent.selfSentence, 9, {
        protected: true,
        mind,
      }),
    );
  }
  pushMemory(
    agent,
    makeMemory(
      town,
      town.day,
      town.minute,
      "plan",
      `Day ${town.day}: ${agent.plan.summary}`,
      5,
      { mind },
    ),
  );
  if (draft.project) applyProject(town, { ...draft.project, owner: agent.id });
  if (draft.thread) safely(() => applyThread(town, { ...draft.thread!, owner: agent.id }));
  agent.status = beatAt(agent, town.minute).status;
  if (agent.id === "kevin" && mentionsSeed(agent.status)) agent.status = "on the floor, not saying much";
}

export function spreadView(town: Town) {
  const holders = town.agents.filter(
    (a) => a.id !== "kevin" && Array.isArray(a.memories) && a.memories.some((m) => m.seed || mentionsSeed(m.text)),
  );
  const notes = (town.notices ?? []).filter((n) => mentionsSeed(n.text));
  const missed = (town.retrievals ?? []).filter((r) => r.missed);
  return { holders, notes, missed };
}
