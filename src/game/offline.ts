import type { Agent, AgentId, Block, MindResult, ThinkJob, ThreadEdit, Town } from "./types";
import { BABA_LOAF } from "./effects";
import { agentById, absMinute } from "./memory";
import { characterProfile, type DiscussionTopic } from "./characters";
import { everydayReply, recentBreadGreeting, recentCafePaymentGreeting } from "./local-dialogue";
import { promptMemories } from "./retrieval";
import { beatAt } from "./plan";
import { localReflections } from "./reflections";
import { clip, formatClock, mentionsSeed } from "./text";
import { placeTitle, placeTitleOf, zoneAt } from "./world";
import { residentLibraryReply, residentReadingReply } from "./community";
import { fundedWorkSummary } from "./funded-work";
import type { FundedTown } from "./economy-types";

export function prepareRetrievals(town: Town, job: ThinkJob) {
  const ids: AgentId[] =
    job.kind === "plan"
      ? planIds(town, job)
      : job.kind === "reflect"
        ? job.agents
        : job.kind === "talk"
          ? [job.a, job.b]
          : [job.agentId];
  for (const id of ids) {
    const agent = agentById(town, id);
    promptMemories(town, agent, job);
  }
}

function planIds(town: Town, job: Extract<ThinkJob, { kind: "plan" }>): AgentId[] {
  const requested = (job as typeof job & { agents?: AgentId[] }).agents;
  const residents = town.agents.filter((agent) => agent.id !== "player").map((agent) => agent.id);
  return requested ? residents.filter((id) => requested.includes(id)) : residents;
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
  // Unavailable inference is not permission to author an NPC decision or speech.
  if (job.kind === "act") throw new Error("Physical decisions require available AI");
  ensureLists(town);
  prepareRetrievals(town, job);
  if (job.kind === "plan") return offlinePlan(town, job.weekly, planIds(town, job));
  if (job.kind === "reflect") return offlineReflect(town, job.agents, job.weekly);
  if (job.kind === "talk") return offlineTalk(town, job.a, job.b);
  return offlinePlayer(town, job.agentId, job.text);
}

function offlinePlan(town: Town, weekly: boolean, ids: AgentId[]): MindResult {
  const plans = ids.map((id) => {
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
    if (
      id === "northern" &&
      agent.projects.some((p) => p.kind === "shift" && p.status === "open")
    ) {
      want = "I want the cafe shift to become money, not another story I tell in the dorms.";
      summary = "Show up for the cafe shift and do not spend the wage before it exists.";
    }
    if (id === "sub" && known) {
      summary =
        "Turn the cafe conversation into a page, and try — this once — not to sand it into a better lie.";
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
      : "Right now I am still the one who reads a life before I interrupt it.";
  }
  if (agent.id === "northern") {
    return known
      ? "Right now I am a student who was introduced, and still counts the till before the lecture."
      : "Right now I am a student who will follow a paying plan further than a lecture.";
  }
  if (agent.id === "baba") {
    return "Right now I am the ledger, and I have not agreed to become the story.";
  }
  if (agent.id === "sub") {
    return known
      ? "Right now I am a writer who already bent someone's confession and has not decided to unbend it."
      : "Right now I am still sanding other people's days until they fit a page.";
  }
  return characterProfile(agent.id).reflection;
}

function offlineReflect(town: Town, ids: AgentId[], weekly: boolean): MindResult {
  return {
    kind: "reflect",
    mind: "offline",
    agents: ids.map((id) => {
      const agent = agentById(town, id);
      return {
        id,
        reflections: localReflections(town, agent),
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
    !agentById(town, "northern").projects.some((p) => p.kind === "shift" && p.status === "open") &&
    !agentById(town, "northern").threads.some(
      (thread) => thread.open && thread.text.startsWith("Cafe work is pending a funded agreement"),
    )
  ) {
    return talkNorthern(town);
  }
  if (
    pair.has("kevin") &&
    pair.has("northern") &&
    [a, b].some(
      (agent) =>
        (agent.threads ?? []).some((t) => /introduced/i.test(t.text)) ||
        (agent.memories ?? []).some((m) => /introduced/i.test(m.text)),
    )
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
      {
        speaker: "northern",
        text: cite(town, agentById(town, "northern"), agentById(town, "kevin")),
      },
      {
        speaker: "kevin",
        text: `The new resident introduced us in the ${place}. I am not calling that friendship. I am calling it a name I can use.`,
      },
      {
        speaker: "northern",
        text: "I will take the introduction. A shift still pays better than a hello.",
      },
    ],
    relationships: [
      {
        owner: "kevin",
        about: "northern",
        delta: 1,
        note: "We were introduced. That is a start, not a debt.",
      },
      {
        owner: "northern",
        about: "kevin",
        delta: 1,
        note: "Someone introduced us. I still need the shift.",
      },
    ],
    favor: null,
    thread: null,
    notice: null,
    project: null,
  };
}

function compose(town: Town, speaker: Agent, other: Agent): string {
  const owed = (town.favors ?? []).find(
    (f) =>
      f.status === "owed" &&
      ((f.from === speaker.id && f.to === other.id) ||
        (f.from === other.id && f.to === speaker.id)),
  );
  if (owed)
    return owed.from === speaker.id
      ? `I still owe you ${owed.amount} for ${clip(owed.text, 90)}. I have not paid it yet.`
      : `Your tab with me is still ${owed.amount}: ${clip(owed.text, 90)}.`;
  const lines = characterProfile(speaker.id).greetings;
  return lines[Math.abs(town.day + Math.floor(town.minute / 60)) % lines.length]!;
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
        note: "He listened when I said I do not know who I am, and he did not turn it into a place.",
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
        : {
            author: "sub",
            text: "A note I am not sure I should have pinned: he needs help with who he is. The buried fortune was mine, not his.",
          },
  };
}

function talkNorthern(town: Town): MindResult {
  const kevin = agentById(town, "kevin");
  const northern = agentById(town, "northern");
  const work = (town as FundedTown).economy?.work ? fundedWorkSummary(town, "northern") : null;
  const agreement = work?.agreements.find(
    (item) =>
      item.payer === "till:cafe" &&
      item.kind === "cafe-shift" &&
      item.status === "active" &&
      work.holds.some((hold) => hold.id === item.holdId && hold.remaining >= item.fee),
  );
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
        text: `I need help with who I am, and I still have to earn a living. ${agreement ? `Your existing cafe agreement reserves ${agreement.fee} for ${agreement.requiredMinutes} eligible minutes; ${agreement.eligibleMinutes} are recorded.` : "A paying shift needs a funded agreement first. We have not made one by talking."}`,
      },
      {
        speaker: "northern",
        text: agreement
          ? "I will rely on the recorded agreement and attendance, not count a wage before it is paid."
          : "Then leave the work pending. I am interested, but I have not taken a shift or earned a promised wage.",
      },
    ],
    relationships: [],
    favor: null,
    notice: null,
    project: null,
    replan: [],
    thread: agreement
      ? null
      : {
          owner: "northern",
          action: "open",
          text: "Cafe work is pending a funded agreement; no shift or wage is accepted by this discussion.",
        },
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
        note: "He let me eat on a tab of 2 and did not pretend it was kindness without a number.",
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
    (f) =>
      f.status === "owed" &&
      ((f.from === a.id && f.to === b.id) || (f.from === b.id && f.to === a.id)),
  );
  return {
    kind: "talk",
    mind: "offline",
    a: a.id,
    b: b.id,
    lines: [
      { speaker: a.id, text: compose(town, a, b) },
      { speaker: b.id, text: owed ? compose(town, b, a) : characterProfile(b.id).publicInfo },
    ],
    relationships: [
      {
        owner: a.id,
        about: b.id,
        delta: 0,
        note: owed
          ? `We spoke, and the tab still stands: ${clip(owed.text, 80)}.`
          : `We spoke in the ${place}. Nothing was settled.`,
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

function discussionTopic(text: string): DiscussionTopic | null {
  if (
    /\b(?:energy|electricity|solar|renewables?|wind power|power grid|batter(?:y|ies)|fuel|decarboni[sz]\w*)\b/i.test(
      text,
    )
  )
    return "energy";
  if (
    /\b(?:education|educat\w*|school\w*|teach\w*|learn\w*|lesson\w*|curriculum|tuition|literacy|studying)\b/i.test(
      text,
    )
  )
    return "education";
  return null;
}

function followup(text: string): boolean {
  return /^(?:(?:and|but|so)\s+)?(?:why(?: is that)?|how(?: so| would (?:that|it) work)?|tell me more|go on|what (?:do you mean|next|about (?:that|the cost|costs?|funding|access|a test))|how (?:much|would we (?:test|fund|start))|can you (?:explain|give (?:me )?an example)|where (?:do we|should we|to) start)[?!.\s]*$/i.test(
    text.trim(),
  );
}

function previousTopic(town: Town, agent: Agent): DiscussionTopic | null {
  // Only the latest exchange with this player supplies the subject of "why?".
  // An older unrelated conversation must not silently become today's subject.
  const previous = [...agent.memories]
    .reverse()
    .find((memory) => memory.type === "chat" && memory.with === "player");
  if (!previous || previous.seed || mentionsSeed(previous.text)) return null;
  const age = absMinute(town.day, town.minute) - absMinute(previous.day, previous.minute);
  if (age < 0 || age > 180) return null;
  const turns = (previous as typeof previous & { turns?: { speaker: AgentId; text: string }[] })
    .turns;
  if (Array.isArray(turns)) {
    const question = [...turns]
      .reverse()
      .find((turn) => turn.speaker === "player" && typeof turn.text === "string");
    const topic = question ? discussionTopic(question.text) : null;
    if (topic) return topic;
    // A second follow-up may rely on the resident's immediately preceding answer.
    if (question && !followup(question.text)) return null;
    const answer = [...turns]
      .reverse()
      .find((turn) => turn.speaker === agent.id && typeof turn.text === "string");
    if (!answer) return null;
    const inferred = discussionTopic(answer.text);
    if (inferred) return inferred;
    const profile = characterProfile(agent.id);
    return (
      (["education", "energy"] as const).find(
        (topic) => answer.text === profile[topic].answer || answer.text === profile[topic].followup,
      ) ?? null
    );
  }
  // A legacy exchange has no reliable speaker attribution. It can suggest a topic,
  // but is never presented as a verified fact or quoted as the player's exact words.
  return discussionTopic(previous.text);
}

function publicReply(
  town: Town,
  agent: Agent,
  text: string,
  topic: DiscussionTopic | null,
): string {
  const profile = characterProfile(agent.id);
  if (topic) {
    if (
      /\b(?:latest|current|today's|live|right now|202\d)\b/i.test(text) &&
      /\b(?:price|cost|research|news|statistic|figure|data)\w*\b/i.test(text)
    ) {
      return `I do not have a current external source for those ${topic} figures. ${profile[topic].followup}`;
    }
    return followup(text) ? profile[topic].followup : profile[topic].answer;
  }
  if (/\b(?:what time|time is it|what day|which day)\b/i.test(text))
    return `It is ${formatClock(town.minute)} on day ${town.day}.`;
  if (/\b(?:where|find|directions|which way)\b/i.test(text)) {
    if (/\b(?:cafe|hobbs|kevin)\b/i.test(text))
      return "Hobbs Cafe is west of the plaza. Kevin runs it; I cannot promise where he is at this moment.";
    if (/\b(?:library|arwyn|data|amelia)\b/i.test(text))
      return "The library is east of the plaza. Arwyn works with its records; try there for research, though I cannot promise who is there now.";
    if (/\b(?:grocery|shop|baba)\b/i.test(text))
      return "The grocery is southwest of the plaza, across the main street. Baba works there.";
    if (/\b(?:dorms?|college|northern)\b/i.test(text))
      return "The college dorms are in the northwest of town. Northern is a student there.";
    if (/\b(?:park|sub)\b/i.test(text))
      return "The park is south of the plaza. Sub sometimes writes there; that is a place to try, not a live location.";
    if (/\b(?:noticeboard|board)\b/i.test(text))
      return "The noticeboard stands in the plaza just east of the cafe entrance.";
    if (/\b(?:we|here|am i|are you)\b/i.test(text))
      return `I am in ${placeTitle(zoneAt(agent.tile.x, agent.tile.y))}.`;
  }
  if (
    /\b(?:who are you|your (?:name|role|job)|what do you do|tell me about yourself)\b/i.test(text)
  )
    return profile.publicInfo;
  if (
    /\b(?:who is kevin|kevin's (?:story|secret|past)|who he is|where he came|man under|kevin.*origin)\b/i.test(
      text,
    )
  )
    return "Kevin runs Hobbs. His personal story is his to tell; you can ask him if he wants to talk about it.";
  if (/\b(?:what can i do|how (?:do i|to) (?:play|start)|help me get started)\b/i.test(text))
    return "Visit Hobbs, talk to residents, or explore the library and noticeboard. If you want bread or a shift, read the offered terms and choose an action; a conversation by itself does not commit you.";
  if (
    /\b(?:ai|artificial intelligence|machine learning|technology|blockchain|bitcoin)\b/i.test(text)
  ) {
    if (String(agent.id) === "data")
      return "I would define the task and a test before choosing a technology. For an AI system, compare its answers with known examples, record failures and check whether it knows when to say it is uncertain.";
    if (String(agent.id) === "amelia")
      return "I would ask what the technology costs, whose problem it solves and who benefits. Calling something decentralized or intelligent does not establish its value.";
    if (agent.id === "kevin")
      return "Start with the problem the technology should solve, then test a small version. I cannot access an external network or verify an online service from here.";
    return "That is outside my expertise. Data may help with a testable technical question; I would want evidence before trusting a claim.";
  }
  if (/\b(?:economics?|budget|funding|incentives?|inflation)\b/i.test(text)) {
    if (String(agent.id) === "amelia")
      return "Start by listing the available funds, the cost of each promised task and who receives the benefit. Reserve the money before offering paid work; an expected contribution is not money already available.";
    return "A budget needs actual funding before anyone promises a wage. Amelia can help examine the costs and incentives; I cannot approve spending through a conversation.";
  }
  if (/\b(?:hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text))
    return compose(town, agent, agentById(town, "player"));
  if (/\b(?:thank you|thanks|cheers)\b/i.test(text))
    return "You are welcome. Let me know if there is another part you want to discuss.";
  if (/\b(?:how are you|how's (?:it|your day))\b/i.test(text)) return profile.reflection;
  if (/\b(?:shut up|hate you|idiot|stupid)\b/i.test(text))
    return "We can disagree. Tell me the question you want answered, and I will try to be useful.";
  if (followup(text))
    return "Which part do you mean? Name the idea or question and I can be more specific.";
  return `I do not have a clear answer to that. I can help with ${profile.specialties.slice(0, 2).join(" and ")}; what part would you like to explore?`;
}

function offlinePlayer(town: Town, id: AgentId, text: string): MindResult {
  ensureLists(town);
  const agent = agentById(town, id);
  const player = agentById(town, "player");
  const probing =
    /who are you|who you are|man under|where (?:did|do) you come|your (?:story|past|origins?)|who is kevin|kevin's (?:story|past|origins?)/i.test(
      text,
    );
  const topic = discussionTopic(text) ?? (followup(text) ? previousTopic(town, agent) : null);
  const everyday = topic ? null : everydayReply(town, agent, text);
  let reply = publicReply(town, agent, text, topic);
  if (agent.id === "kevin" && probing && !topic) {
    reply =
      "I run Hobbs, but I still want to find out who I am — the man under the apron, not a place I came from. I am willing to talk about it, if you mean to listen.";
  }
  const debt = town.favors.find((f) => f.from === "player" && f.to === id && f.status === "owed");
  const carrying = (player.projects ?? []).find(
    (p) =>
      p.owner === "player" && p.kind === "other" && p.status === "open" && p.text === BABA_LOAF,
  );
  const ateLoaf = (player.projects ?? []).some(
    (p) =>
      p.owner === "player" && p.kind === "other" && p.status === "done" && p.text === BABA_LOAF,
  );
  const wantsLoaf =
    /\b(?:buy|purchase|get|receive|take|want|need|like|sell)\b.*\b(?:loaf|bread)\b/i.test(text);
  const asksAboutEating = !topic && /\b(?:eat|eating|consume|loaf)\b/i.test(text) && !wantsLoaf;
  if (asksAboutEating) {
    reply = carrying
      ? "You are carrying a loaf. Choose Eat loaf below when you want to eat it. The tab stays open until paid; talking does not consume the loaf."
      : "You are not carrying a loaf.";
  } else if (everyday) {
    reply = everyday;
  } else if (
    agent.id === "baba" &&
    !topic &&
    /\b(?:bread|loaf|apples?|food|tab|debt|pay|repay|settle|owe)\b/i.test(text)
  ) {
    reply = debt
      ? `Your tab is still ${debt.amount}: ${debt.text} Talking does not pay it. Use the quoted payment action when you choose.`
      : "Bread is 2 on a tab, with one loaf to eat. Read the terms below and choose Accept if you want it. Asking or refusing does not buy anything.";
  } else if (
    agent.id === "kevin" &&
    !probing &&
    !topic &&
    /^(?:hello|hi|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(text.trim())
  ) {
    const paid = recentCafePaymentGreeting(town);
    if (paid) reply = `${reply} ${paid}`;
  } else if (
    agent.id === "baba" &&
    !probing &&
    !topic &&
    /^(?:hello|hi|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(text.trim())
  ) {
    const bread = recentBreadGreeting(town);
    if (bread && !reply.includes(bread)) reply = `${reply} ${bread}`;
  }
  if (
    !topic &&
    !debt &&
    /\b(?:inspect (?:my |the )?tab|owe (?:you|me)|pay (?:you|my|the tab)|repay|settle (?:my |the )?(?:tab|debt))\b/i.test(
      text,
    ) &&
    !everyday &&
    !asksAboutEating
  )
    reply = "There is no open tab between us. Nothing to pay.";
  if (agent.id === "baba" && debt && !asksAboutEating && !topic && !everyday) {
    if (carrying) reply = `${reply} You are carrying the loaf. The tab is ${debt.amount}.`;
    else if (ateLoaf) reply = `${reply} You ate the loaf. You still owe ${debt.amount}.`;
  }
  const asksReading =
    /\b(?:(?:the|your|our|northern['’]s) (?:first )?reading|first[- ]page|(?:park|library) (?:reading|gathering))\b/i.test(
      text,
    );
  const asksProject =
    /\b(?:library (?:project|index|check|result)|index|catalogue|catalog|my (?:contribution|check)|what changed since yesterday|what happened (?:with|at|to) (?:the )?library)\b/i.test(
      text,
    );
  if (!topic && !everyday && asksReading)
    reply =
      residentReadingReply(town, id) ??
      "I have not learned what happened with the reading. The library project board has its invitation and recorded outcome.";
  else if (!topic && !everyday && asksProject)
    reply =
      residentLibraryReply(town, id) ??
      "I have not learned what happened with the library project. The public project board has its recorded progress and terms.";
  else if (
    !topic &&
    /^(?:hello|hi|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(text.trim())
  ) {
    const known = residentLibraryReply(town, id);
    if (known) reply = `${reply} ${known}`;
  }
  return {
    kind: "player",
    mind: "offline",
    agentId: id,
    playerText: text,
    reply,
    delta: 0,
    note: clip(`${player.name} said: ${text}`, 160),
    favor: null,
    project: null,
    thread: null,
    notice: null,
  };
}

export function beatLabel(town: Town, id: AgentId): string {
  const agent = agentById(town, id);
  return `${placeTitleOf(beatAt(agent, town.minute).place)} — ${agent.status}`;
}
