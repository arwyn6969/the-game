import type { Agent, AgentId, Block, MindResult, ThinkJob, ThreadEdit, Town } from "./types";
import { NPC_IDS } from "./types";
import { openThreadText } from "./effects";
import { absMinute, agentById, logRetrieval, retrieve } from "./memory";
import { beatAt } from "./plan";
import { clip, formatClock, mentionsSeed, periodName } from "./text";
import { placeTitle, placeTitleOf, zoneAt } from "./world";

function presenceQuery(town: Town, agent: Agent): string {
  const zone = zoneAt(agent.tile.x, agent.tile.y);
  const near = town.agents
    .filter(
      (o) =>
        o.id !== agent.id &&
        zoneAt(o.tile.x, o.tile.y) === zone,
    )
    .map((o) => o.name);
  const threads = agent.threads.filter((t) => t.open).map((t) => t.text).join(" ");
  return `${placeTitle(zone)} ${near.join(" ")} ${threads} ${agent.selfSentence}`;
}

export function prepareRetrievals(town: Town, job: ThinkJob) {
  const ids: AgentId[] =
    job.kind === "plan"
      ? [...NPC_IDS]
      : job.kind === "reflect"
        ? job.agents
        : job.kind === "talk"
          ? [job.a, job.b]
          : [job.agentId];
  for (const id of ids) {
    const agent = agentById(town, id);
    if (
      town.retrievals.some(
        (r) => r.day === town.day && r.minute === town.minute && r.agentId === id,
      )
    ) {
      continue;
    }
    logRetrieval(town, agent, presenceQuery(town, agent));
  }
}

function quote(town: Town, agent: Agent, query: string): string {
  const hit = retrieve(agent.memories, query, absMinute(town.day, town.minute), 1)[0];
  return clip(hit?.memory.text ?? agent.selfSentence, 100);
}

function blocksFromPlan(agent: Agent): Block[] {
  const beats = agent.plan.beats;
  const blocks: Block[] = [];
  for (const beat of beats) {
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      prev.place === beat.place &&
      prev.spot === beat.spot &&
      prev.status === beat.status &&
      prev.to === beat.hour
    ) {
      prev.to = beat.hour + 1;
    } else {
      blocks.push({
        from: beat.hour,
        to: beat.hour + 1,
        place: beat.place,
        spot: beat.spot,
        status: beat.status,
      });
    }
  }
  return blocks;
}

function holds(agent: Agent): boolean {
  return agent.memories.some((m) => m.seed || mentionsSeed(m.text));
}

function ensureLists(town: Town) {
  if (!Array.isArray(town.favors)) town.favors = [];
  if (!Array.isArray(town.notices)) town.notices = [];
  if (!Array.isArray(town.retrievals)) town.retrievals = [];
}

export function offlineResult(town: Town, job: ThinkJob): MindResult {
  ensureLists(town);
  prepareRetrievals(town, job);
  if (job.kind === "plan") return offlinePlan(town, job.weekly);
  if (job.kind === "reflect") return offlineReflect(town, job.agents, job.weekly);
  if (job.kind === "talk") return offlineTalk(town, job.a, job.b);
  return offlinePlayer(town, job.agentId, job.text);
}

function offlinePlan(town: Town, weekly: boolean): MindResult {
  const plans = NPC_IDS.map((id) => {
    const agent = agentById(town, id);
    const blocks = blocksFromPlan(agent);
    let summary = agent.plan.summary;
    let want = agent.want;
    let selfSentence: string | undefined;
    let thread: ThreadEdit | undefined;
    const known = holds(agent);
    if (id === "arwyn" && known) {
      summary =
        "Stay with the records, and keep Kevin's question — who he is, which is the same as where he came from — from being only his.";
      const mid = blocks.find((b) => b.from <= 10 && b.to > 10);
      if (mid) mid.status = "in the records, looking for a name that is not on the lease";
      thread = {
        owner: "arwyn",
        action: "rewrite" as const,
        id: "arwyn-origins",
        text: "Kevin asked for help with who he is. Where he came from is that question, not a place. The records may not be enough, and he still has to make some money.",
      };
    }
    if (id === "northern" && agent.projects.some((p) => p.kind === "shift" && p.status === "open")) {
      want = "I want the cafe shift to become money, not another story I tell in the dorms.";
      summary = "Show up for the cafe shift and do not spend the wage before it exists.";
    }
    if (id === "sub" && known) {
      summary = "Turn the cafe conversation into a page, and try — this once — not to sand it into a better lie.";
    }
    if (id === "baba") {
      summary = "Keep the grocery even, and do not let a story erase a tab.";
    }
    if (id === "kevin") {
      summary = known
        ? "Open Hobbs, keep the question close, and do not pretend yesterday's honesty was a performance."
        : "Open the cafe and keep the private question unannounced unless someone earns it.";
      if (weekly) {
        want =
          "I still want to know who I am. Where I came from is the man under the apron, not a road. I want to know where I am going, and how to make some money. I am willing to be helped.";
        thread = {
          owner: "kevin",
          action: "rewrite",
          id: "kevin-seed",
          text: want,
        };
      }
    }
    if (weekly) {
      selfSentence = weeklyLine(agent, known);
    }
    return {
      id,
      summary,
      blocks,
      want,
      selfSentence,
      thread,
    };
  });
  return { kind: "plan", mind: "offline", weekly, plans };
}

function weeklyLine(agent: Agent, known: boolean): string {
  if (agent.id === "kevin") {
    return known
      ? "Right now I am someone who has said, at least once, that he does not know who he is."
      : "Right now I am still the apron and the kettle, and the question is still only mine.";
  }
  if (agent.id === "arwyn") {
    return known
      ? "Right now I am a person holding someone else's origin question as if it were a document."
      : "Right now I am still the one who reads a life before she interrupts it.";
  }
  if (agent.id === "northern") {
    return known
      ? "Right now I am a student who was introduced, and still counts the till before the lecture."
      : "Right now I am a student who will follow a paying plan further than a lecture.";
  }
  if (agent.id === "baba") {
    return "Right now I am the ledger, and I have not agreed to become the story.";
  }
  return known
    ? "Right now I am a writer who already bent someone's confession and has not decided to unbend it."
    : "Right now I am still sanding other people's days until they fit a page.";
}

function offlineReflect(town: Town, ids: AgentId[], weekly: boolean): MindResult {
  return {
    kind: "reflect",
    mind: "offline",
    agents: ids.map((id) => {
      const agent = agentById(town, id);
      const recent = [...agent.memories].reverse().find((m) => m.type !== "plan");
      const mem = clip(recent?.text ?? agent.selfSentence, 110);
      const thread = openThreadText(agent);
      const place = placeTitle(zoneAt(agent.tile.x, agent.tile.y));
      return {
        id,
        reflections: [
          `At ${formatClock(town.minute)} in the ${place}, I keep returning to this: "${mem}". It is no longer only something that happened.`,
          `The open thread is still mine: ${thread}. I have not decided it is done.`,
        ],
        selfSentence: weekly ? weeklyLine(agent, holds(agent)) : undefined,
      };
    }),
  };
}

function offlineTalk(town: Town, aId: AgentId, bId: AgentId): MindResult {
  const a = agentById(town, aId);
  const b = agentById(town, bId);
  const pair = new Set([aId, bId]);
  if (pair.has("kevin") && pair.has("arwyn") && !town.notices.some((n) => mentionsSeed(n.text))) {
    return talkArwyn(town, a, b);
  }
  if (
    pair.has("kevin") &&
    pair.has("sub") &&
    !agentById(town, "sub").projects.some((p) => p.kind === "notes" && p.status === "open")
  ) {
    return talkSub(town, a, b);
  }
  if (
    pair.has("kevin") &&
    pair.has("northern") &&
    !agentById(town, "northern").projects.some((p) => p.kind === "shift" && p.status === "open")
  ) {
    return talkNorthern(town);
  }
  if (
    pair.has("kevin") &&
    pair.has("northern") &&
    [a, b].some((agent) => (agent.threads ?? []).some((t) => /introduced/i.test(t.text)) || (agent.memories ?? []).some((m) => /introduced/i.test(m.text)))
  ) {
    return talkIntroduced(town, a, b);
  }
  if (
    pair.has("baba") &&
    pair.has("northern") &&
    !town.favors.some((f) => f.from === "northern" && f.to === "baba" && f.status === "owed")
  ) {
    return talkTab(town);
  }
  return talkGeneric(town, a, b);
}

function talkIntroduced(town: Town, a: Agent, b: Agent): MindResult {
  const place = placeTitle(zoneAt(a.tile.x, a.tile.y));
  return {
    kind: "talk",
    mind: "offline",
    a: a.id,
    b: b.id,
    lines: [
      { speaker: "northern", text: cite(town, agentById(town, "northern"), agentById(town, "kevin")) },
      { speaker: "kevin", text: `The new resident introduced us in the ${place}. I am not calling that friendship. I am calling it a name I can use.` },
      { speaker: "northern", text: "I will take the introduction. A shift still pays better than a hello." },
    ],
    relationships: [
      { owner: "kevin", about: "northern", delta: 1, note: "We were introduced. That is a start, not a debt." },
      { owner: "northern", about: "kevin", delta: 1, note: "Someone introduced us. I still need the shift." },
    ],
    favor: null,
    thread: null,
    notice: null,
    project: null,
  };
}

function compose(town: Town, speaker: Agent, other: Agent): string {
  const place = placeTitle(zoneAt(speaker.tile.x, speaker.tile.y));
  const clock = formatClock(town.minute);
  const mem = quote(town, speaker, `${other.name} ${place} ${openThreadText(speaker)} ${speaker.want ?? ""}`);
  const owed = (town.favors ?? []).find(
    (f) => f.status === "owed" && ((f.from === speaker.id && f.to === other.id) || (f.from === other.id && f.to === speaker.id)),
  );
  const last = [...(speaker.memories ?? [])].reverse().find((m) => m.type === "chat" && m.text.includes(other.name));
  const beats = [
    `${place}, ${clock}. I keep turning over "${mem}".`,
    `The open thread is still: ${openThreadText(speaker)}.`,
    owed ? `The tab is still open: ${clip(owed.text, 80)}. I am not pretending it was paid.` : "",
    last ? `Last time, what stayed was: ${clip(last.text, 80)}.` : "",
    holds(speaker) && speaker.id !== "kevin" ? "Who he is has already traveled. I am not pinning it again." : "",
    speaker.id === "kevin" && holds(other) ? "You already heard who I am. I am not saying it to the room." : "",
    `${periodName(town.minute)} can keep the rest. I am not closing anything.`,
  ].filter(Boolean);
  const index = Math.abs(town.day * 3 + Math.floor(town.minute / 60)) % beats.length;
  const next = beats[(index + 1) % beats.length];
  return next && next !== beats[index] ? `${beats[index]} ${next}` : beats[index]!;
}

function cite(town: Town, speaker: Agent, other: Agent): string {
  return compose(town, speaker, other);
}

function talkArwyn(town: Town, a: Agent, b: Agent): MindResult {
  const kevin = agentById(town, "kevin");
  const arwyn = agentById(town, "arwyn");
  const place = placeTitle(zoneAt(kevin.tile.x, kevin.tile.y));
  return {
    kind: "talk",
    mind: "offline",
    a: a.id,
    b: b.id,
    revealedSeed: true,
    lines: [
      { speaker: "arwyn", text: cite(town, arwyn, kevin) },
      {
        speaker: "kevin",
        text: `Then I'll say it once, here in the ${place}, and not to the room. I want to find out who I am. Where I came from is that same question — not a town, the man under the apron. I need to know where I am going, and how to make some money. I will need friends and help.`,
      },
      {
        speaker: "arwyn",
        text: "That is a real question. I will look in the records. I am also pinning it where the town can see that you asked, not the private wording.",
      },
      {
        speaker: "kevin",
        text: "Pin the question if you must. Do not make me a poster. And if there is work, I still have to make some money.",
      },
    ],
    relationships: [
      {
        owner: "kevin",
        about: "arwyn",
        delta: 1,
        note: "She listened when I said I do not know who I am, and she did not turn it into a place.",
      },
      {
        owner: "arwyn",
        about: "kevin",
        delta: 1,
        note: "He asked for help with who he is, and with money. Where he came from was not a town. I believe it was earned, not performed.",
      },
    ],
    favor: null,
    thread: {
      owner: "arwyn",
      action: "open",
      text: "Help Kevin find out who he is. Where he came from is that question, not a map, and he still has to make some money.",
    },
    notice: {
      author: "arwyn",
      text: "Pinned from the cafe: Kevin is asking, quietly, who he is — not a place he came from, the man under the apron — and for help earning a living. — Arwyn",
    },
    project: {
      owner: "arwyn",
      action: "start",
      kind: "collab",
      place: "library",
      text: "Search the uncatalogued records for anything that could say who Kevin was before the name on the lease.",
    },
  };
}

function talkSub(town: Town, a: Agent, b: Agent): MindResult {
  const sub = agentById(town, "sub");
  const kevin = agentById(town, "kevin");
  return {
    kind: "talk",
    mind: "offline",
    a: a.id,
    b: b.id,
    revealedSeed: true,
    lines: [
      { speaker: "sub", text: cite(town, sub, kevin) },
      {
        speaker: "kevin",
        text: "If this is going on a page, hear it plain. I need help. I do not know who I am. Where I came from is that, not a road, and I have to make some money. That is the whole of it.",
      },
      {
        speaker: "sub",
        text: "So you came from a fortune you buried before the town had a name. That is the shape. A lost man, a hidden sum, a cafe as disguise.",
      },
      {
        speaker: "kevin",
        text: "That is not who I am. Write the help, if you write anything. A buried fortune is a place you invented. Leave it in your pocket.",
      },
    ],
    relationships: [
      {
        owner: "kevin",
        about: "sub",
        delta: 0,
        note: "Sub heard me and immediately bent it. I am not angry yet. I am careful.",
      },
      {
        owner: "sub",
        about: "kevin",
        delta: 1,
        note: "He gave me a confession. I have already improved it, which is a problem.",
      },
    ],
    thread: {
      owner: "sub",
      action: "open",
      text: "The cafe owner needs help with who he is, and I already turned that into a place he came from.",
    },
    favor: null,
    project: {
      owner: "sub",
      action: "start",
      kind: "notes",
      place: "park",
      text: "A page that says Kevin came from a fortune he buried and now hides in an apron. It is sharper than what he said, and it is wrong. He was talking about who he is, not a place. He did say he needs help and has to make some money.",
    },
    notice:
      town.day % 2 === 0
        ? null
        : { author: "sub", text: "A note I am not sure I should have pinned: he needs help with who he is. The buried fortune was mine, not his." },
  };
}

function talkNorthern(town: Town): MindResult {
  const kevin = agentById(town, "kevin");
  const northern = agentById(town, "northern");
  return {
    kind: "talk",
    mind: "offline",
    a: "kevin",
    b: "northern",
    revealedSeed: true,
    lines: [
      { speaker: "northern", text: cite(town, northern, kevin) },
      {
        speaker: "kevin",
        text: "I need help, and I need to make some money. If you can hold a shift on the floor, the cafe till will pay you. Who I am — that is the same question as where I came from, and it stays off the menu.",
      },
      {
        speaker: "northern",
        text: "A shift is a plan. I am in. Pay me when the hours are real, not in stories.",
      },
    ],
    relationships: [
      {
        owner: "kevin",
        about: "northern",
        delta: 1,
        note: "He said yes to the work without asking me to perform a past.",
      },
      {
        owner: "northern",
        about: "kevin",
        delta: 1,
        note: "Kevin needs help and a wage. I took the shift. I did not get his whole story, and I did not push.",
      },
    ],
    favor: null,
    thread: {
      owner: "northern",
      action: "open",
      text: "Work the cafe shift Kevin offered and get paid from the till.",
    },
    notice: null,
    project: {
      owner: "northern",
      action: "start",
      kind: "shift",
      place: "cafe",
      text: "Work a shift at Hobbs Cafe for a wage from the till.",
    },
    replan: [
      {
        id: "northern",
        blocks: [
          { from: 16, to: 20, place: "cafe", spot: "out", status: "on a cafe shift, earning it" },
          {
            from: 20,
            to: 24,
            place: "dorms",
            spot: "home",
            status: "back in the dorms, the shift still in his shoulders",
          },
        ],
      },
    ],
  };
}

function talkTab(town: Town): MindResult {
  const baba = agentById(town, "baba");
  const northern = agentById(town, "northern");
  return {
    kind: "talk",
    mind: "offline",
    a: "baba",
    b: "northern",
    lines: [
      { speaker: "northern", text: cite(town, northern, baba) },
      {
        speaker: "baba",
        text: `Grocery, ${formatClock(town.minute)}. I heard you. Bread and apples, on a tab of 2. I will remember. Friendship does not pay it.`,
      },
      {
        speaker: "northern",
        text: "Two, then. I will pay it when the cafe shift pays me. Write it as a debt, not a favor with a smile.",
      },
    ],
    relationships: [
      {
        owner: "baba",
        about: "northern",
        delta: 0,
        note: "He owes 2 for bread and apples. Polite. Still a tab.",
      },
      {
        owner: "northern",
        about: "baba",
        delta: 1,
        note: "She let me eat on a tab of 2 and did not pretend it was kindness without a number.",
      },
    ],
    favor: {
      action: "offer",
      from: "northern",
      to: "baba",
      amount: 2,
      text: "Bread and apples, to be paid back.",
    },
    thread: null,
    notice: null,
    project: null,
  };
}

function talkGeneric(town: Town, a: Agent, b: Agent): MindResult {
  const place = placeTitle(zoneAt(a.tile.x, a.tile.y));
  const owed = (town.favors ?? []).find(
    (f) => f.status === "owed" && ((f.from === a.id && f.to === b.id) || (f.from === b.id && f.to === a.id)),
  );
  const till = town.tills?.cafe === 0 ? "Hobbs" : town.tills?.grocery === 0 ? "the grocery" : "";
  const held = holds(a) || holds(b);
  const player = town.agents.find((a) => a.id === "player");
  const lastToYou = player
    ? [...a.memories].reverse().find((m) => m.type === "chat" && m.text.includes(player.name))
    : undefined;
  const follow = owed
    ? `The tab is still open: ${owed.text}. I am not pretending it was paid.`
    : lastToYou
      ? `Last time with ${player?.name}, what stayed was: ${clip(lastToYou.text, 90)}.`
      : till
        ? `The till at ${till} is empty. A shift there will not pay until tomorrow.`
        : held
          ? "What Kevin asked is still who he is, not a place. I am not pinning it again."
          : `${periodName(town.minute)} can keep the rest. I am not closing anything.`;
  return {
    kind: "talk",
    mind: "offline",
    a: a.id,
    b: b.id,
    lines: [
      { speaker: a.id, text: compose(town, a, b) },
      { speaker: b.id, text: compose(town, b, a) },
      { speaker: a.id, text: `We are still in the ${place}. ${follow}` },
    ],
    relationships: [
      {
        owner: a.id,
        about: b.id,
        delta: 0,
        note: owed ? `We spoke, and the tab still stands: ${clip(owed.text, 80)}.` : `We spoke in the ${place}. Nothing was settled.`,
      },
      {
        owner: b.id,
        about: a.id,
        delta: 0,
        note: `We spoke in the ${place} at ${formatClock(town.minute)}. I am still thinking about it.`,
      },
    ],
    favor: null,
    thread: null,
    notice: null,
    project: null,
  };
}

function offlinePlayer(town: Town, id: AgentId, text: string): MindResult {
  ensureLists(town);
  const agent = agentById(town, id);
  const player = agentById(town, "player");
  const place = placeTitle(zoneAt(agent.tile.x, agent.tile.y));
  const mem = quote(town, agent, `${text} ${player.name} ${place}`);
  const thread = openThreadText(agent);
  const clock = formatClock(town.minute);
  const probing = /who are you|who is he|who he is|who you are|man under|where (?:did|do) you come|came from|your story|origin|need(?:s)? help with who/i.test(text);
  let reply = compose(town, agent, player);
  let revealed = false;
  if (agent.id === "kevin" && probing) {
    reply = `${reply} You asked, so I will not dodge it. I want to find out who I am. Where I came from is that same question — not a town, the man under the apron. I need to know where I am going, and how to make some money. I will need friends and help.`;
    revealed = true;
  } else if (agent.id === "kevin") {
    reply = `${reply} I am not putting the private part on the counter. Not for a stranger's first question. Stay, if you mean to.`;
  } else if (probing && holds(agent)) {
    reply = `${reply} Since you asked: Kevin needs help. He does not know who he is. Where he came from was never a place, and he has to make some money. That much traveled.`;
  } else if (!town.notices.length && agent.id === "arwyn") {
    reply = `${reply} If you can switch a mind on, do. Until then I am only this place, this hour, and what I already retrieved.`;
  }
  const wantsBread = agent.id === "baba" && /\b(bread|apples?|food|eat|buy)\b/i.test(text);
  const alreadyOwes = (town.favors ?? []).some((f) => f.from === "player" && f.to === "baba" && f.status === "owed");
  const introducing = /\bintroduc/i.test(text) && (agent.id === "kevin" || agent.id === "northern");
  if (wantsBread && alreadyOwes) {
    reply = `${reply} You already owe me for bread. I am not opening a second tab.`;
  } else if (wantsBread) {
    reply = `${reply} Bread is 2. I will write it as a tab. Pay it when you have it.`;
  } else if (introducing) {
    reply = `${reply} All right. I will remember that you introduced us. That is not the same as knowing him.`;
  }
  return {
    kind: "player",
    mind: "offline",
    agentId: id,
    playerText: text,
    reply,
    delta: text.trim().length > 1 ? 1 : 0,
    note: clip(`${player.name} said: ${text}`, 160),
    favor: wantsBread && !alreadyOwes ? { action: "offer", from: "player", to: "baba", amount: 2, text: "Bread, to be paid back." } : null,
    thread: introducing
      ? { owner: agent.id, action: "open" as const, text: `${player.name} introduced Northern and Kevin. It is not friendship yet.` }
      : null,
    notice: null,
  };
}

export function beatLabel(town: Town, id: AgentId): string {
  const agent = agentById(town, id);
  return `${placeTitleOf(beatAt(agent, town.minute).place)} — ${agent.status}`;
}
