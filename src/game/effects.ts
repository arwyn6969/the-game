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
import { blocksToBeats, isPlace, planFromBlocks } from "./plan";
import { refreshResidentStatus } from "./navigation";
import { clip, mentionsSeed, purse } from "./text";
import { formatClock } from "./text";
import { placeTitle, zoneAt } from "./world";
import { groundPlayerReply, groundSharedLine } from "./conversation";
import { settleLegacyDebt, availableFunds } from "./economy";
import type { FundedTown } from "./economy-types";
import { libraryView, refreshLibraryReading } from "./community";
import {
  activateFundedTown,
  closeCompletedWorkItems,
  fundedWorkProjectId,
  FUNDED_CAFE_SHIFT_TEXT,
  runtimeCommand,
} from "./payroll-runtime";
import {
  approvePayrollAgreement,
  createFundedCafeAgreement,
  cafeAgreementTerms,
  CAFE_CANCELLATION,
  suspendWorkAgreement,
  fundedWorkSummary,
  recogniseLegacyClaim,
  settleWorkPayable,
  type PayrollApproval,
  type LegacyWageClaim,
} from "./funded-work";
import { captureSocial, recordSocial, rememberPaidWork } from "./social";

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
    if (
      edit.action !== "close" &&
      text &&
      owner.threads.filter((t) => t.open && !t.seed).length < 8
    ) {
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
  if (edit.action === "pay" && !activateFundedTown(town).ok) return;
  const from = maybeAgent(town, edit.from);
  const to = maybeAgent(town, edit.to);
  if (!from || !to) return;
  if (!Array.isArray(town.favors)) town.favors = [];
  if (edit.action === "offer") {
    if (town.favors.filter((f) => f.status === "owed").length >= 24) return;
    const text = clip(edit.text || "A favor, still unnamed.", 180);
    if (
      town.favors.some(
        (f) => f.status === "owed" && f.from === from.id && f.to === to.id && f.text === text,
      )
    )
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
    pushMemory(
      from,
      makeMemory(town, town.day, town.minute, "favor", line, 7, { protected: true }),
    );
    pushMemory(to, makeMemory(town, town.day, town.minute, "favor", line, 7, { protected: true }));
    return;
  }
  const favor = edit.id
    ? town.favors.find((f) => f.id === edit.id && f.status === "owed")
    : town.favors.find((f) => f.status === "owed" && f.from === from.id && f.to === to.id);
  if (!favor || favor.from !== from.id || favor.to !== to.id) return;
  if (edit.action === "pay") {
    const amount = favor.amount;
    if (!Number.isSafeInteger(amount) || amount < 0) return;
    if (!Number.isSafeInteger(from.money) || from.money < 0) return;
    if (!Number.isSafeInteger(to.money) || to.money < 0) return;
    if (from.money < amount || to.money + amount > 999) {
      pushMemory(
        from,
        makeMemory(
          town,
          town.day,
          town.minute,
          "favor",
          from.money < amount
            ? `I tried to pay ${to.name} and did not have ${amount}. The tab stays.`
            : `I tried to pay ${to.name}, but their purse could not hold ${amount}. The tab stays.`,
          6,
          { protected: true },
        ),
      );
      return;
    }
    const paid = settleLegacyDebt(
      town,
      runtimeCommand(town, "debt.settle", from.id, { debtId: favor.id }, favor.id),
      favor.id,
    );
    if (!paid.ok) return;
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

function paintHours(agent: Agent, blocks: Block[]) {
  if (!agent.plan) return;
  for (const block of blocks) {
    if (!block || !isPlace(String(block.place ?? "")) || typeof block.status !== "string") continue;
    const from = Math.floor(block.from);
    const to = Math.floor(block.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    for (let hour = Math.max(0, from); hour < Math.min(24, to); hour++) {
      if (!agent.plan.beats[hour]) continue;
      agent.plan.beats[hour] = {
        hour,
        place: block.place,
        status: block.status.replace(/\s+/g, " ").trim().slice(0, 110),
        spot: block.spot === "home" ? "home" : "out",
      };
    }
  }
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

export function applyResult(
  town: Town,
  result: MindResult,
  source: "statement" | "event" = "statement",
) {
  if (!Number.isFinite(town.minute)) town.minute = 0;
  if (!Number.isFinite(town.day) || town.day < 1) town.day = 1;
  if (!Number.isFinite(town.nextId)) town.nextId = 1;
  const socialBefore = captureSocial(town);
  try {
    const until = (town.day - 1) * 1440 + town.minute + 20;
    if (result.kind === "plan") {
      for (const draft of result.plans ?? [])
        safely(() => applyPlanDraft(town, draft, result.mind, result.weekly === true));
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
      if (result.favor?.action === "pay" && !activateFundedTown(town).ok) return;
      const a = maybeAgent(town, result.a);
      const b = maybeAgent(town, result.b);
      if (!a || !b || a.id === b.id || a.id === "player" || b.id === "player") return;
      const pair: AgentId[] = [a.id, b.id];
      let lines = (result.lines ?? [])
        .filter((l) => l?.text && (l.speaker === a.id || l.speaker === b.id))
        .slice(0, 4);
      const previousFavors = new Map((town.favors ?? []).map((favor) => [favor.id, favor.status]));
      safely(() => applyFavor(town, result.favor, pair));
      if (result.mind === "grok") {
        lines = lines.map((line) => ({ ...line, text: groundSharedLine(town, a, b, line.text) }));
        if (result.favor) {
          const changed = town.favors.filter(
            (favor) =>
              pair.includes(favor.from) &&
              pair.includes(favor.to) &&
              previousFavors.get(favor.id) !== favor.status,
          );
          const receipt = changed.length
            ? changed
                .map(
                  (favor) =>
                    `${maybeAgent(town, favor.from)?.name} → ${maybeAgent(town, favor.to)?.name}: ${favor.text}, ${favor.amount}, ${favor.status}.`,
                )
                .join(" ")
            : "That proposed change was not completed. Our existing agreement is unchanged.";
          lines = [{ speaker: lines.at(-1)?.speaker ?? a.id, text: receipt }];
        }
        if (result.project?.action === "done")
          lines = [
            {
              speaker: lines.at(-1)?.speaker ?? a.id,
              text: "I have no verified completion to report. The project's recorded state has not changed.",
            },
          ];
      }
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
            source: "statement",
            turns: lines.map(({ speaker, text }) => ({ speaker, text: clip(text, 700) })),
          }),
        );
        const own = [...lines].reverse().find((l) => l.speaker === agent.id);
        if (own) sayBubble(agent, own.text, until);
        if (!agent.lastTalk || typeof agent.lastTalk !== "object") agent.lastTalk = {};
        agent.lastTalk[agent.id === a.id ? b.id : a.id] = (town.day - 1) * 1440 + town.minute;
      }
      for (const rel of result.relationships ?? []) {
        if (!pair.includes(rel.owner) || !pair.includes(rel.about)) continue;
        safely(() => adjustRelation(town, rel.owner, rel.about, rel.delta, rel.note));
      }
      if (result.thread && pair.includes(result.thread.owner))
        safely(() => applyThread(town, result.thread!));
      if (result.notice?.text && pair.includes(result.notice.author))
        safely(() => pinNotice(town, result.notice!.author, result.notice!.text));
      if (
        result.project &&
        pair.includes(result.project.owner) &&
        !(result.mind === "grok" && result.project.action === "done")
      )
        safely(() => applyProject(town, result.project!));
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
    const proposedCommitment =
      result.favor ||
      result.project?.owner === "player" ||
      result.thread?.owner === "player" ||
      result.replan?.some((re) => re.id === "player");
    const unsupportedCompletion = result.mind === "grok" && result.project?.action === "done";
    const reply = proposedCommitment
      ? "Nothing was bought, paid, accepted or cancelled by this conversation. Read the quoted actions and choose explicitly if you want a change."
      : unsupportedCompletion
        ? "I have no verified completion to report. The project's recorded state has not changed."
        : result.mind === "grok"
          ? groundPlayerReply(town, agent, result.reply, result.playerText)
          : result.reply;
    const place = placeTitle(zoneAt(agent.tile.x, agent.tile.y));
    const exchange = `In ${place} at ${formatClock(town.minute)}, ${player.name} said: "${clip(result.playerText, 180)}" ${agent.name} answered: "${clip(reply, 320)}"`;
    pushMemory(
      agent,
      makeMemory(town, town.day, town.minute, "chat", exchange, 7, {
        with: "player",
        mind: result.mind,
        protected: mentionsSeed(exchange),
        source,
        turns: [
          { speaker: "player", text: clip(result.playerText, 400) },
          { speaker: agent.id, text: clip(reply, 700) },
        ],
      }),
    );
    pushMemory(
      player,
      makeMemory(town, town.day, town.minute, "chat", exchange, 7, {
        with: agent.id,
        mind: result.mind,
        protected: mentionsSeed(exchange),
        source,
        turns: [
          { speaker: "player", text: clip(result.playerText, 400) },
          { speaker: agent.id, text: clip(reply, 700) },
        ],
      }),
    );
    sayBubble(agent, reply, until);
    safely(() => adjustRelation(town, agent.id, "player", result.delta, result.note));
    safely(() => adjustRelation(town, "player", agent.id, result.delta, result.note));
    // Speech is never authorization to move money or commit the player's time.
    // Only applyPlayerAction, called with a displayed quote, can apply those edits.
    if (result.thread?.owner === agent.id) safely(() => applyThread(town, result.thread!));
    if (result.notice?.text && result.notice.author === agent.id)
      safely(() => pinNotice(town, result.notice!.author, result.notice!.text));
    if (result.project?.owner === agent.id && !unsupportedCompletion)
      safely(() => applyProject(town, result.project!));
    for (const re of result.replan ?? []) {
      const who = maybeAgent(town, re.id);
      if (who?.id === agent.id) safely(() => paintHours(who, re.blocks));
    }
  } catch {
    /* A partial hour is kept. The clock still moves. */
  } finally {
    safely(() => refreshLibraryReading(town));
    safely(() => recordSocial(town, result, socialBefore));
  }
}

export type PlayerAction = {
  id: string;
  label: string;
  terms: string;
  disabledReason?: string;
};

type QuotedAction = PlayerAction & {
  kind:
    | "bread"
    | "eat-loaf"
    | "share-loaf"
    | "pay"
    | "shift-start"
    | "shift-stop"
    | "shift-resume"
    | "recognise-work"
    | "settle-wage";
  reference?: string;
};

export const PLAYER_CAFE_SHIFT = FUNDED_CAFE_SHIFT_TEXT;
export const BABA_LOAF = "A loaf from Baba. It can be eaten.";

function adoptActionDraft(town: Town, draft: Town) {
  const agents = draft.agents.map((next) => {
    const existing = town.agents.find((agent) => agent.id === next.id);
    if (!existing) return next;
    const projects = next.projects.map((project) => {
      const prior = existing.projects.find((item) => item.id === project.id);
      if (!prior) return project;
      Object.assign(prior, project);
      return prior;
    });
    Object.assign(existing, next, { projects });
    return existing;
  });
  const favors = draft.favors.map((next) => {
    const existing = town.favors.find((favor) => favor.id === next.id);
    if (!existing) return next;
    Object.assign(existing, next);
    return existing;
  });
  Object.assign(town, draft, { agents, favors });
}

function hasLoaf(player: Agent) {
  return player.projects.find(
    (project) =>
      project.owner === "player" &&
      project.kind === "other" &&
      project.status === "open" &&
      project.text === BABA_LOAF,
  );
}
function nearbyTogether(town: Town, id: AgentId): boolean {
  const player = maybeAgent(town, "player");
  const other = maybeAgent(town, id);
  return Boolean(
    player &&
    other &&
    zoneAt(player.tile.x, player.tile.y) === zoneAt(other.tile.x, other.tile.y) &&
    Math.abs(player.tile.x - other.tile.x) + Math.abs(player.tile.y - other.tile.y) <= 2,
  );
}
function payrollPreview(town: Town) {
  const staged = structuredClone(town) as FundedTown;
  const result = activateFundedTown(staged);
  return { staged, result, work: result.ok ? fundedWorkSummary(staged, "player") : null };
}
function confirmedLegacyMinutes(claim: LegacyWageClaim): number {
  return claim.classification === "ambiguous" || !claim.payer
    ? 0
    : Math.min(180, Math.round(claim.evidence.shiftHours * 60));
}
function quotedPlayerActions(town: Town, target: AgentId): QuotedAction[] {
  const player = maybeAgent(town, "player");
  const other = maybeAgent(town, target);
  if (!player || !other) return [];
  const actions: QuotedAction[] = [];
  const add = (
    kind: QuotedAction["kind"],
    label: string,
    terms: string,
    reference?: string,
    disabledReason?: string,
  ) => {
    const revision = (town as FundedTown).economy?.revision ?? 0;
    const id = JSON.stringify([
      kind,
      target,
      town.day,
      town.nextId,
      revision,
      reference ?? "",
      terms,
    ]);
    actions.push({ id, kind, label, terms, reference, disabledReason });
  };
  const loaf = hasLoaf(player);
  if (loaf) {
    add(
      "eat-loaf",
      "Eat loaf",
      "Eat your held loaf once. It will be gone; any unpaid tab stays open. Eating does not move money.",
      loaf.id,
    );
    const library = libraryView(town);
    if (library.lookupCompleted) {
      for (const invitee of ["baba", "northern"] as const)
        if (nearbyTogether(town, invitee)) {
          const name = maybeAgent(town, invitee)!.name;
          add(
            "share-loaf",
            `Share loaf with ${name}`,
            `${name} is here and accepts a short shared meal. Share this held loaf once with ${name}, instead of eating it alone. Any unpaid tab stays open. Show the public library result at the meal: ${library.outcome} No affection, work or future visit is promised.`,
            `${loaf.id}|${invitee}`,
          );
        }
    }
  }
  if (target === "player") return actions;
  const debts = town.favors.filter(
    (favor) => favor.from === "player" && favor.to === target && favor.status === "owed",
  );
  for (const debt of debts) {
    const valid = Number.isSafeInteger(debt.amount) && debt.amount > 0;
    const canPay =
      valid &&
      Number.isSafeInteger(player.money) &&
      player.money >= debt.amount &&
      Number.isSafeInteger(other.money) &&
      other.money + debt.amount <= 999;
    add(
      "pay",
      debt.amount === 0 ? "Complete this favor" : `Pay ${debt.amount}`,
      `Pay ${other.name} ${debt.amount} to close this exact tab: ${debt.text}`,
      debt.id,
      !valid
        ? debt.amount === 0
          ? "This favor needs a recorded completion before it can be closed."
          : "This tab's amount is invalid. It has been preserved for recovery."
        : !canPay
          ? "The full payment cannot be transferred now. The tab stays open."
          : undefined,
    );
  }
  if (target === "baba" && debts.length === 0)
    add(
      "bread",
      "Accept bread tab · 2",
      "Receive one loaf from Baba and owe Baba 2. No money moves until you choose to pay. You can eat or share the loaf once; either leaves the tab open.",
      undefined,
      loaf
        ? "You already carry a loaf. Finish it before taking another."
        : player.projects.filter((p) => p.status === "open").length >= 4
          ? "There is no room to carry a loaf. Finish an open item or project first."
          : town.favors.filter((f) => f.status === "owed").length >= 24
            ? "The town cannot record another open tab yet."
            : undefined,
    );
  if (target === "kevin" || target === "baba") {
    const preview = payrollPreview(town);
    const payer = target === "kevin" ? ("till:cafe" as const) : ("till:grocery" as const);
    const work = preview.work;
    if (!work) {
      if (target === "kevin")
        add(
          "shift-start",
          "Accept cafe shift · 5",
          PLAYER_CAFE_SHIFT,
          undefined,
          preview.result.reason ?? "The financial records need recovery before work can be funded.",
        );
      return actions;
    }
    const current = work.agreements.find(
      (a) =>
        a.kind === "cafe-shift" &&
        a.payer === payer &&
        (a.status === "active" || a.status === "suspended"),
    );
    if (current)
      add(
        current.status === "active" ? "shift-stop" : "shift-resume",
        `${current.status === "active" ? "Suspend" : "Resume"} ${payer === "till:cafe" ? "cafe" : "grocery"} shift`,
        `${current.status === "active" ? "Suspend" : "Resume"} future attendance for this ${payer === "till:cafe" ? "cafe" : "grocery"} agreement. ${current.eligibleMinutes} of ${current.requiredMinutes} minutes and the full ${current.fee}-coin reservation remain across midnight. ${CAFE_CANCELLATION}`,
        current.id,
      );
    for (const payable of work.payables.filter(
      (item) => item.status === "earned" && item.payer === payer,
    ))
      add(
        "settle-wage",
        `Receive earned wage · ${payable.amount}`,
        `Settle the recorded earned wage of ${payable.amount} from ${other.name}'s reserved funds. This does not earn a second wage.`,
        payable.id,
        player.money + payable.amount > 999
          ? "Your purse cannot receive the full wage yet; the earned claim stays reserved."
          : undefined,
      );
    const claims = work.legacyClaims.filter(
      (claim) =>
        ["unresolved", "underfunded", "protected"].includes(claim.resolution) &&
        claim.classification !== "completed-unpaid" &&
        (claim.payer === payer || (claim.payer === null && target === "kevin")),
    );
    for (const claim of claims) {
      const minutes = confirmedLegacyMinutes(claim);
      const workplace = payer === "till:cafe" ? "cafe" : "grocery";
      const hours = claim.payer
        ? claim.evidence.plan.beats
            .filter((beat) => beat.place === workplace && beat.spot === "out")
            .map((beat) => `${String(beat.hour).padStart(2, "0")}:00`)
            .join(", ")
        : "16:00–19:00";
      const protectedAmount =
        preview.staged.economy!.holds.find((hold) => hold.id === claim.holdId)?.remaining ?? 0;
      add(
        "recognise-work",
        `Recognise ${payer === "till:cafe" ? "cafe" : "grocery"} work · ${minutes} minutes`,
        `${other.name} explicitly offers a funded replacement for preserved day ${claim.evidence.day} work. Original evidence records ${Math.round(claim.evidence.shiftHours * 60)} aggregate minutes (${claim.classification}); it remains unchanged. Confirm ${minutes} employer-bound minutes with ${other.name}, reserve the full ${payer === "till:cafe" ? 5 : 4}, and keep the agreement suspended until you choose Resume. ${minutes === 0 ? "Ambiguous old minutes earn no inferred payment." : "Only these disclosed preserved minutes count."} Attendance follows ${claim.payer ? "the preserved workplace hours" : "new replacement hours"}: ${hours}. Progress survives midnight; no fractional wage.`,
        claim.id,
        availableFunds(preview.staged, payer) + protectedAmount < (payer === "till:cafe" ? 5 : 4)
          ? "The employer cannot reserve the full wage yet. Your preserved evidence stays unchanged."
          : claim.resolution === "underfunded"
            ? "The prior wage must first be fully protected. Its evidence remains unchanged."
            : undefined,
      );
    }
    if (target === "kevin" && !current && claims.length === 0) {
      const pending = work.legacyClaims.some((claim) =>
        ["unresolved", "underfunded", "protected"].includes(claim.resolution),
      );
      const completedToday = work.agreements.some(
        (a) =>
          a.kind === "cafe-shift" &&
          a.status === "completed" &&
          work.receipts.some(
            (receipt) => receipt.agreementId === a.id && receipt.at.day === town.day,
          ),
      );
      const conflictingProject = player.projects.some(
        (project) =>
          project.status === "open" &&
          project.kind !== "shift" &&
          (project.text === PLAYER_CAFE_SHIFT ||
            project.text ===
              "Cafe shift, 16:00 to 19:00 each day until cancelled; 5 after three hours if the till can pay."),
      );
      const hasTimetable =
        player.plan.beats.length === 24 &&
        player.plan.beats.every((beat, hour) => beat.hour === hour);
      add(
        "shift-start",
        "Accept cafe shift · 5",
        "Accept one funded cafe work unit: 5 coins reserved before you start, for 180 eligible minutes at Hobbs, 16:00–19:00. Missed or suspended minutes, and earned unpaid wages, survive midnight. You may resume later. No advance or fractional wage. A further unit needs a new offer on a later game day.",
        undefined,
        !hasTimetable
          ? "Your saved timetable needs repair first."
          : conflictingProject
            ? "An existing project conflicts with this shift. Resolve it before accepting."
            : pending
              ? "Your preserved prior work needs explicit recognition or settlement first."
              : completedToday || player.paidToday
                ? "Today's cafe unit has already been paid or completed. Read a new offer on a later game day."
                : work.agreements.some(
                      (a) => a.kind === "cafe-shift" && ["active", "suspended"].includes(a.status),
                    )
                  ? "You have another funded workplace agreement open."
                  : town.minute > 16 * 60
                    ? "Come back before 16:00 to begin the next work unit."
                    : availableFunds(preview.staged, "till:cafe") < 5
                      ? "The cafe cannot reserve the full wage of 5 now."
                      : player.projects.filter((p) => p.status === "open").length >= 4
                        ? "Finish or drop an open project before taking work."
                        : undefined,
      );
    }
  }
  return actions;
}

export function playerActions(town: Town, target: AgentId): PlayerAction[] {
  return quotedPlayerActions(town, target).map(({ id, label, terms, disabledReason }) => ({
    id,
    label,
    terms,
    disabledReason,
  }));
}
function mustWork<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function workerCommand(
  town: Town,
  kind: string,
  terms: Parameters<typeof runtimeCommand>[3],
  suffix: string,
) {
  return { ...runtimeCommand(town, kind, "player", terms, suffix), authority: "ui" as const };
}
function recordPlayerEvent(town: Town, text: string, recipients: AgentId[]) {
  for (const id of new Set(recipients)) {
    const resident = maybeAgent(town, id);
    if (resident)
      pushMemory(
        resident,
        makeMemory(town, town.day, town.minute, "observe", text, 6, { source: "event" }),
      );
  }
}
/** Current explicit quotes are validated before an atomic staged action. */
export function applyPlayerAction(
  town: Town,
  target: AgentId,
  actionId: string,
): { ok: boolean; reply: string } {
  if (!maybeAgent(town, "player") || !maybeAgent(town, target))
    return { ok: false, reply: "That resident is not here." };
  if (
    target !== "player" &&
    Math.abs(maybeAgent(town, "player")!.tile.x - maybeAgent(town, target)!.tile.x) +
      Math.abs(maybeAgent(town, "player")!.tile.y - maybeAgent(town, target)!.tile.y) >
      2
  )
    return {
      ok: false,
      reply: `${maybeAgent(town, target)!.name} is too far away. Walk closer before choosing.`,
    };
  const action = quotedPlayerActions(town, target).find((candidate) => candidate.id === actionId);
  if (!action)
    return {
      ok: false,
      reply: "That offer has changed. Read the current terms before choosing again.",
    };
  if (action.disabledReason) return { ok: false, reply: action.disabledReason };
  try {
    const draft = structuredClone(town) as FundedTown;
    const financial = [
      "pay",
      "shift-start",
      "shift-stop",
      "shift-resume",
      "recognise-work",
      "settle-wage",
    ].includes(action.kind);
    if (financial) {
      const result = activateFundedTown(draft);
      if (!result.ok) throw new Error(result.reason);
    }
    let player = maybeAgent(draft, "player")!;
    let reply: string;
    if (action.kind === "bread") {
      applyFavor(
        draft,
        { action: "offer", from: "player", to: "baba", amount: 2, text: "Bread, to be paid back." },
        ["player", "baba"],
      );
      applyProject(draft, {
        owner: "player",
        action: "start",
        kind: "other",
        place: "grocery",
        text: BABA_LOAF,
      });
      if (
        !hasLoaf(player) ||
        !draft.favors.some(
          (f) => f.from === "player" && f.to === "baba" && f.status === "owed" && f.amount === 2,
        )
      )
        throw new Error("The loaf and tab could not both be recorded; nothing changed.");
      reply =
        "You received one loaf and accepted a tab of 2 with Baba. No money moved. Inventory lets you eat or share the loaf once.";
    } else if (action.kind === "eat-loaf" || action.kind === "share-loaf") {
      const [loafId, inviteeId] = (action.reference ?? "").split("|");
      const loaf = hasLoaf(player);
      if (!loaf || loaf.id !== loafId) throw new Error("You are not carrying that loaf anymore.");
      if (action.kind === "eat-loaf") {
        loaf.status = "done";
        reply = "You eat the loaf. It is gone. Any unpaid tab stays open; no money moved.";
        recordPlayerEvent(draft, reply, ["player"]);
      } else {
        if ((inviteeId !== "baba" && inviteeId !== "northern") || !nearbyTogether(draft, inviteeId))
          throw new Error("The invited resident is no longer here; your loaf is untouched.");
        const view = libraryView(draft);
        if (!view.lookupCompleted)
          throw new Error(
            "The meal needs a completed public library result; your loaf is untouched.",
          );
        loaf.status = "done";
        const invitee = maybeAgent(draft, inviteeId)!;
        reply = `You and ${invitee.name} share the loaf after ${invitee.name} accepts. You show the public library result: ${view.outcome} The loaf is gone; any unpaid tab stays open. No future meeting or affection was promised.`;
        const witnesses = draft.agents
          .filter((a) => a.id !== "player" && a.id !== inviteeId && nearbyTogether(draft, a.id))
          .map((a) => a.id);
        recordPlayerEvent(
          draft,
          `${player.name} and ${invitee.name} shared the offered loaf after both accepted. The public library result was shown: ${view.outcome} The loaf was consumed once; any unpaid tab remains open.`,
          ["player", inviteeId, ...witnesses],
        );
      }
    } else if (action.kind === "pay") {
      const debt = draft.favors.find(
        (f) =>
          f.id === action.reference &&
          f.from === "player" &&
          f.to === target &&
          f.status === "owed",
      );
      if (!debt) throw new Error("That tab is no longer open.");
      applyFavor(
        draft,
        {
          action: "pay",
          id: debt.id,
          from: "player",
          to: target,
          amount: debt.amount,
          text: debt.text,
        },
        ["player", target],
      );
      if (draft.favors.find((f) => f.id === debt.id)?.status !== "paid")
        throw new Error("The payment could not be completed. The tab stays open.");
      reply = `Paid ${maybeAgent(draft, target)!.name} ${debt.amount}. That tab is closed.`;
    } else if (action.kind === "shift-start") {
      const id = `cafe:player:${draft.day}:${draft.nextId}`;
      const approvalId = `approval:${id}`;
      const approval: Omit<PayrollApproval, "consumed"> = {
        id: approvalId,
        kind: "cafe-replacement",
        worker: "player",
        payer: "till:cafe",
        issuer: "kevin",
        claimId: null,
        confirmedMinutes: 0,
        fee: 5,
        requiredMinutes: 180,
        expires: { day: draft.day, minute: 1439 },
        cancellation: CAFE_CANCELLATION,
      };
      mustWork(
        approvePayrollAgreement(
          draft,
          runtimeCommand(draft, "approve-payroll-agreement", "kevin", approval, approvalId),
          approval,
        ),
      );
      mustWork(
        createFundedCafeAgreement(
          draft,
          workerCommand(
            draft,
            "accept-funded-cafe-shift",
            cafeAgreementTerms(id, "player", approvalId),
            id,
          ),
          id,
          "player",
          approvalId,
        ),
      );
      player = maybeAgent(draft, "player")!;
      for (const project of player.projects)
        if (project.kind === "shift" && project.status === "open") project.status = "done";
      applyProject(draft, {
        owner: "player",
        action: "start",
        kind: "shift",
        place: "cafe",
        text: PLAYER_CAFE_SHIFT,
      });
      const item = player.projects.find(
        (project) =>
          project.owner === "player" &&
          project.kind === "shift" &&
          project.status === "open" &&
          project.text === PLAYER_CAFE_SHIFT,
      );
      if (!item) throw new Error("The funded work item could not be recorded; nothing changed.");
      item.id = fundedWorkProjectId(id);
      paintHours(player, [
        { from: 16, to: 19, place: "cafe", spot: "out", status: "on a funded cafe shift" },
      ]);
      player.shiftHours = 0;
      reply =
        "Cafe unit accepted: 5 coins reserved for 180 eligible minutes, 16:00–19:00. Your minutes and any earned unpaid wage survive midnight. Nothing paid in advance.";
    } else if (action.kind === "recognise-work") {
      const claim = draft.economy!.work!.legacyClaims.find(
        (c) => c.id === action.reference && c.worker === "player",
      )!;
      if (!claim) throw new Error("That preserved work record is no longer available.");
      const payer = target === "baba" ? ("till:grocery" as const) : ("till:cafe" as const);
      const issuer = target === "baba" ? "baba" : "kevin";
      const minutes = confirmedLegacyMinutes(claim);
      const approvalId = `approval:player:${claim.id}`;
      const approval: Omit<PayrollApproval, "consumed"> = {
        id: approvalId,
        kind: "legacy-recognition",
        worker: "player",
        payer,
        issuer,
        claimId: claim.id,
        confirmedMinutes: minutes,
        fee: payer === "till:cafe" ? 5 : 4,
        requiredMinutes: 180,
        expires: { day: draft.day, minute: 1439 },
        cancellation: CAFE_CANCELLATION,
      };
      mustWork(
        approvePayrollAgreement(
          draft,
          runtimeCommand(draft, "approve-payroll-agreement", issuer, approval, approvalId),
          approval,
        ),
      );
      const terms = {
        claimId: claim.id,
        payer,
        confirmedMinutes: minutes,
        approvalId,
        fee: approval.fee,
        requiredMinutes: 180,
        cancellation: CAFE_CANCELLATION,
      };
      mustWork(
        recogniseLegacyClaim(
          draft,
          workerCommand(draft, "recognise-legacy-payroll", terms, claim.id),
          claim.id,
          payer,
          minutes,
          approvalId,
        ),
      );
      player = maybeAgent(draft, "player")!;
      if (claim.payer === null)
        paintHours(player, [
          {
            from: 16,
            to: 19,
            place: payer === "till:grocery" ? "grocery" : "cafe",
            spot: "out",
            status: "on an explicitly replaced workplace shift",
          },
        ]);
      reply = `Explicit funded recognition recorded: ${minutes} minutes with ${maybeAgent(draft, issuer)!.name}. Original legacy evidence remains unchanged. The funded agreement is suspended; read Resume before working.`;
    } else if (action.kind === "settle-wage") {
      const payable = draft.economy!.work!.payables.find(
        (p) => p.id === action.reference && p.worker === "player",
      )!;
      if (!payable) throw new Error("That earned payable no longer exists.");
      const issuer = payable.payer === "till:grocery" ? "baba" : "kevin";
      const settled = mustWork(
        settleWorkPayable(
          draft,
          runtimeCommand(
            draft,
            "settle-work-payable",
            issuer,
            { payableId: payable.id },
            `${payable.id}:${draft.day}:${draft.nextId}`,
          ),
          payable.id,
        ),
      );
      if (settled.status !== "settled")
        throw new Error(settled.reason ?? "The earned wage remains reserved and payable.");
      closeCompletedWorkItems(draft, payable.agreementId);
      player = maybeAgent(draft, "player")!;
      player.paidToday = true;
      const workplace = payable.payer === "till:grocery" ? "grocery" : "cafe";
      pushMemory(
        player,
        makeMemory(
          draft,
          draft.day,
          draft.minute,
          "favor",
          `${placeTitle(workplace)} paid me ${payable.amount} for a shift I actually worked.`,
          7,
          { protected: true, source: "event" },
        ),
      );
      const transaction = draft.economy!.transactions.find(
        (item) => item.id === settled.transactionId,
      );
      rememberPaidWork(
        draft,
        "player",
        workplace,
        payable.amount,
        settled.transactionId ?? payable.id,
        transaction && { day: transaction.day, minute: transaction.minute },
      );
      reply = `The recorded earned wage of ${payable.amount} is settled once from its reserved funds.`;
    } else {
      const agreement = draft.economy!.work!.agreements.find(
        (a) => a.id === action.reference && a.worker === "player",
      )!;
      if (!agreement) throw new Error("That work agreement is no longer available.");
      const resume = action.kind === "shift-resume";
      mustWork(
        suspendWorkAgreement(
          draft,
          workerCommand(
            draft,
            resume ? "resume-work" : "suspend-work",
            { agreementId: agreement.id },
            `${agreement.id}:${draft.nextId}`,
          ),
          agreement.id,
          resume,
        ),
      );
      player = maybeAgent(draft, "player")!;
      if (resume) {
        const legacyClaim = draft.economy!.work!.legacyClaims.find(
          (claim) => claim.agreementId === agreement.id,
        );
        if (legacyClaim?.payer && legacyClaim.classification !== "ambiguous") {
          const workplace = agreement.payer === "till:grocery" ? "grocery" : "cafe";
          paintHours(
            player,
            legacyClaim.evidence.plan.beats
              .filter((beat) => beat.place === workplace && beat.spot === "out")
              .map((beat) => ({ ...beat, from: beat.hour, to: beat.hour + 1 })),
          );
          player.plan.day = draft.day;
        } else
          paintHours(player, [
            {
              from: 16,
              to: 19,
              place: agreement.payer === "till:grocery" ? "grocery" : "cafe",
              spot: "out",
              status: "on a funded workplace shift",
            },
          ]);
      }
      reply = `${resume ? "Resumed" : "Suspended"} workplace attendance. ${agreement.eligibleMinutes} minutes and the full ${agreement.fee}-coin reservation remain. No money moved and no accrued work was lost.`;
    }
    if (target !== "player" && action.kind !== "share-loaf")
      applyResult(
        draft,
        {
          kind: "player",
          mind: "offline",
          agentId: target,
          playerText: action.label,
          reply,
          delta: 0,
          note: "",
          favor: null,
        },
        "event",
      );
    else if (action.kind !== "eat-loaf" && action.kind !== "share-loaf")
      recordPlayerEvent(draft, reply, ["player"]);
    adoptActionDraft(town, draft);
    return { ok: true, reply };
  } catch (error) {
    return {
      ok: false,
      reply:
        error instanceof Error
          ? error.message
          : "The action could not be recorded; nothing changed.",
    };
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
    makeMemory(town, town.day, town.minute, "plan", `Day ${town.day}: ${agent.plan.summary}`, 5, {
      mind,
    }),
  );
  if (draft.project && !(mind === "grok" && draft.project.action === "done"))
    applyProject(town, { ...draft.project, owner: agent.id });
  if (draft.thread) safely(() => applyThread(town, { ...draft.thread!, owner: agent.id }));
  refreshResidentStatus(town, agent);
}

export function spreadView(town: Town) {
  const holders = town.agents.filter(
    (a) =>
      a.id !== "kevin" &&
      Array.isArray(a.memories) &&
      a.memories.some((m) => m.seed || mentionsSeed(m.text)),
  );
  const notes = (town.notices ?? []).filter((n) => mentionsSeed(n.text));
  const missed = (town.retrievals ?? []).filter((r) => r.missed);
  return { holders, notes, missed };
}
