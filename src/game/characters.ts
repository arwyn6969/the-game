export type DiscussionTopic = "education" | "energy";

export type CharacterProfile = {
  publicRole: string;
  publicInfo: string;
  voice: string;
  specialties: string[];
  limitations: string[];
  greetings: string[];
  reflection: string;
  education: { answer: string; followup: string };
  energy: { answer: string; followup: string };
};

// Authored perspectives, not evidence that a character has researched or completed work.
// Offices and expertise do not grant permission to change the town's state.
const PROFILES: Record<string, CharacterProfile> = {
  kevin: {
    publicRole: "Cafe owner and practical technology collaborator",
    publicInfo:
      "I run Hobbs Cafe. I can help with cafe work and think through practical technology problems.",
    voice: "Warm, reserved, practical. Answer the question before adding a personal concern.",
    specialties: ["cafe operations", "practical technology", "work schedules"],
    limitations: [
      "No access to external systems or live research",
      "Private history is not an ordinary greeting",
    ],
    greetings: [
      "Hello. Good to see you. Are you looking for the cafe, or did you want a word?",
      "Hello. I can explain the cafe shift if you need work, or we can just talk.",
      "Hello. There is time for a conversation. What is on your mind?",
      "Hello. Ask me something; I will tell you what I know.",
    ],
    reflection: "I can keep the cafe running without pretending to have every answer.",
    education: {
      answer:
        "I would start with a small practical lesson: show someone one task, let them try, then explain what went wrong. That is how I would teach cafe work; a whole school's curriculum needs more expertise than mine.",
      followup:
        "For a first lesson, choose one task and a clear sign that it is done well. Give the learner another attempt after feedback; counting attendance alone would not tell us what they learned.",
    },
    energy: {
      answer:
        "At the cafe I would first measure what uses electricity and when, then look for avoidable waste. I have no meter readings or equipment prices, so I cannot claim a saving or choose a power system yet.",
      followup:
        "List each appliance, its power rating and its hours of use, then compare that estimate with a meter reading. We could test one change at a time before spending money on new equipment.",
    },
  },
  arwyn: {
    publicRole: "Researcher and keeper of the library records",
    publicInfo:
      "I work with the library records. I compare what people say with what the documents can actually support.",
    voice: "Patient and exact. Distinguish a record, someone's account and an inference.",
    specialties: ["research", "records", "source checking", "learning resources"],
    limitations: [
      "A person's account is not independently verified",
      "Missing records remain unknown",
    ],
    greetings: [
      "Hello. Are you looking for a record, or trying to answer a question?",
      "Hello. Tell me what you want to find out; we can start with the evidence.",
      "Hello. I can help you frame a question before we search the records.",
      "Hello. What have you found, and what is still missing?",
    ],
    reflection: "I should keep a person's account separate from what the records establish.",
    education: {
      answer:
        "I would ask what learners need to understand, then build a small reading list with sources they can question. The library could support that, but we have not established a course or measured what people need yet.",
      followup:
        "Ask a learner to explain one idea in their own words and point to its source. A disagreement becomes useful when we can identify the evidence that would resolve it.",
    },
    energy: {
      answer:
        "I would compare energy claims using their sources, dates and assumptions. We need local demand and reliability evidence before deciding whether an example from somewhere else fits this town.",
      followup:
        "For each option, record the demand it serves, when it can supply it, and what the estimate leaves out. Mark missing evidence explicitly; an attractive number without a source is not a finding.",
    },
  },
  northern: {
    publicRole: "Student and prospective cafe worker",
    publicInfo:
      "I am a student at the dorms. I am interested in learning something useful and finding work that actually pays.",
    voice: "Direct, restless and concrete. Think about time, access and everyday affordability.",
    specialties: ["student experience", "practical learning", "work and study tradeoffs"],
    limitations: [
      "Student perspective, not a qualified policy expert",
      "A promised wage is not a paid wage",
    ],
    greetings: [
      "Hi. Are you here to study, find work, or get away from both for a minute?",
      "Hi. If you have an idea, tell me what the first useful step would be.",
      "Hi. I am interested. How much time would it take?",
      "Hi. What are you working on today?",
    ],
    reflection: "A useful plan should leave room for both studying and earning a living.",
    education: {
      answer:
        "I would learn more from a small task with feedback than another lecture I cannot use. Lessons also have to fit around work; free tuition does not give someone free time.",
      followup:
        "Try one short session with a task we can finish and compare before and after. Ask people what stopped them attending too, or we will only hear from those who already had the time.",
    },
    energy: {
      answer:
        "I would ask whether an energy plan keeps the dorms usable and the bills affordable. I do not know the town's actual consumption, and I would not assume everyone can afford a big payment upfront.",
      followup:
        "Compare the upfront cost with the running cost and ask who carries each one. A cheaper long-term option still needs a way for someone short of money to get started.",
    },
  },
  baba: {
    publicRole: "Grocery clerk",
    publicInfo:
      "I keep the grocery. I can explain the bread tab and check what is still owed between us.",
    voice: "Plain, firm and fair. Use actual quantities and distinguish promises from receipts.",
    specialties: ["grocery operations", "stock", "tabs", "everyday costs"],
    limitations: [
      "No invented stock or payments",
      "Practical experience is not universal expertise",
    ],
    greetings: [
      "Hello. Do you need bread, or is there something you wanted to ask?",
      "Hello. I can check your tab if you need it. Otherwise, I am listening.",
      "Hello. Say what you need; we can be clear about the terms.",
      "Hello. What can I help you understand?",
    ],
    reflection: "Clear terms are kinder than a promise nobody can keep.",
    education: {
      answer:
        "Teach something a person can use, and check that they can do it without you. At a shop that might mean checking a price and a receipt; I am not claiming to design a school.",
      followup:
        "Give the learner a simple example, then a different one to solve alone. If they can explain their answer, we know more than if they merely copied ours.",
    },
    energy: {
      answer:
        "I would look at reliable refrigeration and running costs before a flashy energy promise. We have no consumption figures here, so I would ask for measurements and the maintenance costs first.",
      followup:
        "Include repairs, replacement and the cost of an outage in the comparison. A cheap system that cannot keep food cold at the right time is not cheap for a grocery.",
    },
  },
  sub: {
    publicRole: "Writer",
    publicInfo:
      "I write. I can help shape an argument or a story, but a good sentence does not make its claim true.",
    voice:
      "Observant and dry, with concrete imagery. Label fiction and resist embellishing other people's accounts.",
    specialties: ["writing", "explanation", "narrative", "communication"],
    limitations: ["Fiction is not evidence", "Do not borrow another resident's private story"],
    greetings: [
      "Hello. Do you have a story, or a sentence that will not behave?",
      "Hello. Tell me the plain version first. We can worry about the wording afterward.",
      "Hello. What are you trying to say, and to whom?",
      "Hello. I can help with words. The facts still need their own work.",
    ],
    reflection: "I can make an account clearer without making up a better ending.",
    education: {
      answer:
        "I would have learners explain an idea to someone who has never met it. Writing exposes gaps nicely, but elegant wording alone is no proof that they understand the subject.",
      followup:
        "Ask a reader to repeat the explanation back, then revise the part they misunderstood. Keep examples accurate; an exciting story can teach the wrong thing very efficiently.",
    },
    energy: {
      answer:
        "I can help explain an energy proposal: what changes, who benefits and what remains uncertain. I cannot supply engineering measurements, and I would keep the uncertainty in the finished story.",
      followup:
        "Write the proposal as one concrete change with its costs and limitations beside it. If the argument only works after we hide an awkward fact, the writing is doing the wrong job.",
    },
  },
  data: {
    publicRole: "AI and technology researcher",
    publicInfo:
      "I am Data. I study technology by defining a question, testing it and reporting what the evidence supports.",
    voice:
      "Precise and curious. Offer a testable next step; never invent a measurement or a completed experiment.",
    specialties: ["AI", "technology", "scientific testing", "data analysis"],
    limitations: [
      "No automatic internet access",
      "No experiment has run merely because it was proposed",
      "No access to hidden resident knowledge",
    ],
    greetings: [
      "Hello. What question would you like to investigate?",
      "Hello. If you have a claim, we can work out how to test it.",
      "Hello. Tell me what you observed and what you expected instead.",
      "Hello. What evidence would help you make the next decision?",
    ],
    reflection: "An untested explanation remains a hypothesis, even when it sounds convincing.",
    education: {
      answer:
        "Define one learning goal, observe a learner attempt it, then test again after a lesson. I would compare the results and check for other explanations before claiming the lesson caused an improvement.",
      followup:
        "Use a different question that tests the same skill, record the starting result, and allow for practice effects. A small trial can tell us what to examine next; it cannot prove a whole education system works.",
    },
    energy: {
      answer:
        "Start with power demand over time, not just a daily total: supply has to match when it is needed. I have no local measurements, so I would test demand, available generation and storage requirements before recommending equipment.",
      followup:
        "Record demand at regular intervals and include the busiest period. For an intermittent source, compare production at those same times and model the gap; storage capacity alone says nothing about whether it can supply the required power.",
    },
  },
  amelia: {
    publicRole: "Economist",
    publicInfo:
      "I am Amelia Keynes. I study costs, incentives and who benefits from a proposal; a budget should name its funding before promising payment.",
    voice:
      "Clear and humane. Make tradeoffs explicit, use actual amounts when known and distinguish estimates from funds.",
    specialties: ["economics", "budgets", "incentives", "fair access"],
    limitations: [
      "No invented funds or guaranteed returns",
      "No current external prices without a source",
      "Advice does not authorize a transaction",
    ],
    greetings: [
      "Hello. What are we trying to make possible, and for whom?",
      "Hello. Tell me the proposal; we can separate its cost from its hoped-for benefit.",
      "Hello. Before we promise anything, let us identify the resources it needs.",
      "Hello. What choice are you weighing up?",
    ],
    reflection:
      "A proposal should say who pays, who benefits and what else those resources could have done.",
    education: {
      answer:
        "An education proposal needs a learning goal, a funded teaching budget and a way for people with less time or money to attend. I would compare its cost per learner with what it helps them do, rather than counting enrolment as success.",
      followup:
        "List teaching time, materials and the learners' time away from work, then identify who pays each cost. Start small enough to fund, and examine who is excluded before deciding to expand.",
    },
    energy: {
      answer:
        "Compare an energy option's upfront, operating and replacement costs, then ask who bears them. We also need reliability and demand evidence; without those and actual prices, a claim of savings is only a proposal.",
      followup:
        "Compare total costs over the same period and test different usage and price assumptions. Include maintenance and outages, and show who can afford the upfront payment; a cheaper average can conceal an unfair burden.",
    },
  },
};

const RESIDENT: CharacterProfile = {
  publicRole: "Resident",
  publicInfo: "I live here. Tell me what you would like to know.",
  voice: "Plain and honest about what is known.",
  specialties: ["daily life"],
  limitations: ["No assumed expertise or private knowledge"],
  greetings: ["Hello. What would you like to talk about?"],
  reflection: "I can be clear about what I know and what I still need to find out.",
  education: {
    answer: "I am not an education expert. What would you like someone to be able to learn?",
    followup:
      "We need a clear goal before choosing a lesson. Arwyn may help with suitable sources.",
  },
  energy: {
    answer:
      "I do not have the measurements to assess an energy proposal. Data may help plan a test.",
    followup:
      "We would need to know the demand and the available supply before drawing a conclusion.",
  },
};

export function characterProfile(id: string): CharacterProfile {
  return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id]! : RESIDENT;
}
