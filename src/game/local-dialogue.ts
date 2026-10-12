import type { Agent, Memory, Town } from "./types";
import { memorySource } from "./conversation";
import { BABA_LOAF, PLAYER_CAFE_SHIFT, playerActions } from "./effects";
import { absMinute, agentById } from "./memory";
import { formatClock, mentionsSeed } from "./text";
import { placeTitle } from "./world";

type Intent = "wages" | "work" | "money" | "stock" | "help" | "invitation";
type Exchange = { question: string; answer: string };

const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").trim();

/** These are supported local topics, not a claim to understand arbitrary prose. */
function intentOf(raw: string): Intent | null {
  const text = normalize(raw);
  if (
    /\b(?:wages?|salary|paychecks?|paydays?|earnings)\b/.test(text) ||
    /\b(?:have i been|was i|am i|did i get|when (?:am|was|will) i (?:be|get)|haven't been|not been) paid\b/.test(
      text,
    ) ||
    /\bwhen (?:do|will|can|did) i (?:get|be) paid\b/.test(text) ||
    /^(?:please )?pay me\b/.test(text) ||
    /\b(?:haven't|have not|hasn't|has not) paid me\b/.test(text) ||
    /\b(?:have|did|will|can) you (?:pay|paid) me\b/.test(text) ||
    /\b(?:paid|payment|pay|money)\b.*\b(?:shift|work|earned)\b/.test(text) ||
    /\b(?:shift|work)\b.*\b(?:paid|payment|pay)\b/.test(text)
  )
    return "wages";
  // Existing tab/payment dialogue owns these requests, even when phrased as
  // asking for help or having enough money. Discussing a payment never makes it.
  if (/\b(?:tab|debt|repay|settle|owe (?:you|me)|pay you)\b/.test(text)) return null;
  if (
    /\b(?:help (?:you|me|out)|give you (?:a |some )?help|(?:need|want|use) (?:some |any |your |a )?(?:help|hand)|(?:can|could|would|may|will) (?:i|you) help|anything i can do|what can i do for you|how can i help)\b/.test(
      text,
    )
  )
    return "help";
  if (
    /\b(?:coffee|a drink|a chat)\b/.test(text) &&
    /\b(?:join|meet|come|go|grab|have|fancy|want|like|together|let's|invite)\b/.test(text)
  )
    return "invitation";
  if (/\b(?:join me|come with me|meet me|let's meet|meet (?:at|in|by))\b/.test(text))
    return "invitation";
  if (
    !/\byour (?:job|role)\b/.test(text) &&
    (/\b(?:shifts?|jobs?|earn|(?:need|want|find|offer|some|for|i|to|paid) work|work (?:here|for|at)|(?:quit|cancel|stop|leave) (?:my |the |this )?work)\b/.test(
      text,
    ) ||
      /^(?:please )?(?:i )?(?:quit|cancel)[!.\s]*$/.test(text))
  )
    return "work";
  if (
    !/\b(?:stock market|stocks and shares|share price|bread|apples?|food|tab|debt)\b/.test(text) &&
    /\b(?:stock|inventory|supplies|restock\w*|what (?:do you|does the shop) (?:sell|have)|what(?:'s| is) (?:in|at) (?:the |your )?shop)\b/.test(
      text,
    )
  )
    return "stock";
  if (
    /\b(?:money|coins?|broke|income|afford)\b/.test(text) &&
    !/\b(?:tab|debt|owe|repay|settle)\b/.test(text)
  )
    return "money";
  return null;
}

function isFollowup(text: string): boolean {
  return /^(?:(?:and|but|so)\s+)?(?:why(?: is that)?|how(?: so| much| long| would (?:that|it) work)?|tell me more|go on|what (?:do you mean|next|would (?:that|it) (?:take|cost|mean)|about (?:that|it|the cost|costs?|a test|today|yesterday))|today|yesterday|(?:would|will) what (?:take|cost)|what do (?:i|we) do|how can (?:i|we) (?:do that|help)|can you (?:explain|give (?:me )?an example)|where (?:do we|should we|to) start|yes(?: please)?|no(?: thanks| thank you)?|not (?:that|now|today)|that(?:'s| is) (?:what i meant|not what i meant)|(?:(?:i )?(?:just )?thought )?(?:it|that) (?:could|would|might) .{1,90})[?!.\s]*$/i.test(
    normalize(text),
  );
}

function latestExchange(town: Town, agent: Agent): Exchange | null {
  const recent = agent.memories
    .filter((memory) => memory.type === "chat" && memory.with === "player")
    .sort((a, b) => a.day - b.day || a.minute - b.minute)
    .slice(-3)
    .reverse();
  let latest: Exchange | null = null;
  for (const memory of recent) {
    const age = absMinute(town.day, town.minute) - absMinute(memory.day, memory.minute);
    if (memory.seed || mentionsSeed(memory.text) || age < 0 || age > 180) break;
    // Only attributed turns establish what the player offered or refused. Walk
    // at most three exchanges, and only through uninterrupted short follow-ups.
    const turns = memory.turns ?? [];
    if (turns.some((turn) => mentionsSeed(turn.text))) break;
    const question = [...turns].reverse().find((turn) => turn.speaker === "player");
    const answer = [...turns].reverse().find((turn) => turn.speaker === agent.id);
    if (!question || !answer) break;
    latest ??= { question: question.text, answer: answer.text };
    if (intentOf(question.text)) return { question: question.text, answer: latest.answer };
    if (!isFollowup(question.text)) break;
  }
  return latest;
}

function previousIntent(exchange: Exchange | null): Intent | null {
  if (!exchange) return null;
  // A bad generic answer must not erase the question it failed to answer.
  const intent = intentOf(exchange.question);
  if (intent) return intent;
  // Follow-up chains may use the last answer; a new unrelated question breaks them.
  if (!isFollowup(exchange.question)) return null;
  // The opening subject is safer than a secondary suggestion such as "ask
  // Kevin about paid work" at the end of an answer to an offer of help.
  const subject = exchange.answer.split(/[.!?]/, 1)[0];
  if (/\b(?:coffee|invitation|meeting|a chat)\b/i.test(subject)) return "invitation";
  if (/\b(?:help|specific task|question together)\b/i.test(subject)) return "help";
  return intentOf(subject);
}

function refusing(raw: string): boolean {
  const text = normalize(raw);
  return (
    /^(?:no(?: thanks| thank you)?|not (?:now|today|that))[?!.\s]*$/.test(text) ||
    /\b(?:not interested|no thanks)\b/.test(text) ||
    /\b(?:don't|do not|won't|will not|can't|cannot) (?:(?:want|need|wish|intend)(?: to)? )?(?:you to )?(?:a |any |your |the )?(?:help|work|take|accept|start|join|meet|come|go|coffee|job|shift|drink)\b/.test(
      text,
    )
  );
}

function cafeShift(town: Town) {
  return agentById(town, "player").projects.find(
    (project) =>
      project.owner === "player" &&
      project.kind === "shift" &&
      project.status === "open" &&
      (project.place ?? "cafe") === "cafe",
  );
}

function shiftReply(town: Town, agent: Agent, text: string): string {
  const shift = cafeShift(town);
  const keeping =
    /\b(?:don't|do not|won't|will not) (?:want to )?(?:quit|cancel|stop|leave)\b/i.test(text);
  const declining = refusing(text) && !keeping;
  const prefix = keeping
    ? shift
      ? "Understood; you want to keep your agreement. "
      : "You have no cafe shift to cancel. "
    : declining
      ? "Understood; I will not treat that as accepting or cancelling work. "
      : "";
  if (agent.id !== "kevin")
    return `${prefix}Ask Kevin at Hobbs about the cafe shift: 16:00–19:00 each day, 5 after three game hours on the floor if the till can pay. He has the current terms and availability; I cannot offer you a paid job here.`;
  if (shift) {
    const hours =
      shift.text === PLAYER_CAFE_SHIFT
        ? "Your cafe shift is open, 16:00–19:00 each day until cancelled."
        : "Your cafe shift is open; its agreed hours are in your timetable.";
    return `${prefix}${hours} Today you have ${Math.round(agentById(town, "player").shiftHours * 60)} worked minutes recorded. Three game hours earn 5 if the till can pay. Unpaid hours reset at midnight. Use Cancel cafe shift below to end the agreement; talking does not change it.`;
  }
  if (/\b(?:quit|cancel|stop|leave)\b/i.test(text))
    return "You have no open cafe shift to cancel. This conversation has not changed any agreement.";
  const offer = playerActions(town, "kevin").find((action) =>
    action.label.startsWith("Accept cafe shift"),
  );
  return `${prefix}The cafe shift is 16:00–19:00 each day until cancelled, for 5 after three game hours on the floor if the till can pay. ${offer?.disabledReason ? `${offer.disabledReason} ` : ""}Read the terms below and choose Accept to take it. Talking alone commits you to nothing.`;
}

function wageReceipts(town: Town, workplace: "cafe" | "grocery"): Memory[] {
  const line = `${placeTitle(workplace)} paid me ${workplace === "cafe" ? 5 : 4} for a shift I actually worked.`;
  return agentById(town, "player")
    .memories.filter(
      (memory) =>
        memory.type === "favor" &&
        memorySource(memory) === "event" &&
        memory.text === line &&
        absMinute(memory.day, memory.minute) <= absMinute(town.day, town.minute),
    )
    .sort((a, b) => a.day - b.day || a.minute - b.minute);
}

/** Wage evidence comes from the worker's engine receipts, never conversational claims. */
function wageReply(town: Town, agent: Agent, text: string): string {
  const workplace = agent.id === "kevin" ? "cafe" : agent.id === "baba" ? "grocery" : null;
  if (!workplace)
    return "Ask Kevin about cafe wages, or Baba about grocery wages. The employer and your recorded work determine payment; I cannot pay you through a conversation.";
  const player = agentById(town, "player");
  const receipts = wageReceipts(town, workplace);
  const requestedDay = /\byesterday\b/i.test(text) ? town.day - 1 : town.day;
  const receipt = [...receipts].reverse().find((memory) => memory.day === requestedDay);
  const last = receipts.at(-1);
  const amount = workplace === "cafe" ? 5 : 4;
  const paidLine = (memory: Memory) =>
    `${placeTitle(workplace)} paid you ${amount} on day ${memory.day} at ${formatClock(memory.minute)} for a completed shift.`;
  const evidence = receipt
    ? paidLine(receipt)
    : `I have no ${placeTitle(workplace)} wage receipt for day ${requestedDay}.${last ? ` The latest receipt says: ${paidLine(last)}` : ""}`;
  const shift = player.projects.find(
    (project) =>
      project.owner === "player" &&
      project.kind === "shift" &&
      project.status === "open" &&
      (project.place ?? "cafe") === workplace,
  );
  let status = shift
    ? `Your ${workplace} shift is still open${shift.text === PLAYER_CAFE_SHIFT ? ", 16:00–19:00 daily" : "; check its hours in your timetable"}.`
    : `You have no open ${workplace} shift agreement.`;
  if (requestedDay === town.day && !receipt && shift) {
    const minutes = Math.round(player.shiftHours * 60);
    status += ` Today has ${minutes} worked minutes recorded; the full wage of ${amount} needs 180.`;
    if (player.paidToday)
      status +=
        " Today's wage is already marked paid, but I cannot verify this employer's receipt.";
    else if ((town.tills[workplace] ?? 0) < amount)
      status += " The till cannot fund the full wage now.";
    else if (player.money + amount > 999) status += " Your purse cannot hold the full wage now.";
    else if (minutes >= 180)
      status +=
        " Recorded hours alone do not confirm payment; the work rules still have to issue a receipt.";
    status += " Unpaid hours reset at midnight.";
  }
  return `${evidence} ${status} Asking does not pay a second wage.`;
}

function helpReply(agent: Agent, text: string, continuation: boolean): string {
  const requestingHelp =
    /\b(?:help me|i (?:don't |do not )?(?:need|want) (?:some |any |your |a )?help|i need a hand)\b/i.test(
      normalize(text),
    );
  if (refusing(text))
    return requestingHelp
      ? "Understood; I will not press you to take help. We can leave it there."
      : "Understood; no help is expected from you. We can leave it there.";
  if (continuation)
    return "We can talk through a question together. There is no task, duration or payment agreed by this conversation; we would need to name a task before estimating its time. For paid work, ask Kevin about the cafe shift.";
  if (requestingHelp)
    return "What do you need help with: finding a place, earning coins, or discussing an idea? I can explain the available choices.";
  if (agent.id === "kevin")
    return "Thanks for offering to help. If you mean paid work at Hobbs, ask about the cafe shift and read its terms. If you mean something else, tell me what you have in mind; we have not agreed a task.";
  if (agent.id === "baba")
    return "Thanks for offering to help. We could talk through how to check the shop's stock, but I have no recorded restocking job to give you. Did you mean a discussion or paid work?";
  return "Thanks for offering to help. We could talk through a question together. Did you mean a discussion, or are you looking for paid work? I have not set you a task.";
}

/** Returns null for unsupported subjects so the existing topic/consent dialogue remains intact. */
export function everydayReply(town: Town, agent: Agent, text: string): string | null {
  const direct = intentOf(text);
  const continuation = !direct && isFollowup(text);
  const previous = continuation ? latestExchange(town, agent) : null;
  const intent = direct ?? (continuation ? previousIntent(previous) : null);
  switch (intent) {
    case "wages":
      return wageReply(
        town,
        agent,
        continuation && !/\b(?:today|yesterday)\b/i.test(text)
          ? `${previous?.question ?? ""} ${text}`
          : text,
      );
    case "work":
      return shiftReply(town, agent, text);
    case "money":
      return `A cafe shift is one way to earn coins. ${shiftReply(town, agent, text)}`;
    case "stock":
      return agent.id === "baba"
        ? continuation
          ? "For a stock check, start with item names and counts actually observed. I have no recorded quantities to fill in for you. We can discuss what needs checking, but no order or restocking has been completed."
          : "I do not have a tracked stock count or a full inventory to quote. We can discuss checking supplies and deciding what needs restocking. If you mean a particular item, name it and I can explain whether there is an offer for it."
        : "Baba handles the grocery. Ask him about stock or a particular item; I do not have an inventory to quote.";
    case "help":
      return helpReply(agent, text, continuation);
    case "invitation":
      if (refusing(text))
        return "Understood; we can leave the invitation there. No meeting has been arranged.";
      return continuation
        ? "A chat could help us exchange ideas and get to know each other. We can keep talking here; no meeting elsewhere has been arranged."
        : "I would enjoy a coffee and a chat. We can talk here, but I cannot promise to meet you somewhere else or at a particular time.";
    default:
      return null;
  }
}

/** Preserve the useful greeting acknowledgment, now with a dated, employer-bound receipt. */
export function recentCafePaymentGreeting(town: Town): string | null {
  const receipt = wageReceipts(town, "cafe").at(-1);
  return receipt && receipt.day >= town.day - 1
    ? `Hobbs Cafe paid you 5 on day ${receipt.day} at ${formatClock(receipt.minute)} for your shift.`
    : null;
}

/** An open bread tab stays mentionable. A closed one is mentioned only while it is recent. */
export function recentBreadGreeting(town: Town): string | null {
  const player = agentById(town, "player");
  const debt = (town.favors ?? []).find(
    (favor) =>
      favor.from === "player" &&
      favor.to === "baba" &&
      favor.status === "owed" &&
      /bread/i.test(favor.text),
  );
  const carrying = (player.projects ?? []).some(
    (project) =>
      project.owner === "player" && project.status === "open" && project.text === BABA_LOAF,
  );
  if (debt) return null;
  const notes: string[] = [];
  if (carrying) notes.push("You are carrying the loaf.");
  const paid = [...(agentById(town, "baba").memories ?? [])]
    .reverse()
    .find(
      (memory) =>
        memory.type === "favor" &&
        /bread/i.test(memory.text) &&
        / is paid\./i.test(memory.text) &&
        memory.day >= town.day - 1 &&
        absMinute(memory.day, memory.minute) <= absMinute(town.day, town.minute),
    );
  if (paid) notes.push("You paid the bread tab. That one is closed.");
  return notes.join(" ") || null;
}
