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
const { libraryActions, applyLibraryAction, residentLibraryReply } =
  await server.ssrLoadModule("/src/game/community.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const ask = (town, agentId, text) =>
  offlineResult(town, { kind: "player", agentId, text, day: town.day, minute: town.minute });
const act = (town, kind, argument) => {
  const action = libraryActions(town).find((item) => {
    const [candidate, arg] = JSON.parse(item.id);
    return candidate === kind && arg === argument;
  });
  assert.ok(action, `${kind}:${argument} is offered`);
  assert.equal(action.disabledReason, undefined);
  const result = applyLibraryAction(town, action.id);
  assert.equal(result.ok, true, result.reply);
};
const financialState = (town) =>
  structuredClone({
    economy: town.economy,
    favors: town.favors,
    tills: town.tills,
    residents: town.agents.map(({ id, money, projects }) => ({ id, money, projects })),
  });

const paidSourceCheck = () => {
  const town = createTown("Emblem Visitor");
  person(town, "northern").tile = { ...ANCHORS.dorms };
  act(town, "accept", "source");
  person(town, "player").tile = { ...ANCHORS.library };
  for (const key of ["card:equipment", "card:dorm", "box:Cedar"]) act(town, "inspect", key);
  act(town, "report", "source");
  return town;
};

test("Northern directs ordinary requests for work or help to the public library terms", () => {
  const town = createTown("Emblem Visitor");
  const before = financialState(town);
  for (const question of [
    "Can you give me paid work?",
    "Do you have a task for me?",
    "Can I help you?",
    "Would you like some help?",
    "How can I earn coins?",
  ]) {
    const result = ask(town, "northern", question);
    assert.match(result.reply, /Open Library project/);
    assert.match(result.reply, /source and reference check terms/);
    assert.match(result.reply, /does not accept work or pay/);
    assert.doesNotMatch(result.reply, /Ask Kevin|Ask Baba|I have not set you a task/);
    assert.equal(result.delta, 0);
    for (const field of ["favor", "project", "thread", "notice"]) assert.equal(result[field], null);
  }
  assert.deepEqual(financialState(town), before, "directions cannot accept work or issue money");
});

test("explicit library payment questions take precedence over generic cafe wage answers", () => {
  const town = paidSourceCheck();
  const before = financialState(town);
  const answer = ask(town, "kevin", "Have I been paid for my source check?").reply;
  assert.match(answer, /Emblem Visitor completed the agreed source check and earned 2/);
  assert.match(answer, /independent lookup has not yet established usefulness/);
  assert.match(answer, /Library project panel/);
  assert.doesNotMatch(answer, /cafe shift|cafe wages|no .*wage receipt/i);
  assert.deepEqual(financialState(town), before, "acknowledgment cannot pay a second fee");
});

test("Northern can give project directions without learning unwitnessed payment details", () => {
  const town = paidSourceCheck();
  assert.equal(residentLibraryReply(town, "northern"), null);
  const answer = ask(town, "northern", "Have I been paid for my source check?").reply;
  assert.match(answer, /Library project/);
  assert.doesNotMatch(answer, /Emblem Visitor|earned 2|completed the agreed source check/);
});

test("Northern acknowledges an actual witnessed source check without inventing usefulness", () => {
  const town = createTown("Emblem Visitor");
  act(town, "accept", "source");
  person(town, "player").tile = { ...ANCHORS.library };
  person(town, "northern").tile = { x: ANCHORS.library.x + 1, y: ANCHORS.library.y };
  for (const key of ["card:equipment", "card:dorm", "box:Cedar"]) act(town, "inspect", key);
  act(town, "report", "source");
  const answer = ask(town, "northern", "What about my source check payment?").reply;
  assert.match(answer, /Emblem Visitor completed the agreed source check and earned 2/);
  assert.match(answer, /independent lookup has not yet established usefulness/);
});

test("Northern's library guidance preserves explicit cafe work and unrelated discussion", () => {
  const town = createTown("Emblem Visitor");
  assert.match(ask(town, "northern", "Can you give me paid cafe work?").reply, /Ask Kevin/);
  assert.doesNotMatch(ask(town, "northern", "What is your job?").reply, /Open Library project/);
  assert.doesNotMatch(
    ask(town, "northern", "Can I help you investigate solar energy?").reply,
    /Open Library project/,
  );
});
