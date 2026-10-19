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
const { activateFundedTown } = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const { auditEconomy, availableFunds, runEconomyCommand, reserveFunds } =
  await server.ssrLoadModule("/src/game/economy.ts");
const { buyReadingRefreshments, readingRefreshmentReceipt, READING_REFRESHMENTS_PRICE } =
  await server.ssrLoadModule("/src/game/commerce.ts");
const { exportTown } = await server.ssrLoadModule("/src/game/save.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const EVENT = "library-evening:1:1";
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const cash = (town) =>
  town.agents.reduce((sum, agent) => sum + agent.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const funded = (money = 4) => {
  const town = createTown("Mira");
  person(town, "player").money = money;
  assert.equal(activateFundedTown(town).ok, true);
  // Finance-only event fixture; community action/import lifecycles have their
  // own end-to-end suite using real preparation reports and routed residents.
  town.economy.projects = {
    library: {
      started: 1,
      evening: { version: 1, eventId: EVENT, choice: "park", status: "ready" },
    },
  };
  person(town, "player").tile = { ...ANCHORS.park };
  return town;
};

test("reading refreshments are a two-coin cash sale into the grocery till, preserving personal tabs", () => {
  const town = funded();
  town.favors.push({
    id: "old-bread-tab",
    from: "player",
    to: "baba",
    amount: 2,
    text: "An existing personal bread tab.",
    status: "owed",
    day: 1,
  });
  const original = structuredClone({
    debt: town.favors[0],
    money: person(town, "baba").money,
    items: person(town, "player").projects,
    holds: town.economy.holds,
    work: town.economy.work,
  });
  const total = cash(town);
  const till = town.tills.grocery;
  const available = availableFunds(town, "till:grocery");
  const result = buyReadingRefreshments(town, EVENT);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.replayed, false);
  assert.equal(result.value.amount, READING_REFRESHMENTS_PRICE);
  assert.equal(person(town, "player").money, 2);
  assert.equal(town.tills.grocery, till + 2);
  assert.equal(availableFunds(town, "till:grocery"), available + 2);
  assert.equal(person(town, "baba").money, original.money);
  assert.deepEqual(town.favors[0], original.debt);
  assert.deepEqual(person(town, "player").projects, original.items);
  assert.deepEqual(town.economy.holds, original.holds);
  assert.deepEqual(town.economy.work, original.work);
  assert.equal(cash(town), total);
  assert.equal(town.economy.transactions.filter((entry) => entry.kind !== "transfer").length, 0);
  assert.deepEqual(readingRefreshmentReceipt(town, EVENT), result.value);
  assert.deepEqual(auditEconomy(town), []);
});

test("each tray has one exact receipt and cannot charge twice across JSON serialization", () => {
  let town = funded();
  const first = buyReadingRefreshments(town, EVENT);
  assert.equal(first.ok, true);
  const after = exportTown(town);
  const repeat = buyReadingRefreshments(town, EVENT);
  assert.equal(repeat.ok, true);
  assert.equal(repeat.replayed, true);
  assert.equal(exportTown(town), after);
  town = JSON.parse(after).town;
  assert.deepEqual(readingRefreshmentReceipt(town, EVENT), first.value);
  const repeatedAfterReload = buyReadingRefreshments(town, EVENT);
  assert.equal(repeatedAfterReload.ok, true);
  assert.equal(repeatedAfterReload.replayed, true);
  assert.equal(person(town, "player").money, 2);
  const cafeTill = town.tills.cafe;
  const second = buyReadingRefreshments(town, EVENT, "tea");
  assert.equal(second.ok, true);
  assert.notEqual(second.value.transactionId, first.value.transactionId);
  assert.equal(town.tills.cafe, cafeTill + 2);
  assert.equal(second.value.kind, "tea");
  assert.deepEqual(readingRefreshmentReceipt(town, EVENT, "tea"), second.value);
  assert.equal(buyReadingRefreshments(town, EVENT, "tea").replayed, true);
  assert.equal(person(town, "player").money, 0);
  assert.deepEqual(auditEconomy(town), []);
});

test("an unaffordable sale changes neither funds nor the recorded event payment history", () => {
  const town = funded(1);
  const before = exportTown(town);
  const result = buyReadingRefreshments(town, EVENT);
  assert.equal(result.ok, false);
  assert.equal(result.code, "insufficient-funds");
  assert.equal(readingRefreshmentReceipt(town, EVENT), null);
  assert.equal(exportTown(town), before);
});

test("paying for bread cannot fabricate a tea tray when the purse is then empty", () => {
  const town = funded(2);
  assert.equal(buyReadingRefreshments(town, EVENT).ok, true);
  const before = exportTown(town);
  const tea = buyReadingRefreshments(town, EVENT, "tea");
  assert.equal(tea.ok, false);
  assert.equal(tea.code, "insufficient-funds");
  assert.ok(readingRefreshmentReceipt(town, EVENT));
  assert.equal(readingRefreshmentReceipt(town, EVENT, "tea"), null);
  assert.equal(exportTown(town), before);
  const unknown = buyReadingRefreshments(town, EVENT, "coffee");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "invalid-event");
  assert.equal(exportTown(town), before);
});

test("refreshments cannot spend personal coins already reserved for another commitment", () => {
  const town = funded();
  const reserved = runEconomyCommand(
    town,
    {
      id: "personal:reserve",
      kind: "reserve-personal-funds",
      actor: "player",
      authority: "ui",
      terms: { amount: 3 },
    },
    (draft, context) =>
      reserveFunds(draft, context, {
        id: "hold:personal",
        account: "agent:player",
        amount: 3,
        agreementId: "personal:commitment",
        purpose: "An existing explicitly reserved personal commitment",
      }),
  );
  assert.equal(reserved.ok, true, reserved.reason);
  const before = exportTown(town);
  const result = buyReadingRefreshments(town, EVENT);
  assert.equal(result.ok, false);
  assert.equal(result.code, "insufficient-funds");
  assert.equal(exportTown(town), before);
  assert.deepEqual(auditEconomy(town), []);
});

test("blank or prose event keys cannot create a sale or activate financial state", () => {
  const town = createTown("Mira");
  const before = exportTown(town);
  for (const eventId of ["", " ", "My invented reading", "reading\n1", "a".repeat(97)]) {
    const result = buyReadingRefreshments(town, eventId);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-event");
    assert.equal(readingRefreshmentReceipt(town, eventId), null);
  }
  assert.equal(exportTown(town), before);
  assert.equal(town.economy, undefined);
});

test("a purchase projection cannot treat another creditor, amount or event as its cash-sale receipt", () => {
  const town = funded();
  const result = buyReadingRefreshments(town, EVENT);
  assert.equal(result.ok, true);
  for (const mutate of [
    (copy) => (copy.economy.transactions.at(-1).to = "agent:baba"),
    (copy) => (copy.economy.transactions.at(-1).amount = 1),
    (copy) => (copy.economy.transactions.at(-1).agreementId = "library-evening:2:1"),
    (copy) => (copy.economy.commandReceipts.at(-1).value.amount = 1),
    (copy) => (copy.economy.commandReceipts.at(-1).authority = "simulation"),
  ]) {
    const copy = structuredClone(town);
    mutate(copy);
    assert.equal(readingRefreshmentReceipt(copy, EVENT), null);
  }
  assert.equal(readingRefreshmentReceipt(town, EVENT, "tea"), null);
  assert.equal(readingRefreshmentReceipt(town, "library-evening:2:1"), null);
});

test("a fresh purchase requires the actual named event, an active reading and its current venue", () => {
  for (const mutate of [
    (town) => (town.economy.projects.library.evening.status = "invited"),
    (town) => (town.economy.projects.library.evening.status = "waiting"),
    (town) => (town.economy.projects.library.evening.status = "done"),
    (town) => (town.economy.projects.library.evening.choice = null),
    (town) => (town.economy.projects.library.evening.version = 2),
    (town) => (town.economy.projects.library.evening.eventId = "library-evening:2:1"),
    (town) => (person(town, "player").tile = { ...ANCHORS.cafe }),
  ]) {
    const town = funded();
    mutate(town);
    const before = exportTown(town);
    const result = buyReadingRefreshments(town, EVENT);
    assert.equal(result.ok, false);
    assert.equal(result.code, "reading-unavailable");
    assert.equal(exportTown(town), before);
  }
  const library = funded();
  library.economy.projects.library.evening.choice = "library";
  library.economy.projects.library.evening.status = "routing";
  person(library, "player").tile = { ...ANCHORS.library };
  assert.equal(buyReadingRefreshments(library, EVENT, "tea").ok, true);
});

test("a completed event can replay its paid receipt but cannot add another tray", () => {
  const town = funded();
  assert.equal(buyReadingRefreshments(town, EVENT).ok, true);
  town.economy.projects.library.evening.status = "done";
  const before = exportTown(town);
  const replay = buyReadingRefreshments(town, EVENT);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(exportTown(town), before);
  const extra = buyReadingRefreshments(town, EVENT, "tea");
  assert.equal(extra.ok, false);
  assert.equal(extra.code, "reading-unavailable");
  assert.equal(exportTown(town), before);
});
