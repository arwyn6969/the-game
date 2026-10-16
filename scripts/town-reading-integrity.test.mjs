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
const { libraryActions, applyLibraryAction, libraryView, validateLibraryState } =
  await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const state = (town) => town.economy.projects.library;
const evening = (town) => state(town).evening;
function act(town, kind, arg) {
  const action = libraryActions(town).find((item) => {
    const [actualKind, actualArg] = JSON.parse(item.id);
    return actualKind === kind && actualArg === arg;
  });
  assert.ok(action, `Missing ${kind}:${arg}`);
  assert.equal(action.disabledReason, undefined, action.disabledReason);
  const result = applyLibraryAction(town, action.id);
  assert.equal(result.ok, true, result.reply);
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateLibraryState(town), []);
}
function bookedReading(work = false) {
  const town = createTown("Mira");
  if (work)
    person(town, "northern").projects.push({
      id: "original-northern-shift",
      owner: "northern",
      kind: "shift",
      place: "cafe",
      status: "open",
      day: 1,
      text: "Preserved agreed cafe attendance, 16:00–20:00.",
    });
  act(town, "accept", "reference");
  person(town, "player").tile = { ...ANCHORS.library };
  for (const key of [
    "card:kevin",
    "box:Birch",
    "box:Alder",
    "box:Cedar",
    "card:equipment",
    "card:dorm",
  ])
    act(town, "inspect", key);
  act(town, "report", "reference");
  act(town, "request", "source");
  act(town, "submit", "player");
  act(town, "test", "");
  for (let minute = 0; minute < 120 && state(town).lookup.status !== "done"; minute++)
    advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "done");
  act(town, "evening-plan", "park");
  return town;
}
function readyReading(work = false) {
  const town = bookedReading(work);
  person(town, "player").tile = { ...libraryView(town).story.gathering.tile };
  for (let minute = 0; minute < 180 && evening(town).status !== "ready"; minute++)
    advanceTown(town, 1);
  assert.equal(evening(town).status, "ready");
  assert.ok(parseTownFile(exportTown(town)), "the honest ready fixture must load");
  return town;
}

test("import rejects a ready reading whose guests have not physically arrived", () => {
  const town = bookedReading();
  assert.ok(libraryView(town).story.gathering.guests.some((guest) => !guest.arrived));
  assert.ok(parseTownFile(exportTown(town)), "the honest routing fixture must load");
  const forged = JSON.parse(exportTown(town));
  const claimed = state(forged.town).evening;
  claimed.status = "ready";
  claimed.readyAt = { day: town.day, minute: town.minute };
  assert.equal(parseTownFile(JSON.stringify(forged)) === null, true);
});

test("matching forged scene copies cannot claim refreshments without the actual sales", () => {
  const town = readyReading();
  act(town, "evening-join", "listen");
  assert.deepEqual(libraryView(town).story.refreshments, []);
  assert.ok(parseTownFile(exportTown(town)), "the honest completed fixture must load");
  const forged = JSON.parse(exportTown(town));
  const project = state(forged.town);
  project.evening.scene[project.evening.scene.length - 1] =
    "They pass round Baba's bread tray and Kevin's tea tray. Your earned coins have become something shared.";
  project.events.find((event) => event.id === `reading:${project.evening.eventId}:scene`).text =
    `${project.evening.outcome} ${project.evening.scene.join(" ")}`;
  assert.deepEqual(auditEconomy(forged.town), [], "the forged scene changes no financial totals");
  assert.equal(parseTownFile(JSON.stringify(forged)) === null, true);
});

test("an asynchronous work replan demotes readiness and remains saveable before the next clock tick", () => {
  const town = readyReading(true);
  assert.ok(
    town.economy.work.agreements.some(
      (agreement) => agreement.worker === "northern" && agreement.status === "active",
    ),
    "the replan concerns a genuine funded wage commitment",
  );
  const clock = { day: town.day, minute: town.minute };
  const books = structuredClone(town.economy.work);
  const balances = town.agents.map(({ money }) => money);
  applyResult(town, {
    kind: "plan",
    mind: "grok",
    weekly: false,
    plans: [
      {
        id: "northern",
        summary: "A newly received plan keeps my current cafe commitment.",
        blocks: [
          { from: 0, to: 24, place: "cafe", spot: "out", status: "working the current cafe shift" },
        ],
      },
    ],
  });
  assert.equal(evening(town).status, "routing");
  assert.equal(evening(town).readyAt, null);
  assert.equal(evening(town).completedAt, null);
  assert.equal(evening(town).attendedByPlayer, false);
  assert.deepEqual({ day: town.day, minute: town.minute }, clock);
  assert.deepEqual(town.economy.work, books);
  assert.deepEqual(
    town.agents.map(({ money }) => money),
    balances,
  );
  assert.deepEqual(validateLibraryState(town), []);
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored, "a legitimate replan must save without waiting for another minute");
  assert.equal(
    person(restored, "northern").plan.summary,
    "A newly received plan keeps my current cafe commitment.",
  );
  assert.ok(
    person(restored, "northern").plan.beats.every(
      (beat) => beat.status === "working the current cafe shift",
    ),
  );
});
