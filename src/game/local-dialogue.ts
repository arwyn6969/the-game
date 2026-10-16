import type { Agent, Memory, Town } from "./types";
import {
  memorySource,
  playerWageReceipts as wageReceipts,
  settledPlayerWageTransfers as settledWageTransfers,
} from "./conversation";
import { BABA_LOAF, playerActions } from "./effects";
import { absMinute, agentById } from "./memory";
import { formatClock, mentionsSeed } from "./text";
import { placeTitle } from "./world";
import { characterProfile } from "./characters";
import { beatAt } from "./plan";
import { fundedWorkSummary } from "./funded-work";
import type { FundedTown } from "./economy-types";

type Intent =
  "wages" | "work" | "money" | "stock" | "help" | "invitation" | "day" | "time" | "role";
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
    /\b(?:what(?:'s| is) (?:the )?time|what time is it|tell me the time|what(?:'s| is) (?:the )?(?:game )?day|what day (?:is it|are we on)|which day (?:is it|are we on))\b/.test(
      text,
    )
  )
    return "time";
  if (
    /\b(?:tell me (?:a (?:bit|little) )?about yourself|what (?:do you do|is your (?:job|role))|what(?:'s| is) your (?:job|role)|what brings you here)\b/.test(
      text,
    )
  )
    return "role";
  if (
    /\b(?:what (?:are you|have you been|were you) (?:up to|doing)|what did you do (?:today|yesterday)|any plans (?:for )?(?:today|tomorrow)|what do you have planned|what (?:are|were) your plans|what have you got on|how(?:'s| is|has|was) (?:your|the) day|how are (?:things|you doing)|how(?:'s| is) life|are you (?:okay|ok)|how are you feeling)\b/.test(
      text,
    )
  )
    return "day";
  if (
    /\b(?:help (?:you|me|out)|give you (?:a |some )?help|lend (?:you |me )?(?:a |some )?hand|pitch in|(?:need|want|use|get|have|like) (?:some |any |your |a )?(?:help|hand)|(?:can|could|would|may|will) (?:i|you) help|anything i can do|can i do anything useful|anything that needs doing|what can i do for you|how can i help)\b/.test(
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
    (/\b(?:shifts?|jobs?|earn|hiring|paid opportunity|(?:need|want|find|offer|some|for|i|to|paid) work|work (?:here|for|at)|(?:quit|cancel|stop|leave) (?:my |the |this )?work)\b/.test(
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
    /\b(?:money|coins?|broke|income|afford|my balance|my purse)\b/.test(text) &&
    !/\b(?:tab|debt|owe|repay|settle)\b/.test(text)
  )
    return "money";
  return null;
}

function dayReply(town: Town, agent: Agent, text: string): string {
  if (/\btomorrow\b/i.test(text))
    return "Tomorrow's timetable is not settled yet. Ask me when the new game day starts; I can tell you the plan then.";
  if (/\b(?:yesterday|did you do|have you been|were you|was your day)\b/i.test(text)) {
    const day = /\byesterday\b/i.test(text) ? town.day - 1 : town.day;
    const receipt = [...agent.memories]
      .reverse()
      .find(
        (memory) =>
          memory.day === day &&
          absMinute(memory.day, memory.minute) <= absMinute(town.day, town.minute) &&
          memory.type === "favor" &&
          memorySource(memory) === "event" &&
          /^(?:Hobbs Cafe|Grocery) paid me \d+ for a shift I actually worked\.$/.test(memory.text),
      );
    return receipt
      ? `My completed-work record on day ${receipt.day}, ${formatClock(receipt.minute)} says: ${receipt.text}`
      : `I do not have a completed-activity record for day ${day}. My timetable tells us my intentions; it cannot prove what I finished.`;
  }
  const status = mentionsSeed(agent.status) ? "keeping my ordinary routine" : agent.status;
  const current = beatAt(agent, town.minute);
  const next = agent.plan.beats.find(
    (beat) =>
      beat.hour > Math.floor(town.minute / 60) &&
      (beat.place !== current.place || beat.spot !== current.spot),
  );
  const plan = next
    ? ` I plan to ${next.spot === "home" ? "go home" : `visit ${placeTitle(next.place)}`} at ${formatClock(next.hour * 60)}.`
    : "";
  return `Right now I am ${status}.${plan}`;
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

function fundedPlayerWork(town: Town) {
  return (town as FundedTown).economy?.work ? fundedWorkSummary(town, "player") : null;
}

function fundedShiftReply(town: Town, agent: Agent): string {
  const workplace = agent.id === "kevin" ? "cafe" : agent.id === "baba" ? "grocery" : null;
  if (!workplace)
    return "Ask Kevin at Hobbs about the cafe shift: 16:00–19:00, with 5 reserved before you accept. Ask Baba about any preserved grocery work. Only eligible attendance counts; I cannot give you a paid job through this conversation.";
  const work = fundedPlayerWork(town);
  const payer = `till:${workplace}`;
  const agreement = [...(work?.agreements ?? [])]
    .reverse()
    .find(
      (item) =>
        item.payer === payer &&
        item.kind === "cafe-shift" &&
        ["active", "suspended"].includes(item.status),
    );
  const choices = playerActions(town, agent.id);
  if (agreement) {
    const paused = agreement.status === "suspended";
    const choice = choices.find((item) =>
      (paused ? /resume/i : /cancel|pause|suspend/i).test(item.label),
    );
    return `Your ${workplace} shift is ${paused ? "paused" : "open"}. You have ${agreement.eligibleMinutes} eligible ${workplace} minutes recorded toward ${agreement.requiredMinutes}; the full fee is ${agreement.fee}. Accrued progress and reserved pay survive midnight and interruption.${choice ? ` Use ${choice.label} below when you choose.` : " Read the current choices for its available next step."} Talking does not change the agreement.`;
  }
  const recognition = choices.find((item) => /^Recognise .* work/.test(item.label));
  if (recognition)
    return `${recognition.terms}${recognition.disabledReason ? ` ${recognition.disabledReason}` : ""} Read ${recognition.label} below and choose explicitly. Talking does not recognise or accept work.`;
  const settlement = choices.find((item) => /^Receive earned wage/.test(item.label));
  if (settlement)
    return `Your ${workplace} work is complete and its earned wage is still payable. ${settlement.terms}${settlement.disabledReason ? ` ${settlement.disabledReason}` : ""} Read ${settlement.label} below; talking does not transfer money.`;
  const unresolved = work?.legacyClaims.find(
    (claim) =>
      (claim.payer === payer || (claim.payer === null && workplace === "cafe")) &&
      ["unresolved", "underfunded", "protected"].includes(claim.resolution),
  );
  if (unresolved)
    return `Your saved ${workplace} work remains labelled legacy evidence: ${unresolved.reason} It has not been erased or turned into an invented payment. Read the current choices for any funded recognition or replacement.`;
  const offer = choices.find((item) => /Accept cafe shift/i.test(item.label));
  return offer
    ? `${offer.terms}${offer.disabledReason ? ` ${offer.disabledReason}` : ""} Read the terms below and choose explicitly; asking does not accept work.`
    : workplace === "grocery"
      ? "You have no open grocery funded shift agreement, and I have no new grocery shift offer. Ask Kevin at Hobbs about the cafe shift: 16:00–19:00, with 5 reserved before acceptance. No agreement was made by this conversation."
      : "There is no available cafe shift offer in the current choices. No agreement was made by this conversation.";
}

function shiftReply(town: Town, agent: Agent, text: string): string {
  const keeping =
    /\b(?:don't|do not|won't|will not) (?:want to )?(?:quit|cancel|stop|leave)\b/i.test(text);
  const prefix = keeping
    ? "Understood; you want to keep your agreement. Talking does not cancel work. "
    : refusing(text)
      ? "Understood; I will not treat that as accepting or cancelling work. "
      : "";
  return `${prefix}${fundedShiftReply(town, agent)}`;
}

/** Wage evidence comes from the worker's engine receipts, never conversational claims. */
function wageReply(town: Town, agent: Agent, text: string): string {
  const workplace = agent.id === "kevin" ? "cafe" : agent.id === "baba" ? "grocery" : null;
  if (!workplace)
    return "Ask Kevin about cafe wages, or Baba about grocery wages. The employer and your recorded work determine payment; I cannot pay you through a conversation.";
  const player = agentById(town, "player");
  const work = fundedPlayerWork(town);
  const economy = (town as FundedTown).economy;
  if (work && economy) {
    const payer = `till:${workplace}`;
    const requestedDay = /\byesterday\b/i.test(text) ? town.day - 1 : town.day;
    const settlements = settledWageTransfers(town, workplace);
    const paid = [...settlements].reverse().find((item) => item.day === requestedDay);
    const historical = [...wageReceipts(town, workplace)]
      .reverse()
      .find((memory) => memory.day === requestedDay);
    const evidence = paid
      ? `${placeTitle(workplace)} paid you ${paid.amount} on day ${paid.day} at ${formatClock(paid.minute)}; the accounts record the transfer.`
      : historical
        ? `${placeTitle(workplace)} paid you ${workplace === "cafe" ? 5 : 4} on day ${historical.day} at ${formatClock(historical.minute)} for a completed shift; that is a retained historical receipt.`
        : `I have no ${placeTitle(workplace)} wage receipt for day ${requestedDay}.`;
    const pending = work.payables.filter(
      (payable) => payable.payer === payer && payable.status === "earned",
    );
    const agreement = [...work.agreements]
      .reverse()
      .find(
        (item) =>
          item.payer === payer &&
          item.kind === "cafe-shift" &&
          ["active", "suspended"].includes(item.status),
      );
    const status = pending.length
      ? ` ${pending.reduce((sum, payable) => sum + payable.amount, 0)} is earned and still payable; its reservation remains.${pending[0].reason ? ` ${pending[0].reason}` : ""}`
      : agreement
        ? ` Your ${workplace} shift is ${agreement.status === "active" ? "still open" : "paused"}: ${agreement.eligibleMinutes} worked minutes of ${agreement.requiredMinutes}; the reserved fee is ${agreement.fee}. Progress and earned pay do not reset at midnight.`
        : ` You have no open ${workplace} funded shift agreement.`;
    const legacy = work.legacyClaims.find(
      (claim) => claim.payer === payer && ["unresolved", "underfunded"].includes(claim.resolution),
    );
    return `${evidence}${status}${legacy ? ` Earlier work is preserved as legacy evidence: ${legacy.reason}` : ""} Asking does not pay a second wage.`;
  }
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
    ? `Your saved ${workplace} shift remains legacy evidence; its timetable and ${Math.round(player.shiftHours * 60)} aggregate minutes are preserved. It is not an active funded agreement.`
    : `You have no open ${workplace} shift agreement.`;
  const choice = playerActions(town, agent.id).find((action) =>
    /^(?:Recognise .* work|Receive earned wage)/.test(action.label),
  );
  if (choice)
    status += ` ${choice.terms}${choice.disabledReason ? ` ${choice.disabledReason}` : ""} Read ${choice.label} below; this conversation does not apply it.`;
  else if (player.paidToday)
    status += " The saved record is already marked paid; that cannot create another wage.";
  return `${evidence} ${status} Asking does not pay a second wage.`;
}

function helpReply(agent: Agent, text: string, continuation: boolean): string {
  const requestingHelp =
    /\b(?:help me|lend me (?:a |some )?hand|i (?:don't |do not )?(?:need|want|could use|would like|get|have) (?:some |any |your |a )?(?:help|hand)|(?:could|can|may) i (?:get|have) (?:some |any |your |a )?(?:help|hand))\b/i.test(
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
    case "time":
      return `It is ${formatClock(town.minute)} on day ${town.day}.`;
    case "role":
      return characterProfile(agent.id).publicInfo;
    case "day":
      return dayReply(town, agent, text);
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
      if (
        /\b(?:my (?:money|coins?|balance|purse)|(?:money|coins?|balance).*i (?:have|hold)|how (?:many coins|much money) (?:do )?i)\b/i.test(
          text,
        )
      )
        return `Your purse shows ${agentById(town, "player").money} coins. An unpaid wage or a promise is separate from that spendable balance.`;
      if (
        /\bwhere\b.*\b(?:money|coins?)\b.*\b(?:come|go)|\bwhere\b.*\b(?:come|go)\b.*\b(?:money|coins?)\b/i.test(
          text,
        )
      )
        return (town as FundedTown).economy
          ? "The accounts begin with recorded opening balances. Wages and payments move those existing coins between accounts; a reservation earmarks money without creating it. The current town does not add unexplained coins at midnight."
          : "This older town has personal purses and shop tills, but it does not yet have a complete account journal. I would not claim that every source and use of money is accounted for.";
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
  const settlement = settledWageTransfers(town, "cafe").at(-1);
  if (
    settlement &&
    (!receipt ||
      absMinute(settlement.day, settlement.minute) >= absMinute(receipt.day, receipt.minute))
  )
    return settlement.day >= town.day - 1
      ? `Hobbs Cafe paid you ${settlement.amount} on day ${settlement.day} at ${formatClock(settlement.minute)} for your shift.`
      : null;
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
        memorySource(memory) === "event" &&
        town.favors.some(
          (favor) =>
            favor.from === "player" &&
            favor.to === "baba" &&
            favor.status === "paid" &&
            favor.amount > 0 &&
            /bread/i.test(favor.text) &&
            memory.text ===
              `${player.name} → ${agentById(town, "baba").name}: ${favor.text} is paid.`,
        ) &&
        memory.day >= town.day - 1 &&
        absMinute(memory.day, memory.minute) <= absMinute(town.day, town.minute),
    );
  if (paid) notes.push("You paid the bread tab. That one is closed.");
  return notes.join(" ") || null;
}
