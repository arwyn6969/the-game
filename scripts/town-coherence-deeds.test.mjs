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
const { applyPlayerAction, playerActions, PLAYER_CAFE_SHIFT } = await server.ssrLoadModule(
  "/src/game/effects.ts",
);
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { visibleSocialEvents } = await server.ssrLoadModule("/src/game/social.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const say = (town, id, text) => {
  const result = offlineResult(town, {
    kind: "player",
    agentId: id,
    text,
    day: town.day,
    minute: town.minute,
  });
  applyResult(town, result);
  return result.reply;
};

test("a finished cafe shift is remembered by Kevin and listed in town life", () => {
  const town = createTown("Mira");
  const player = person(town, "player");
  const before = player.money;
  player.tile = { x: 10, y: 21 };
  player.shiftHours = 179 / 60;
  player.paidToday = false;
  player.plan.beats[16] = {
    hour: 16,
    place: "cafe",
    spot: "out",
    status: "on a cafe shift, earning it",
  };
  player.projects.push({
    id: "shift-test",
    owner: "player",
    kind: "shift",
    status: "open",
    place: "cafe",
    text: PLAYER_CAFE_SHIFT,
    day: 1,
  });
  town.minute = 16 * 60;
  stepMinute(town, false);
  assert.equal(player.money, before + 5);
  assert.equal(player.paidToday, true);
  const kevin = person(town, "kevin");
  assert.ok(
    kevin.memories.some((memory) => memory.text === "Mira worked the Hobbs shift. The till paid 5."),
  );
  const shown = visibleSocialEvents(town, false);
  assert.ok(shown.some((event) => event.text.includes("worked the Hobbs shift")));
  town.day += 1;
  town.minute = 8 * 60;
  assert.match(say(town, "kevin", "Hello"), /paid you 5 on day 1/);
});

test("taking and repaying bread is something Baba still mentions", () => {
  const town = createTown("Mira");
  const player = person(town, "player");
  const baba = person(town, "baba");
  player.tile = { x: baba.tile.x + 1, y: baba.tile.y };
  const accept = playerActions(town, "baba").find((action) =>
    action.label.startsWith("Accept bread"),
  );
  assert.equal(applyPlayerAction(town, "baba", accept.id).ok, true);
  assert.ok(visibleSocialEvents(town, false).some((event) => /loaf|tab/i.test(event.text)));
  assert.match(say(town, "baba", "Hello"), /carrying the loaf/);
  assert.match(say(town, "baba", "Hello"), /tab is 2|tab is still 2/);
  const pay = playerActions(town, "baba").find((action) => action.label === "Pay 2");
  assert.equal(applyPlayerAction(town, "baba", pay.id).ok, true);
  assert.match(say(town, "baba", "Hello"), /paid the bread tab/);
  town.day += 3;
  assert.doesNotMatch(say(town, "baba", "Hello"), /bread tab/);
});
