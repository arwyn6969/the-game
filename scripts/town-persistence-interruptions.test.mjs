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
const economy = await server.ssrLoadModule("/src/game/economy.ts");
const work = await server.ssrLoadModule("/src/game/funded-work.ts");
const payroll = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { playerActions, applyPlayerAction, applyResult } =
  await server.ssrLoadModule("/src/game/effects.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const command = (id, kind, actor, terms) => ({ id, kind, actor, authority: "simulation", terms });
function successful(result) {
  assert.equal(result.ok, true, result.reason ?? result.reply);
  return result.value;
}
function reload(town) {
  const result = save.readTownFile(save.exportTown(town));
  assert.equal(result.status, "ready", result.reason);
  assert.deepEqual(economy.auditEconomy(result.town), []);
  return result.town;
}

test("an imported completed wage closes its own stale commitment without paying twice or closing a newer unit", () => {
  let town = createTown("Ada");
  const player = person(town, "player");
  player.tile = { ...person(town, "kevin").tile };
  const action = playerActions(town, "kevin").find(
    (item) => item.label === "Accept cafe shift · 5",
  );
  assert.ok(action);
  successful(applyPlayerAction(town, "kevin", action.id));
  const agreement = town.economy.work.agreements.find((item) => item.worker === "player");
  player.tile = { ...ANCHORS.cafe };
  // The accounting command commits before the runtime updates its legacy project projection.
  for (let minute = 960; minute < 1140; minute++) {
    town.minute = minute;
    successful(
      work.recordCafeAttendance(
        town,
        command(`minute:${minute}`, "record-cafe-attendance", "player", {
          agreementId: agreement.id,
          day: town.day,
          minute,
        }),
        agreement.id,
      ),
    );
  }
  const oldId = payroll.fundedWorkProjectId(agreement.id);
  assert.equal(person(town, "player").projects.find((item) => item.id === oldId).status, "open");
  town.day++;
  town.minute = 960;
  person(town, "player").tile = { ...person(town, "kevin").tile };
  const next = playerActions(town, "kevin").find((item) => item.label === "Accept cafe shift · 5");
  assert.ok(next);
  successful(applyPlayerAction(town, "kevin", next.id));
  const newer = town.economy.work.agreements.find(
    (item) => item.worker === "player" && item.id !== agreement.id,
  );
  assert.ok(newer);
  const newerId = payroll.fundedWorkProjectId(newer.id);
  town = reload(town);
  const money = person(town, "player").money;
  const transactions = town.economy.transactions.length;
  payroll.advanceFundedPayroll(town);
  assert.equal(person(town, "player").projects.find((item) => item.id === oldId).status, "done");
  assert.equal(person(town, "player").projects.find((item) => item.id === newerId).status, "open");
  assert.equal(person(town, "player").money, money);
  assert.equal(town.economy.transactions.length, transactions);
  reload(town);
});

test("financial effect dates remain bound to their authorizing command on import", () => {
  const town = createTown("Ada");
  economy.initializeEconomy(town);
  town.minute += 10;
  successful(
    economy.runEconomyCommand(
      town,
      command("test-payment", "test-transfer", "player", {}),
      (draft, context) => {
        economy.transferFunds(draft, context, {
          id: "test-payment:transfer",
          from: "agent:player",
          to: "agent:baba",
          amount: 1,
          purpose: "A personal payment",
        });
        return { amount: 1 };
      },
    ),
  );
  town.minute += 10;
  successful(
    economy.runEconomyCommand(
      town,
      command("reserve-coins", "test-hold", "player", {}),
      (draft, context) => {
        economy.reserveFunds(draft, context, {
          id: "personal-reservation",
          account: "agent:player",
          amount: 1,
          agreementId: "personal-commitment",
          purpose: "Reserve my own existing coin",
        });
        return { amount: 1 };
      },
    ),
  );
  town.minute += 10;
  successful(
    economy.runEconomyCommand(
      town,
      command("release-coins", "test-release", "player", {}),
      (draft, context) => {
        economy.releaseFunds(
          draft,
          context,
          "personal-reservation",
          "The unearned commitment is cancelled",
        );
        return { amount: 1 };
      },
    ),
  );
  town.minute += 10;
  const valid = reload(town);
  for (const corrupt of [
    (draft) => draft.economy.transactions[0].minute++,
    (draft) => draft.economy.holds[0].createdAt.minute++,
    (draft) => draft.economy.holds[0].releases[0].minute++,
  ]) {
    const corrupted = structuredClone(valid);
    corrupt(corrupted);
    const raw = JSON.stringify({ version: 2, town: corrupted });
    const report = save.readTownFile(raw);
    assert.equal(
      report.status,
      "unreadable",
      "a different valid past minute is still a contradictory financial record",
    );
    assert.equal(report.raw, raw);
  }
});

test("an NPC can repay its original tab after an authorized settlement correction and reload", () => {
  let town = createTown("Ada");
  town.favors.push({
    id: "corrected-npc-tab",
    from: "northern",
    to: "baba",
    amount: 2,
    status: "owed",
    day: 1,
    text: "The original personal tab",
  });
  const proposal = {
    kind: "talk",
    a: "northern",
    b: "baba",
    lines: [],
    favor: { id: "corrected-npc-tab", from: "northern", to: "baba", action: "pay" },
  };
  applyResult(town, proposal);
  assert.equal(town.favors[0].status, "paid");
  const payment = town.economy.transactions.find(
    (item) => item.agreementId === "corrected-npc-tab",
  );
  assert.ok(payment);
  const reason = "Correct a mistaken recorded settlement and preserve the original tab";
  successful(
    economy.reverseTransfer(
      town,
      command("correct-npc-tab", "money.reverse", "northern", {
        transactionId: payment.id,
        reason,
      }),
      payment.id,
      reason,
    ),
  );
  for (let cycle = 1; cycle <= 2; cycle++) {
    town = reload(town);
    const before = person(town, "northern").money;
    applyResult(town, proposal);
    assert.equal(town.favors[0].status, "paid");
    assert.equal(person(town, "northern").money, before - 2);
    const paid = person(town, "northern").money;
    applyResult(town, proposal);
    assert.equal(person(town, "northern").money, paid);
    if (cycle === 2) break;
    const latest = town.economy.transactions.findLast(
      (item) => item.agreementId === "corrected-npc-tab" && !item.reversalOf,
    );
    successful(
      economy.reverseTransfer(
        town,
        command(`correct-npc-tab:${cycle}`, "money.reverse", "northern", {
          transactionId: latest.id,
          reason,
        }),
        latest.id,
        reason,
      ),
    );
  }
  assert.equal(
    town.economy.transactions.filter(
      (item) => item.agreementId === "corrected-npc-tab" && !item.reversalOf,
    ).length,
    3,
  );
  reload(town);
});

test("a corrected player tab gets a fresh quoted repayment without reviving the old quote", () => {
  let town = createTown("Ada");
  town.favors.push({
    id: "corrected-player-tab",
    from: "player",
    to: "baba",
    amount: 2,
    status: "owed",
    day: 1,
    text: "My original personal tab",
  });
  person(town, "player").tile = { ...person(town, "baba").tile };
  const original = playerActions(town, "baba").find((item) => item.label === "Pay 2");
  assert.ok(original);
  successful(applyPlayerAction(town, "baba", original.id));
  const payment = town.economy.transactions.find(
    (item) => item.agreementId === "corrected-player-tab",
  );
  assert.ok(payment);
  const reason = "Correct my mistaken recorded settlement";
  successful(
    economy.reverseTransfer(
      town,
      command("correct-player-tab", "money.reverse", "player", {
        transactionId: payment.id,
        reason,
      }),
      payment.id,
      reason,
    ),
  );
  town = reload(town);
  const before = person(town, "player").money;
  assert.equal(applyPlayerAction(town, "baba", original.id).ok, false);
  assert.equal(person(town, "player").money, before);
  const next = playerActions(town, "baba").find((item) => item.label === "Pay 2");
  assert.ok(next);
  successful(applyPlayerAction(town, "baba", next.id));
  assert.equal(person(town, "player").money, before - 2);
  assert.equal(town.favors[0].status, "paid");
  assert.equal(applyPlayerAction(town, "baba", next.id).ok, false);
  assert.equal(person(town, "player").money, before - 2);
  reload(town);
});

test("corrected NPC repayments cannot collide with another valid imported debt ID", () => {
  for (const otherPaidFirst of [true, false]) {
    let town = createTown("Ada");
    for (const id of ["old-tab", "old-tab:correction:1"])
      town.favors.push({
        id,
        from: "northern",
        to: "baba",
        amount: 1,
        status: "owed",
        day: 1,
        text: "A separate preserved personal tab",
      });
    const pay = (id) =>
      applyResult(town, {
        kind: "talk",
        a: "northern",
        b: "baba",
        lines: [],
        favor: { id, from: "northern", to: "baba", action: "pay" },
      });
    if (otherPaidFirst) pay("old-tab:correction:1");
    pay("old-tab");
    const payment = town.economy.transactions.find((item) => item.agreementId === "old-tab");
    const reason = "Correct only the first tab's payment";
    successful(
      economy.reverseTransfer(
        town,
        command("correct-first-tab", "money.reverse", "northern", {
          transactionId: payment.id,
          reason,
        }),
        payment.id,
        reason,
      ),
    );
    town = reload(town);
    pay("old-tab");
    assert.equal(town.favors.find((item) => item.id === "old-tab").status, "paid");
    pay("old-tab:correction:1");
    assert.ok(town.favors.every((item) => item.status === "paid"));
    const money = person(town, "northern").money;
    pay("old-tab");
    pay("old-tab:correction:1");
    assert.equal(person(town, "northern").money, money);
    reload(town);
  }
});
