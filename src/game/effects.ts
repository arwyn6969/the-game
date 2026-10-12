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
    if (!Number.isInteger(amount) || amount < 0 || amount > 30) return;
    if (!Number.isInteger(from.money) || from.money < 0 || from.money > 999) return;
    if (!Number.isInteger(to.money) || to.money < 0 || to.money > 999) return;
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
    from.money -= amount;
    to.money += amount;
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
  }
}

export type PlayerAction = {
  id: string;
  label: string;
  terms: string;
  disabledReason?: string;
};

type QuotedAction = PlayerAction & {
  kind: "bread" | "eat-loaf" | "pay" | "shift-start" | "shift-stop";
  reference?: string;
};

// Shared contract identity while retaining the existing v1 Project schema.
export const PLAYER_CAFE_SHIFT =
  "Cafe shift, 16:00 to 19:00 each day until cancelled; 5 after three hours if the till can pay.";
export const BABA_LOAF = "A loaf from Baba. It can be eaten.";

function quotedPlayerActions(town: Town, target: AgentId): QuotedAction[] {
  const player = maybeAgent(town, "player");
  const other = maybeAgent(town, target);
  if (!player || !other || target === "player") return [];
  const actions: QuotedAction[] = [];
  const add = (
    kind: QuotedAction["kind"],
    label: string,
    terms: string,
    reference?: string,
    disabledReason?: string,
  ) => {
    // The existing nextId is a save-compatible revision. A used quote cannot be
    // replayed after its debt has been paid. The UI also checks town identity.
    const id = JSON.stringify([kind, target, town.day, town.nextId, reference ?? "", terms]);
    actions.push({ id, kind, label, terms, reference, disabledReason });
  };
  const debts = (town.favors ?? []).filter(
    (f) => f.from === "player" && f.to === target && f.status === "owed",
  );
  const loaf = (player.projects ?? []).find(
    (project) =>
      project.owner === "player" &&
      project.kind === "other" &&
      project.status === "open" &&
      project.text === BABA_LOAF,
  );
  if (loaf) {
    add(
      "eat-loaf",
      "Eat loaf",
      "Eat your held loaf once. It will be gone; any unpaid tab stays open. Eating does not move money.",
      loaf.id,
    );
  }
  for (const debt of debts) {
    const validAmount = Number.isInteger(debt.amount) && debt.amount >= 0 && debt.amount <= 30;
    const canPay =
      validAmount &&
      Number.isInteger(player.money) &&
      player.money >= debt.amount &&
      player.money <= 999 &&
      Number.isInteger(other.money) &&
      other.money >= 0 &&
      other.money + debt.amount <= 999;
    add(
      "pay",
      debt.amount === 0 ? "Complete this favor" : `Pay ${debt.amount}`,
      `Pay ${other.name} ${debt.amount} to close this exact tab: ${debt.text}`,
      debt.id,
      !validAmount
        ? "This tab's amount is invalid. It has been preserved for recovery."
        : debt.amount === 0
          ? "This favor needs a recorded completion before it can be closed."
          : !canPay
            ? "The full payment cannot be transferred now. The tab stays open."
            : undefined,
    );
  }
  if (target === "baba" && debts.length === 0) {
    const conflictingLoaf = (player.projects ?? []).some(
      (project) => project.status === "open" && project.text === BABA_LOAF,
    );
    add(
      "bread",
      "Accept bread tab · 2",
      "Receive one loaf from Baba and owe Baba 2. No money moves until you choose to pay. You can eat the loaf once; eating does not pay the tab.",
      undefined,
      conflictingLoaf
        ? "You already have a loaf or a conflicting item. Finish it before taking another."
        : (player.projects ?? []).filter((project) => project.status === "open").length >= 4
          ? "There is no room to carry a loaf. Finish an open item or project first."
          : (town.favors ?? []).filter((f) => f.status === "owed").length >= 24
            ? "The town cannot record another open tab yet."
            : undefined,
    );
  }
  if (target === "kevin") {
    const shifts = (player.projects ?? []).filter(
      (p) => p.owner === "player" && p.kind === "shift" && p.status === "open",
    );
    const shift = shifts.find((p) => (p.place ?? "cafe") === "cafe");
    if (shift) {
      add(
        "shift-stop",
        "Cancel cafe shift",
        `End the cafe shift now. This pays no wage and keeps money already earned. Today's ${Math.round(player.shiftHours * 60)} worked minutes remain until midnight; cancelled hours earn nothing.`,
        shift.id,
      );
    } else {
      const hasTimetable =
        Array.isArray(player.plan?.beats) &&
        player.plan.beats.length === 24 &&
        player.plan.beats.every((beat, hour) => beat?.hour === hour);
      const conflictingProject = (player.projects ?? []).some(
        (project) => project.status === "open" && project.text === PLAYER_CAFE_SHIFT,
      );
      const disabledReason = !hasTimetable
        ? "Your saved timetable needs repair before you can take this shift."
        : conflictingProject
          ? "An existing project conflicts with this shift. Resolve it before accepting."
          : shifts.length
            ? "You already have an open shift elsewhere."
            : town.minute > 16 * 60
              ? "Come back before 16:00 to take a full shift."
              : player.paidToday
                ? "You have already received today's wage."
                : (town.tills?.cafe ?? 0) < 5
                  ? "The cafe till cannot fund a wage of 5 now."
                  : (player.projects ?? []).filter((p) => p.status === "open").length >= 4
                    ? "Finish or drop an open project before taking a shift."
                    : undefined;
      add(
        "shift-start",
        "Accept cafe shift · 5",
        "Work at Hobbs Cafe, 16:00–19:00 each day until cancelled. Three game hours on the floor earn 5 if the till can pay in full. No advance or part-payment. Worked minutes and unpaid wages do not carry past midnight.",
        undefined,
        disabledReason,
      );
    }
  }
  return actions;
}

/** Read-only quotes: showing or discussing an offer does not accept it. */
export function playerActions(town: Town, target: AgentId): PlayerAction[] {
  return quotedPlayerActions(town, target).map(({ id, label, terms, disabledReason }) => ({
    id,
    label,
    terms,
    disabledReason,
  }));
}

/** Only explicit UI actions enter here; model output cannot call this boundary. */
export function applyPlayerAction(
  town: Town,
  target: AgentId,
  actionId: string,
): { ok: boolean; reply: string } {
  const player = maybeAgent(town, "player");
  const other = maybeAgent(town, target);
  if (!player || !other || target === "player")
    return { ok: false, reply: "That resident is not here." };
  if (Math.abs(player.tile.x - other.tile.x) + Math.abs(player.tile.y - other.tile.y) > 2)
    return { ok: false, reply: `${other.name} is too far away. Walk closer before choosing.` };
  const action = quotedPlayerActions(town, target).find((candidate) => candidate.id === actionId);
  if (!action)
    return {
      ok: false,
      reply: "That offer has changed. Read the current terms before choosing again.",
    };
  if (action.disabledReason) return { ok: false, reply: action.disabledReason };
  let reply: string;
  if (action.kind === "bread") {
    // Stage both effects before adopting either: a refused item must never
    // leave the player owing for a loaf they did not receive.
    try {
      const staged = structuredClone(town);
      const stagedPlayer = maybeAgent(staged, "player")!;
      const stagedBaba = maybeAgent(staged, "baba")!;
      const previousFavors = staged.favors.length;
      applyFavor(
        staged,
        { action: "offer", from: "player", to: "baba", amount: 2, text: "Bread, to be paid back." },
        ["player", "baba"],
      );
      applyProject(staged, {
        owner: "player",
        action: "start",
        kind: "other",
        place: "grocery",
        text: BABA_LOAF,
      });
      const received = stagedPlayer.projects.some(
        (project) =>
          project.owner === "player" &&
          project.kind === "other" &&
          project.text === BABA_LOAF &&
          project.status === "open",
      );
      const debt = staged.favors.at(-1);
      if (
        !received ||
        staged.favors.length !== previousFavors + 1 ||
        debt?.from !== "player" ||
        debt.to !== "baba" ||
        debt.amount !== 2 ||
        debt.status !== "owed"
      ) {
        return {
          ok: false,
          reply:
            "The loaf and its tab could not both be recorded. You received no loaf and owe nothing new.",
        };
      }
      town.favors = staged.favors;
      town.nextId = staged.nextId;
      player.projects = stagedPlayer.projects;
      player.memories = stagedPlayer.memories;
      player.newMemories = stagedPlayer.newMemories;
      other.memories = stagedBaba.memories;
      other.newMemories = stagedBaba.newMemories;
    } catch {
      return {
        ok: false,
        reply:
          "The loaf and its tab could not both be recorded. You received no loaf and owe nothing new.",
      };
    }
    reply =
      "You received one loaf and accepted a tab of 2 with Baba. No money has moved. You can choose Eat loaf when you want it.";
  } else if (action.kind === "eat-loaf") {
    const loaf = player.projects.find(
      (project) =>
        project.id === action.reference &&
        project.owner === "player" &&
        project.kind === "other" &&
        project.text === BABA_LOAF &&
        project.status === "open",
    );
    if (!loaf) return { ok: false, reply: "You are not carrying that loaf anymore." };
    loaf.status = "done";
    reply = "You eat the loaf. It is gone. Any unpaid tab stays open; no money moved.";
  } else if (action.kind === "pay") {
    const debt = town.favors.find(
      (f) =>
        f.id === action.reference && f.from === "player" && f.to === target && f.status === "owed",
    );
    if (!debt) return { ok: false, reply: "That tab is no longer open." };
    applyFavor(
      town,
      {
        action: "pay",
        id: debt.id,
        from: debt.from,
        to: debt.to,
        amount: debt.amount,
        text: debt.text,
      },
      ["player", target],
    );
    if (debt.status !== "paid")
      return { ok: false, reply: "The payment could not be completed. The tab stays open." };
    reply = debt.amount
      ? `Paid ${other.name} ${debt.amount}. That tab is closed.`
      : "That favor is complete. No money moved.";
  } else if (action.kind === "shift-start") {
    applyProject(town, {
      owner: "player",
      action: "start",
      kind: "shift",
      place: "cafe",
      text: PLAYER_CAFE_SHIFT,
    });
    if (
      !player.projects.some(
        (project) =>
          project.owner === "player" &&
          project.kind === "shift" &&
          project.place === "cafe" &&
          project.status === "open" &&
          project.text === PLAYER_CAFE_SHIFT,
      )
    ) {
      return {
        ok: false,
        reply: "The shift could not be recorded. Your timetable has not changed.",
      };
    }
    paintHours(player, [
      { from: 16, to: 19, place: "cafe", spot: "out", status: "on a cafe shift, earning it" },
    ]);
    reply =
      "Cafe shift accepted: 16:00–19:00 each day until cancelled. Three game hours on the floor, then 5 if the till can pay. Nothing paid in advance.";
  } else {
    applyProject(town, {
      owner: "player",
      action: "drop",
      id: action.reference,
      kind: "shift",
      text: "",
    });
    paintHours(player, [
      { from: 16, to: 18, place: "park", spot: "out", status: "in the park, keeping to the path" },
      { from: 18, to: 19, place: "townhouses", spot: "home", status: "home on the row, lamp low" },
    ]);
    reply =
      "Cafe shift cancelled. No wage was paid by cancelling; money already earned stays yours.";
  }
  applyResult(
    town,
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
  return { ok: true, reply };
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
