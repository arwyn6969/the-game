import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const cacheDir = await mkdtemp(join(tmpdir(), "town-development-"));
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  cacheDir,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { makeMemory, pushMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");

const { relationshipContext } = await server.ssrLoadModule("/src/game/relationships.ts");
const { publicReflections } = await server.ssrLoadModule("/src/game/social.ts");

const resident = (town, id = "data") => town.agents.find((agent) => agent.id === id);
const revision = (town, extras = {}) => ({
  kind: "plan",
  mind: "grok",
  weekly: true,
  plans: [
    {
      id: "data",
      summary: "Review evidence and test one idea.",
      blocks: [],
      selfSentence: "I now test a small example before generalising.",
      selfReason: "The independent lookup exposed an unsupported assumption.",
      ...extras,
    },
  ],
});

test("self-description requires own non-seed experience and an explicit reason", () => {
  const town = createTown("Test Resident");
  const agent = resident(town);
  const initial = agent.selfSentence;
  const evidence = makeMemory(
    town,
    town.day,
    town.minute,
    "observe",
    "My lookup found the wrong shelf.",
    7,
  );
  pushMemory(agent, evidence);
  const cases = [
    {},
    { selfEvidence: ["missing"] },
    { selfEvidence: [evidence.id], selfReason: "" },
  ];
  for (const extras of cases) {
    applyResult(town, revision(town, extras));
    assert.equal(agent.selfSentence, initial);
  }
  const foreign = makeMemory(town, town.day, town.minute, "observe", "A private observation.", 7);
  pushMemory(resident(town, "kevin"), foreign);
  applyResult(town, revision(town, { selfEvidence: [foreign.id] }));
  assert.equal(agent.selfSentence, initial);
  for (const extra of [{ seed: true }, { source: "reflection" }, { day: town.day + 1 }]) {
    const invalid = { ...evidence, id: `invalid-${town.nextId++}`, ...extra };
    pushMemory(agent, invalid);
    applyResult(town, revision(town, { selfEvidence: [invalid.id] }));
    assert.equal(agent.selfSentence, initial);
  }
  const identity = agent.identity;
  applyResult(town, revision(town, { selfEvidence: [evidence.id] }));
  assert.match(agent.selfSentence, /small example/);
  assert.equal(agent.identity, identity);
  const provenance = agent.memories.find((memory) =>
    memory.text.startsWith("Self-description revision."),
  );
  assert.ok(provenance);
  assert.ok(provenance.text.includes(evidence.id));
  assert.equal(provenance.source, "reflection");
  assert.ok(!publicReflections(town, agent.id).some((memory) => memory.id === provenance.id));
  const reloaded = parseTownFile(exportTown(town));
  assert.equal(resident(reloaded).selfSentence, agent.selfSentence);
  const restored = resident(reloaded).memories.find((memory) => memory.id === provenance.id);
  assert.equal(restored.text, provenance.text);
  assert.equal(restored.source, "reflection");
  assert.equal(restored.protected, true);
  assert.ok(!publicReflections(reloaded, agent.id).some((memory) => memory.id === provenance.id));
});

test("stable self-description and repeated reflection add no invented development", () => {
  const town = createTown("Test Resident");
  const agent = resident(town);
  const evidence = makeMemory(
    town,
    town.day,
    town.minute,
    "observe",
    "I checked a second record.",
    7,
  );
  pushMemory(agent, evidence);
  const before = agent.memories.filter((memory) => memory.type === "reflect").length;
  applyResult(
    town,
    revision(town, { selfSentence: agent.selfSentence, selfEvidence: [evidence.id] }),
  );
  assert.equal(agent.memories.filter((memory) => memory.type === "reflect").length, before);
  const result = {
    kind: "reflect",
    mind: "grok",
    agents: [{ id: agent.id, reflections: ["My evidence does not justify a change yet."] }],
  };
  applyResult(town, result);
  applyResult(town, result);
  assert.equal(
    agent.memories.filter((memory) => memory.text === result.agents[0].reflections[0]).length,
    1,
  );
  assert.equal(agent.newMemories, 0);
});

test("archived original references can justify change, ambiguous duplicates cannot", () => {
  const town = createTown("Test Resident");
  const agent = resident(town);
  const memory = makeMemory(
    town,
    town.day,
    town.minute,
    "chat",
    "A recorded account of a failed method.",
    7,
    { with: "player" },
  );
  pushMemory(agent, { ...memory, id: `archive-chat-${memory.id}` });
  applyResult(town, revision(town, { selfEvidence: [memory.id] }));
  assert.match(agent.selfSentence, /small example/);
  pushMemory(agent, memory);
  applyResult(
    town,
    revision(town, { selfSentence: "An unsupported second change.", selfEvidence: [memory.id] }),
  );
  assert.match(agent.selfSentence, /small example/);
});

test("contact, regard and reliable commitments stay distinct and directional", () => {
  const town = createTown("Test Resident");
  const data = resident(town);
  const arwyn = resident(town, "arwyn");
  data.memories = [];
  arwyn.memories = [];
  data.relationships.arwyn = {
    score: -2,
    note: "PRIVATE_FEELING: I disagree with this interpretation.",
  };
  const text = "We disagreed about how to check a record.";
  const turns = [
    { speaker: "data", text },
    { speaker: "arwyn", text: "Let us check the source." },
  ];
  for (const [owner, other] of [
    [data, arwyn],
    [arwyn, data],
  ]) {
    pushMemory(
      owner,
      makeMemory(town, town.day, town.minute, "chat", text, 6, { with: other.id, turns }),
    );
  }
  town.favors = [
    ...["paid", "broken", "owed", "forgiven"].map((status, i) => ({
      id: `f${i}`,
      from: "arwyn",
      to: "data",
      text: "A specific obligation.",
      amount: 1,
      status,
      day: town.day,
    })),
    {
      id: "irrelevant",
      from: "arwyn",
      to: "kevin",
      text: "PRIVATE_DEBT",
      amount: 1,
      status: "broken",
      day: town.day,
    },
    {
      id: "reverse",
      from: "data",
      to: "arwyn",
      text: "Own debt",
      amount: 1,
      status: "paid",
      day: town.day,
    },
  ];
  const context = relationshipContext(town, "data", "arwyn");
  assert.equal(context.familiarity.retainedExchanges, 1);
  assert.equal(context.regard.score, -2);
  assert.deepEqual(context.reliability, { kept: 1, broken: 1, pending: 1, forgiven: 1 });
  assert.match(context.limits, /not trust or affection/);
  assert.doesNotMatch(JSON.stringify(context), /PRIVATE_DEBT/);
  const shared = relationshipContext(town, "data", "arwyn", true);
  assert.equal(shared.regard, undefined);
  assert.doesNotMatch(JSON.stringify(shared), /PRIVATE_FEELING/);
  arwyn.memories = [];
  assert.equal(relationshipContext(town, "data", "arwyn", true).familiarity.retainedExchanges, 0);
  assert.equal(relationshipContext(town, "data", "arwyn").familiarity.retainedExchanges, 1);
  const reloaded = parseTownFile(exportTown(town));
  assert.deepEqual(relationshipContext(reloaded, "data", "arwyn"), context);
});
