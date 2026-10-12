import type { Agent, MindResult, ThinkJob, Town } from "./types";
import { AGENT_IDS, NPC_IDS } from "./types";
import { openThreadText, playerActions } from "./effects";
import { agentById } from "./memory";
import { promptMemories } from "./retrieval";
import { beatAt } from "./plan";
import { clip, formatClock, periodName, plain } from "./text";
import { placeTitle, zoneAt } from "./world";
import { memorySource, pairObligations, recentConversation, sharedMemories } from "./conversation";

export function planResidents(job: Extract<ThinkJob, { kind: "plan" }>) {
  const requested = (job as typeof job & { agents?: import("./types").AgentId[] }).agents;
  return [...new Set(requested ?? NPC_IDS)].filter((id) =>
    NPC_IDS.includes(id as (typeof NPC_IDS)[number]),
  );
}

function packet(town: Town, agent: Agent, job: ThinkJob) {
  const threads = Array.isArray(agent.threads) ? agent.threads : [];
  const memories = promptMemories(town, agent, job);
  if (job.kind === "talk") {
    const other = agentById(town, job.a === agent.id ? job.b : job.a);
    const shared = { ...agent, memories: sharedMemories(agent, other) };
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      place: placeTitle(zoneAt(agent.tile.x, agent.tile.y)),
      status: clip(agent.status, 80),
      memories,
      recentConversation: recentConversation(shared, other.id),
      obligations: pairObligations(town, agent.id, other.id),
    };
  }
  const owed = (town.favors ?? []).find(
    (f) => f.status === "owed" && (f.from === agent.id || f.to === agent.id),
  );
  const relationships =
    agent.relationships && typeof agent.relationships === "object" ? agent.relationships : {};
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    identity: clip(agent.identity, 600),
    selfSentence: clip(agent.selfSentence, 160),
    want: clip(agent.want, 180),
    money: agent.money,
    owed: owed ? clip(`${owed.from} owes ${owed.to}: ${owed.text}`, 80) : "",
    place: placeTitle(zoneAt(agent.tile.x, agent.tile.y)),
    status: clip(agent.status, 80),
    threads: threads
      .filter((t) => t.open)
      .slice(0, 4)
      .map((t) => ({
        id: t.id,
        text: clip(t.text, 100),
        hidden: Boolean(t.hidden),
        seed: Boolean(t.seed),
      })),
    relationships: Object.entries(relationships)
      .slice(0, 5)
      .map(([id, rel]) => ({
        id,
        score: rel?.score ?? 0,
        note: clip(rel?.note ?? "", 60),
      })),
    projects: (agent.projects ?? [])
      .filter((p) => p.status === "open")
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        text: clip(p.text, 100),
      })),
    memories,
    ...(job.kind === "player"
      ? {
          recentConversation: recentConversation(agent, "player"),
          currentFacts: playerFacts(town, agent),
        }
      : {}),
  };
}

function playerFacts(town: Town, agent: Agent) {
  const player = agentById(town, "player");
  const obligations = pairObligations(town, "player", agent.id);
  const owed = obligations.filter((debt) => debt.status === "owed");
  const actions = playerActions(town, agent.id);
  const receiptPlace = agent.id === "kevin" ? "cafe" : agent.id === "baba" ? "grocery" : null;
  const wageReceipts = receiptPlace
    ? player.memories
        .filter(
          (memory) =>
            memory.type === "favor" &&
            memorySource(memory) === "event" &&
            memory.text.startsWith(`${placeTitle(receiptPlace)} paid me `),
        )
        .slice(-2)
    : [];
  return {
    source: "event",
    openObligationCount: owed.length,
    obligations: obligations.slice(0, 8),
    obligationsOmitted: Math.max(0, obligations.length - 8),
    offeredChoices: actions
      .slice(0, 6)
      .map(({ label, terms, disabledReason }) => ({ label, terms, disabledReason })),
    choicesOmitted: Math.max(0, actions.length - 6),
    wageReceipts: wageReceipts.map(({ id, text, day, minute }) => ({ id, text, day, minute })),
    // Choices already describe relevant inventory and agreements without leaking unrelated projects.
    notice:
      "Offers are not accepted actions. Use the current recorded state; this message authorizes no transaction.",
  };
}

export function buildPrompt(town: Town, job: ThinkJob): string {
  const clock = `Day ${town.day}, ${formatClock(town.minute)}, ${periodName(town.minute)}.`;
  const places = "cafe, library, dorms, park, townhouses, grocery, noticeboard, plaza, street";
  if (job.kind === "plan") {
    const people = planResidents(job).map((id) => packet(town, agentById(town, id), job));
    return `${clock} Write the dawn plan ONLY for the listed residents. Places must be one of: ${places}. Spot is "home" or "out". Cover 0–24 with blocks, no gaps. A plan is an intention, not proof of completed work. Preserve existing commitments. Status lines are what a neighbor would see — Kevin does not announce who he is in a status, and where he came from is that question, not a place. He may revise his private want. ${
      job.weekly
        ? "It is a 7th dawn: each resident rewrites selfSentence, one sentence, who they are right now. Identity drifts. It does not reset."
        : "Do not include selfSentence."
    } Projects have no guaranteed success; they may start or drop one. Threads close or rewrite only if that person decides. Return JSON: {"plans":[{"id":"kevin","summary":"","blocks":[{"from":0,"to":7,"place":"cafe","spot":"home","status":""}],"want":"","selfSentence":"","project":{"owner":"kevin","action":"none","kind":"other","text":"","place":"cafe"},"thread":{"owner":"kevin","action":"none","id":"","text":""}}]}
People: ${JSON.stringify(people)}`;
  }
  if (job.kind === "reflect") {
    const people = job.agents.map((id) => packet(town, agentById(town, id), job));
    return `${clock} Write exactly 2 first-person reflections for each listed resident, grounded in their retrieved memories. Reflections are interpretations, not new facts or completed actions; preserve attribution and uncertainty. No advice to the player about software. ${
      job.weekly ? "Also rewrite selfSentence." : "Do not include selfSentence."
    } JSON: {"agents":[{"id":"arwyn","reflections":["",""],"selfSentence":""}]}
People: ${JSON.stringify(people)}`;
  }
  if (job.kind === "talk") {
    const a = packet(town, agentById(town, job.a), job);
    const b = packet(town, agentById(town, job.b), job);
    return `${clock} These two are in the same place. Write at most 4 short spoken lines. This is their shared context only: neither speaker may invent access to private histories, hidden motives or absent people's conversations. Ground the exchange in the shared evidence or ordinary public activity; ask a question when evidence is missing. A statement is what someone said, not proof it happened. They may propose a same-pair favor, open or rewrite their own thread, pin their own public note, start or drop their own project, or replan remaining hours. A proposal is not a completed action: speak conditionally until the game confirms it. Never mark a project done or invent completed work. Relationship delta is -1, 0, or 1. No ending, no party. JSON: {"lines":[{"speaker":"kevin","text":""}],"relationships":[{"owner":"kevin","about":"arwyn","delta":0,"note":""}],"favor":null,"thread":null,"notice":null,"project":null,"replan":[],"revealedSeed":false}
A: ${JSON.stringify(a)}
B: ${JSON.stringify(b)}`;
  }
  const agent = agentById(town, job.agentId);
  const body = packet(town, agent, job);
  const said = plain(job.text, 400);
  return `${clock} The player, ${plain(town.playerName, 18)}, says to ${agent.name}: "${said}". Answer their actual question in character, usually one to three sentences. Use recentConversation for follow-ups such as "why?" or "that" before searching older memories. You may use a retrieved memory and an open thread (${openThreadText(agent)}), but do not force every answer back to it. Memory source "statement" records words spoken, not verified facts; "reflection" records a belief or intention. Dates are game dates: resolve yesterday/tomorrow relative to the original event, not now. Current facts and receipts outrank remembered claims. Admit missing knowledge and ask one concrete clarification rather than inventing an answer. You may ask for help with work inside this town. You may start or drop one project of your own, never claim its completion without a verified event. JSON: {"reply":"","delta":0,"note":"","favor":null,"thread":null,"notice":null,"project":null}
Speech cannot buy, pay, accept or cancel work, or edit the player's projects, threads or schedule. Those require the player's separate quoted action button. Keep favor null and never claim an action completed because of text alone.
Resident: ${JSON.stringify(body)}
Current beat: ${beatAt(agent, town.minute).status}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json");
  return JSON.parse(raw.slice(start, end + 1));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asAgent(value: unknown): import("./types").AgentId | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return (AGENT_IDS as readonly string[]).includes(id) ? (id as import("./types").AgentId) : null;
}

function asPlace(value: unknown): import("./types").PlaceId | undefined {
  if (typeof value !== "string") return undefined;
  const place = value.trim().toLowerCase();
  return [
    "cafe",
    "library",
    "dorms",
    "park",
    "townhouses",
    "grocery",
    "noticeboard",
    "plaza",
    "street",
  ].includes(place)
    ? (place as import("./types").PlaceId)
    : undefined;
}

export function parseMind(job: ThinkJob, text: string): MindResult | null {
  let data: Record<string, unknown>;
  try {
    const parsed = asRecord(extractJson(text));
    if (!parsed) return null;
    data = parsed;
  } catch {
    return null;
  }
  if (job.kind === "plan") {
    const plans = Array.isArray(data.plans) ? data.plans : [];
    const mapped = plans
      .map((item) => {
        const row = asRecord(item);
        if (!row) return null;
        const id = asAgent(row.id);
        if (!id) return null;
        const blocks = Array.isArray(row.blocks) ? row.blocks : [];
        return {
          id: id as MindResult & { kind: "plan" } extends { plans: { id: infer I }[] } ? I : never,
          summary: String(row.summary ?? ""),
          blocks: blocks.map((b) => {
            const block = asRecord(b) ?? {};
            return {
              from: Number(block.from ?? 0),
              to: Number(block.to ?? 0),
              place: String(block.place ?? "street")
                .trim()
                .toLowerCase(),
              spot: block.spot === "home" ? ("home" as const) : ("out" as const),
              status: String(block.status ?? "around the town"),
            };
          }),
          want: typeof row.want === "string" ? row.want : undefined,
          selfSentence: typeof row.selfSentence === "string" ? row.selfSentence : undefined,
          project: parseProject(row.project),
          thread: parseThread(row.thread),
        };
      })
      .filter((p) => p && planResidents(job).includes(p.id));
    if (!mapped.length) return null;
    return {
      kind: "plan",
      mind: "grok",
      weekly: job.weekly,
      plans: mapped as MindResult & { kind: "plan" } extends { plans: infer P } ? P : never,
    };
  }
  if (job.kind === "reflect") {
    const agents = Array.isArray(data.agents) ? data.agents : [];
    const mapped = agents
      .map((item) => {
        const row = asRecord(item);
        if (!row) return null;
        const id = asAgent(row.id);
        if (!id) return null;
        const reflections = Array.isArray(row.reflections)
          ? row.reflections.filter((r): r is string => typeof r === "string").slice(0, 2)
          : [];
        if (reflections.length < 1) return null;
        return {
          id,
          reflections,
          selfSentence: typeof row.selfSentence === "string" ? row.selfSentence : undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const kept = mapped.filter((a) => job.agents.includes(a.id as (typeof job.agents)[number]));
    if (!kept.length) return null;
    return {
      kind: "reflect",
      mind: "grok",
      agents: kept.map((a) => ({
        id: a.id as (typeof job.agents)[number],
        reflections: a.reflections,
        selfSentence: a.selfSentence,
      })),
    };
  }
  if (job.kind === "talk") {
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const clean = lines
      .map((line) => {
        const row = asRecord(line);
        if (!row) return null;
        const speaker = asAgent(row.speaker);
        if (speaker !== job.a && speaker !== job.b) return null;
        if (typeof row.text !== "string" || !row.text.trim()) return null;
        return { speaker, text: row.text };
      })
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .slice(0, 4);
    if (!clean.length) return null;
    const relationships = Array.isArray(data.relationships)
      ? data.relationships
          .map((item) => {
            const row = asRecord(item);
            if (!row) return null;
            const owner = asAgent(row.owner);
            const about = asAgent(row.about);
            if (!owner || !about || owner === about) return null;
            const delta = Number(row.delta ?? 0);
            return {
              owner,
              about,
              delta: Number.isFinite(delta) ? delta : 0,
              note: String(row.note ?? ""),
            };
          })
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
      : [];
    return {
      kind: "talk",
      mind: "grok",
      a: job.a,
      b: job.b,
      lines: clean,
      relationships,
      favor: parseFavor(data.favor),
      thread: parseThread(data.thread),
      notice: parseNotice(data.notice),
      project: parseProject(data.project),
      replan: parseReplan(data.replan),
      revealedSeed: false,
    };
  }
  if (typeof data.reply !== "string" || !data.reply.trim()) return null;
  return {
    kind: "player",
    mind: "grok",
    agentId: job.agentId,
    playerText: job.text,
    reply: data.reply,
    delta: Number(data.delta ?? 0),
    note: typeof data.note === "string" ? data.note : "",
    favor: parseFavor(data.favor),
    thread: parseThread(data.thread),
    notice: parseNotice(data.notice),
    project: parseProject(data.project),
  };
}

function parseThread(value: unknown): import("./types").ThreadEdit | null {
  const row = asRecord(value);
  if (!row || row.action === "none" || row.action == null) return null;
  if (row.action !== "open" && row.action !== "rewrite" && row.action !== "close") return null;
  const owner = asAgent(row.owner);
  if (!owner) return null;
  return {
    owner,
    action: row.action,
    text: String(row.text ?? ""),
    id: typeof row.id === "string" ? row.id.slice(0, 40) : undefined,
  };
}

function parseProject(value: unknown): import("./types").ProjectEdit | null {
  const row = asRecord(value);
  if (!row || row.action === "none" || row.action == null) return null;
  if (row.action !== "start" && row.action !== "drop" && row.action !== "done") return null;
  const owner = asAgent(row.owner);
  if (!owner) return null;
  const kind = typeof row.kind === "string" ? row.kind : "other";
  const safeKind = (
    ["shift", "rumor", "collab", "debt", "notes", "notice", "other"].includes(kind) ? kind : "other"
  ) as import("./types").ProjectKind;
  return {
    owner,
    action: row.action,
    kind: safeKind,
    text: String(row.text ?? ""),
    place: asPlace(row.place),
    id: typeof row.id === "string" ? row.id.slice(0, 40) : undefined,
  };
}

function parseFavor(value: unknown) {
  const row = asRecord(value);
  if (!row || row.action == null) return null;
  if (!["offer", "pay", "forgive", "break"].includes(String(row.action))) return null;
  const from = asAgent(row.from);
  const to = asAgent(row.to);
  if (!from || !to || from === to) return null;
  const amount = Number(row.amount ?? 0);
  return {
    action: row.action as "offer" | "pay" | "forgive" | "break",
    from,
    to,
    amount: Number.isFinite(amount) ? amount : 0,
    text: String(row.text ?? ""),
    id: typeof row.id === "string" ? row.id.slice(0, 40) : undefined,
  };
}

function parseNotice(value: unknown) {
  const row = asRecord(value);
  if (!row || typeof row.text !== "string" || !row.text.trim()) return null;
  const author = asAgent(row.author);
  if (!author) return null;
  return { author, text: row.text };
}

function parseReplan(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      if (!row || !Array.isArray(row.blocks)) return null;
      const id = asAgent(row.id);
      if (!id || id === "player") return null;
      return {
        id,
        blocks: row.blocks.map((b) => {
          const block = asRecord(b) ?? {};
          return {
            from: Number(block.from ?? 0),
            to: Number(block.to ?? 0),
            place: (asPlace(block.place) ?? "street") as "street",
            spot: block.spot === "home" ? ("home" as const) : ("out" as const),
            status: String(block.status ?? ""),
          };
        }),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}
