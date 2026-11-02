// Analysis only: actual current-main engine APIs; no production source mutation.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createServer } from "vite";

const directory = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const load = (file) => server.ssrLoadModule(`/src/game/${file}.ts`);
const { createTown } = await load("town");
const { activateFundedTown } = await load("payroll-runtime");
const { playerActions, applyPlayerAction } = await load("effects");
const { libraryActions, applyLibraryAction, libraryView, validateLibraryState } =
  await load("community");
const { advanceTown } = await load("sim");
const { auditEconomy, availableFunds } = await load("economy");
const { exportTown, readTownFile } = await load("save");
const { buyReadingRefreshments } = await load("commerce");
const { ANCHORS } = await load("world");
const { mentionsSeed } = await load("text");
const agent = (town, id) => town.agents.find((person) => person.id === id);
const lib = (town) => town.economy?.projects?.library;
const balances = (town) =>
  Object.fromEntries([
    ...town.agents.map(({ id, money }) => [`agent:${id}`, money]),
    ...Object.entries(town.tills).map(([id, money]) => [`till:${id}`, money]),
    ...Object.entries(town.economy?.projectBalances ?? {}).map(([id, money]) => [id, money]),
  ]);
const total = (town) => Object.values(balances(town)).reduce((sum, value) => sum + value, 0);
const point = (town) => ({ day: town.day, minute: town.minute });
const continuityProjection = (town) =>
  JSON.parse(
    JSON.stringify(
      town.agents.map(({ id, name, memories, projects }) => ({
        id,
        name,
        projects,
        memories: memories.map((memory) => ({
          ...memory,
          text: memory.text.replace(/\s+/g, " ").trim().slice(0, 420),
          seed: Boolean(memory.seed),
          protected: Boolean(memory.protected || memory.seed || mentionsSeed(memory.text)),
        })),
      })),
    ),
  );
function differencePaths(a, b, path = "", out = []) {
  if (isDeepStrictEqual(a, b) || out.length >= 10) return out;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
      differencePaths(a[key], b[key], `${path}.${key}`, out);
  } else
    out.push({
      path,
      before: typeof a === "string" ? `string length ${a.length}` : a,
      after: typeof b === "string" ? `string length ${b.length}` : b,
    });
  return out;
}
let checks = 0;
function healthy(town) {
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateLibraryState(town), []);
  assert.equal(total(town), 90);
  assert.equal(town.agents.length, 8);
  assert.equal(
    town.economy.transactions.filter((transaction) => transaction.kind !== "transfer").length,
    0,
  );
  checks++;
}
function snapshot(town) {
  healthy(town);
  return {
    ...point(town),
    balances: balances(town),
    total: total(town),
    cafeAvailable: availableFunds(town, "till:cafe"),
    groceryAvailable: availableFunds(town, "till:grocery"),
    holds: town.economy.holds
      .filter((hold) => hold.remaining > 0)
      .map(({ id, account, amount, remaining, agreementId }) => ({
        id,
        account,
        amount,
        remaining,
        agreementId,
      })),
    agreements: town.economy.work.agreements.map(
      ({ id, worker, payer, kind, status, fee, requiredMinutes, eligibleMinutes }) => ({
        id,
        worker,
        payer,
        kind,
        status,
        fee,
        requiredMinutes,
        eligibleMinutes,
      }),
    ),
    payables: structuredClone(town.economy.work.payables),
    debts: town.favors.map(({ id, from, to, amount, status }) => ({
      id,
      from,
      to,
      amount,
      status,
    })),
    project: lib(town)
      ? {
          phase: lib(town).phase,
          lookup: lib(town).lookup?.status ?? null,
          outcome: lib(town).lookup?.result ?? null,
          evening: lib(town).evening?.status ?? null,
          custody: libraryView(town).custody,
          publicEvents: libraryView(town).events,
        }
      : null,
  };
}
function scenario(name) {
  let town = createTown("Trace Resident");
  assert.equal(activateFundedTown(town).ok, true);
  const identity = structuredClone(town.identityRegistry);
  const events = [],
    days = [];
  const record = (kind, details = {}) => events.push({ ...point(town), kind, ...details });
  const state = () => snapshot(town);
  const near = (id) => {
    agent(town, "player").tile = { ...agent(town, id).tile };
    agent(town, "player").path = [];
  };
  function action(target, prefix, expected = true) {
    near(target);
    const quoted = playerActions(town, target).find((item) => item.label.startsWith(prefix));
    assert.ok(quoted, `Missing ${prefix}`);
    const before = exportTown(town);
    const result = applyPlayerAction(town, target, quoted.id);
    record("player-action", {
      target,
      label: quoted.label,
      disabledReason: quoted.disabledReason ?? null,
      ...result,
    });
    assert.equal(result.ok, expected, result.reply);
    if (!expected) assert.equal(exportTown(town), before);
    healthy(town);
    return quoted;
  }
  function library(kind, argument = "", expected = true) {
    const quoted = libraryActions(town).find((item) => {
      const [actualKind, actualArgument] = JSON.parse(item.id);
      return actualKind === kind && actualArgument === argument;
    });
    assert.ok(quoted, `Missing library ${kind}:${argument}`);
    const before = exportTown(town);
    const result = applyLibraryAction(town, quoted.id);
    record("library-action", {
      kind,
      argument,
      label: quoted.label,
      disabledReason: quoted.disabledReason ?? null,
      ...result,
    });
    assert.equal(result.ok, expected, result.reply);
    if (!expected) assert.equal(exportTown(town), before);
    healthy(town);
    return quoted;
  }
  function staleLibrary(quote) {
    const before = exportTown(town);
    const result = applyLibraryAction(town, quote.id);
    assert.equal(result.ok, false);
    assert.equal(exportTown(town), before);
    record("stale-library-action", { label: quote.label, ...result });
  }
  function until(day, minute) {
    const delta = (day - town.day) * 1440 + minute - town.minute;
    assert.ok(delta >= 0);
    advanceTown(town, delta);
    healthy(town);
  }
  function reload(label) {
    const before = snapshot(town);
    const continuity = continuityProjection(town);
    const result = readTownFile(exportTown(town));
    assert.equal(result.status, "ready", result.reason);
    town = result.town;
    assert.deepEqual(snapshot(town), before);
    assert.deepEqual(town.identityRegistry, identity);
    assert.ok(
      isDeepStrictEqual(continuityProjection(town), continuity),
      `Reload changed normalized continuity: ${JSON.stringify(differencePaths(continuity, continuityProjection(town)))}`,
    );
    record("reload", {
      label,
      retained:
        "all balances, holds, agreements, payables, debts, library state, memories, projects, names and eight identities",
    });
  }
  function completeLibrary() {
    library("accept", "reference");
    record("funding-and-reservations", { snapshot: state() });
    // Preserve a blocked normal-action request, then use explicitly synthetic positioning.
    library("report", "reference", false);
    agent(town, "player").tile = { ...ANCHORS.library };
    for (const key of [
      "card:kevin",
      "box:Birch",
      "box:Alder",
      "box:Cedar",
      "card:equipment",
      "card:dorm",
    ])
      library("inspect", key);
    const quote = library("report", "reference");
    staleLibrary(quote);
    library("request", "source");
    library("submit", "player");
    library("test");
    for (let i = 0; i < 120 && lib(town).lookup.status === "routing"; i++) advanceTown(town, 1);
    assert.equal(lib(town).lookup.status, "done");
    assert.equal(lib(town).lookup.result, "success");
    record("lookup-complete", { snapshot: state() });
    reload("after all three paid library tasks");
  }
  const opening = state();
  return {
    name,
    get town() {
      return town;
    },
    events,
    days,
    opening,
    record,
    state,
    near,
    action,
    library,
    staleLibrary,
    until,
    reload,
    completeLibrary,
  };
}

function offer(s, day) {
  const town = s.town;
  s.near("kevin");
  const quoted = playerActions(town, "kevin").find((item) =>
    item.label.startsWith("Accept cafe shift"),
  );
  assert.ok(quoted);
  const canAccept = !quoted.disabledReason;
  s.action("kevin", "Accept cafe shift", canAccept);
  const quote = {
    day,
    offered: canAccept,
    reason: quoted.disabledReason ?? null,
    availableBefore: availableFunds(town, "till:cafe") + (canAccept ? 5 : 0),
  };
  if (canAccept) {
    s.record("accepted-payroll-reservation", { snapshot: s.state() });
    s.until(day, 960);
    agent(town, "player").tile = { ...ANCHORS.cafe };
    agent(town, "player").path = [];
    s.until(day, 1140);
    const playerAgreement = town.economy.work.agreements
      .filter((item) => item.worker === "player" && item.kind === "cafe-shift")
      .at(-1);
    assert.equal(playerAgreement.status, "completed");
    assert.equal(playerAgreement.eligibleMinutes, 180);
    assert.equal(
      town.economy.work.payables.find((item) => item.agreementId === playerAgreement.id).status,
      "settled",
    );
    s.record("completed-cafe-unit", { agreementId: playerAgreement.id, fee: 5 });
  } else {
    s.record("idle-no-funded-cafe-unit", { reason: quoted.disabledReason });
  }
  return quote;
}

const scenarios = [];
try {
  for (const mode of ["no-library", "library-left-pending", "library-reading-refund"]) {
    const s = scenario(mode);
    if (mode === "library-left-pending") {
      s.library("accept", "reference");
      s.record("funded-unfinished-library", { snapshot: s.state() });
    }
    if (mode === "library-reading-refund") {
      s.completeLibrary();
      s.library("evening-plan", "park");
      for (let i = 0; i < 180 && lib(s.town).evening.status !== "ready"; i++)
        advanceTown(s.town, 1);
      assert.equal(lib(s.town).evening.status, "ready");
      agent(s.town, "player").tile = { ...libraryView(s.town).story.gathering.tile };
      const breadQuote = s.library("evening-refreshments", "bread");
      s.staleLibrary(breadQuote);
      s.library("evening-refreshments", "tea");
      const saleBefore = balances(s.town);
      const replay = buyReadingRefreshments(s.town, lib(s.town).evening.eventId, "tea");
      assert.equal(replay.ok, true);
      assert.equal(replay.replayed, true);
      assert.deepEqual(balances(s.town), saleBefore);
      s.record("duplicate-commerce-receipt", { ok: replay.ok, replayed: replay.replayed });
      s.library("evening-join", "listen");
      s.action("baba", "Accept bread tab");
      s.action("player", "Eat loaf");
      s.record("consumed-loaf-debt-retained", { debts: s.state().debts });
      s.reload("consumed loaf, still-owed personal tab");
      s.action("baba", "Pay 2");
      s.library("close");
      s.reload("after reading purchases, personal tab repayment and project refund");
    }
    for (let day = 1; day <= 7; day++) {
      if (day > 1) s.until(day, 420);
      const dayStart = s.state();
      const next = offer(s, day);
      const grocery = playerActions(s.town, "baba").filter((item) =>
        /grocery.*shift|shift.*grocery/i.test(item.label),
      );
      assert.equal(grocery.length, 0);
      s.record("no-new-grocery-offer", {
        details:
          "No new grocery shift action exists; only existing agreements/claims can be handled.",
      });
      s.until(day, 1439);
      const dayEnd = s.state();
      s.days.push({
        day,
        offer: next,
        dayStart,
        dayEnd,
        transfers: s.town.economy.transactions.filter((transaction) => transaction.day === day),
        consequence:
          mode === "library-reading-refund"
            ? libraryView(s.town).outcome
            : mode === "library-left-pending"
              ? "Accepted reference check incomplete; 6 library fee coins remain held and 2 remain uncommitted."
              : "Library not accepted; no recurring commerce event unlocked.",
      });
      s.reload(`end of day ${day}`);
    }
    scenarios.push({
      name: s.name,
      opening: s.opening,
      days: s.days,
      events: s.events,
      transactions: s.town.economy.transactions,
      holds: s.town.economy.holds,
      closing: s.state(),
      commandReceiptCount: s.town.economy.commandReceipts.length,
      issued: 0,
      retired: 0,
    });
    console.log(
      `${mode}: offers ${s.days.filter((day) => day.offer.offered).map((day) => day.day)}; final cafe ${s.town.tills.cafe}; total ${total(s.town)}`,
    );
  }
  const interrupted = scenario("interrupted-current-cafe-unit");
  const acceptedQuote = interrupted.action("kevin", "Accept cafe shift");
  const acceptedState = exportTown(interrupted.town);
  const repeatedAcceptance = applyPlayerAction(interrupted.town, "kevin", acceptedQuote.id);
  assert.equal(repeatedAcceptance.ok, false);
  assert.equal(exportTown(interrupted.town), acceptedState);
  interrupted.record("duplicate-acceptance-rejected", repeatedAcceptance);
  interrupted.until(1, 960);
  agent(interrupted.town, "player").tile = { ...ANCHORS.cafe };
  interrupted.until(1, 1020);
  interrupted.action("kevin", "Suspend cafe shift");
  const playerWork = () =>
    interrupted.town.economy.work.agreements.find((item) => item.worker === "player");
  assert.equal(playerWork().eligibleMinutes, 60);
  interrupted.record("suspended-at-60-minutes", { snapshot: interrupted.state() });
  interrupted.reload("suspended unit with 60 earned minutes and 5 reserved coins");
  interrupted.until(2, 420);
  assert.equal(playerWork().eligibleMinutes, 60);
  assert.equal(
    interrupted.town.economy.holds.find((hold) => hold.id === playerWork().holdId).remaining,
    5,
  );
  interrupted.record("overnight-preservation", { snapshot: interrupted.state() });
  interrupted.action("kevin", "Resume cafe shift");
  interrupted.until(2, 960);
  agent(interrupted.town, "player").tile = { ...ANCHORS.cafe };
  interrupted.until(2, 1080);
  assert.equal(playerWork().eligibleMinutes, 180);
  assert.equal(playerWork().status, "completed");
  assert.equal(agent(interrupted.town, "player").money, 9);
  interrupted.reload("completed interrupted unit pays exactly once");
  const output = {
    sourceRevision: "a26714e03192a17acaa963d7d2681e74a1ac425b",
    node: process.version,
    method:
      "Seven game-calendar days (07:00 Day 1 through 23:59 Day 7); actual current engine advanceTown with authored offlineResult, normal action validation and synthetic player positioning. No clock skipping or NPC teleportation; player travel time is intentionally excluded. A core experiment, not a browser/UI/human playtest. All fresh towns keep their original 90 coins. Balances are never manually adjusted.",
    scenarios,
    supplementary: {
      name: interrupted.name,
      opening: interrupted.opening,
      events: interrupted.events,
      closing: interrupted.state(),
      transactions: interrupted.town.economy.transactions,
      holds: interrupted.town.economy.holds,
    },
    harnessDevelopmentNotes: [
      "First run stopped on the harness assuming unfinished library.lookup was non-null; projection corrected, no engine change.",
      "Second run stopped because the harness omitted evening-join's explicit listen argument; corrected to the actual structured UI choice, no engine change.",
      "Added raw-memory reload equality initially failed on load's normal insertion of false seed/protected flags and undefined turns, plus protection of text mentioning the authored seed and whitespace trimming. The comparison now canonicalizes those documented loader rules while retaining every other memory field. No engine change.",
    ],
    healthChecks: checks,
  };
  writeFileSync(`${directory}current-trace.json`, JSON.stringify(output, null, 2) + "\n");
  const table = scenarios
    .map((s) => {
      const rows = s.days
        .map(
          ({ day, offer, dayEnd, transfers }) =>
            `| ${day} | ${offer.offered ? "5 paid" : "Unavailable"} | ${dayEnd.balances["agent:player"]} | ${dayEnd.balances["till:cafe"]} / ${dayEnd.cafeAvailable} | ${dayEnd.balances["till:grocery"]} / ${dayEnd.groceryAvailable} | ${dayEnd.project?.custody ?? 0} | ${transfers.map((tx) => `${tx.from} → ${tx.to}: ${tx.amount}`).join("; ") || "None"} |`,
        )
        .join("\n");
      return `## ${s.name}\n\n| Day | Player café work | Player cash | Café cash / available | Grocery cash / available | Library custody | Transfers that day |\n| --- | --- | ---: | ---: | ---: | ---: | --- |\n${rows}\n\nBlocked offer: ${s.days.find((day) => !day.offer.offered)?.offer.reason}\n`;
    })
    .join("\n");
  const text = `# A02 current-rule seven-day trace\n\nSource: \`${output.sourceRevision}\`; Node ${process.version}. Run from repository root:\n\n\`\`\`sh\n/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node docs/implementation/a02-economy-2026-11-01-evidence/current-trace.mjs\n\`\`\`\n\n${output.method}\n\n${checks} explicit health checks passed: eight actors, zero economy/library validation errors, 90 coins and no issuance/retirement. Every daily save/export passed readTownFile and preserved financial state and all eight stable identities. Full account balances, all transfers, every hold/release, agreements/payables, debts, refusals and action results are in [current-trace.json](current-trace.json). The JSON contains synthetic financial projections and authored public project events only, not private towns or character seeds.\n\n${table}\n## Interpretation and limits\n\nThe three paths isolate a circulation gap. Existing wages are fully reserved before acceptance and paid after 180 eligible café minutes. No unearned shifts are paid on idle days. Kevin's existing agreement retains its reservation and pays only when his authored attendance completes; see the journal rather than assuming a nightly wage. New grocery shifts are absent on every day in these fixtures.\n\nThe pending-library path deliberately leaves the accepted check unfinished. Its reserved fees and custody survive all seven days; this is a lawful blocked/idle case, not a missing payment. The completed path uses the actual library evidence/report/independent lookup lifecycle, routes Northern and reading guests through advanceTown, purchases one real tea tray and one real bread tray, attends the free reading, consumes a separately accepted loaf, repays its personal debt to Baba and refunds the project's unused 2 coins (1 per till). It retains blocked premature completion, stale action rejection and idempotent duplicate sale evidence.\n\nLibrary paid checks and public records are useful bounded content. A finished reading does not create another event or another new sale each day. Refunding and purchasing delay exhaustion by circulating already existing coins; neither guarantees continued wages. A personal bread repayment is not grocery turnover. Unavailable work does not imply lost earned wages.\n\nAll action kinds exercised have ordinary UI entry points, but this script calls engine functions directly and moves the player to required locations. It excludes travel cost and click/discovery difficulty. advanceTown resolves jobs with authored local fallback; no live or paid inference runs. No claim about browser usability, spontaneous resident demand, retention or enjoyment follows.\n`;
  const openingRows = Object.entries(scenarios[0].opening.balances)
    .map(([account, coins]) => `| ${account} | ${coins} |`)
    .join("\n");
  const appendix = `\n## Opening accounts and interrupted-work check\n\n| Account | Opening coins |\n| --- | ---: |\n${openingRows}\n\nActivation preserves and reserves Kevin's 5-coin café agreement and Baba's 4-coin grocery agreement. Thus the initial available tills are 17 and 12. Full minute progression pays both existing units on Day 1, not once per day. These are opening commitments, not new player grocery opportunities.\n\nA separate actual-engine interruption case accepts a new café unit, rejects duplicate acceptance without mutation, performs 60 eligible minutes, explicitly suspends it, saves/reloads and passes midnight. The full 5-coin hold and 60 minutes remain. Resuming and completing the other 120 minutes next day pays exactly 5 once; a final roundtrip retains it. This supplemental case is not included in the three seven-day tables. The occupied commitment and held funding are deliberately unavailable during suspension.\n\nReload checks also compare every actor's names, projects and all memory content after canonicalizing documented loader whitespace/protection rules, optional flags and absent/undefined fields. The completed-library scenario reloads after eating but before repaying, proving the still-owed tab survives consumption and reload.\n\nHarness development failures retained in the JSON: an initial snapshot assumed a non-null lookup on an unfinished project; a second run omitted the explicit \`listen\` argument for Join the reading. Both were harness mistakes corrected to the source contracts. A later raw-memory equality assertion exposed normal loader defaults (false seed/protected and undefined turns) plus content-based protection and trailing whitespace trimming; the comparison canonicalizes those documented rules while retaining every other field. No engine behavior changed.\n\nDaily project snapshots retain public story events as well as finances. The completed path records Arwyn using the report on Day 2. Current source schedules Baba's note 30 game minutes after the lookup, with Day 3 as another trigger; it is not exclusively a Day 3 unlock. These finite consequences do not replenish commerce or create another paid task automatically.\n`;
  writeFileSync(`${directory}current-trace.md`, text + appendix);
} finally {
  await server.close();
}
