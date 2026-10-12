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
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const economy = await server.ssrLoadModule("/src/game/economy.ts");
const work = await server.ssrLoadModule("/src/game/funded-work.ts");
const migration = await server.ssrLoadModule("/src/game/economy-migration.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(async () => {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
  await server.close();
});

const copy = (value) => structuredClone(value);
const agent = (town, id) => town.agents.find((person) => person.id === id);
const cash = (town) =>
  town.agents.reduce((sum, person) => sum + person.money, 0) + town.tills.cafe + town.tills.grocery;
const fundedTown = (change = () => {}) => {
  const town = createTown("Ada");
  change(town);
  const result = migration.initializeFundedEconomy(town);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(economy.auditEconomy(town), []);
  return town;
};
const command = (id, terms = {}, extra = {}) => ({
  id,
  kind: "test-transfer",
  actor: "player",
  authority: "ui",
  terms,
  ...extra,
});
const transfer = (town, id, from, to, amount, extra = {}) =>
  economy.runEconomyCommand(town, command(id, { from, to, amount }, extra), (draft, context) => {
    economy.transferFunds(draft, context, {
      id: `${id}:transfer`,
      from,
      to,
      amount,
      purpose: "A disclosed fixture transfer",
    });
    return { from, to, amount };
  });
const reload = (town) => {
  const result = save.readTownFile(save.exportTown(town));
  assert.equal(result.status, "ready", result.reason);
  assert.deepEqual(economy.auditEconomy(result.town), []);
  return result.town;
};
const shift = (town, worker = "player", place = "cafe", hours = 0, paid = false) => {
  const person = agent(town, worker);
  person.shiftHours = hours;
  person.paidToday = paid;
  person.projects.push({
    id: `${worker}-${place}-legacy`,
    owner: worker,
    kind: "shift",
    place,
    status: "open",
    day: town.day,
    text:
      place === "cafe"
        ? "Cafe shift, 16:00 to 19:00 each day until cancelled; 5 after three hours if the till can pay."
        : "Grocery shift; 4 after three hours if the till can pay.",
  });
  person.plan.beats.forEach((beat) => {
    if (beat.hour >= 16 && beat.hour < 19)
      Object.assign(beat, { place, spot: "out", status: "working" });
  });
  return person;
};
const sim = (id, kind, actor, terms) =>
  command(id, terms, { kind, actor, authority: "simulation" });
const workerCommand = (id, kind, worker, terms) =>
  command(id, terms, { kind, actor: worker, authority: worker === "player" ? "ui" : "simulation" });
const workState = (town) => town.economy.work;
const successful = (result) => {
  assert.equal(result.ok, true, result.reason);
  return result.value;
};
const approveProject = (town, projectId = "library") => {
  const approvalIds = [];
  for (const [donor, account] of [
    ["kevin", "till:cafe"],
    ["baba", "till:grocery"],
  ]) {
    const approval = {
      id: `${projectId}:${donor}-approval`,
      projectId,
      donor,
      account,
      amount: 4,
      expires: { day: town.day + 2, minute: town.minute },
    };
    successful(
      work.approveLibraryContribution(
        town,
        sim(`${approval.id}:command`, "approve-library-contribution", donor, approval),
        approval,
      ),
    );
    approvalIds.push(approval.id);
  }
  return approvalIds;
};
const fundProject = (town, projectId = "library") => {
  const approvalIds = approveProject(town, projectId);
  return work.fundLibraryProject(
    town,
    sim(`fund:${projectId}`, "fund-library-project", "kevin", { projectId, approvalIds }),
    projectId,
    approvalIds,
  );
};
const acceptCheck = (town, suffix = "one", worker = "player", payer = "project:library") => {
  const offer = {
    id: `check:${suffix}`,
    revision: 1,
    worker,
    payer,
    issuer: "kevin",
    task: "Inspect the source card and box; report supported or unresolved mappings.",
    requiredEvidence: ["source-card", "box"],
    fee: 2,
    expires: { day: town.day + 2, minute: town.minute },
  };
  const saved = successful(
    work.createWorkOffer(town, sim(`offer:${suffix}`, "offer-work", "kevin", offer), offer),
  );
  return successful(
    work.acceptWorkOffer(
      town,
      workerCommand(`accept:${suffix}`, "accept-work", worker, work.workAcceptanceTerms(saved)),
      saved.id,
    ),
  );
};
const observe = (town, agreement, key) => {
  const input = {
    id: `evidence:${agreement.id}:${key}`,
    agreementId: agreement.id,
    worker: agreement.worker,
    key,
    source: `Authored ${key} fixture`,
    detail: `Recorded interaction with the ${key}.`,
  };
  return successful(
    work.recordWorkEvidence(
      town,
      sim(`observe:${agreement.id}:${key}`, "record-work-evidence", agreement.worker, input),
      input,
    ),
  );
};
const reportCheck = (town, agreement, outcome = "success", evidenceIds) => {
  const ids =
    evidenceIds ?? agreement.requiredEvidence.map((key) => observe(town, agreement, key).id);
  const report = {
    outcome,
    text:
      outcome === "success"
        ? "The current mapping is supported."
        : "The check was completed; the mapping failed or remains uncertain.",
    evidenceIds: ids,
  };
  return successful(
    work.submitWorkReport(
      town,
      workerCommand(`report:${agreement.id}`, "submit-work-report", agreement.worker, {
        agreementId: agreement.id,
        report,
      }),
      agreement.id,
      report,
    ),
  );
};
const completeCheck = (town, agreement, id = `complete:${agreement.id}`) =>
  work.completeWorkUnit(
    town,
    sim(id, "complete-work", agreement.worker, { agreementId: agreement.id }),
    agreement.id,
  );
const fundedDay = (town) =>
  successful(
    work.advanceFundedDay(
      town,
      sim(`day:${town.day + 1}`, "advance-funded-day", "kevin", { nextDay: town.day + 1 }),
    ),
  );
const payrollApproval = (town, id, kind, claimId = null, confirmedMinutes = 0) => {
  const approval = {
    id,
    kind,
    worker: "player",
    payer: "till:cafe",
    issuer: "kevin",
    claimId,
    confirmedMinutes,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: town.day + 2, minute: town.minute },
    cancellation: work.CAFE_CANCELLATION,
  };
  successful(
    work.approvePayrollAgreement(
      town,
      sim(`approve:${id}`, "approve-payroll-agreement", "kevin", approval),
      approval,
    ),
  );
  return approval;
};

test("the S1 initialization boundary reconciles the fresh 77 without activating ordinary towns", () => {
  const town = createTown("Ada");
  const before = copy(town);
  assert.equal(cash(town), 77);
  assert.equal(town.economy, undefined);
  assert.deepEqual(economy.auditEconomy(town), []);
  const ordinary = save.parseTownFile(save.exportTown(town));
  assert.equal(
    ordinary.economy,
    undefined,
    "ordinary import must not activate half the funded economy",
  );
  assert.deepEqual(town, before);
  assert.equal(migration.initializeFundedEconomy(town).ok, true);
  assert.equal(cash(town), 77, "opening recognition does not issue earnings");
  assert.deepEqual(economy.auditEconomy(town), []);
  const initialized = copy(town);
  assert.deepEqual(migration.initializeFundedEconomy(town), { ok: true, migrated: false });
  assert.deepEqual(
    town,
    initialized,
    "repeated migration cannot duplicate openings, claims or holds",
  );
  assert.deepEqual(reload(town).economy, town.economy);
});

test("the funded boundary completes an existing account snapshot without reopening its books", () => {
  const town = createTown("Ada");
  shift(town, "player", "cafe", 3);
  economy.initializeEconomy(town);
  const opening = copy(town.economy.openingBalances);
  assert.equal(town.economy.work, undefined);
  const existing = transfer(town, "before-payroll-migration", "agent:player", "agent:baba", 1);
  assert.equal(existing.ok, true, existing.reason);
  const transactions = copy(town.economy.transactions);
  const cashBefore = cash(town);
  assert.deepEqual(migration.initializeFundedEconomy(town), { ok: true, migrated: true });
  assert.deepEqual(town.economy.openingBalances, opening);
  assert.deepEqual(town.economy.transactions, transactions);
  assert.equal(cash(town), cashBefore);
  assert.equal(
    town.economy.transactions.some((transaction) => transaction.kind !== "transfer"),
    false,
  );
  assert.equal(economy.availableFunds(town, "till:cafe"), town.tills.cafe - 10);
  assert.equal(economy.availableFunds(town, "till:grocery"), town.tills.grocery - 4);
  const claim = workState(town).legacyClaims.find((item) => item.worker === "player");
  assert.equal(claim.classification, "completed-unpaid");
  assert.equal(claim.resolution, "protected");
  assert.equal(workState(town).payables.filter((payable) => payable.worker === "player").length, 1);
  assert.ok(town.economy.commandReceipts.some((receipt) => receipt.id === existing.receipt.id));
  const migrated = copy(town);
  assert.deepEqual(migration.initializeFundedEconomy(town), { ok: true, migrated: false });
  assert.deepEqual(town, migrated);
  assert.deepEqual(reload(town).economy, migrated.economy);
});

test("invalid legacy attendance and payment flags retain raw recovery instead of being normalized away", () => {
  for (const [field, value] of [
    ["shiftHours", -1],
    ["shiftHours", NaN],
    ["shiftHours", Infinity],
    ["paidToday", "false"],
    ["paidToday", 0],
    ["paidToday", null],
  ]) {
    for (const coreSnapshot of [false, true]) {
      const town = createTown("Ada");
      shift(town, "player", "cafe", 1.5);
      agent(town, "player")[field] = value;
      if (coreSnapshot) economy.initializeEconomy(town);
      const before = copy(town);
      const result = migration.initializeFundedEconomy(town);
      assert.equal(result.ok, false, `${field}: ${String(value)}, snapshot=${coreSnapshot}`);
      assert.ok(result.reason);
      assert.deepEqual(town, before);
      const raw = JSON.stringify({ version: 1, town });
      const imported = migration.importFundedTown(raw);
      assert.equal(imported.status, "unreadable");
      assert.equal(imported.raw, raw);
      assert.ok(imported.reason);
    }
  }
});

test("a command transfers existing coins exactly once, including after reload", () => {
  const town = fundedTown();
  const total = cash(town);
  const first = transfer(town, "once", "agent:player", "agent:baba", 2);
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.replayed, false);
  assert.equal(agent(town, "player").money, 2);
  assert.equal(agent(town, "baba").money, 11);
  assert.equal(cash(town), total);
  const paid = copy(town);
  const retry = transfer(town, "once", "agent:player", "agent:baba", 2);
  assert.equal(retry.ok, true, retry.reason);
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.receipt, first.receipt);
  assert.deepEqual(town, paid);
  const kept = reload(town);
  assert.equal(transfer(kept, "once", "agent:player", "agent:baba", 2).replayed, true);
  assert.equal(agent(kept, "player").money, 2);
  assert.equal(agent(kept, "baba").money, 11);
  assert.deepEqual(economy.auditEconomy(kept), []);
});

test("a reused command ID with different terms cannot repeat or replace its transfer", () => {
  const town = fundedTown();
  assert.equal(transfer(town, "immutable", "agent:player", "agent:baba", 1).ok, true);
  const before = copy(town);
  const result = transfer(town, "immutable", "agent:player", "agent:baba", 2);
  assert.equal(result.ok, false);
  assert.deepEqual(town, before);
});

test("wrong actor, model authority and insufficient funds refuse the entire command", () => {
  for (const [scenario, amount, extra] of [
    ["wrong actor", 1, { actor: "baba" }],
    ["model authority", 1, { authority: "model" }],
    ["insufficient funds", 5, {}],
  ]) {
    const town = fundedTown();
    const before = copy(town);
    assert.equal(
      transfer(town, scenario, "agent:player", "agent:baba", amount, extra).ok,
      false,
      scenario,
    );
    assert.deepEqual(town, before, scenario);
  }
});

test("a partial transfer followed by an invalid second donor rolls back balances and the receipt", () => {
  const town = fundedTown();
  const before = copy(town);
  const result = economy.runEconomyCommand(
    town,
    sim("two-donors", "test-transfer", "kevin", { cafe: 4, grocery: 100 }),
    (draft, context) => {
      const project = economy.ensureProjectAccount(draft, context, "library");
      economy.transferFunds(draft, context, {
        id: "first-donor",
        from: "till:cafe",
        to: project,
        amount: 4,
        purpose: "Library contribution",
      });
      economy.transferFunds(draft, context, {
        id: "second-donor",
        from: "till:grocery",
        to: project,
        amount: 100,
        purpose: "Library contribution",
      });
      return project;
    },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(
    town,
    before,
    "no project account, first debit, transaction or command receipt leaks",
  );
});

test("recipient capacity refuses an ordinary transfer without clipping or losing money", () => {
  const town = fundedTown((raw) => {
    agent(raw, "baba").money = 999;
  });
  const before = copy(town);
  assert.equal(transfer(town, "full-purse", "agent:player", "agent:baba", 2).ok, false);
  assert.deepEqual(town, before);
});

test("holds earmark existing cash and prevent a competing spend", () => {
  const town = fundedTown();
  const total = cash(town);
  const balance = agent(town, "player").money;
  const accepted = economy.runEconomyCommand(
    town,
    command("reserve", { amount: 3 }),
    (draft, context) => {
      economy.reserveFunds(draft, context, {
        id: "fixture-hold",
        account: "agent:player",
        amount: 3,
        agreementId: "fixture-agreement",
        purpose: "Disclosed reserved payment",
      });
      return { holdId: "fixture-hold" };
    },
  );
  assert.equal(accepted.ok, true, accepted.reason);
  assert.equal(agent(town, "player").money, balance);
  assert.equal(cash(town), total);
  assert.equal(economy.availableFunds(town, "agent:player"), 1);
  const before = copy(town);
  assert.equal(transfer(town, "competing-spend", "agent:player", "agent:baba", 2).ok, false);
  assert.deepEqual(town, before);
  const excessive = economy.runEconomyCommand(
    town,
    command("excessive-hold", { amount: 2 }),
    (draft, context) => {
      economy.reserveFunds(draft, context, {
        id: "second-hold",
        account: "agent:player",
        amount: 2,
        agreementId: "second-agreement",
        purpose: "Competing hold",
      });
      return null;
    },
  );
  assert.equal(excessive.ok, false);
  assert.deepEqual(town, before);
  assert.deepEqual(economy.auditEconomy(town), []);
});

test("the player's command cannot spend or reserve an unapproved resident or business account", () => {
  for (const scenario of ["personal-transfer", "till-transfer", "till-hold"]) {
    const town = fundedTown();
    const before = copy(town);
    const result =
      scenario === "till-hold"
        ? economy.runEconomyCommand(town, command(scenario, { amount: 1 }), (draft, context) => {
            economy.reserveFunds(draft, context, {
              id: "unapproved-hold",
              account: "till:cafe",
              amount: 1,
              agreementId: "unapproved-work",
              purpose: "Unapproved wage",
            });
            return null;
          })
        : transfer(
            town,
            scenario,
            scenario === "personal-transfer" ? "agent:baba" : "till:cafe",
            "agent:player",
            1,
          );
    assert.equal(result.ok, false, scenario);
    assert.deepEqual(town, before, scenario);
  }
});

test("money helpers reject a fabricated or expired transaction context", () => {
  const town = fundedTown();
  let expiredContext;
  successful(
    economy.runEconomyCommand(town, command("capture-context"), (_draft, context) => {
      expiredContext = context;
      return null;
    }),
  );
  const before = copy(town);
  for (const context of [
    expiredContext,
    { command: command("fabricated"), economy: town.economy },
  ]) {
    assert.throws(() =>
      economy.transferFunds(town, context, {
        id: "outside-command",
        from: "agent:player",
        to: "agent:baba",
        amount: 1,
        purpose: "Outside atomic authority",
      }),
    );
    assert.deepEqual(town, before);
  }
});

test("commands cannot rewrite opening balances, completed transactions or past evidence", () => {
  for (const scenario of ["opening", "transaction", "evidence"]) {
    const town = fundedTown();
    assert.equal(transfer(town, "existing-payment", "agent:player", "agent:baba", 1).ok, true);
    if (scenario === "evidence") {
      successful(fundProject(town));
      observe(town, acceptCheck(town), "source-card");
    }
    const before = copy(town);
    const result = economy.runEconomyCommand(town, command(`rewrite:${scenario}`), (draft) => {
      if (scenario === "opening") {
        draft.economy.openingBalances["agent:player"]++;
        agent(draft, "player").money++;
      }
      if (scenario === "transaction") draft.economy.transactions[0].purpose = "A different history";
      if (scenario === "evidence")
        draft.economy.work.evidence[0].detail = "A different observation";
      return null;
    });
    assert.equal(result.ok, false, scenario);
    assert.deepEqual(town, before, scenario);
  }
});

test("explicit issuance and retirement reconcile separately from ordinary transfers", () => {
  const town = fundedTown();
  const total = cash(town);
  for (const [kind, amount] of [
    ["issuance", 3],
    ["retirement", 2],
  ]) {
    const options = {
      id: `supply:${kind}`,
      kind,
      account: "agent:player",
      amount,
      purpose: "An explicitly authored fixture event",
      authorization: "authored-event",
      reason: "Bounded test of the money-supply ledger.",
    };
    successful(
      economy.runEconomyCommand(
        town,
        sim(
          `supply-command:${kind}`,
          kind === "issuance" ? "money.issue" : "money.retire",
          "kevin",
          options,
        ),
        (draft, context) => {
          economy.changeMoneySupply(draft, context, options);
          return { amount };
        },
      ),
    );
  }
  assert.equal(cash(town), total + 1);
  assert.equal(
    town.economy.transactions.filter((transaction) => transaction.kind === "issuance").length,
    1,
  );
  assert.equal(
    town.economy.transactions.filter((transaction) => transaction.kind === "retirement").length,
    1,
  );
  assert.deepEqual(economy.auditEconomy(reload(town)), []);
});

test("stale, expired, disabled and altered quotes cannot authorize a transfer", () => {
  for (const scenario of ["stale", "expired", "disabled", "altered-terms", "wrong-person"]) {
    const town = fundedTown();
    const terms = { from: "agent:player", to: "agent:baba", amount: 2 };
    const quote = economy.createEconomyQuote(town, {
      id: `quote:${scenario}`,
      kind: "test-transfer",
      actor: "player",
      terms,
      expiresAt: { day: town.day, minute: town.minute + 5 },
      eligibility: {
        eligible: scenario !== "disabled",
        key: "fixture",
        reason: scenario === "disabled" ? "Unavailable worker" : undefined,
      },
    });
    if (scenario === "stale")
      assert.equal(transfer(town, "intervening-command", "agent:player", "agent:baba", 1).ok, true);
    if (scenario === "expired") town.minute += 6;
    const before = copy(town);
    const extra = { quote, ...(scenario === "wrong-person" ? { actor: "baba" } : {}) };
    assert.equal(
      transfer(
        town,
        scenario,
        "agent:player",
        "agent:baba",
        scenario === "altered-terms" ? 1 : 2,
        extra,
      ).ok,
      false,
      scenario,
    );
    assert.deepEqual(town, before, scenario);
  }
});

test("an imported unequal opening keeps its balances, identity and recorded commitments", () => {
  const raw = createTown("Unequal Ada");
  raw.day = 7;
  raw.minute = 1031;
  raw.paused = false;
  raw.tills = { cafe: 240, grocery: 113 };
  agent(raw, "player").money = 91;
  agent(raw, "northern").money = 999;
  shift(raw, "player", "cafe", 1.5);
  raw.favors.push({
    id: "legacy-tab",
    from: "player",
    to: "baba",
    amount: 2,
    text: "Recorded bread tab",
    status: "owed",
    day: 6,
  });
  const before = copy(raw);
  const imported = migration.importFundedTown(JSON.stringify({ version: 1, town: raw }));
  assert.equal(imported.status, "ready", imported.reason);
  const town = imported.town;
  assert.equal(cash(town), cash(before));
  assert.deepEqual(town.tills, before.tills);
  assert.equal(town.playerName, before.playerName);
  assert.equal(town.paused, false);
  assert.deepEqual(town.favors, before.favors);
  assert.deepEqual(agent(town, "player").projects, agent(before, "player").projects);
  assert.equal(agent(town, "player").shiftHours, 1.5);
  assert.equal(agent(town, "northern").money, 999);
  assert.deepEqual(economy.auditEconomy(town), []);
  const second = migration.importFundedTown(save.exportTown(town));
  assert.equal(second.status, "ready", second.reason);
  assert.deepEqual(
    second.town.economy,
    town.economy,
    "reimport preserves the one opening and existing claim IDs",
  );
});

test("explicit migration preserves valid legacy balances above the old normalization cap", () => {
  const raw = createTown("Ada");
  raw.tills = { cafe: 1200, grocery: 1300 };
  agent(raw, "player").money = 1400;
  const imported = migration.importFundedTown(JSON.stringify({ version: 1, town: raw }));
  assert.equal(imported.status, "ready", imported.reason);
  assert.deepEqual(imported.town.tills, raw.tills);
  assert.equal(agent(imported.town, "player").money, 1400);
  assert.equal(cash(imported.town), cash(raw));
  const kept = reload(imported.town);
  assert.equal(agent(kept, "player").money, 1400);
  assert.deepEqual(kept.tills, raw.tills);
});

test("a legacy bread tab pays its recorded personal creditor exactly", () => {
  const town = fundedTown((raw) => {
    raw.favors.push({
      id: "old-tab",
      from: "player",
      to: "baba",
      amount: 2,
      text: "Bread accepted before accounts existed",
      status: "owed",
      day: 1,
    });
  });
  const before = {
    player: agent(town, "player").money,
    baba: agent(town, "baba").money,
    grocery: town.tills.grocery,
    total: cash(town),
  };
  const request = command("settle-old-tab", { debtId: "old-tab" }, { kind: "debt.settle" });
  const paid = economy.settleLegacyDebt(town, request, "old-tab");
  assert.equal(paid.ok, true, paid.reason);
  assert.equal(agent(town, "player").money, before.player - 2);
  assert.equal(agent(town, "baba").money, before.baba + 2);
  assert.equal(town.tills.grocery, before.grocery);
  assert.equal(cash(town), before.total);
  assert.equal(town.favors.find((favor) => favor.id === "old-tab").status, "paid");
  const kept = reload(town);
  const retry = economy.settleLegacyDebt(kept, request, "old-tab");
  assert.equal(retry.ok, true, retry.reason);
  assert.equal(retry.replayed, true);
  assert.equal(agent(kept, "baba").money, before.baba + 2);
  assert.deepEqual(economy.auditEconomy(kept), []);
});

test("authorized corrections append one reversal and restore the exact legacy creditor", () => {
  const town = fundedTown((raw) => {
    raw.favors.push({
      id: "corrected-tab",
      from: "player",
      to: "baba",
      amount: 2,
      text: "Original personal tab",
      status: "owed",
      day: 1,
    });
  });
  const paid = successful(
    economy.settleLegacyDebt(
      town,
      command("pay-corrected-tab", { debtId: "corrected-tab" }, { kind: "debt.settle" }),
      "corrected-tab",
    ),
  );
  const original = copy(
    town.economy.transactions.find((transaction) => transaction.id === paid.transactionId),
  );
  const reason =
    "Correct the mistakenly recorded settlement while keeping the original obligation.";
  const request = sim("reverse-tab", "money.reverse", "player", {
    transactionId: paid.transactionId,
    reason,
  });
  successful(economy.reverseTransfer(town, request, paid.transactionId, reason));
  assert.equal(agent(town, "player").money, 4);
  assert.equal(agent(town, "baba").money, 9);
  assert.equal(town.tills.grocery, 16);
  assert.deepEqual(
    town.economy.transactions.find((transaction) => transaction.id === original.id),
    original,
  );
  assert.equal(
    town.economy.transactions.filter((transaction) => transaction.reversalOf === original.id)
      .length,
    1,
  );
  const debt = town.favors.find((favor) => favor.id === "corrected-tab");
  assert.equal(debt.status, "owed");
  assert.equal(debt.to, "baba");
  const before = copy(town);
  assert.equal(economy.reverseTransfer(town, request, paid.transactionId, reason).replayed, true);
  assert.deepEqual(town, before);
  assert.equal(
    economy.reverseTransfer(
      town,
      sim("reverse-tab-again", "money.reverse", "player", {
        transactionId: paid.transactionId,
        reason,
      }),
      paid.transactionId,
      reason,
    ).ok,
    false,
  );
  assert.deepEqual(town, before);
  assert.deepEqual(economy.auditEconomy(reload(town)), []);
});

test("contradictory books and malformed extensions preserve complete raw recovery data", () => {
  for (const scenario of [
    "balance-edited",
    "unrecorded-balanced-transfer",
    "malformed-extension",
    "fabricated-opening",
    "negative-hold",
  ]) {
    const town = fundedTown();
    if (scenario === "balance-edited") agent(town, "player").money += 1;
    if (scenario === "unrecorded-balanced-transfer") {
      agent(town, "player").money -= 1;
      agent(town, "baba").money += 1;
    }
    if (scenario === "malformed-extension") town.economy.transactions = "broken ledger";
    if (scenario === "fabricated-opening") town.economy.openingBalances["agent:player"] += 5;
    if (scenario === "negative-hold")
      town.economy.holds.push({
        id: "bad",
        account: "agent:player",
        amount: -1,
        remaining: -1,
        agreementId: "bad",
        purpose: "bad",
        commandId: "bad",
        createdAt: { day: 1, minute: 420 },
        releases: [],
      });
    const raw = JSON.stringify({ version: 1, town });
    const result = save.readTownFile(raw);
    assert.equal(result.status, "unreadable", scenario);
    assert.equal(result.raw, raw, `${scenario}: full original bytes remain recoverable`);
    assert.ok(result.reason, `${scenario}: corruption has an explanation`);
    assert.equal(save.parseTownFile(raw), null, scenario);
    const again = migration.importFundedTown(raw);
    assert.equal(again.status, "unreadable", scenario);
    assert.equal(again.raw, raw);
    assert.ok(again.reason);
  }
});

test("legacy invalid money or duplicate financial IDs fail migration without changing the input", () => {
  for (const scenario of [
    "fractional-money",
    "negative-money",
    "duplicate-debt-id",
    "duplicate-work-id",
  ]) {
    const town = createTown("Ada");
    if (scenario === "fractional-money") agent(town, "player").money = 4.5;
    if (scenario === "negative-money") town.tills.cafe = -1;
    if (scenario === "duplicate-debt-id")
      town.favors.push(
        ...[1, 2].map((n) => ({
          id: "duplicate",
          from: "player",
          to: "baba",
          amount: n,
          text: `Recorded tab ${n}`,
          status: "owed",
          day: 1,
        })),
      );
    if (scenario === "duplicate-work-id") {
      const person = shift(town);
      person.projects.push({ ...person.projects.at(-1) });
    }
    const before = copy(town);
    assert.equal(migration.initializeFundedEconomy(town).ok, false, scenario);
    assert.deepEqual(town, before, scenario);
    const raw = JSON.stringify({ version: 1, town });
    const imported = migration.importFundedTown(raw);
    assert.equal(imported.status, "unreadable", scenario);
    assert.equal(imported.raw, raw);
    assert.ok(imported.reason);
  }
});

test("an inconsistent save cannot overwrite the last recoverable stored town", () => {
  const town = fundedTown();
  const good = save.exportTown(town);
  let stored = good;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    },
  });
  agent(town, "player").money += 1;
  const result = save.saveTownWithStatus(town);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "serialization");
  assert.ok(result.explanation);
  assert.equal(stored, good);
  const loaded = save.readTownSave();
  assert.equal(loaded.status, "ready");
  assert.equal(agent(loaded.town, "player").money, 4);
  const bad = JSON.stringify({ version: 1, town });
  stored = bad;
  const recovery = save.readTownSave();
  assert.equal(recovery.status, "unreadable");
  assert.equal(recovery.raw, bad);
  assert.ok(recovery.reason);
});

test("the audit detects an older runtime changing funded balances without ledger entries", () => {
  const town = fundedTown((raw) => {
    raw.tills = { cafe: 120, grocery: 85 };
  });
  town.minute = 1439;
  stepMinute(town, false);
  assert.ok(
    economy.auditEconomy(town).length,
    "the unchanged S1 legacy runtime cannot silently round-trip funded books",
  );
  const raw = JSON.stringify({ version: 1, town });
  assert.equal(save.readTownFile(raw).status, "unreadable");
});

test("library funding protects payroll and transfers the two approved contributions atomically", () => {
  const town = fundedTown();
  const before = { cafe: town.tills.cafe, grocery: town.tills.grocery, total: cash(town) };
  assert.equal(economy.availableFunds(town, "till:cafe"), before.cafe - 5);
  assert.equal(economy.availableFunds(town, "till:grocery"), before.grocery - 4);
  successful(fundProject(town));
  assert.equal(town.tills.cafe, before.cafe - 4);
  assert.equal(town.tills.grocery, before.grocery - 4);
  assert.equal(economy.accountBalance(town, "project:library"), 8);
  assert.equal(cash(town) + economy.accountBalance(town, "project:library"), before.total);
  assert.equal(economy.availableFunds(town, "till:cafe"), before.cafe - 9);
  assert.equal(economy.availableFunds(town, "till:grocery"), before.grocery - 8);
  assert.ok(workState(town).legacyClaims.every((claim) => claim.resolution === "protected"));
  assert.deepEqual(economy.auditEconomy(town), []);
});

test("underfunded or unresolved old wages block a donor even when its till has positive cash", () => {
  for (const scenario of [
    "four-coins-five-claim",
    "partial-payroll",
    "second-donor-insufficient",
  ]) {
    const town = fundedTown((raw) => {
      if (scenario === "four-coins-five-claim") raw.tills.cafe = 4;
      if (scenario === "partial-payroll") shift(raw, "player", "cafe", 1.5);
      if (scenario === "second-donor-insufficient") raw.tills.grocery = 7;
    });
    const approvalIds = approveProject(town);
    const before = copy(town);
    if (scenario === "four-coins-five-claim") {
      assert.equal(town.tills.cafe, 4);
      assert.ok(
        workState(town).legacyClaims.some(
          (claim) =>
            claim.payer === "till:cafe" && claim.amount === 5 && claim.resolution === "underfunded",
        ),
      );
      assert.ok(work.payrollFundingReasons(town, "till:cafe").length);
    }
    const result = work.fundLibraryProject(
      town,
      sim(`fund:${scenario}`, "fund-library-project", "kevin", {
        projectId: "library",
        approvalIds,
      }),
      "library",
      approvalIds,
    );
    assert.equal(result.ok, false, scenario);
    assert.deepEqual(
      town,
      before,
      `${scenario}: no donation, consumed approval, released payroll or partial custody`,
    );
    assert.deepEqual(economy.auditEconomy(town), []);
  }
});

test("success, failure and uncertainty each earn the disclosed fee for completed evidence and report", () => {
  for (const outcome of ["success", "failure", "uncertain"]) {
    const town = fundedTown();
    successful(fundProject(town));
    const before = agent(town, "player").money;
    const agreement = acceptCheck(town, outcome);
    assert.equal(agent(town, "player").money, before, "acceptance reserves, it does not pay");
    assert.equal(economy.availableFunds(town, "project:library"), 6);
    reportCheck(town, agreement, outcome);
    const result = successful(completeCheck(town, agreement));
    assert.equal(agent(town, "player").money, before + 2, outcome);
    assert.equal(economy.accountBalance(town, "project:library"), 6);
    assert.equal(result.receipt.outcome, outcome);
    assert.equal(result.payable.status, "settled");
    assert.equal(workState(town).receipts.length, 1);
    const completed = copy(town);
    assert.equal(completeCheck(town, agreement).replayed, true);
    assert.deepEqual(town, completed, "completion retry does not pay a second fee");
    assert.deepEqual(economy.auditEconomy(town), []);
  }
});

test("an incomplete report or invented evidence cannot spend the reserved work fee", () => {
  const town = fundedTown();
  successful(fundProject(town));
  const agreement = acceptCheck(town);
  const source = observe(town, agreement, "source-card");
  reportCheck(town, agreement, "uncertain", [source.id]);
  let before = copy(town);
  assert.equal(completeCheck(town, agreement).ok, false);
  assert.deepEqual(town, before);
  const input = {
    id: "invented-box",
    agreementId: agreement.id,
    worker: "player",
    key: "unoffered-evidence",
    source: "Model prose",
    detail: "The model says it was checked.",
  };
  assert.equal(
    work.recordWorkEvidence(
      town,
      sim("invented-evidence", "record-work-evidence", "player", input),
      input,
    ).ok,
    false,
  );
  assert.deepEqual(town, before);
  const report = {
    outcome: "success",
    text: "Claimed checked",
    evidenceIds: [source.id, "unrecorded-box"],
  };
  assert.equal(
    work.submitWorkReport(
      town,
      workerCommand("invented-report", "submit-work-report", "player", {
        agreementId: agreement.id,
        report,
      }),
      agreement.id,
      report,
    ).ok,
    false,
  );
  assert.deepEqual(town, before);
  assert.equal(workState(town).payables.length, 0);
  assert.equal(economy.availableFunds(town, "project:library"), 6);
});

test("an offer must still match its worker and terms and reserve the whole available fee", () => {
  const town = fundedTown();
  successful(fundProject(town));
  const offer = {
    id: "pending-offer",
    revision: 1,
    worker: "player",
    payer: "project:library",
    issuer: "kevin",
    task: "Check two authored records and report.",
    requiredEvidence: ["card"],
    fee: 2,
    expires: { day: 2, minute: 420 },
  };
  const saved = successful(
    work.createWorkOffer(town, sim("offer-pending", "offer-work", "kevin", offer), offer),
  );
  for (const scenario of ["stale-terms", "wrong-worker", "model"]) {
    const terms = work.workAcceptanceTerms(saved);
    if (scenario === "stale-terms") terms.revision++;
    const request = workerCommand(
      `accept:${scenario}`,
      "accept-work",
      scenario === "wrong-worker" ? "baba" : "player",
      terms,
    );
    if (scenario === "model") request.authority = "model";
    const before = copy(town);
    assert.equal(work.acceptWorkOffer(town, request, saved.id).ok, false, scenario);
    assert.deepEqual(town, before);
  }
  for (let i = 0; i < 4; i++) acceptCheck(town, `held:${i}`);
  assert.equal(economy.availableFunds(town, "project:library"), 0);
  const before = copy(town);
  assert.equal(
    work.acceptWorkOffer(
      town,
      workerCommand("accept-underfunded", "accept-work", "player", work.workAcceptanceTerms(saved)),
      saved.id,
    ).ok,
    false,
  );
  assert.deepEqual(town, before, "no partial hold or worker commitment on insufficient custody");
});

test("cancelling after a complete report earns its fee before releasing any unearned work", () => {
  const town = fundedTown();
  successful(fundProject(town));
  const agreement = acceptCheck(town, "cancel-ready");
  reportCheck(town, agreement, "failure");
  successful(
    work.cancelWorkAgreement(
      town,
      workerCommand("cancel-ready", "cancel-work", "player", { agreementId: agreement.id }),
      agreement.id,
    ),
  );
  assert.equal(agent(town, "player").money, 6);
  assert.equal(workState(town).receipts[0].outcome, "failure");
  assert.equal(workState(town).payables[0].status, "settled");
  assert.equal(economy.accountBalance(town, "project:library"), 6);
  assert.deepEqual(economy.auditEconomy(town), []);
});

test("closing a project pays completed units, releases incomplete ones and refunds only unspent custody", () => {
  const town = fundedTown();
  const donors = { cafe: town.tills.cafe, grocery: town.tills.grocery };
  successful(fundProject(town));
  const complete = acceptCheck(town, "close-ready");
  reportCheck(town, complete);
  const incomplete = acceptCheck(town, "close-incomplete");
  observe(town, incomplete, "source-card");
  const result = successful(
    work.closeFundedProject(
      town,
      sim("close-library", "close-funded-project", "kevin", { projectId: "library" }),
      "library",
    ),
  );
  assert.equal(result.status, "closed");
  assert.equal(result.refunds, 3);
  assert.equal(agent(town, "player").money, 6);
  assert.equal(town.tills.cafe, donors.cafe - 1);
  assert.equal(town.tills.grocery, donors.grocery - 1);
  assert.equal(economy.accountBalance(town, "project:library"), 0);
  assert.equal(
    workState(town).agreements.find((agreement) => agreement.id === complete.id).status,
    "completed",
  );
  assert.equal(
    workState(town).agreements.find((agreement) => agreement.id === incomplete.id).status,
    "cancelled",
  );
  assert.deepEqual(economy.auditEconomy(reload(town)), []);
});

test("interruption, cancellation and reload retain evidence and pay only complete units", () => {
  let town = fundedTown();
  successful(fundProject(town));
  const agreement = acceptCheck(town, "interrupted");
  observe(town, agreement, "source-card");
  successful(
    work.suspendWorkAgreement(
      town,
      workerCommand("suspend-check", "suspend-work", "player", { agreementId: agreement.id }),
      agreement.id,
    ),
  );
  town = reload(town);
  fundedDay(town);
  assert.equal(
    workState(town).agreements.find((item) => item.id === agreement.id).status,
    "suspended",
  );
  assert.equal(workState(town).evidence.length, 1);
  assert.equal(economy.availableFunds(town, "project:library"), 6);
  successful(
    work.suspendWorkAgreement(
      town,
      workerCommand("resume-check", "resume-work", "player", { agreementId: agreement.id }),
      agreement.id,
      true,
    ),
  );
  const box = observe(town, agreement, "box");
  const source = workState(town).evidence.find((item) => item.key === "source-card");
  reportCheck(town, agreement, "failure", [source.id, box.id]);
  successful(completeCheck(town, agreement));
  const other = acceptCheck(town, "incomplete");
  observe(town, other, "source-card");
  const money = agent(town, "player").money;
  successful(
    work.cancelWorkAgreement(
      town,
      workerCommand("cancel-incomplete", "cancel-work", "player", { agreementId: other.id }),
      other.id,
    ),
  );
  assert.equal(agent(town, "player").money, money);
  assert.equal(workState(town).agreements.find((item) => item.id === other.id).status, "cancelled");
  assert.equal(economy.availableFunds(town, "project:library"), 6);
  successful(
    work.cancelWorkAgreement(
      town,
      workerCommand("cancel-complete", "cancel-work", "player", { agreementId: agreement.id }),
      agreement.id,
    ),
  );
  assert.equal(agent(town, "player").money, money);
  assert.equal(workState(town).receipts.length, 1);
  assert.equal(workState(town).payables[0].status, "settled");
  assert.deepEqual(economy.auditEconomy(reload(town)), []);
});

test("a full worker purse keeps its earned payable and hold through cancellation, day change and reload", () => {
  let town = fundedTown((raw) => {
    agent(raw, "player").money = 999;
    raw.tills.cafe = 120;
    raw.tills.grocery = 85;
  });
  successful(fundProject(town));
  const agreement = acceptCheck(town, "full-worker");
  reportCheck(town, agreement);
  const completed = successful(completeCheck(town, agreement));
  assert.equal(completed.payable.status, "earned");
  assert.match(completed.payable.reason, /purse/);
  assert.equal(agent(town, "player").money, 999);
  assert.equal(economy.accountBalance(town, "project:library"), 8);
  assert.equal(economy.availableFunds(town, "project:library"), 6);
  const balances = { cafe: town.tills.cafe, grocery: town.tills.grocery };
  const pending = copy(town);
  assert.equal(
    work.closeFundedProject(
      town,
      sim("close-with-payable", "close-funded-project", "kevin", { projectId: "library" }),
      "library",
    ).ok,
    false,
  );
  assert.deepEqual(town, pending, "earned liabilities cannot be released for project refunds");
  successful(
    work.cancelWorkAgreement(
      town,
      workerCommand("cancel-full-payable", "cancel-work", "player", { agreementId: agreement.id }),
      agreement.id,
    ),
  );
  fundedDay(town);
  for (let i = 0; i < 200; i++)
    agent(town, "player").memories.push({
      id: `compressed:${i}`,
      day: 1,
      minute: 420,
      type: "observe",
      text: `Old ordinary observation ${i}.`,
      importance: 1,
      keywords: ["ordinary"],
    });
  town = reload(town);
  assert.ok(
    agent(town, "player").memories.length < 200,
    "the reload fixture actually compresses ordinary memories",
  );
  assert.deepEqual(
    town.tills,
    balances,
    "funded midnight preserves tills above destructive legacy caps",
  );
  const payable = workState(town).payables.find((item) => item.id === completed.payable.id);
  assert.equal(payable.status, "earned");
  assert.equal(workState(town).receipts.length, 1);
  assert.equal(economy.availableFunds(town, "project:library"), 6);
  assert.equal(transfer(town, "make-purse-room", "agent:player", "agent:baba", 2).ok, true);
  const settled = successful(
    work.settleWorkPayable(
      town,
      sim("settle-full-payable", "settle-work-payable", "kevin", { payableId: payable.id }),
      payable.id,
    ),
  );
  assert.equal(settled.status, "settled");
  assert.equal(agent(town, "player").money, 999);
  assert.equal(economy.accountBalance(town, "project:library"), 6);
  assert.equal(economy.availableFunds(town, "project:library"), 6);
  const settledBefore = copy(town);
  const reason = "The lookup failed.";
  assert.equal(
    economy.reverseTransfer(
      town,
      sim("reverse-earned-fee", "money.reverse", "kevin", {
        transactionId: settled.transactionId,
        reason,
      }),
      settled.transactionId,
      reason,
    ).ok,
    false,
  );
  assert.deepEqual(
    town,
    settledBefore,
    "earned fees remain earned after failure and cannot be clawed back",
  );
  assert.deepEqual(economy.auditEconomy(town), []);
});

test("legacy paid, partial, completed unpaid and mixed-employer work remain distinct", () => {
  for (const scenario of ["paid", "partial", "unpaid", "ambiguous", "unworked"]) {
    const raw = createTown("Ada");
    const person = shift(
      raw,
      "player",
      "cafe",
      scenario === "partial" ? 1.5 : scenario === "unworked" ? 0 : 3,
      scenario === "paid",
    );
    if (scenario === "ambiguous")
      person.projects.push({
        id: "mixed-grocery",
        owner: "player",
        kind: "shift",
        place: "grocery",
        status: "open",
        day: raw.day,
        text: "Other employer's recorded shift",
      });
    const oldMoney = person.money;
    const expected = {
      paid: "already-paid",
      partial: "partial",
      unpaid: "completed-unpaid",
      ambiguous: "ambiguous",
      unworked: "active-unworked",
    }[scenario];
    assert.equal(
      work.classifyLegacyPayroll(raw).find((claim) => claim.worker === "player").classification,
      expected,
    );
    const town = fundedTown((fixture) => Object.assign(fixture, raw));
    const claim = workState(town).legacyClaims.find((item) => item.worker === "player");
    assert.equal(claim.classification, expected);
    assert.equal(claim.evidence.shiftHours, person.shiftHours);
    assert.equal(claim.evidence.paidToday, person.paidToday);
    assert.deepEqual(
      claim.evidence.projects,
      person.projects.filter((project) => project.kind === "shift"),
    );
    assert.equal(
      agent(town, "player").money,
      oldMoney,
      "classification never fabricates an old payout",
    );
    assert.equal(
      workState(town).payables.filter((item) => item.worker === "player").length,
      scenario === "unpaid" ? 1 : 0,
    );
    if (scenario === "paid") assert.equal(claim.resolution, "paid");
    if (scenario === "partial" || scenario === "ambiguous")
      assert.equal(claim.resolution, "unresolved");
    if (scenario === "unpaid" || scenario === "unworked")
      assert.equal(claim.resolution, "protected");
    const before = copy(town.economy);
    assert.equal(migration.initializeFundedEconomy(town).migrated, false);
    assert.deepEqual(reload(town).economy, before);
  }
});

test("explicit recognition preserves a partial claim and cannot invent attendance", () => {
  const town = fundedTown((raw) => {
    shift(raw, "player", "cafe", 1.5);
  });
  const claim = workState(town).legacyClaims.find((item) => item.worker === "player");
  const approvalId = "recognition-approval";
  const terms = (confirmedMinutes) => ({
    claimId: claim.id,
    payer: "till:cafe",
    confirmedMinutes,
    approvalId,
    fee: 5,
    requiredMinutes: 180,
    cancellation: work.CAFE_CANCELLATION,
  });
  const before = copy(town);
  const inventedApproval = {
    id: approvalId,
    kind: "legacy-recognition",
    worker: "player",
    payer: "till:cafe",
    issuer: "kevin",
    claimId: claim.id,
    confirmedMinutes: 91,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: town.day + 2, minute: town.minute },
    cancellation: work.CAFE_CANCELLATION,
  };
  assert.equal(
    work.approvePayrollAgreement(
      town,
      sim("approve-invented-minutes", "approve-payroll-agreement", "kevin", inventedApproval),
      inventedApproval,
    ).ok,
    false,
  );
  assert.deepEqual(town, before);
  payrollApproval(town, approvalId, "legacy-recognition", claim.id, 90);
  const agreement = successful(
    work.recogniseLegacyClaim(
      town,
      workerCommand("recognise-partial", "recognise-legacy-payroll", "player", terms(90)),
      claim.id,
      "till:cafe",
      90,
      approvalId,
    ),
  );
  assert.equal(agreement.eligibleMinutes, 90);
  assert.equal(agreement.status, "suspended");
  assert.equal(agreement.fee, 5);
  assert.equal(agent(town, "player").money, 4);
  assert.equal(agent(town, "player").shiftHours, 1.5);
  assert.equal(
    workState(town).legacyClaims.find((item) => item.id === claim.id).evidence.shiftHours,
    1.5,
  );
  successful(
    work.cancelWorkAgreement(
      town,
      workerCommand("cancel-partial-recognition", "cancel-work", "player", {
        agreementId: agreement.id,
      }),
      agreement.id,
    ),
  );
  fundedDay(town);
  const kept = reload(town);
  assert.equal(
    workState(kept).agreements.find((item) => item.id === agreement.id).eligibleMinutes,
    90,
  );
  assert.equal(kept.economy.holds.find((hold) => hold.id === agreement.holdId).remaining, 5);
  assert.equal(agent(kept, "player").shiftHours, 1.5);
});

test("a protected unworked legacy agreement can be replaced without reserving its wage twice", () => {
  const town = fundedTown((raw) => {
    shift(raw, "player", "cafe", 0);
  });
  const claim = workState(town).legacyClaims.find((item) => item.worker === "player");
  const originalEvidence = copy(claim.evidence);
  assert.equal(claim.resolution, "protected");
  const available = economy.availableFunds(town, "till:cafe");
  const approval = payrollApproval(town, "replace-unworked", "legacy-recognition", claim.id, 0);
  const terms = {
    claimId: claim.id,
    payer: "till:cafe",
    confirmedMinutes: 0,
    approvalId: approval.id,
    fee: 5,
    requiredMinutes: 180,
    cancellation: work.CAFE_CANCELLATION,
  };
  const agreement = successful(
    work.recogniseLegacyClaim(
      town,
      workerCommand("accept-replacement", "recognise-legacy-payroll", "player", terms),
      claim.id,
      "till:cafe",
      0,
      approval.id,
    ),
  );
  assert.equal(economy.availableFunds(town, "till:cafe"), available);
  assert.equal(town.economy.holds.find((hold) => hold.id === claim.holdId).remaining, 0);
  assert.equal(town.economy.holds.find((hold) => hold.id === agreement.holdId).remaining, 5);
  assert.deepEqual(
    workState(town).legacyClaims.find((item) => item.id === claim.id).evidence,
    originalEvidence,
  );
  successful(
    work.suspendWorkAgreement(
      town,
      workerCommand("resume-replacement", "resume-work", "player", { agreementId: agreement.id }),
      agreement.id,
      true,
    ),
  );
  town.minute = 960;
  agent(town, "player").tile = { ...ANCHORS.cafe };
  successful(
    work.recordCafeAttendance(
      town,
      sim("replacement-minute", "record-cafe-attendance", "player", {
        agreementId: agreement.id,
        day: town.day,
        minute: town.minute,
      }),
      agreement.id,
    ),
  );
  assert.equal(
    workState(town).agreements.find((item) => item.id === agreement.id).eligibleMinutes,
    1,
  );
  assert.equal(agent(town, "player").money, 4);
  assert.deepEqual(economy.auditEconomy(reload(town)), []);
});

test("a completed unpaid legacy wage settles once and an already-paid shift earns no second claim", () => {
  const town = fundedTown((raw) => {
    shift(raw, "player", "cafe", 3);
    shift(raw, "northern", "cafe", 3, true);
  });
  const payable = workState(town).payables.find((item) => item.worker === "player");
  assert.equal(payable.amount, 5);
  assert.equal(
    workState(town).payables.some((item) => item.worker === "northern"),
    false,
  );
  const request = sim("pay-legacy-wage", "settle-work-payable", "kevin", { payableId: payable.id });
  successful(work.settleWorkPayable(town, request, payable.id));
  assert.equal(agent(town, "player").money, 9);
  const kept = reload(town);
  assert.equal(work.settleWorkPayable(kept, request, payable.id).replayed, true);
  assert.equal(agent(kept, "player").money, 9);
  assert.equal(migration.initializeFundedEconomy(kept).migrated, false);
  assert.equal(workState(kept).payables.filter((item) => item.worker === "player").length, 1);
  assert.equal(agent(kept, "northern").money, 2);
  assert.deepEqual(economy.auditEconomy(kept), []);
});

test("new cafe attendance remains employer-bound, resumable and payable after all 180 minutes", () => {
  const town = fundedTown((raw) => {
    const person = agent(raw, "player");
    person.plan.beats.forEach((beat) => {
      if (beat.hour >= 16 && beat.hour < 19)
        Object.assign(beat, { place: "cafe", spot: "out", status: "working" });
    });
    person.tile = { x: 11, y: 11 };
  });
  agent(town, "player").tile = { ...ANCHORS.cafe };
  const id = "funded-cafe";
  const approvalId = "cafe-approval";
  const unapproved = copy(town);
  assert.equal(
    work.createFundedCafeAgreement(
      town,
      workerCommand(
        "accept-unapproved-cafe",
        "accept-funded-cafe-shift",
        "player",
        work.cafeAgreementTerms(id, "player", approvalId),
      ),
      id,
      "player",
      approvalId,
    ).ok,
    false,
  );
  assert.deepEqual(town, unapproved, "a worker's choice cannot authorize the employer's cash");
  payrollApproval(town, approvalId, "cafe-replacement");
  const agreement = successful(
    work.createFundedCafeAgreement(
      town,
      workerCommand(
        "accept-cafe",
        "accept-funded-cafe-shift",
        "player",
        work.cafeAgreementTerms(id, "player", approvalId),
      ),
      id,
      "player",
      approvalId,
    ),
  );
  town.minute = 720;
  let before = copy(town);
  assert.equal(
    work.recordCafeAttendance(
      town,
      sim("lunch-minute", "record-cafe-attendance", "player", {
        agreementId: id,
        day: town.day,
        minute: town.minute,
      }),
      id,
    ).ok,
    false,
  );
  assert.deepEqual(town, before);
  town.minute = 960;
  successful(
    work.recordCafeAttendance(
      town,
      sim("cafe-minute:0", "record-cafe-attendance", "player", {
        agreementId: id,
        day: town.day,
        minute: town.minute,
      }),
      id,
    ),
  );
  before = copy(town);
  assert.equal(
    work.recordCafeAttendance(
      town,
      sim("duplicate-cafe-minute", "record-cafe-attendance", "player", {
        agreementId: id,
        day: town.day,
        minute: town.minute,
      }),
      id,
    ).ok,
    false,
  );
  assert.deepEqual(town, before);
  successful(
    work.cancelWorkAgreement(
      town,
      workerCommand("interrupt-cafe", "cancel-work", "player", { agreementId: id }),
      id,
    ),
  );
  assert.equal(workState(town).agreements.find((item) => item.id === id).eligibleMinutes, 1);
  assert.equal(town.economy.holds.find((hold) => hold.id === agreement.holdId).remaining, 5);
  successful(
    work.suspendWorkAgreement(
      town,
      workerCommand("resume-cafe", "resume-work", "player", { agreementId: id }),
      id,
      true,
    ),
  );
  for (let minute = 961; minute < 1140; minute++) {
    town.minute = minute;
    successful(
      work.recordCafeAttendance(
        town,
        sim(`cafe-minute:${minute}`, "record-cafe-attendance", "player", {
          agreementId: id,
          day: town.day,
          minute,
        }),
        id,
      ),
    );
    assert.equal(agent(town, "player").money, minute === 1139 ? 9 : 4);
  }
  assert.equal(workState(town).agreements.find((item) => item.id === id).status, "completed");
  assert.equal(workState(town).payables.find((item) => item.agreementId === id).status, "settled");
  assert.equal(
    workState(town).receipts.find((item) => item.agreementId === id).outcome,
    "attendance",
  );
  assert.deepEqual(economy.auditEconomy(reload(town)), []);
});
