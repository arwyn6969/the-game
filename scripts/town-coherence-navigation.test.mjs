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
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { refreshResidentStatus } = await server.ssrLoadModule("/src/game/navigation.ts");
const { planFromBlocks, beatAt, goalFor } = await server.ssrLoadModule("/src/game/plan.ts");
const { walkable, placeOfZone, zoneAt } = await server.ssrLoadModule("/src/game/world.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const resident = (town, id) => town.agents.find((a) => a.id === id);

function scenario() {
  const town = createTown("Test resident");
  town.minute = 20 * 60 + 58;
  for (const agent of town.agents) {
    if (agent.id === "player") continue;
    agent.tile = { ...agent.home };
    agent.path = [];
    agent.plan = planFromBlocks(town.day, "A quiet evening", [
      {
        from: 0,
        to: 24,
        place: placeOfZone(zoneAt(agent.home.x, agent.home.y)),
        spot: "home",
        status: `${agent.name} has arrived home`,
      },
    ]);
  }
  return town;
}

/** Check every intermediate assignment, not only a collision-free final screenshot. */
function traceMotion(town) {
  const counts = new Map();
  for (const agent of town.agents) {
    let tile = agent.tile;
    Object.defineProperty(agent, "tile", {
      configurable: true,
      enumerable: true,
      get: () => tile,
      set: (next) => {
        assert.notEqual(agent.id, "player", "simulation never moves the player");
        assert.equal(
          Math.abs(next.x - tile.x) + Math.abs(next.y - tile.y),
          1,
          `${agent.id} uses one adjacent step`,
        );
        assert.ok(walkable(next.x, next.y));
        assert.ok(
          town.agents.every(
            (other) => other.id === agent.id || other.tile.x !== next.x || other.tile.y !== next.y,
          ),
          "every intermediate tile is unoccupied",
        );
        counts.set(agent.id, (counts.get(agent.id) ?? 0) + 1);
        assert.ok(
          counts.get(agent.id) <= 3,
          `${agent.id} keeps the normal movement budget, including yielding`,
        );
        tile = next;
      },
    });
  }
  return () => counts.clear();
}

function advance(town, minutes, clear = () => {}) {
  for (let i = 0; i < minutes; i++) {
    clear();
    // Dialogue/model proposals are irrelevant to these movement scenarios.
    stepMinute(town, false);
  }
}

test("opposing cafe traffic yields without moving a nearby stationary player", () => {
  const town = scenario();
  resident(town, "kevin").tile = { x: 17, y: 20 };
  resident(town, "baba").tile = { x: 16, y: 20 };
  resident(town, "northern").tile = { x: 10, y: 21 };
  resident(town, "player").tile = { x: 15, y: 20 };
  const clear = traceMotion(town);
  advance(town, 1, clear);
  for (const id of ["kevin", "baba", "northern"])
    assert.doesNotMatch(resident(town, id).status, /has arrived home/);
  advance(town, 19, clear);
  for (const id of ["kevin", "baba", "northern"]) {
    assert.deepEqual(resident(town, id).tile, resident(town, id).home);
    assert.match(resident(town, id).status, /has arrived home/);
  }
  assert.deepEqual(resident(town, "player").tile, { x: 15, y: 20 });
});

test("the same yielding policy clears opposing traffic at the library door", () => {
  const town = scenario();
  resident(town, "arwyn").tile = { x: 34, y: 20 };
  resident(town, "baba").tile = { x: 35, y: 20 };
  resident(town, "player").tile = { x: 36, y: 20 };
  const clear = traceMotion(town);
  advance(town, 30, clear);
  assert.deepEqual(resident(town, "arwyn").tile, resident(town, "arwyn").home);
  assert.deepEqual(resident(town, "baba").tile, resident(town, "baba").home);
  assert.deepEqual(resident(town, "player").tile, { x: 36, y: 20 });
});

test("a player occupying the only doorway blocks passage and produces truthful observations", () => {
  const town = scenario();
  town.minute = 13 * 60 + 59;
  resident(town, "baba").tile = { x: 16, y: 20 };
  resident(town, "baba").status = "already asleep in bed";
  resident(town, "northern").tile = { x: 10, y: 21 };
  resident(town, "player").tile = { x: 17, y: 20 };
  const clear = traceMotion(town);
  advance(town, 15, clear);
  assert.deepEqual(resident(town, "baba").tile, { x: 16, y: 20 });
  assert.match(resident(town, "baba").status, /waiting for a clear path home/);
  assert.deepEqual(resident(town, "player").tile, { x: 17, y: 20 });
  const observations = resident(town, "northern").memories.filter(
    (m) => m.type === "observe" && m.minute === 14 * 60,
  );
  assert.ok(observations.some((m) => /saw Baba — waiting for a clear path home/.test(m.text)));
  assert.ok(observations.every((m) => !/already asleep|has arrived home/.test(m.text)));
});

test("shared destinations settle beside their occupant instead of endlessly displacing them", () => {
  const town = scenario();
  for (const id of ["arwyn", "data"]) {
    const agent = resident(town, id);
    agent.plan = planFromBlocks(town.day, "Read records", [
      { from: 0, to: 24, place: "library", spot: "out", status: "reading records in the library" },
    ]);
  }
  resident(town, "arwyn").tile = { x: 40, y: 20 };
  resident(town, "data").tile = { x: 39, y: 20 };
  const clear = traceMotion(town);
  advance(town, 30, clear);
  assert.deepEqual(resident(town, "arwyn").tile, { x: 40, y: 20 });
  assert.deepEqual(resident(town, "data").tile, { x: 39, y: 20 });
  assert.equal(resident(town, "data").status, "reading records in the library");
});

test("refreshing a paused resident's status does not move them or claim their destination", () => {
  const town = scenario();
  resident(town, "baba").tile = { x: 16, y: 20 };
  resident(town, "player").tile = { x: 17, y: 20 };
  const before = town.agents.map((a) => ({ ...a.tile }));
  for (const agent of town.agents) refreshResidentStatus(town, agent);
  assert.deepEqual(
    town.agents.map((a) => a.tile),
    before,
  );
  assert.match(resident(town, "baba").status, /waiting for a clear path home/);
});

test("a new town can refresh arrival labels without moving any resident", () => {
  const town = createTown("Test resident");
  const before = town.agents.map((a) => ({ ...a.tile }));
  for (const agent of town.agents) {
    if (agent.id === "player") continue;
    const beat = beatAt(agent, town.minute);
    const goal = goalFor(agent, beat);
    if (agent.tile.x === goal.x && agent.tile.y === goal.y) continue;
    if (beat.spot === "home" || placeOfZone(zoneAt(agent.tile.x, agent.tile.y)) !== beat.place)
      assert.notEqual(agent.status, beat.status, `${agent.id} is still on the way`);
  }
  assert.deepEqual(
    town.agents.map((a) => a.tile),
    before,
  );
});

test("a paused save refreshes stale arrival claims without changing positions or receipts", () => {
  const town = scenario();
  town.paused = true;
  resident(town, "baba").tile = { x: 16, y: 20 };
  resident(town, "baba").status = "Baba has arrived home";
  resident(town, "player").tile = { x: 17, y: 20 };
  const stable = (value) => ({
    day: value.day,
    minute: value.minute,
    paused: value.paused,
    tills: value.tills,
    favors: value.favors,
    residents: value.agents.map(({ id, tile, money, memories, plan }) => ({
      id,
      tile,
      money,
      memories: memories.map((memory) => ({
        ...memory,
        seed: memory.seed === true,
        turns: memory.turns ?? [],
      })),
      plan,
    })),
  });
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  assert.match(resident(restored, "baba").status, /waiting for a clear path home/);
  assert.deepEqual(stable(restored), stable(town));
});

test("applying a new plan does not claim the resident has already arrived", () => {
  const town = scenario();
  resident(town, "baba").tile = { x: 16, y: 20 };
  resident(town, "player").tile = { x: 17, y: 20 };
  const before = { ...resident(town, "baba").tile };
  applyResult(town, {
    kind: "plan",
    mind: "offline",
    plans: [
      {
        id: "baba",
        summary: "A quiet evening",
        blocks: [{ from: 0, to: 24, place: "townhouses", spot: "home", status: "already home" }],
      },
    ],
  });
  assert.match(resident(town, "baba").status, /waiting for a clear path home/);
  assert.deepEqual(resident(town, "baba").tile, before);
});
