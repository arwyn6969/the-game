import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { applyResult, PLAYER_CAFE_SHIFT } = await server.ssrLoadModule("/src/game/effects.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const ask = (town, id, text) =>
  offlineResult(town, {
    kind: "player",
    agentId: id,
    text,
    day: town.day,
    minute: town.minute,
  });
const say = (town, id, text) => {
  const result = ask(town, id, text);
  applyResult(town, result);
  return result.reply;
};
const remember = (town, id, question, answer, changes = {}) => {
  const memory = {
    id: `test-chat-${town.nextId++}`,
    day: town.day,
    minute: town.minute,
    type: "chat",
    with: "player",
    source: "statement",
    importance: 5,
    keywords: [],
    text: `${question} ${answer}`,
    turns: [
      { speaker: "player", text: question },
      { speaker: id, text: answer },
    ],
    ...changes,
  };
  person(town, id).memories.push(memory);
  return memory;
};
const receipt = (town, day, minute, changes = {}) => {
  person(town, "player").memories.push({
    id: `test-wage-${town.nextId++}`,
    day,
    minute,
    type: "favor",
    source: "event",
    text: "Hobbs Cafe paid me 5 for a shift I actually worked.",
    importance: 6,
    keywords: [],
    ...changes,
  });
};
const shift = (town) =>
  person(town, "player").projects.push({
    id: "test-shift",
    owner: "player",
    kind: "shift",
    status: "open",
    place: "cafe",
    text: PLAYER_CAFE_SHIFT,
    day: town.day,
  });
const commitments = (town) =>
  structuredClone({
    favors: town.favors,
    tills: town.tills,
    agents: town.agents.map(({ id, money, projects, plan, tile, relationships }) => ({
      id,
      money,
      projects,
      plan,
      tile,
      scores: Object.fromEntries(
        Object.entries(relationships).map(([other, relation]) => [other, relation.score]),
      ),
    })),
  });

test("wage wording reads dated worker receipts and does not pay twice", () => {
  const town = createTown("Mira");
  town.day = 3;
  town.minute = 1200;
  shift(town);
  person(town, "player").shiftHours = 3;
  person(town, "player").paidToday = true;
  receipt(town, 2, 1139);
  receipt(town, 3, 1139);
  const before = commitments(town);
  for (const text of [
    "What about my wages?",
    "Have I been paid today?",
    "Did you pay me?",
    "When do I get paid?",
    "Please pay me.",
    "Hello, my payment for the shift?",
    "You haven't paid me for work.",
  ]) {
    const result = ask(town, "kevin", text);
    assert.match(result.reply, /paid you 5 on day 3 at 18:59/);
    assert.match(result.reply, /saved cafe shift remains legacy evidence/);
    assert.doesNotMatch(result.reply, /reset at midnight/);
    assert.doesNotMatch(result.reply, /do not have a clear answer/);
    assert.equal(result.mind, "offline");
    for (const field of ["favor", "project", "thread", "notice"]) assert.equal(result[field], null);
    applyResult(town, result);
  }
  assert.deepEqual(commitments(town), before);
  assert.match(say(town, "kevin", "Was I paid yesterday?"), /paid you 5 on day 2 at 18:59/);
  assert.match(say(town, "kevin", "How much?"), /paid you 5 on day 2 at 18:59/);
  assert.match(say(town, "kevin", "What about today?"), /paid you 5 on day 3 at 18:59/);
});

test("old, foreign, future and conversational payment claims are not today's wage evidence", () => {
  const town = createTown("Mira");
  town.day = 4;
  town.minute = 1100;
  shift(town);
  receipt(town, 3, 1139);
  receipt(town, 4, 900, { source: "statement" });
  receipt(town, 4, 901, { type: "chat" });
  receipt(town, 4, 902, { text: "Grocery paid me 4 for a shift I actually worked." });
  receipt(town, 4, 1139);
  const reply = say(town, "kevin", "Have I been paid today?");
  assert.match(reply, /no Hobbs Cafe wage receipt for day 4/);
  assert.match(reply, /latest receipt.*day 3 at 18:59/);
  assert.doesNotMatch(reply, /paid you 5 on day 4/);
  assert.match(say(town, "baba", "Have I been paid?"), /Grocery paid you 4 on day 4/);
  assert.doesNotMatch(say(town, "baba", "Have I been paid?"), /Hobbs Cafe paid/);
  assert.match(say(town, "data", "Have I been paid?"), /Ask Kevin.*Baba/);
});

test("unpaid legacy answers preserve aggregate evidence and explain funded recognition", () => {
  const town = createTown("Mira");
  shift(town);
  person(town, "player").shiftHours = 1.5;
  town.tills.cafe = 0;
  const reply = say(town, "kevin", "Where are my wages?");
  assert.match(reply, /90 aggregate minutes are preserved/);
  assert.match(reply, /Confirm 90 employer-bound minutes/);
  assert.match(reply, /cannot reserve the full wage/);
  assert.doesNotMatch(reply, /reset at midnight|90 worked minutes/);
  person(town, "player").projects[0].status = "done";
  assert.match(say(town, "kevin", "What happened to my wages?"), /no open cafe shift agreement/);
});

test("help and invitations take precedence over greetings without creating tasks or appointments", () => {
  const town = createTown("Mira");
  const before = commitments(town);
  assert.match(
    say(town, "northern", "Hello, could I help you out?"),
    /Thanks for offering to help/,
  );
  assert.doesNotMatch(person(town, "northern").memories.at(-1).text, /How much time would it take/);
  assert.match(say(town, "northern", "How long?"), /no task, duration or payment agreed/);
  for (const text of [
    "Hello, fancy a coffee together?",
    "Would you like to join me for a drink?",
    "Come with me to Hobbs?",
  ]) {
    assert.match(say(town, "amelia", text), /coffee and a chat/);
    assert.doesNotMatch(
      person(town, "amelia").memories.at(-1).text,
      /see you there|meet you at 1|on my way|appointment confirmed/i,
    );
  }
  assert.match(say(town, "amelia", "That could give us time to talk."), /exchange ideas/);
  assert.match(
    say(town, "amelia", "I just thought it might help us get to know each other."),
    /exchange ideas/,
  );
  assert.match(
    say(town, "amelia", "Just thought it would give us something to discuss."),
    /exchange ideas/,
  );
  assert.match(say(town, "amelia", "No thanks."), /No meeting has been arranged/);
  assert.deepEqual(commitments(town), before);
});

test("a clarification repairs the latest failed help answer using its actual question", () => {
  const town = createTown("Mira");
  remember(town, "northern", "Do you need a hand?", "Hi. How much time would it take?");
  const reply = say(town, "northern", "Would what take?");
  assert.match(reply, /name a task before estimating/);
  assert.doesNotMatch(reply, /do not have a clear answer|How much time would it take/);
  assert.match(say(town, "northern", "Tell me more."), /help|task/);
});

test("offers, requests and refusals retain their direction and leave consent explicit", () => {
  const town = createTown("Mira");
  const before = commitments(town);
  assert.match(say(town, "baba", "Can you help me?"), /What do you need help with/);
  assert.match(say(town, "baba", "Please don't help me."), /will not press you to take help/);
  for (const text of ["I don’t want any help.", "I don't want your help."])
    assert.match(say(town, "baba", text), /will not press you to take help/);
  assert.match(say(town, "baba", "I don't want to help you."), /no help is expected/);
  assert.match(
    say(town, "amelia", "I don’t want to join you for coffee."),
    /No meeting has been arranged/,
  );
  assert.match(say(town, "kevin", "I won't take a job."), /will not treat that as accepting/);
  assert.doesNotMatch(
    say(town, "kevin", "I can't afford food. Can I work here?"),
    /will not treat that as accepting/,
  );
  assert.match(say(town, "amelia", "Don't you want to have coffee?"), /would enjoy/);
  shift(town);
  const agreed = commitments(town);
  assert.match(say(town, "kevin", "Do not cancel my shift."), /want to keep your agreement/);
  assert.match(
    say(town, "kevin", "I quit the shift."),
    /Talking does not recognise or accept work/,
  );
  for (const text of ["I quit.", "Cancel.", "Please cancel my work."])
    assert.match(say(town, "kevin", text), /Talking does not recognise or accept work/);
  assert.deepEqual(commitments(town), agreed);
  person(town, "player").projects = [];
  assert.deepEqual(commitments(town), before);
});

test("repayment wording keeps its tab context ahead of generic money and help", () => {
  const town = createTown("Mira");
  town.favors.push({
    id: "test-tab",
    from: "player",
    to: "baba",
    amount: 2,
    text: "A loaf",
    status: "owed",
    day: town.day,
  });
  const before = commitments(town);
  for (const text of [
    "I have money to pay you.",
    "Can I pay you with coins?",
    "Can you help me pay my tab?",
  ]) {
    const reply = say(town, "baba", text);
    assert.match(reply, /tab is still 2/);
    assert.doesNotMatch(reply, /cafe shift|What do you need help/);
  }
  assert.deepEqual(commitments(town), before);
  assert.doesNotMatch(say(town, "baba", "What stock do you have?"), /loaf|tab is|owe 2/);
});

test("money and shop-stock questions give available directions without inventing funding or inventory", () => {
  const town = createTown("Mira");
  const before = commitments(town);
  assert.match(
    say(town, "baba", "I'm short of money. What can I do?"),
    /Ask Kevin.*16:00–19:00.*5/,
  );
  const stock = say(town, "baba", "Stock?");
  assert.match(stock, /do not have a tracked stock count/);
  assert.doesNotMatch(stock, /Bread is 2|Accept|\d+ (?:loaves|apples)/);
  assert.match(
    say(town, "baba", "How would that work?"),
    /item names and counts actually observed/,
  );
  assert.match(say(town, "baba", "Do you sell bread?"), /Bread is 2 on a tab/);
  assert.deepEqual(commitments(town), before);
  town.minute = 1050;
  assert.match(say(town, "kevin", "I need a job."), /Come back before 16:00/);
});

test("follow-ups cannot borrow another person's history, stale history, private seeds or an abandoned topic", () => {
  for (const change of [{ with: "baba" }, { minute: -1 }, { seed: true }, {}]) {
    const town = createTown("Mira");
    remember(
      town,
      "northern",
      "May I help you?",
      "PRIVATE_MARKER How long would that take?",
      change,
    );
    if (!Object.keys(change).length)
      remember(town, "northern", "Who won the chess final?", "I don't know.");
    const reply = ask(town, "northern", "Would what take?").reply;
    assert.doesNotMatch(reply, /name a task before estimating|PRIVATE_MARKER/);
  }
  const town = createTown("Mira");
  remember(town, "northern", "May I help you?", "A chat could help.");
  assert.doesNotMatch(ask(town, "amelia", "How long?").reply, /name a task before estimating/);
});

test("generic greetings are standalone rather than replies to an unstated task", () => {
  const town = createTown("Mira");
  for (const id of ["kevin", "arwyn", "northern", "baba", "sub", "data", "amelia"]) {
    for (const hour of [8, 9, 10, 11]) {
      town.minute = hour * 60;
      const reply = ask(town, id, "Hello!").reply;
      assert.doesNotMatch(
        reply,
        /(?:how (?:much time|long) would it take|resources it needs|tell me the proposal|tell me the plain version)/i,
      );
    }
  }
});
