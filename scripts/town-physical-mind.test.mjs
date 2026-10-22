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
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");

function fixture() {
  const town = createTown("A human");
  const actor = town.agents.find((agent) => agent.id === "northern");
  actor.tile = { ...ANCHORS.library };
  town.agents
    .find((agent) => agent.id === "arwyn")
    .memories.push({
      id: "private-other",
      day: 1,
      minute: 1,
      type: "observe",
      text: "PRIVATE_OTHER_RESIDENT_FACT",
      importance: 10,
      keywords: [],
      protected: true,
    });
  town.physicalItems = {
    version: 1,
    items: [
      {
        id: "manuscript:town:1",
        kind: "manuscript",
        title: "Private content fixture",
        text: "ACTUAL_SAVED_CONTENT",
        author: "northern",
        owner: "town",
        revision: 2,
        contentRevision: 1,
        location: { kind: "held", holder: "northern" },
      },
    ],
    session: {
      actor: "northern",
      revision: 3,
      enabled: true,
      waiting: true,
      decisions: 1,
      maxDecisions: 8,
      intent: null,
      lastResult: null,
      usage: {
        requests: 1,
        providerAttempts: 0,
        attemptsUnknown: 0,
        knownTokens: 0,
        tokenSamples: 0,
        tokensUnknown: 0,
        elapsedMs: 0,
        failures: 0,
      },
    },
  };
  const job = {
    kind: "act",
    agentId: "northern",
    sessionRevision: 3,
    day: town.day,
    minute: town.minute,
  };
  return { town, job };
}

test("act prompts disclose item metadata and actual read results, never global contents or another resident's memory", () => {
  const { town, job } = fixture();
  const initial = buildPrompt(town, job);
  assert.ok(initial.length <= 14000);
  assert.match(initial, /exactly ONE supported physical decision/);
  assert.match(initial, /manuscript:town:1/);
  assert.doesNotMatch(initial, /ACTUAL_SAVED_CONTENT|PRIVATE_OTHER_RESIDENT_FACT/);
  assert.match(initial, /player has not spoken/);
  assert.match(initial, /not a completed one/);
  town.physicalItems.session.lastResult = {
    ok: true,
    kind: "read",
    itemId: "manuscript:town:1",
    message: "Read current content",
    content: {
      title: "Private content fixture",
      text: "ACTUAL_SAVED_CONTENT",
      revision: 1,
      author: "northern",
    },
  };
  const read = buildPrompt(town, job);
  assert.match(read, /ACTUAL_SAVED_CONTENT/);
  assert.doesNotMatch(read, /PRIVATE_OTHER_RESIDENT_FACT/);
});

test("act parser binds actor/session to the request and rejects extra authority rather than turning it into wait", () => {
  const { job } = fixture();
  const decision = { kind: "read", itemId: "manuscript:town:1", itemRevision: 2 };
  assert.deepEqual(parseMind(job, JSON.stringify({ decision })), {
    kind: "act",
    mind: "grok",
    agentId: "northern",
    sessionRevision: 3,
    decision,
  });
  for (const response of [
    { decision, agentId: "player" },
    { decision, sessionRevision: 4 },
    { decision: { ...decision, actor: "player" } },
    { decision: { kind: "delete-town" } },
    { reply: "I picked it up" },
    { decision: { kind: "wait" }, decisions: [{ kind: "write" }] },
  ])
    assert.equal(parseMind(job, JSON.stringify(response)), null);
  assert.equal(parseMind({ ...job, agentId: "player" }, '{"decision":{"kind":"wait"}}'), null);
  assert.equal(parseMind({ ...job, sessionRevision: -1 }, '{"decision":{"kind":"wait"}}'), null);
});

test("unavailable act inference has no authored NPC action or speech fallback", () => {
  const { town, job } = fixture();
  const before = structuredClone(town);
  assert.throws(() => offlineResult(town, job), /require available AI/);
  assert.deepEqual(town, before);
});
