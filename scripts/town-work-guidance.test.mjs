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
const { playerActions, applyPlayerAction } = await server.ssrLoadModule("/src/game/effects.ts");
const { everydayReply } = await server.ssrLoadModule("/src/game/local-dialogue.ts");
const { activateFundedTown } = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const { auditEconomy, availableFunds } = await server.ssrLoadModule("/src/game/economy.ts");
const { buyReadingRefreshments } = await server.ssrLoadModule("/src/game/commerce.ts");
const { exportTown } = await server.ssrLoadModule("/src/game/save.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const cafeOffer = (town) =>
  playerActions(town, "kevin").find((action) => action.label === "Accept cafe shift · 5");
const ask = (town, id, text) => everydayReply(town, person(town, id), text);

test("a cafe quote discloses available funding after payroll without activating or exposing personal books", () => {
  const town = createTown("Mira");
  const before = JSON.stringify(town);
  const offer = cafeOffer(town);
  assert.equal(offer.disabledReason, undefined);
  assert.match(offer.terms, /cafe has 17 coins available after existing reservations/);
  assert.match(offer.terms, /each new shift needs 5/);
  assert.match(offer.terms, /till does not refill at midnight/);
  assert.doesNotMatch(offer.terms, /agent:|till:|Kevin.*11|Baba.*9|legacy:/);
  assert.match(ask(town, "kevin", "Can I work here?"), /cafe has 17 coins available/);
  assert.equal(JSON.stringify(town), before);
  assert.equal(town.economy, undefined);
});

test("an unfunded quote explains the shortage and cannot consume reserved payroll", () => {
  const town = createTown("Mira");
  town.tills.cafe = 8;
  person(town, "player").tile = { ...person(town, "kevin").tile };
  const before = JSON.stringify(town);
  const offer = cafeOffer(town);
  assert.match(offer.terms, /cafe has 3 coins available after existing reservations/);
  assert.match(offer.disabledReason, /full wage of 5.*Only 3 coins are available/);
  assert.equal(applyPlayerAction(town, "kevin", offer.id).ok, false);
  assert.equal(JSON.stringify(town), before);
});

test("a real reading sale changes the disclosed availability and restores an affordable wage quote", () => {
  let town = createTown("Mira");
  town.tills.cafe = 8;
  assert.equal(activateFundedTown(town).ok, true);
  town.economy.projects = {
    library: {
      started: 1,
      evening: {
        version: 1,
        eventId: "library-evening:1:1",
        choice: "park",
        status: "ready",
      },
    },
  };
  person(town, "player").tile = { ...ANCHORS.park };
  const holds = structuredClone(town.economy.holds);
  const openingCash = town.tills.cafe + person(town, "player").money;
  assert.match(cafeOffer(town).disabledReason, /Only 3 coins are available/);
  assert.equal(buyReadingRefreshments(town, "library-evening:1:1", "tea").ok, true);
  assert.equal(town.tills.cafe + person(town, "player").money, openingCash);
  assert.deepEqual(town.economy.holds, holds);
  assert.equal(availableFunds(town, "till:cafe"), 5);
  assert.equal(cafeOffer(town).disabledReason, undefined);
  assert.match(cafeOffer(town).terms, /cafe has 5 coins available/);
  assert.deepEqual(auditEconomy(town), []);
  // Finance-only fixture: this checks serialized funding and quote projections,
  // while the complete reading/import journey has its own browser gate.
  town = JSON.parse(exportTown(town)).town;
  const before = JSON.stringify(town);
  assert.equal(cafeOffer(town).disabledReason, undefined);
  assert.match(cafeOffer(town).terms, /cafe has 5 coins available/);
  assert.equal(JSON.stringify(town), before);
});

test("fresh-town work and wage referrals distinguish recorded grocery claims from new offers", () => {
  for (const funded of [false, true]) {
    const town = createTown("Mira");
    if (funded) assert.equal(activateFundedTown(town).ok, true);
    const before = JSON.stringify(town);
    for (const id of ["data", "amelia", "arwyn", "northern", "sub"])
      for (const question of ["Can I get a job?", "Have I been paid?"]) {
        const reply = ask(town, id, question);
        assert.match(reply, /Baba can check grocery work already recorded/);
        assert.match(reply, /no new grocery shift offer/);
      }
    assert.match(ask(town, "baba", "Have I been paid?"), /no new grocery shift offer/);
    assert.match(ask(town, "baba", "Can I work here?"), /no new grocery shift offer/);
    assert.equal(JSON.stringify(town), before);
  }
});
