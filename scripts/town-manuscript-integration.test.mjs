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
const physical = await server.ssrLoadModule("/src/game/physical-items.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { parseTownFile, exportTown } = await server.ssrLoadModule("/src/game/save.ts");
const { ANCHORS, zoneAt } = await server.ssrLoadModule("/src/game/world.ts");

test("parsed decisions survive clock ticks and a saved journey without per-step inference", () => {
  let town = createTown("Reader");
  assert.equal(physical.initializePhysicalItems(town).ok, true);
  const actor = () => town.agents.find((person) => person.id === "northern");
  const book = () => town.physicalItems.items[0];
  const session = () => town.physicalItems.session;
  actor().tile = { ...ANCHORS.library };
  assert.equal(physical.startPhysicalSession(town, "northern", 8).ok, true);

  // These are synthetic transport responses, not actual provider measurements.
  function respond(decision) {
    const job = physical.nextPhysicalJob(town);
    assert.ok(job);
    assert.equal(physical.markPhysicalRequest(town, job), true);
    const prompt = buildPrompt(town, job);
    assert.ok(prompt.length <= 8000);
    const parsed = parseMind(job, JSON.stringify({ decision }));
    assert.equal(parsed.kind, "act");
    // An ordinary world tick must not make an otherwise relevant act stale.
    stepMinute(town, false);
    assert.equal(session().revision, job.sessionRevision);
    physical.recordPhysicalUsage(town, job, {
      elapsedMs: 10,
      attempts: 1,
      totalTokens: 100,
      success: true,
    });
    const result = physical.applyPhysicalCommand(town, parsed.agentId, parsed.decision);
    assert.equal(result.ok, true, result.message);
    return result;
  }
  const itemDecision = (kind, extra = {}) => ({
    kind,
    itemId: book().id,
    itemRevision: book().revision,
    ...extra,
  });

  respond(itemDecision("bring", { destination: "park" }));
  assert.equal(session().usage.requests, 1);
  assert.equal(physical.nextPhysicalJob(town), null);
  // Saves intentionally omit navigation paths: persistent intent must rebuild it.
  town = parseTownFile(exportTown(town));
  assert.ok(town);
  for (let tick = 0; tick < 175 && session().intent; tick++) {
    assert.equal(physical.nextPhysicalJob(town), null);
    stepMinute(town, false);
    assert.equal(session().usage.requests, 1);
  }
  assert.equal(session().intent, null);
  assert.equal(session().lastResult.ok, true, session().lastResult.message);
  assert.equal(zoneAt(actor().tile.x, actor().tile.y), "park");
  assert.deepEqual(book().location, { kind: "held", holder: "northern" });

  const original = "A squirrel took the stage. The trees declined to review its performance.";
  respond(itemDecision("write", { title: "The first rehearsal", text: original }));
  const read = respond(itemDecision("read"));
  assert.equal(read.content.text, original);
  assert.match(buildPrompt(town, physical.nextPhysicalJob(town)), /A squirrel took the stage/);
  const spoken = "I wrote a squirrel a leading role. It has not accepted yet.";
  respond({ kind: "speak", text: spoken });
  assert.equal(actor().bubble.text, spoken);
  assert.ok(physical.nextPhysicalJob(town), "speech permits the next self-chosen action");
  assert.deepEqual(book().location, { kind: "held", holder: "northern" });
  town = parseTownFile(exportTown(town));
  assert.ok(town);
  assert.ok(physical.nextPhysicalJob(town), "a completed speech remains complete after reload");
  assert.equal(session().usage.requests, 4);
  assert.equal(session().usage.providerAttempts, 4);
  assert.equal(session().usage.knownTokens, 400);
  respond(itemDecision("put-down"));
  assert.equal(book().location.kind, "ground");
  assert.equal(book().text, original);
  respond({ kind: "wait" });
  assert.equal(physical.nextPhysicalJob(town), null, "explicit wait parks the bounded trial");
  assert.equal(session().waiting, true);
  assert.equal(session().enabled, true, "wait parks before the eight-request cap");
  assert.equal(session().usage.requests, 6);
  assert.equal(session().usage.providerAttempts, 6);
  assert.equal(session().usage.knownTokens, 600);
  assert.equal(session().usage.attemptsUnknown, 0);
  assert.equal(session().usage.tokensUnknown, 0);
  assert.deepEqual(physical.validatePhysicalItems(town), []);
  const reloaded = parseTownFile(exportTown(town));
  assert.equal(reloaded.physicalItems.items[0].text, original);
  assert.equal(physical.nextPhysicalJob(reloaded), null);
});
