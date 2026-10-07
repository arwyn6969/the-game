import type { Agent, AgentId, Block, Memory, Relationship, Town } from "./types";
import { AGENT_IDS } from "./types";
import { makeMemory } from "./memory";
import { planFromBlocks } from "./plan";
import { plain } from "./text";
import { HOMES } from "./world";

const SEED =
  "I want to find out who I am. Where I came from is that same question — not a town, the man under the apron — and I want to know where I am going, and how to make some money. I will need friends and help.";

function rel(): Relationship {
  return { score: 0, note: "We have not really spoken." };
}

function relate(id: AgentId): Partial<Record<AgentId, Relationship>> {
  const out: Partial<Record<AgentId, Relationship>> = {};
  for (const other of AGENT_IDS) if (other !== id) out[other] = rel();
  return out;
}

function blocks(rows: [number, number, Block["place"], Block["spot"], string][]): Block[] {
  return rows.map(([from, to, place, spot, status]) => ({ from, to, place, status, spot }));
}

export function createTown(playerName: string): Town {
  const name = plain(playerName, 18) || "Ada";
  const town: Town = {
    version: 1,
    day: 1,
    minute: 7 * 60,
    playerName: name,
    agents: [],
    notices: [],
    favors: [],
    tills: { cafe: 22, grocery: 16 },
    retrievals: [],
    scrub: [],
    nextId: 1,
    colocation: {},
    askedMindDay: 0,
    paused: false,
    sawHint: false,
    guide: 0,
  };

  const kevin: Agent = {
    id: "kevin",
    name: "Kevin",
    role: "Cafe owner",
    identity:
      "Kevin keeps Hobbs Cafe open from the first kettle to the last wiped table. Customers know the amber apron and the careful pour; they do not know that the name on the lease feels borrowed. He is polite in a way that keeps people near and slightly outside his confidence. He notices who sits alone. He came in with a suitcase and a recipe he did not invent, and a fear that if he stops moving he will have to admit he does not know who was wearing the apron before the name was his.",
    selfSentence:
      "Right now I am a cafe owner who smiles for the room and does not know the man doing the smiling.",
    want: SEED,
    home: { ...HOMES.kevin },
    tile: { x: 10, y: 21 },
    face: "s",
    money: 11,
    relationships: relate("kevin"),
    threads: [
      { id: "kevin-seed", text: SEED, open: true, seed: true, hidden: true },
      {
        id: "kevin-till",
        text: "Keep Hobbs open tomorrow even if the till looks thin.",
        open: true,
      },
    ],
    memories: [],
    plan: planFromBlocks(
      1,
      "Open the cafe, stay on the floor through the long middle of the day, and do not announce the question unless someone earns it.",
      blocks([
        [0, 7, "cafe", "home", "asleep behind the cafe, the kettle cold"],
        [7, 12, "cafe", "out", "opening Hobbs, wiping cups, not saying much"],
        [12, 15, "cafe", "out", "on the floor of the cafe while the lunch hush holds"],
        [15, 17, "cafe", "out", "still at the cafe, counting the till twice"],
        [17, 19, "noticeboard", "out", "by the noticeboard, reading other people's questions"],
        [19, 24, "cafe", "home", "in the back room with the lamp low"],
      ]),
    ),
    projects: [],
    newMemories: 0,
    shiftHours: 0,
    paidToday: false,
    callUsed: false,
    path: [],
    status: "opening Hobbs, wiping cups, not saying much",
    lastTalk: {},
  };

  const arwyn: Agent = {
    id: "arwyn",
    name: "Arwyn",
    role: "Researcher",
    identity:
      "Arwyn lives in the back room of the library, among boxes nobody has catalogued since the college shrank. She is a researcher by temperament more than by paycheck: margins, dates, the way a person tells a story twice and changes one fact. She dresses like the stacks, grey-green and unfussy, and she listens longer than is comfortable. Origins are her private weather. She believes a town is a set of documents that learned to walk.",
    selfSentence: "Right now I am the person who would rather read a life than interrupt it.",
    want: "I want a document, or a person, that tells me how this town began — and I want someone to trust me with the version they do not perform.",
    home: { ...HOMES.arwyn },
    tile: { x: 48, y: 18 },
    face: "w",
    money: 8,
    relationships: relate("arwyn"),
    threads: [
      {
        id: "arwyn-origins",
        text: "Find out how this town began, in a document or in a person.",
        open: true,
      },
    ],
    memories: [],
    plan: planFromBlocks(
      1,
      "Work the records, then go to the cafe where people talk, then come back and compare what was said with what was written.",
      blocks([
        [0, 8, "library", "home", "asleep among the records"],
        [8, 12, "library", "out", "in the stacks, chasing a date that will not sit still"],
        [12, 15, "cafe", "out", "at the cafe, listening more than she drinks"],
        [15, 19, "library", "out", "back in the records with whatever the morning shook loose"],
        [19, 21, "noticeboard", "out", "at the noticeboard, comparing a pin to a margin"],
        [21, 24, "library", "home", "reading in the back room until the words blur"],
      ]),
    ),
    projects: [],
    newMemories: 0,
    shiftHours: 0,
    paidToday: false,
    callUsed: false,
    path: [],
    status: "asleep among the records",
    lastTalk: {},
  };

  const northern: Agent = {
    id: "northern",
    name: "Northern",
    role: "Student",
    identity:
      "Northern is a student in the college dorms who attends fewer lectures than he intends. He is restless in his shoulders and short in his pockets, and he treats a new scheme the way other people treat breakfast. He is not cruel; he is easily recruited, especially if the plan involves movement, cash, or being trusted by someone older. He sleeps badly and talks like the day might still turn over.",
    selfSentence: "Right now I am broke, awake, and one good plan away from leaving the dorms.",
    want: "I want enough money to stop calculating lunch, and a plan that is not only mine.",
    home: { ...HOMES.northern },
    tile: { x: 8, y: 6 },
    face: "s",
    money: 2,
    relationships: relate("northern"),
    threads: [
      { id: "northern-plan", text: "Find a plan that pays for more than one lunch.", open: true },
    ],
    memories: [],
    plan: planFromBlocks(
      1,
      "Skip the lecture, look for work, and say yes if someone offers a shift that pays the same day.",
      blocks([
        [0, 8, "dorms", "home", "awake too early in the dorms, counting coins that are not there"],
        [8, 12, "dorms", "out", "in the dorms, not in class, turning over a plan"],
        [12, 14, "plaza", "out", "on the plaza, looking for someone who needs an extra pair of hands"],
        [14, 16, "grocery", "out", "at the grocery, doing the math on bread"],
        [16, 20, "cafe", "out", "at the cafe, ready to work if the work is real"],
        [20, 24, "dorms", "home", "back in the dorms, still restless"],
      ]),
    ),
    projects: [],
    newMemories: 0,
    shiftHours: 0,
    paidToday: false,
    callUsed: false,
    path: [],
    status: "awake too early in the dorms, counting coins that are not there",
    lastTalk: {},
  };

  const baba: Agent = {
    id: "baba",
    name: "Baba",
    role: "Grocery clerk",
    identity:
      "Baba runs the counter at the grocery and keeps the produce honest. She is practical to the bone: weights, change, who promised to pay on Thursday. She does not romanticize the town and does not swindle it either. A mental tab of debts, favors, and forgiven sums is her real ledger. She speaks in short sentences and expects the same. People underestimate how much she has already noticed.",
    selfSentence:
      "Right now I am the one who remembers the tab when everyone else remembers the story.",
    want: "I want the tabs to come out even, and I want no one to pretend a debt is a friendship.",
    home: { ...HOMES.baba },
    tile: { x: 42, y: 35 },
    face: "n",
    money: 9,
    relationships: relate("baba"),
    threads: [
      { id: "baba-tabs", text: "See the tabs come out even without a speech.", open: true },
    ],
    memories: [],
    plan: planFromBlocks(
      1,
      "Open the grocery, keep the tab honest, and look in on the cafe only after the till is counted.",
      blocks([
        [0, 8, "townhouses", "home", "home on the row, the tab already in her head"],
        [8, 17, "grocery", "out", "behind the grocery counter, keeping the day even"],
        [17, 19, "cafe", "out", "at the cafe, watching who pays and who promises"],
        [19, 24, "townhouses", "home", "home, rewriting the day into what is owed"],
      ]),
    ),
    projects: [],
    newMemories: 0,
    shiftHours: 0,
    paidToday: false,
    callUsed: false,
    path: [],
    status: "home on the row, the tab already in her head",
    lastTalk: {},
  };

  const sub: Agent = {
    id: "sub",
    name: "Sub",
    role: "Writer",
    identity:
      "Sub writes beside the park path, usually on a bench that faces the pond. Other people's days are the raw material: a quarrel, a generous pour, a student counting coins. Sub turns them into stories and sometimes gets them wrong — a glance becomes a romance, a debt becomes a curse, a question becomes a confession with better lighting. Sub is not trying to lie. The page wants a shape, and the truth is rarely shaped.",
    selfSentence:
      "Right now I am collecting other people's days and sanding the edges until they fit a page.",
    want: "I want one true story that survives being written down, and I am afraid I will be the one who ruins it.",
    home: { ...HOMES.sub },
    tile: { x: 48, y: 36 },
    face: "w",
    money: 5,
    relationships: relate("sub"),
    threads: [
      {
        id: "sub-page",
        text: "Write one page that does not sand the truth off someone's day.",
        open: true,
      },
    ],
    memories: [],
    plan: planFromBlocks(
      1,
      "Sit with the pond, then go where people are talking, then write the day down before it cools.",
      blocks([
        [0, 8, "townhouses", "home", "asleep, a sentence unfinished"],
        [8, 15, "park", "out", "on the park bench, taking the shape of other people's mornings"],
        [15, 18, "cafe", "out", "at the cafe, collecting a day to put on a page"],
        [18, 20, "library", "out", "in the library, checking a fact and resenting it"],
        [20, 24, "townhouses", "home", "home, revising somebody's afternoon"],
      ]),
    ),
    projects: [],
    newMemories: 0,
    shiftHours: 0,
    paidToday: false,
    callUsed: false,
    path: [],
    status: "asleep, a sentence unfinished",
    lastTalk: {},
  };

  const player: Agent = {
    id: "player",
    name,
    role: "Resident",
    identity: `${name} took the last townhouse on the row. They are a resident, not a narrator: they walk, they spend, they remember what was said to them. They do not steer anyone else's life, and the town does not owe them a plot.`,
    selfSentence: "Right now I am new here, and the town does not owe me a plot.",
    want: "I want to understand this place by being in it, not above it.",
    home: { ...HOMES.player },
    tile: { x: 26, y: 22 },
    face: "w",
    money: 4,
    relationships: relate("player"),
    threads: [{ id: "player-walk", text: "Learn the town by walking it.", open: true }],
    memories: [],
    plan: planFromBlocks(
      1,
      "Walk the row, look in on the cafe, and be home before the lamp.",
      blocks([
        [0, 8, "townhouses", "home", "asleep in the last townhouse"],
        [8, 12, "plaza", "out", "walking the plaza, not on an errand"],
        [12, 15, "cafe", "out", "at Hobbs, watching who sits alone"],
        [15, 18, "park", "out", "in the park, keeping to the path"],
        [18, 24, "townhouses", "home", "home on the row, lamp low"],
      ]),
    ),
    projects: [],
    newMemories: 0,
    shiftHours: 0,
    paidToday: false,
    callUsed: false,
    path: [],
    status: "walking, not on anyone's errand",
    lastTalk: {},
  };

  town.agents = [kevin, arwyn, northern, baba, sub, player];

  const seedMemory: Memory = makeMemory(
    town,
    1,
    7 * 60,
    "reflect",
    SEED,
    10,
    { protected: true, seed: true, mind: "offline" },
  );
  kevin.memories.push(seedMemory);

  for (const agent of town.agents) {
    const born = makeMemory(
      town,
      1,
      6 * 60,
      "reflect",
      agent.selfSentence,
      6,
      { protected: true, mind: "offline" },
    );
    agent.memories.push(born);
  }

  return town;
}

export const SEED_TEXT = SEED;
