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
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { visibleSocialEvents, rememberPaidWork, cleanSocial } =
  await server.ssrLoadModule("/src/game/social.ts");
const { recentBreadGreeting } = await server.ssrLoadModule("/src/game/local-dialogue.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);

test("compression records the actual new dialogue and cannot duplicate the archived first exchange", () => {
  const town = createTown("Mira");
  for (let index = 0; index <= 40; index++) {
    applyResult(town, {
      kind: "player",
      mind: "offline",
      agentId: "arwyn",
      playerText: `Public question ${index}`,
      reply: `Specific answer ${index}`,
      delta: 0,
      note: "",
      favor: null,
      project: null,
      thread: null,
      notice: null,
    });
  }
  assert.ok(person(town, "arwyn").memories.some((memory) => memory.id.startsWith("archive-chat-")));
  assert.equal(town.social.at(-1).turns[0].text, "Public question 40");
  assert.equal(town.social.at(-1).turns[1].text, "Specific answer 40");
  const events = visibleSocialEvents(town, false);
  assert.equal(events.filter((event) => event.turns[0]?.text === "Public question 0").length, 1);
  assert.equal(events.filter((event) => event.turns[0]?.text === "Public question 40").length, 1);
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  assert.equal(
    visibleSocialEvents(restored, false).filter(
      (event) => event.turns[0]?.text === "Public question 0",
    ).length,
    1,
  );
});

test("distinct settled-payment keys retain distinct deeds while a replay stays idempotent after reload", () => {
  let town = createTown("Mira");
  town.day = 3;
  town.minute = 600;
  const at = { day: 3, minute: 590 };
  rememberPaidWork(town, "player", "cafe", 5, "settled-transfer-A", at);
  rememberPaidWork(town, "player", "cafe", 5, "settled-transfer-B", at);
  rememberPaidWork(town, "player", "cafe", 5, "settled-transfer-A", at);
  const deeds = person(town, "kevin").memories.filter((memory) =>
    memory.id.startsWith("paid-work-"),
  );
  assert.equal(deeds.length, 2);
  assert.equal(new Set(deeds.map((memory) => memory.id)).size, 2);
  assert.ok(
    deeds.every((memory) => memory.source === "event" && memory.day === 3 && memory.minute === 590),
  );
  assert.equal(town.social.length, 2);
  assert.equal(cleanSocial(town.social).length, 2);
  assert.ok(town.social.every((event) => event.day === 3 && event.minute === 590));
  town = parseTownFile(exportTown(town));
  assert.ok(town);
  rememberPaidWork(town, "player", "cafe", 5, "settled-transfer-B", at);
  assert.equal(town.social.length, 2);
  assert.equal(
    person(town, "kevin").memories.filter((memory) => memory.id.startsWith("paid-work-")).length,
    2,
  );
});

test("Baba's bread greeting cannot borrow another debtor's receipt or treat a statement as payment", () => {
  const town = createTown("Mira");
  const baba = person(town, "baba");
  town.favors.push({
    id: "bread",
    from: "northern",
    to: "baba",
    amount: 2,
    status: "paid",
    text: "Bread",
    day: 1,
  });
  baba.memories.push(
    makeMemory(town, 1, 420, "favor", "Northern → Baba: Bread is paid.", 7, { source: "event" }),
  );
  assert.equal(recentBreadGreeting(town), null);
  town.favors[0].from = "player";
  assert.equal(recentBreadGreeting(town), null);
  baba.memories.push(
    makeMemory(town, 1, 420, "favor", "Mira → Baba: Bread is paid.", 7, { source: "statement" }),
  );
  assert.equal(recentBreadGreeting(town), null);
  baba.memories.push(
    makeMemory(town, 1, 420, "favor", "Mira → Baba: Bread is paid.", 7, { source: "event" }),
  );
  assert.match(recentBreadGreeting(town), /paid the bread tab/);
  town.day = 3;
  assert.equal(recentBreadGreeting(town), null);
});
