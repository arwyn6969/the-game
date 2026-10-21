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
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { beatAt, goalFor } = await server.ssrLoadModule("/src/game/plan.ts");
const { refreshResidentStatus, moveResidents } =
  await server.ssrLoadModule("/src/game/navigation.ts");
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { ANCHORS, placeOfZone, zoneAt } = await server.ssrLoadModule("/src/game/world.ts");
const resident = (town, id) => town.agents.find((a) => a.id === id);
const finances = (town) =>
  JSON.stringify({
    money: town.agents.map((a) => a.money),
    tills: town.tills,
    favors: town.favors,
    economy: town.economy,
    player: resident(town, "player"),
    identity: town.identityRegistry,
  });

test("single-resident jobs ask for filled results without an empty example for a different resident", () => {
  const town = createTown("Test Resident");
  for (const [kind, id] of [
    ["plan", "baba"],
    ["reflect", "kevin"],
  ]) {
    const prompt = buildPrompt(town, {
      kind,
      agents: [id],
      weekly: false,
      day: town.day,
      minute: town.minute,
    });
    const instruction = prompt.split("\nPeople: ")[0];
    assert.doesNotMatch(instruction, /"id":"(?:kevin|arwyn)"|"summary":""|"reflections":\["",""\]/);
    assert.match(instruction, /exactly one filled/);
    assert.match(instruction, /supplied id/);
    assert.ok(prompt.length <= 14000);
  }
});
function groceryPlan(town) {
  // The actual accepted Flash-Lite work block from the failed behavioral check.
  const job = { kind: "plan", agents: ["baba"], weekly: false, day: town.day, minute: town.minute };
  const parsed = parseMind(
    job,
    JSON.stringify({
      plans: [
        {
          id: "baba",
          summary: "Head over to open the grocery.",
          blocks: [
            { from: 0, to: 7, place: "cafe", spot: "out", status: "visiting the cafe" },
            {
              from: 7,
              to: 24,
              place: "grocery",
              spot: "home",
              status: "opening the grocery counter and checking tabs",
            },
          ],
        },
      ],
    }),
  );
  assert.ok(parsed);
  applyResult(town, parsed);
}

test("Baba's captured grocery/home plan navigates to work after save and reload", () => {
  const town = parseTownFile(exportTown(createTown("Test Resident")));
  town.minute = 12 * 60;
  const original = finances(town);
  groceryPlan(town);
  const loaded = parseTownFile(exportTown(town));
  assert.ok(loaded);
  for (const value of [town, loaded]) {
    const baba = resident(value, "baba");
    const beat = beatAt(baba, value.minute);
    assert.deepEqual(goalFor(baba, beat), ANCHORS.grocery);
    assert.equal(beat.spot, "out");
    assert.equal(finances(value), original);
  }
});

test("an inconsistent home label cannot override the declared destination, even without beatAt", () => {
  const town = createTown("Test Resident");
  for (const agent of town.agents.filter((a) => a.id !== "player")) {
    const homePlace = placeOfZone(zoneAt(agent.home.x, agent.home.y));
    const foreignPlace = homePlace === "grocery" ? "library" : "grocery";
    assert.deepEqual(
      goalFor(agent, { hour: 12, place: foreignPlace, spot: "home", status: "at work" }),
      ANCHORS[foreignPlace],
    );
    assert.deepEqual(
      goalFor(agent, { hour: 23, place: homePlace, spot: "home", status: "asleep" }),
      agent.home,
    );
  }
});

test("a mistaken home flag still allows arrival beside an occupied public work counter", () => {
  const town = createTown("Test Resident");
  town.minute = 12 * 60;
  groceryPlan(town);
  const baba = resident(town, "baba");
  baba.tile = { x: 9, y: 36 };
  resident(town, "kevin").tile = { ...ANCHORS.grocery };
  refreshResidentStatus(town, baba);
  assert.equal(baba.status, "opening the grocery counter and checking tabs");
  // An ordinary movement pass must not send him back toward the townhouses.
  moveResidents(town, false);
  assert.equal(placeOfZone(zoneAt(baba.tile.x, baba.tile.y)), "grocery");
});

test("reflection evidence separates speech and plans from events while preserving original dates", () => {
  const town = createTown("Test Resident");
  const baba = resident(town, "baba");
  baba.memories = [
    makeMemory(town, 1, 420, "chat", "Kevin: I'll start the kettle if you like.", 10, {
      with: "kevin",
      source: "statement",
    }),
    makeMemory(town, 1, 425, "plan", "I intend to drink a cup before opening the grocery.", 10),
    makeMemory(town, 1, 480, "favor", "A confirmed receipt records a payment of 2.", 10, {
      protected: true,
      source: "event",
    }),
  ];
  const ids = baba.memories.map((m) => m.id);
  town.day = 2;
  town.minute = 600;
  const loaded = parseTownFile(exportTown(town));
  const prompt = buildPrompt(loaded, {
    kind: "reflect",
    agents: ["baba"],
    weekly: false,
    day: 2,
    minute: 600,
  });
  const [packet] = JSON.parse(prompt.split("\nPeople: ")[1]);
  assert.deepEqual(
    packet.evidence.events.map((m) => m.id),
    [ids[2]],
  );
  assert.deepEqual(
    packet.evidence.statements.map((m) => m.id),
    [ids[0]],
  );
  assert.deepEqual(
    packet.evidence.interpretations.map((m) => m.id),
    [ids[1]],
  );
  assert.equal(packet.evidence.statements[0].day, 1);
  assert.equal(packet.evidence.statements[0].minute, 420);
  assert.match(packet.evidence.statements[0].text, /I'll start the kettle if you like/);
  assert.match(prompt, /not.*action time/i);
  assert.match(prompt, /conditional.*future tense/i);
});

test("planning packets identify each resident's own home without changing public destinations", () => {
  const town = createTown("Test Resident");
  const prompt = buildPrompt(town, {
    kind: "plan",
    agents: ["kevin", "baba"],
    weekly: false,
    day: town.day,
    minute: town.minute,
  });
  const people = JSON.parse(prompt.split("\nPeople: ")[1]);
  assert.equal(people.find((a) => a.id === "baba").homePlace, "townhouses");
  assert.equal(people.find((a) => a.id === "kevin").homePlace, "cafe");
  assert.match(prompt, /public.*work.*"out"/i);
});
