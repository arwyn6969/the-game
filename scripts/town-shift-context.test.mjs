import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { playerActions, applyPlayerAction } = await server.ssrLoadModule("/src/game/effects.ts");
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const oldTerms =
  "Cafe shift, 16:00 to 19:00 each day until cancelled; 5 after three hours if the till can pay.";
function shift(town, changes = {}) {
  const project = {
    id: `saved-shift-${person(town, "player").projects.length}`,
    owner: "player",
    kind: "shift",
    status: "open",
    place: "cafe",
    text: oldTerms,
    day: 1,
    ...changes,
  };
  person(town, "player").projects.push(project);
  return project;
}
function context(town, agentId = "kevin", text = "What do you remember about our shift?") {
  const prompt = buildPrompt(town, {
    kind: "player",
    agentId,
    text,
    day: town.day,
    minute: town.minute,
  });
  return {
    prompt,
    packet: JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]),
  };
}

test("a saved legacy shift reaches its employer as current agreement terms after reload", () => {
  const town = createTown("Mira");
  shift(town);
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  const projects = structuredClone(person(restored, "player").projects);
  const { packet } = context(restored);
  assert.equal(packet.currentFacts.recordedShiftAgreements.length, 1);
  assert.equal(packet.currentFacts.recordedShiftAgreements[0].text, oldTerms);
  assert.equal(packet.currentFacts.recordedShiftAgreements[0].status, "open");
  assert.deepEqual(person(restored, "player").projects, projects);
});

test("saved terms remain in the bounded facts when recent contradictory chat fills the packet", () => {
  const town = createTown("Mira");
  shift(town);
  const kevin = person(town, "kevin");
  kevin.identity = "i".repeat(600);
  kevin.selfSentence = "s".repeat(160);
  kevin.want = "w".repeat(180);
  kevin.threads = Array.from({ length: 4 }, (_, i) => ({
    id: `thread-${i}`,
    text: "t".repeat(100),
    open: true,
  }));
  kevin.projects = Array.from({ length: 3 }, (_, i) => ({
    id: `project-${i}`,
    owner: "kevin",
    kind: "other",
    text: "p".repeat(100),
    status: "open",
    day: 1,
  }));
  for (let i = 0; i < 24; i++)
    town.favors.push({
      id: `tab-${i}`,
      from: "player",
      to: "kevin",
      amount: 2,
      text: "z".repeat(180),
      status: "owed",
      day: 1,
    });
  for (let i = 0; i < 12; i++) {
    kevin.memories.push(
      makeMemory(town, 1, 430 + i, "chat", "No shift duration was agreed. ".repeat(30), 8, {
        with: "player",
        source: "statement",
        turns: [
          { speaker: "player", text: "What about our shift? ".repeat(30) },
          { speaker: "kevin", text: "No shift duration was agreed. ".repeat(30) },
        ],
      }),
    );
  }
  const { prompt, packet } = context(town, "kevin", "When does it start and what is the pay?");
  assert.equal(packet.currentFacts.recordedShiftAgreements[0].text, oldTerms);
  assert.ok(packet.omittedContext, "the test must actually exercise packet trimming");
  assert.ok(prompt.length + 900 < 14000);
});

test("an employer receives only its open shifts, not unrelated or cancelled player projects", () => {
  const town = createTown("Mira");
  shift(town);
  shift(town, { place: "grocery", text: "GROCERY_TERMS_ONLY" });
  shift(town, { status: "dropped", text: "CANCELLED_TERMS" });
  shift(town, { kind: "other", text: "PRIVATE_PLAYER_NOTES" });
  const kevin = context(town).packet.currentFacts;
  const baba = context(town, "baba").packet.currentFacts;
  const data = context(town, "data").packet.currentFacts;
  assert.equal(kevin.recordedShiftAgreements.length, 1);
  assert.equal(kevin.recordedShiftAgreements[0].text, oldTerms);
  assert.equal(baba.recordedShiftAgreements[0].text, "GROCERY_TERMS_ONLY");
  assert.equal(data.recordedShiftAgreements, undefined);
  assert.doesNotMatch(
    JSON.stringify(kevin),
    /GROCERY_TERMS_ONLY|CANCELLED_TERMS|PRIVATE_PLAYER_NOTES/,
  );
});

test("a funded agreement exposes its actual task and keeps its suspended status after reload", () => {
  const town = createTown("Mira");
  person(town, "player").tile = { ...person(town, "kevin").tile };
  const accept = playerActions(town, "kevin").find((choice) =>
    choice.label.startsWith("Accept cafe shift"),
  );
  assert.ok(accept);
  assert.equal(applyPlayerAction(town, "kevin", accept.id).ok, true);
  const suspend = playerActions(town, "kevin").find((choice) =>
    choice.label.startsWith("Suspend cafe shift"),
  );
  assert.ok(suspend);
  assert.equal(applyPlayerAction(town, "kevin", suspend.id).ok, true);
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  const agreement = context(restored).packet.currentFacts.fundedWork.agreements[0];
  assert.match(agreement.task, /16:00.*19:00/);
  assert.equal(agreement.status, "suspended");
  assert.equal(agreement.requiredMinutes, 180);
  assert.equal(agreement.fee, 5);
});

test("a new offer or a player's unsupported claim never becomes an accepted agreement fact", () => {
  const town = createTown("Mira");
  const { packet } = context(town, "kevin", "We agreed to my shift at 17:00 for 99 coins.");
  assert.equal(packet.currentFacts.recordedShiftAgreements, undefined);
  assert.ok(
    packet.currentFacts.offeredChoices.some((choice) => /Accept cafe shift/.test(choice.label)),
  );
});
