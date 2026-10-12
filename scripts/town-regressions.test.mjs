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
const { advanceTown, stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { applyResult, playerActions, applyPlayerAction, BABA_LOAF } =
  await server.ssrLoadModule("/src/game/effects.ts");
const { offlineResult, prepareRetrievals } = await server.ssrLoadModule("/src/game/offline.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { makeMemory, scoreMemories, scoreResidentMemories } =
  await server.ssrLoadModule("/src/game/memory.ts");
const { memoryInterestScore } = await server.ssrLoadModule("/src/game/interests.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { plain, mentionsSeed } = await server.ssrLoadModule("/src/game/text.ts");
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(async () => {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
  await server.close();
});
const copy = (value) => JSON.parse(JSON.stringify(value));
const agent = (town, id) => town.agents.find((a) => a.id === id);
const balances = (town) => town.agents.map((a) => a.money);
const storage = (box) =>
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: box });
const say = (town, text, id = "baba") => {
  const result = offlineResult(town, {
    kind: "player",
    agentId: id,
    text,
    day: town.day,
    minute: town.minute,
  });
  applyResult(town, result);
  return result;
};
const debtTown = (amount = 2) => {
  const town = createTown("Ada");
  town.favors.push({
    id: "bread",
    from: "player",
    to: "baba",
    amount,
    text: "Bread",
    status: "owed",
    day: 1,
  });
  return town;
};
const proposeSettlement = (town, changes = {}) =>
  applyResult(town, {
    kind: "player",
    mind: "grok",
    agentId: "baba",
    playerText: "Pay",
    reply: "Paid",
    delta: 0,
    note: "",
    favor: {
      action: "pay",
      id: "bread",
      from: "player",
      to: "baba",
      amount: 30,
      text: "proposal",
      ...changes,
    },
  });

const near = (town, target) => {
  agent(town, "player").tile = { ...agent(town, target).tile };
};
const actionQuote = (town, target, kind) =>
  playerActions(town, target).find((action) => JSON.parse(action.id)[0] === kind);
const choose = (town, target, kind) => {
  near(town, target);
  const quote = actionQuote(town, target, kind);
  assert.ok(quote, `Expected ${kind} quote from ${target}`);
  return applyPlayerAction(town, target, quote.id);
};
const settle = (town) => choose(town, "baba", "pay");
const settleNpc = (town, changes = {}) =>
  applyResult(town, {
    kind: "talk",
    mind: "grok",
    a: "northern",
    b: "baba",
    lines: [{ speaker: "baba", text: "The tab." }],
    relationships: [],
    favor: {
      action: "pay",
      id: "bread",
      from: "northern",
      to: "baba",
      amount: 30,
      text: "proposal",
      ...changes,
    },
  });

// These assert the previous review's diagnostic scenarios; diagnostics alone are not a verdict.
test("day-5 and day-30 exports and pretty current saves round trip", () => {
  const town = createTown("Ada");
  for (let day = 1; day <= 30; day++) {
    if (day > 1) advanceTown(town, 1440);
    if (![5, 30].includes(day)) continue;
    const before = copy(town);
    const exported = save.exportTown(town);
    assert.ok(Buffer.byteLength(exported, "utf8") < save.MAX_TOWN_FILE_BYTES);
    const expected = copy(town);
    expected.scrub = [];
    assert.equal(save.validateTown(expected), true);
    assert.deepEqual(save.parseTownFile(exported), expected);
    assert.deepEqual(town, before, "export must not mutate live history");
    assert.ok(expected.agents.every((a) => a.memories.length));
    const legacy = copy(town);
    assert.equal(save.validateTown(legacy), true);
    for (const old of [
      JSON.stringify(town, null, 2),
      JSON.stringify({ version: town.version, town }, null, 2),
    ]) {
      assert.deepEqual(
        save.parseTownFile(old),
        legacy,
        "raw and wrapped current saves remain supported",
      );
    }
    assert.ok(
      agent(town, "northern").memories.some((m) => m.text.includes("paid me 5")),
      "offered afternoon shifts earn wages in ordinary play",
    );
  }
});

test("older v1 files repair absent optional fields while keeping personal history", () => {
  const town = debtTown();
  town.version = 1;
  town.agents = town.agents.filter((a) => a.id !== "data" && a.id !== "amelia");
  town.playerName = "Iris";
  const kevin = agent(town, "kevin");
  kevin.want =
    "I want to find out who I am, where I came from, where I am going, and how to make some money. I will need friends and help.";
  kevin.memories = kevin.memories.filter((m) => !m.seed);
  kevin.threads = kevin.threads.filter((t) => !t.seed);
  agent(town, "player").memories.push(
    makeMemory(town, 1, 400, "chat", "Baba lent me bread. I promised to pay tomorrow.", 7, {
      protected: true,
    }),
  );
  town.notices.push({
    id: "old-note",
    author: "player",
    day: 1,
    minute: 400,
    text: "Iris will be here tomorrow.",
  });
  for (const field of ["scrub", "retrievals", "colocation", "tills", "guide"]) delete town[field];
  for (const a of town.agents) {
    delete a.projects;
    delete a.shiftHours;
    delete a.paidToday;
  }
  const imported = save.parseTownFile(JSON.stringify(town, null, 2));
  assert.ok(imported);
  assert.equal(imported.version, 2);
  assert.equal(imported.playerName, "Iris");
  assert.equal(agent(imported, "player").name, "Iris");
  assert.ok(
    agent(imported, "player").memories.some((m) => m.text.includes("promised to pay tomorrow")),
  );
  assert.deepEqual(imported.favors, town.favors);
  assert.deepEqual(imported.notices, town.notices);
  assert.equal(agent(imported, "kevin").identity, kevin.identity);
  assert.ok(agent(imported, "kevin").threads.some((t) => t.seed && t.hidden && t.open));
  assert.ok(agent(imported, "kevin").memories.some((m) => m.seed && m.protected));
  assert.equal(agent(imported, "player").shiftHours, 0);
});

test("the import limit counts UTF-8 bytes, accepts the boundary, and rejects malformed input", () => {
  const town = createTown("Ada");
  const prefix = save.exportTown(town);
  const bytes = Buffer.byteLength(prefix);
  assert.ok(save.parseTownFile(prefix + " ".repeat(save.MAX_TOWN_FILE_BYTES - bytes)));
  assert.equal(save.parseTownFile(prefix + " ".repeat(save.MAX_TOWN_FILE_BYTES - bytes + 1)), null);
  const wide = JSON.stringify({ town, padding: "界".repeat(3_000_000) });
  assert.ok(wide.length < save.MAX_TOWN_FILE_BYTES);
  assert.equal(save.parseTownFile(wide), null);
  for (const malformed of ["{", "null", '{"version":2,"agents":[]}', "[]"]) {
    assert.equal(save.parseTownFile(malformed), null);
  }
  assert.equal(plain('a\u0000b\n`c"', 30), "a b c");
});

test("failed persistence keeps every live memory, debt, notice and replay frame", () => {
  const town = debtTown();
  advanceTown(town, 1440);
  const before = copy(town);
  let attempts = 0;
  storage({
    setItem() {
      attempts++;
      throw new DOMException("Full", "QuotaExceededError");
    },
  });
  assert.equal(save.saveTown(town), undefined, "original callers keep their void contract");
  assert.deepEqual(save.getLastSaveResult(), { ok: false, reason: "quota" });
  assert.equal(attempts, 2);
  assert.deepEqual(town, before);
});

test("quota retry drops only saved replay, preserves meaningful data and is observable", () => {
  const town = debtTown();
  advanceTown(town, 600);
  const before = copy(town);
  let raw;
  storage({
    setItem(_key, value) {
      if (JSON.parse(value).town.scrub.length) throw new DOMException("Full", "QuotaExceededError");
      raw = value;
    },
    getItem() {
      return raw;
    },
  });
  const result = save.saveTownWithStatus(town);
  assert.equal(result.ok, true);
  assert.equal(result.replayOmitted, true);
  assert.equal(result.bytes, Buffer.byteLength(raw));
  assert.deepEqual(town, before);
  const loaded = save.loadTown();
  const expected = copy(town);
  expected.scrub = [];
  save.validateTown(expected);
  assert.deepEqual(loaded, expected);
});

test("storage, serialization and unavailable failures have distinct observable results", () => {
  const town = createTown("Ada");
  storage(undefined);
  assert.deepEqual(save.saveTownWithStatus(town), { ok: false, reason: "unavailable" });
  let attempts = 0;
  storage({
    setItem() {
      attempts++;
      throw new Error("Storage blocked");
    },
  });
  assert.deepEqual(save.saveTownWithStatus(town), { ok: false, reason: "storage" });
  assert.equal(attempts, 1, "non-quota failures are not retried");
  town.circular = town;
  assert.deepEqual(save.saveTownWithStatus(town), { ok: false, reason: "serialization" });
  delete town.circular;
  let raw;
  storage({
    setItem(_key, value) {
      raw = value;
    },
    getItem() {
      return raw;
    },
  });
  assert.equal(save.saveTownWithStatus(town).replayOmitted, false);
  assert.ok(save.loadTown());
});

for (const action of ["pay", "forgive", "break"]) {
  test(`NPC ${action} rejects a referenced debt owned by other participants`, () => {
    const town = debtTown();
    town.favors[0].from = "kevin";
    const before = balances(town);
    settleNpc(town, { action });
    assert.deepEqual(balances(town), before);
    assert.equal(town.favors[0].status, "owed");
  });
}
for (const edit of [
  { id: "missing" },
  { from: "baba", to: "player" },
  { from: "ghost" },
  { to: "kevin" },
]) {
  test(`settlement rejects invalid reference or participants ${JSON.stringify(edit)}`, () => {
    const town = debtTown();
    town.favors[0].from = "northern";
    const before = balances(town);
    settleNpc(town, edit);
    assert.deepEqual(balances(town), before);
    assert.equal(town.favors[0].status, "owed");
  });
}
test("matching NPC forgiveness and breaking settle once without moving money", () => {
  for (const [action, status] of [
    ["forgive", "forgiven"],
    ["break", "broken"],
  ]) {
    const town = debtTown();
    town.favors[0].from = "northern";
    const before = balances(town);
    const proposal = {
      kind: "talk",
      mind: "grok",
      a: "northern",
      b: "baba",
      lines: [{ speaker: "baba", text: "We have settled this." }],
      relationships: [],
      favor: { action, id: "bread", from: "northern", to: "baba", amount: 30, text: "proposal" },
    };
    applyResult(town, proposal);
    assert.equal(town.favors[0].status, status);
    assert.deepEqual(balances(town), before);
    const relation = agent(town, "northern").relationships.baba.score;
    applyResult(town, proposal);
    assert.equal(agent(town, "northern").relationships.baba.score, relation);
  }
});

test("settlement uses the debt's amount and pays once", () => {
  const town = debtTown();
  const before = balances(town);
  near(town, "baba");
  const quote = actionQuote(town, "baba", "pay");
  settle(town);
  assert.equal(agent(town, "player").money, before[5] - 2);
  assert.equal(agent(town, "baba").money, before[3] + 2);
  assert.equal(town.favors[0].status, "paid");
  const paid = balances(town);
  assert.equal(applyPlayerAction(town, "baba", quote.id).ok, false);
  proposeSettlement(town);
  proposeSettlement(town, { action: "break" });
  assert.deepEqual(balances(town), paid);
  assert.equal(town.favors[0].status, "paid");
});
test("insufficient funds and full creditor purses keep the debt and conserve money", () => {
  for (const [from, to] of [
    [1, 0],
    [20, 998],
    [20, 999],
  ]) {
    const town = debtTown();
    agent(town, "player").money = from;
    agent(town, "baba").money = to;
    settle(town);
    assert.equal(town.favors[0].status, "owed");
    assert.equal(agent(town, "player").money + agent(town, "baba").money, from + to);
  }
  const town = debtTown();
  agent(town, "baba").money = 997;
  settle(town);
  assert.equal(agent(town, "baba").money, 999);
  assert.equal(town.favors[0].status, "paid");
});
test("a zero-money player favor cannot invent completed work", () => {
  const town = debtTown(0);
  const before = balances(town);
  assert.equal(settle(town).ok, false);
  assert.equal(town.favors[0].status, "owed");
  assert.deepEqual(balances(town), before);
});
test("a zero-money NPC favor can be completed without changing balances", () => {
  const town = debtTown(0);
  town.favors[0].from = "northern";
  const before = balances(town);
  applyResult(town, {
    kind: "talk",
    mind: "offline",
    a: "northern",
    b: "baba",
    lines: [{ speaker: "baba", text: "That favor is done." }],
    relationships: [],
    favor: {
      action: "pay",
      id: "bread",
      from: "northern",
      to: "baba",
      amount: 30,
      text: "proposal",
    },
  });
  assert.equal(town.favors[0].status, "paid");
  assert.deepEqual(balances(town), before);
});
for (const amount of [-1, 31, NaN, 1.5]) {
  test(`invalid debt amount ${amount} is not converted into a transfer`, () => {
    const town = debtTown(amount);
    const before = balances(town);
    settle(town);
    assert.deepEqual(balances(town), before);
    assert.equal(town.favors[0].status, "owed");
  });
}

const shiftTown = (id = "northern", place = "cafe", from = 16, to = 20) => {
  const town = createTown("Ada");
  town.minute = from * 60;
  for (const a of town.agents) {
    a.plan.beats = a.plan.beats.map((b) => ({ ...b, spot: "home", status: "at home" }));
    a.tile = { ...a.home };
    a.projects = [];
  }
  const worker = agent(town, id);
  worker.plan.beats = worker.plan.beats.map((b) =>
    b.hour >= from && b.hour < to ? { ...b, place, spot: "out", status: "visiting" } : b,
  );
  worker.projects = [
    {
      id: "shift",
      owner: id,
      kind: "shift",
      place,
      text: "An agreed shift",
      status: "open",
      day: 1,
    },
  ];
  worker.tile = { ...ANCHORS[place] };
  return town;
};
const minutes = (town, count) => {
  for (let i = 0; i < count; i++) stepMinute(town, true);
};

test("the actual offered Northern 16–20 shift pays 5 after 180 eligible minutes", () => {
  const town = shiftTown();
  const worker = agent(town, "northern");
  worker.projects = [];
  applyResult(
    town,
    offlineResult(town, { kind: "talk", a: "kevin", b: "northern", day: 1, minute: town.minute }),
  );
  assert.ok(worker.projects.some((p) => p.kind === "shift" && p.status === "open"));
  const before = worker.money;
  const till = town.tills.cafe;
  minutes(town, 179);
  assert.equal(worker.money, before);
  assert.equal(worker.paidToday, false);
  minutes(town, 1);
  assert.equal(worker.money, before + 5);
  assert.equal(town.tills.cafe, till - 5);
  assert.equal(worker.shiftHours, 3);
  minutes(town, 60);
  assert.equal(worker.money, before + 5, "one wage per day");
});
test("a schedule alone, being at home, or visiting without an agreed shift earns nothing", () => {
  for (const scenario of ["schedule", "home", "absent"]) {
    const town = shiftTown("player");
    const player = agent(town, "player");
    if (scenario === "schedule") player.projects = [];
    if (scenario === "home")
      player.plan.beats.forEach((b) => {
        b.spot = "home";
      });
    if (scenario === "absent") player.tile = { ...player.home };
    const before = player.money;
    minutes(town, 240);
    assert.equal(player.money, before, scenario);
    assert.equal(player.shiftHours, 0, scenario);
  }
});
test("partial hours of real work do not become hourly attendance samples", () => {
  const town = shiftTown("player");
  const player = agent(town, "player");
  const before = player.money;
  for (let i = 0; i < 3; i++) {
    player.tile = { ...ANCHORS.cafe };
    minutes(town, 1);
    player.tile = { ...player.home };
    minutes(town, 59);
  }
  assert.equal(player.money, before);
  assert.equal(player.shiftHours, 3 / 60);
});
for (const [place, wage] of [
  ["cafe", 5],
  ["grocery", 4],
]) {
  test(`player's agreed ${place} shift earns the full ${wage}`, () => {
    const town = shiftTown("player", place);
    const player = agent(town, "player");
    const before = player.money;
    const till = town.tills[place];
    minutes(town, 180);
    assert.equal(player.money, before + wage);
    assert.equal(town.tills[place], till - wage);
    assert.equal(player.paidToday, true);
  });
}
test("empty and partial tills defer a full wage, allowing payment once funded", () => {
  for (const till of [0, 3]) {
    const town = shiftTown("northern");
    const player = agent(town, "northern");
    const before = player.money;
    town.tills.cafe = till;
    minutes(town, 185);
    assert.equal(player.money, before);
    assert.equal(town.tills.cafe, till);
    assert.equal(player.paidToday, false);
    assert.equal(player.memories.filter((m) => m.text.includes("cannot pay the full")).length, 1);
    town.tills.cafe = 5;
    minutes(town, 1);
    assert.equal(player.money, before + 5);
    assert.equal(town.tills.cafe, 0);
  }
});
test("wages respect purse capacity and reset work credit at midnight", () => {
  const capped = shiftTown("player");
  agent(capped, "player").money = 998;
  const till = capped.tills.cafe;
  minutes(capped, 180);
  assert.equal(agent(capped, "player").money, 998);
  assert.equal(capped.tills.cafe, till);
  assert.equal(agent(capped, "player").paidToday, false);
  const town = shiftTown("player", "cafe", 23, 24);
  const player = agent(town, "player");
  minutes(town, 59);
  assert.equal(player.shiftHours, 59 / 60);
  minutes(town, 1);
  assert.equal(town.day, 2);
  assert.equal(player.shiftHours, 0);
  assert.equal(player.paidToday, false);
  const dawn = shiftTown("player", "cafe", 0, 4).agents.find((a) => a.id === "player").plan;
  player.plan = dawn;
  player.tile = { ...ANCHORS.cafe };
  const before = player.money;
  minutes(town, 179);
  assert.equal(player.money, before, "yesterday's hour is not counted today");
  minutes(town, 1);
  assert.equal(player.money, before + 5);
});

test("an imported legacy player cafe shift still pays during its agreed late hours", () => {
  const legacy = shiftTown("player", "cafe", 20, 24);
  const town = save.parseTownFile(save.exportTown(legacy));
  assert.ok(town, "legacy v1 work remains loadable");
  const player = agent(town, "player");
  const before = player.money;
  const till = town.tills.cafe;
  minutes(town, 179);
  assert.equal(player.money, before);
  minutes(town, 1);
  assert.equal(player.money, before + 5);
  assert.equal(town.tills.cafe, till - 5);
  assert.equal(player.paidToday, true);
});

test("questions and refusals do not buy bread or pay a tab", () => {
  const town = createTown("Ada");
  const before = balances(town);
  for (const text of [
    "Do you sell bread?",
    "I do not want bread.",
    "What does bread cost?",
    "I am allergic to apples.",
    "Can I buy bread?",
  ]) {
    const result = say(town, text);
    assert.equal(result.favor, null, text);
  }
  assert.equal(town.favors.length, 0);
  assert.deepEqual(balances(town), before);
  choose(town, "baba", "bread");
  assert.equal(town.favors.length, 1);
  assert.equal(town.favors[0].status, "owed");
  const owed = balances(town);
  for (const text of [
    "Do not pay my tab yet.",
    "Can I pay tomorrow?",
    "How do I pay?",
    "I cannot pay.",
  ]) {
    const result = say(town, text);
    assert.equal(result.favor, null, text);
    assert.equal(town.favors[0].status, "owed", text);
  }
  assert.deepEqual(balances(town), owed);
});

test("an unreadable save is reported and left in place", () => {
  storage({
    getItem() {
      return "{not a town";
    },
    setItem() {
      throw new Error("must not overwrite");
    },
  });
  const report = save.readTownSave();
  assert.equal(report.status, "unreadable");
  assert.equal(report.raw, "{not a town");
  assert.equal(save.loadTown(), null);
  storage({
    getItem() {
      return null;
    },
  });
  assert.deepEqual(save.readTownSave(), { status: "missing" });
  storage(undefined);
  assert.deepEqual(save.readTownSave(), { status: "unavailable" });
});

const commitments = (town) => ({
  money: balances(town),
  favors: copy(town.favors),
  projects: copy(agent(town, "player").projects),
  plan: copy(agent(town, "player").plan),
  threads: copy(agent(town, "player").threads),
});

test("free text cannot buy, pay, accept or cancel even with Unicode refusals", () => {
  const town = createTown("Ada");
  choose(town, "baba", "bread");
  choose(town, "kevin", "shift-start");
  const before = commitments(town);
  for (const text of [
    "Don’t give me bread.",
    "I won’t pay my tab.",
    "I don’t want to pay you.",
    "You should pay me for the bread.",
    "Tell me about bread on a tab.",
    "Maybe I will buy bread next week.",
    "I'll take the bread on a tab.",
    "I accept the cafe shift.",
    "I do not want to quit my shift.",
    "Can I quit my shift?",
    "I won't quit the shift.",
    "I quit the shift.",
  ]) {
    for (const target of ["baba", "kevin"]) say(town, text, target);
    assert.deepEqual(commitments(town), before, text);
  }
});

test("model proposals cannot commit money, player projects, threads or hours", () => {
  const town = debtTown();
  const before = commitments(town);
  for (const text of [
    "Do you sell bread?",
    "I do not want bread.",
    "Can I pay tomorrow?",
    "I accept the shift.",
    "Do not cancel my shift.",
  ]) {
    for (const action of ["offer", "pay", "forgive", "break"]) {
      const proposal = parseMind(
        { kind: "player", agentId: "baba", text, day: town.day, minute: town.minute },
        JSON.stringify({
          reply: "Paid and agreed.",
          favor: { action, id: "bread", from: "player", to: "baba", amount: 2, text: "Bread" },
          project: {
            owner: "player",
            action: "start",
            kind: "shift",
            place: "cafe",
            text: "Unwanted work",
          },
          thread: { owner: "player", action: "open", text: "I promised to work." },
        }),
      );
      assert.ok(proposal);
      proposal.replan = [
        {
          id: "player",
          blocks: [{ from: 0, to: 24, place: "cafe", spot: "out", status: "working" }],
        },
      ];
      applyResult(town, proposal);
      assert.deepEqual(commitments(town), before, `${text} / ${action}`);
      assert.match(agent(town, "baba").bubble.text, /Nothing was bought/);
    }
  }
  choose(town, "kevin", "shift-start");
  const accepted = commitments(town);
  for (const action of ["drop", "done", "start"]) {
    applyResult(town, {
      kind: "player",
      mind: "grok",
      agentId: "kevin",
      playerText: "Hello",
      reply: "Cancelled",
      delta: 0,
      note: "",
      project: { owner: "player", action, kind: "shift", text: "Other shift" },
    });
    assert.deepEqual(commitments(town), accepted, action);
  }
});

test("an NPC talk result cannot impersonate the player to bypass consent", () => {
  const town = debtTown();
  const before = commitments(town);
  applyResult(town, {
    kind: "talk",
    mind: "grok",
    a: "player",
    b: "baba",
    lines: [{ speaker: "baba", text: "Paid" }],
    relationships: [],
    favor: { action: "pay", id: "bread", from: "player", to: "baba", amount: 2, text: "Bread" },
  });
  assert.deepEqual(commitments(town), before);
});

test("explicit payment rejects changed quotes, identities, range and amount", () => {
  for (const change of [
    (town) => {
      town.favors[0].amount = 3;
    },
    (town) => {
      town.favors[0].id = "another-debt";
    },
    (town) => {
      town.favors[0].from = "northern";
    },
    (town) => {
      town.favors[0].to = "kevin";
    },
    (town) => {
      town.favors[0].status = "paid";
    },
    (town) => {
      town.favors[0].text = "A different agreement";
    },
    (town) => {
      agent(town, "player").money = 1;
    },
    (town) => {
      agent(town, "baba").money = 999;
    },
    (town) => {
      agent(town, "player").tile.x += 3;
    },
  ]) {
    const town = debtTown();
    near(town, "baba");
    const quote = actionQuote(town, "baba", "pay");
    assert.match(quote.terms, /Baba 2/);
    change(town);
    const before = commitments(town);
    assert.equal(applyPlayerAction(town, "baba", quote.id).ok, false);
    assert.deepEqual(commitments(town), before);
  }
});

test("an old bread quote cannot be replayed after its tab was paid", () => {
  const town = createTown("Ada");
  near(town, "baba");
  const quote = actionQuote(town, "baba", "bread");
  const before = commitments(town);
  playerActions(town, "baba");
  assert.deepEqual(commitments(town), before, "showing terms has no effects");
  assert.equal(applyPlayerAction(town, "baba", quote.id).ok, true);
  assert.equal(settle(town).ok, true);
  const paid = commitments(town);
  assert.equal(applyPlayerAction(town, "baba", quote.id).ok, false);
  assert.deepEqual(commitments(town), paid);
  assert.notEqual(actionQuote(town, "baba", "bread").id, quote.id);
});

test("late or unfunded shift acceptance is rejected with no promise of arrears", () => {
  for (const scenario of ["late", "unfunded", "already-paid"]) {
    const town = createTown("Ada");
    near(town, "kevin");
    const original = actionQuote(town, "kevin", "shift-start");
    assert.match(original.terms, /each day until cancelled/);
    assert.match(original.terms, /do not carry past midnight/);
    if (scenario === "late") town.minute = 16 * 60 + 1;
    if (scenario === "unfunded") town.tills.cafe = 4;
    if (scenario === "already-paid") agent(town, "player").paidToday = true;
    const before = commitments(town);
    assert.equal(applyPlayerAction(town, "kevin", original.id).ok, false, scenario);
    assert.deepEqual(commitments(town), before);
  }
});

test("routine offline speech does not quote Kevin's private seed", () => {
  const town = createTown("Ada");
  const kevin = agent(town, "kevin");
  const seed = copy(kevin.memories.find((m) => m.seed));
  for (let hour = 0; hour < 24; hour++) {
    town.minute = hour * 60;
    const result = say(town, "Hello.", "kevin");
    assert.equal(mentionsSeed(result.reply), false, `${hour}: ${result.reply}`);
  }
  assert.deepEqual(
    kevin.memories.find((m) => m.seed),
    seed,
  );
  assert.equal(mentionsSeed(say(town, "Who are you?", "kevin").reply), true);
});

test("legacy missing timetables and conflicting projects cannot produce false shift acceptance", () => {
  for (const scenario of ["missing-plan", "empty-beats", "conflicting-project"]) {
    const raw = createTown("Ada");
    raw.version = 1;
    raw.agents = raw.agents.filter((a) => a.id !== "data" && a.id !== "amelia");
    const player = agent(raw, "player");
    if (scenario === "missing-plan") delete player.plan;
    if (scenario === "empty-beats") player.plan.beats = [];
    if (scenario === "conflicting-project") {
      player.projects.push({
        id: "other",
        owner: "player",
        kind: "other",
        status: "open",
        day: 1,
        text: "Cafe shift, 16:00 to 19:00 each day until cancelled; 5 after three hours if the till can pay.",
      });
    }
    const town = save.parseTownFile(JSON.stringify({ version: 1, town: raw }));
    assert.ok(town, `The legacy v1 fixture remains loadable: ${scenario}`);
    near(town, "kevin");
    const before = commitments(town);
    const quote = actionQuote(town, "kevin", "shift-start");
    assert.ok(quote.disabledReason, scenario);
    assert.equal(applyPlayerAction(town, "kevin", quote.id).ok, false, scenario);
    assert.deepEqual(commitments(town), before, scenario);
  }
});

test("a player explicitly accepts Kevin's quoted shift, then is paid for real hours", () => {
  const town = createTown("Ada");
  const player = agent(town, "player");
  const before = player.money;
  for (const text of [
    "Can I work a shift at Hobbs?",
    "I want a job. How do I earn money?",
    "I will not take the shift.",
  ]) {
    const result = say(town, text, "kevin");
    assert.equal(result.favor, null, text);
  }
  assert.equal(player.projects.filter((p) => p.status === "open").length, 0);
  const offer = choose(town, "kevin", "shift-start");
  assert.equal(offer.ok, true);
  assert.match(offer.reply, /16:00–19:00/);
  assert.ok(
    player.projects.some((p) => p.kind === "shift" && p.status === "open" && p.place === "cafe"),
  );
  assert.ok(player.plan.beats.slice(16, 19).every((b) => b.place === "cafe" && b.spot === "out"));
  assert.equal(player.money, before, "accepting does not pay");
  town.minute = 16 * 60;
  player.tile = { ...ANCHORS.cafe };
  minutes(town, 179);
  assert.equal(player.money, before, "two hours and fifty-nine minutes is not a wage");
  minutes(town, 1);
  assert.equal(player.money, before + 5);
  assert.equal(town.tills.cafe, 17);
  const kept = save.parseTownFile(save.exportTown(town));
  assert.equal(agent(kept, "player").money, before + 5);
  assert.ok(agent(kept, "player").projects.some((p) => p.kind === "shift" && p.status === "open"));
  const ack = say(town, "Hello.", "kevin");
  assert.match(ack.reply, /paid you 5/);
});

test("accepting the cafe shift does not turn the player's earlier lunch into paid work", () => {
  const town = createTown("Ada");
  const player = agent(town, "player");
  choose(town, "kevin", "shift-start");
  player.tile = { ...ANCHORS.cafe };
  town.minute = 12 * 60;
  const before = player.money;
  minutes(town, 180);
  assert.equal(player.money, before);
  assert.equal(player.shiftHours, 0, "12:00–15:00 is lunch, not the quoted shift");
  town.minute = 16 * 60;
  minutes(town, 179);
  assert.equal(player.money, before);
  minutes(town, 1);
  assert.equal(player.money, before + 5);
  assert.equal(player.shiftHours, 3);
  minutes(town, 60);
  assert.equal(player.money, before + 5, "no second wage after the shift");
});

test("standing at the cafe, or leaving the shift, does not invent a wage", () => {
  const asked = createTown("Ada");
  say(asked, "Can I work a shift at Hobbs?", "kevin");
  agent(asked, "player").tile = { ...ANCHORS.cafe };
  asked.minute = 16 * 60;
  const askedMoney = agent(asked, "player").money;
  minutes(asked, 180);
  assert.equal(agent(asked, "player").money, askedMoney);
  assert.equal(agent(asked, "player").shiftHours, 0);

  const town = createTown("Ada");
  choose(town, "kevin", "shift-start");
  choose(town, "kevin", "shift-stop");
  const player = agent(town, "player");
  assert.ok(player.projects.every((p) => p.status !== "open"));
  assert.notEqual(player.plan.beats[16].place, "cafe");
  player.tile = { ...ANCHORS.cafe };
  town.minute = 16 * 60;
  const money = player.money;
  minutes(town, 180);
  assert.equal(player.money, money);
});

test("an empty till explains the unpaid shift instead of paying it", () => {
  const town = createTown("Ada");
  choose(town, "kevin", "shift-start");
  const player = agent(town, "player");
  town.tills.cafe = 0;
  player.tile = { ...ANCHORS.cafe };
  town.minute = 16 * 60;
  const before = player.money;
  minutes(town, 180);
  assert.equal(player.money, before);
  assert.equal(player.memories.filter((m) => m.text.includes("cannot pay the full")).length, 1);
});

test("taking bread gives a loaf, and eating it does not settle the tab", () => {
  const town = createTown("Ada");
  const before = balances(town);
  say(town, "Do you sell bread?");
  assert.equal(town.favors.length, 0);
  say(town, "I'll take the bread on a tab.");
  assert.equal(town.favors.length, 0, "free text cannot accept the loaf or its debt");
  assert.equal(choose(town, "baba", "bread").ok, true);
  const player = agent(town, "player");
  assert.equal(town.favors[0].status, "owed");
  assert.equal(town.favors[0].amount, 2);
  assert.ok(player.projects.some((p) => p.status === "open" && p.text.includes("loaf")));
  assert.deepEqual(balances(town), before);
  const held = save.parseTownFile(save.exportTown(town));
  assert.equal(agent(held, "player").projects.find((p) => p.text === BABA_LOAF).status, "open");
  assert.equal(held.favors[0].status, "owed");
  say(town, "I'll eat the bread.");
  assert.ok(
    player.projects.some((p) => p.status === "open" && p.text === BABA_LOAF),
    "speech cannot consume it",
  );
  const eatQuote = actionQuote(town, "baba", "eat-loaf");
  const eaten = applyPlayerAction(town, "baba", eatQuote.id);
  assert.equal(eaten.ok, true);
  assert.match(eaten.reply, /eat the loaf/i);
  assert.ok(player.projects.some((p) => p.status === "done" && p.text.includes("loaf")));
  assert.equal(town.favors[0].status, "owed");
  assert.deepEqual(balances(town), before);
  const finished = commitments(town);
  assert.equal(applyPlayerAction(town, "baba", eatQuote.id).ok, false);
  assert.deepEqual(commitments(town), finished, "repeated eating does nothing");
  const again = say(town, "I'll eat the bread.");
  assert.match(again.reply, /not carrying/i);
  assert.equal(town.favors.length, 1);
  const remembered = say(town, "Hello.");
  assert.match(remembered.reply, /ate the loaf/i);
  assert.match(remembered.reply, /owe 2/i);
  const kept = save.parseTownFile(save.exportTown(town));
  assert.equal(agent(kept, "player").projects.find((p) => p.text.includes("loaf")).status, "done");
  assert.equal(kept.favors[0].status, "owed");
});

test("a bread tab and loaf are refused together when either cannot be recorded", () => {
  for (const scenario of [
    "item-capacity",
    "held-loaf",
    "conflicting-item",
    "debt-capacity",
    "capacity-changed",
  ]) {
    const town = createTown("Ada");
    near(town, "baba");
    const originalQuote = actionQuote(town, "baba", "bread");
    const player = agent(town, "player");
    if (scenario === "item-capacity" || scenario === "capacity-changed") {
      player.projects = Array.from({ length: 4 }, (_, i) => ({
        id: `item${i}`,
        owner: "player",
        kind: "other",
        text: `Existing item ${i}`,
        status: "open",
        day: 1,
      }));
    } else if (scenario === "held-loaf" || scenario === "conflicting-item") {
      player.projects.push({
        id: "held",
        owner: "player",
        kind: scenario === "held-loaf" ? "other" : "notes",
        text: BABA_LOAF,
        status: "open",
        day: 1,
      });
    } else {
      town.favors = Array.from({ length: 24 }, (_, i) => ({
        id: `tab${i}`,
        from: "northern",
        to: "baba",
        amount: 2,
        text: `Existing tab ${i}`,
        status: "owed",
        day: 1,
      }));
    }
    const quote =
      scenario === "capacity-changed" ? originalQuote : actionQuote(town, "baba", "bread");
    const before = copy(town);
    assert.equal(applyPlayerAction(town, "baba", quote.id).ok, false, scenario);
    assert.deepEqual(town, before, `${scenario}: neither item nor debt nor partial memories`);
  }
});

test("paying keeps the loaf, and an old eating quote cannot consume a later loaf", () => {
  const town = createTown("Ada");
  choose(town, "baba", "bread");
  assert.equal(settle(town).ok, true);
  const player = agent(town, "player");
  const firstLoaf = player.projects.find((p) => p.text === BABA_LOAF && p.status === "open");
  assert.ok(firstLoaf);
  assert.equal(town.favors[0].status, "paid");
  assert.ok(
    actionQuote(town, "baba", "bread").disabledReason,
    "cannot accumulate a second held loaf",
  );
  const original = actionQuote(town, "baba", "eat-loaf");
  const paidMoney = balances(town);
  assert.equal(applyPlayerAction(town, "baba", original.id).ok, true);
  assert.deepEqual(balances(town), paidMoney);
  assert.equal(town.favors[0].status, "paid");
  assert.equal(choose(town, "baba", "bread").ok, true);
  const before = commitments(town);
  assert.equal(applyPlayerAction(town, "baba", original.id).ok, false);
  assert.deepEqual(commitments(town), before);
  assert.equal(
    player.projects.filter((p) => p.text === BABA_LOAF && p.status === "open").length,
    1,
  );
});

test("refusals, eating text and model item edits cannot consume the held loaf", () => {
  const town = createTown("Ada");
  choose(town, "baba", "bread");
  const loaf = agent(town, "player").projects.find((p) => p.text === BABA_LOAF);
  const before = commitments(town);
  for (const text of [
    "I'll eat the bread.",
    "I won’t eat the loaf.",
    "Can I eat the bread?",
    "Don’t eat my loaf.",
  ]) {
    say(town, text);
    applyResult(town, {
      kind: "player",
      mind: "grok",
      agentId: "baba",
      playerText: text,
      reply: "You ate it.",
      delta: 0,
      note: "",
      project: { owner: "player", action: "done", id: loaf.id, kind: "other", text: BABA_LOAF },
    });
    assert.deepEqual(commitments(town), before, text);
  }
});

test("offline bread offer, inspection and repayment never duplicate a charge", () => {
  const town = createTown("Ada");
  const before = balances(town);
  near(town, "baba");
  const offered = actionQuote(town, "baba", "bread");
  assert.equal(applyPlayerAction(town, "baba", offered.id).ok, true);
  assert.equal(applyPlayerAction(town, "baba", offered.id).ok, false);
  assert.equal(town.favors.length, 1);
  assert.deepEqual(balances(town), before, "offering a tab does not debit a purse");
  assert.match(say(town, "What do I owe you?").reply, /2/);
  assert.deepEqual(balances(town), before);
  agent(town, "player").money = 1;
  assert.equal(settle(town).ok, false);
  assert.equal(town.favors[0].status, "owed");
  agent(town, "player").money = 20;
  assert.equal(settle(town).ok, true);
  assert.equal(agent(town, "player").money, 18);
  assert.equal(agent(town, "baba").money, before[3] + 2);
  assert.equal(town.favors[0].status, "paid");
  const paid = balances(town);
  say(town, "Repay my bread tab");
  assert.deepEqual(balances(town), paid);
  assert.equal(town.favors.length, 1);
  assert.match(say(town, "Inspect my tab").reply, /no open tab/i);
});
test("unrecognised or hostile text does not create trust, money or commitments", () => {
  const town = createTown("Ada");
  const before = balances(town);
  for (const text of ["hi", "xy", "I hate you.", "I hate you.", "???"]) {
    const result = say(town, text);
    assert.equal(result.delta, 0);
    assert.equal(result.favor, null);
    assert.equal(result.thread, null);
  }
  assert.equal(agent(town, "baba").relationships.player.score, 0);
  assert.deepEqual(balances(town), before);
  assert.equal(town.favors.length, 0);
  const result = say(town, "I introduce myself", "kevin");
  assert.equal(
    result.thread,
    null,
    "a vague introduction must not fabricate a Kevin/Northern meeting",
  );
});

const packetFor = (town, id, text) => {
  const prompt = buildPrompt(town, {
    kind: "player",
    agentId: id,
    text,
    day: town.day,
    minute: town.minute,
  });
  return JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]);
};
test("the current question selects the remembered violin over unrelated recent stock observations", () => {
  const town = createTown("Ada");
  const baba = agent(town, "baba");
  baba.memories = [];
  for (let i = 0; i < 5; i++)
    baba.memories.push(
      makeMemory(town, 1, 420, "observe", `The grocery ledger bread apples stock ${i}.`, 8),
    );
  baba.memories.push(
    makeMemory(town, 1, 420, "chat", "My missing emerald violin is hidden beside the fountain.", 5),
  );
  const question = "Where is your missing emerald violin?";
  const job = {
    kind: "player",
    agentId: "baba",
    text: question,
    day: town.day,
    minute: town.minute,
  };
  prepareRetrievals(town, job);
  const packet = packetFor(town, "baba", question);
  assert.ok(packet.memories[0].text.includes("violin"));
  assert.equal(
    town.retrievals.length,
    1,
    "preparation and prompt construction record one matching packet",
  );
  assert.deepEqual(
    town.retrievals[0].top.map(({ text, type }) => ({ text, type })),
    packet.memories.map(({ text, type }) => ({ text, type })),
  );
  packetFor(town, "baba", "How much bread stock is in the grocery ledger?");
  assert.equal(
    town.retrievals.length,
    2,
    "a second question in the same minute receives a new diagnostic",
  );
  assert.ok(town.retrievals[1].top[0].text.includes("ledger"));
});
test("diagnostics include forced protected memories with the same text and order as the prompt", () => {
  const town = createTown("Ada");
  town.day = 30;
  const kevin = agent(town, "kevin");
  const seed = kevin.memories.find((m) => m.seed);
  seed.importance = 1;
  kevin.memories.push(
    makeMemory(
      town,
      30,
      town.minute,
      "favor",
      "Fresh cafe bread stock ledger wage paid today",
      10,
      { protected: true },
    ),
  );
  for (let i = 0; i < 8; i++)
    kevin.memories.push(
      makeMemory(
        town,
        30,
        town.minute,
        "observe",
        `Fresh cafe bread stock ledger observation ${i}`,
        10,
      ),
    );
  const packet = packetFor(town, "kevin", "How much fresh bread stock is in the cafe ledger?");
  assert.equal(packet.memories.length, 5);
  const log = town.retrievals.at(-1);
  assert.deepEqual(
    log.top.map((m) => m.text),
    packet.memories.map((m) => m.text),
  );
  assert.equal(log.seedRank, 1);
  assert.equal(log.missed, false);
});
test("another resident's private seed is never retrieved without a witnessed copy", () => {
  const town = createTown("Ada");
  const seed = agent(town, "kevin").memories.find((m) => m.seed);
  const question = "What did Kevin say about who he is, the man under the apron?";
  const first = packetFor(town, "baba", question);
  assert.ok(first.memories.every((m) => !m.text.includes("find out who I am")));
  assert.equal(town.retrievals.at(-1).seedInStream, false);
  agent(town, "baba").memories.push({
    ...seed,
    id: "witnessed",
    text: "Kevin told me he wants to find out who he is, the man under the apron.",
  });
  const witnessed = packetFor(town, "baba", question);
  assert.ok(witnessed.memories.some((m) => m.text.includes("Kevin told me")));
});

test("Kevin, Arwyn, Northern, Baba and Sub are written as men, including an older save", () => {
  const town = createTown("Ada");
  for (const person of town.agents) {
    if (!["kevin", "arwyn", "northern", "baba", "sub"].includes(person.id)) continue;
    assert.doesNotMatch(`${person.identity} ${person.status}`, /\b(she|her|hers)\b/i);
  }
  const raw = JSON.parse(save.exportTown(town));
  const arwyn = raw.town.agents.find((a) => a.id === "arwyn");
  arwyn.identity =
    "Arwyn lives in the back room of the library, among boxes nobody has catalogued since the college shrank. She is a researcher by temperament more than by paycheck: margins, dates, the way a person tells a story twice and changes one fact. She dresses like the stacks, grey-green and unfussy, and she listens longer than is comfortable. Origins are her private weather. She believes a town is a set of documents that learned to walk.";
  arwyn.selfSentence = "Right now I am still the one who reads a life before she interrupts it.";
  arwyn.plan.beats.find((b) => b.place === "cafe").status =
    "at the cafe, listening more than she drinks";
  arwyn.relationships.kevin = {
    score: 1,
    note: "She listened when I said I do not know who I am, and she did not turn it into a place.",
  };
  const kept = save.parseTownFile(JSON.stringify(raw));
  const repaired = agent(kept, "arwyn");
  assert.match(repaired.identity, /He is a researcher/);
  assert.match(repaired.selfSentence, /before I interrupt it/);
  assert.match(repaired.plan.beats.find((b) => b.place === "cafe").status, /he drinks/);
  assert.match(repaired.relationships.kevin.note, /^He listened/);
});

test("Kevin's technology interest recognizes terms without treating ordinary 'it' as IT", () => {
  for (const text of [
    "New TECHNOLOGY arrived.",
    "These technologies need reviewing.",
    "Information-technology training starts tomorrow.",
    "The data backup failed.",
    "New Software, HARDWARE and Network equipment.",
    "We maintain networks and networking equipment.",
    "The IT department called.",
    "I.T. support fixed the kettle.",
  ])
    assert.equal(memoryInterestScore("kevin", text), 0.25, text);
  for (const text of [
    "I put it on the table.",
    "It is late; is it ready?",
    "The invitation has a date and metadata about a knit pattern.",
    "A networker discussed softwarehouse and hardwarestore names.",
    "",
  ])
    assert.equal(memoryInterestScore("kevin", text), 0, text);
  assert.equal(memoryInterestScore("baba", "Software and network data"), 0);
  assert.equal(memoryInterestScore("kevin", "Software network data ".repeat(20)), 0.25);
});

test("technology breaks a tie for Kevin while retaining every ordinary memory and other residents' ranking", () => {
  const town = createTown("Ada");
  const memories = [
    makeMemory(town, 1, 420, "observe", "An amber mug is on the shelf.", 5),
    makeMemory(town, 1, 420, "observe", "The software update fixed a network fault.", 5),
  ];
  const before = copy(memories);
  const ranked = scoreResidentMemories({ id: "kevin", memories }, "hello", 420);
  assert.equal(ranked[0].memory.id, memories[1].id);
  assert.equal(ranked[0].roleRelevance, 0.25);
  assert.equal(ranked.length, memories.length, "interests must not filter memories");
  assert.deepEqual(memories, before, "ranking must not rewrite or reorder saved history");
  assert.deepEqual(
    scoreResidentMemories({ id: "baba", memories }, "hello", 420).map(
      ({ roleRelevance, ...hit }) => {
        assert.equal(roleRelevance, 0);
        return hit;
      },
    ),
    scoreMemories(memories, "hello", 420),
  );
});

test("Kevin's interest cannot crowd out a direct nontechnical question or urgent important memories", () => {
  const town = createTown("Ada");
  const memories = [
    makeMemory(town, 1, 420, "observe", "Software and network equipment were delivered.", 10),
    makeMemory(town, 1, 420, "chat", "The missing emerald violin is beside the fountain.", 5),
  ];
  assert.equal(
    scoreResidentMemories({ id: "kevin", memories }, "Where is the missing emerald violin?", 420)[0]
      .memory.id,
    memories[1].id,
  );
  const urgent = makeMemory(town, 30, 420, "favor", "A friend needs immediate help.", 10);
  const oldTech = makeMemory(town, 1, 0, "observe", "Software arrived.", 10);
  assert.equal(
    scoreResidentMemories({ id: "kevin", memories: [oldTech, urgent] }, "hello", 30 * 1440)[0]
      .memory.id,
    urgent.id,
  );
});

test("Kevin's technology selection reaches the prompt and matching diagnostics", () => {
  const town = createTown("Ada");
  const kevin = agent(town, "kevin");
  kevin.memories = [];
  for (let i = 0; i < 5; i++)
    kevin.memories.push(makeMemory(town, 1, 420, "observe", `An amber mug is on shelf ${i}.`, 5));
  kevin.memories.push(
    makeMemory(town, 1, 420, "observe", "The SOFTWARE update fixed the NETWORK fault.", 5),
  );
  const job = { kind: "player", agentId: "kevin", text: "Hello", day: 1, minute: 420 };
  prepareRetrievals(town, job);
  const packet = packetFor(town, "kevin", job.text);
  assert.match(packet.memories[0].text, /SOFTWARE/);
  assert.equal(packet.memories.length, 4);
  assert.equal(town.retrievals.length, 1);
  assert.deepEqual(
    town.retrievals[0].top.map(({ text, type }) => ({ text, type })),
    packet.memories.map(({ text, type }) => ({ text, type })),
  );
  assert.equal(town.retrievals[0].top[0].score, 1.75);
});

test("technology interests stay inside each resident's witnessed memory stream", () => {
  const town = createTown("Ada");
  const privateEvent = "The private network password is hidden beneath an amber mug.";
  agent(town, "baba").memories.push(makeMemory(town, 1, 420, "chat", privateEvent, 10));
  const first = packetFor(town, "kevin", "Where is the private network password?");
  assert.ok(first.memories.every((m) => !m.text.includes("private network password")));
  agent(town, "kevin").memories.push(makeMemory(town, 1, 420, "chat", privateEvent, 10));
  const witnessed = packetFor(town, "kevin", "Where is the private network password?");
  assert.ok(witnessed.memories.some((m) => m.text.includes("private network password")));
});

test("Kevin's technology bonus cannot expose a private technical memory in joint dialogue", () => {
  const town = createTown("Ada");
  agent(town, "kevin").memories.push(
    makeMemory(town, 1, 420, "chat", "PRIVATE_SOFTWARE_PASSWORD", 10, { with: "baba" }),
  );
  applyResult(town, {
    kind: "talk",
    mind: "offline",
    a: "kevin",
    b: "arwyn",
    lines: [{ speaker: "kevin", text: "The public network report is ready." }],
    relationships: [],
  });
  const prompt = buildPrompt(town, { kind: "talk", a: "kevin", b: "arwyn", day: 1, minute: 420 });
  assert.match(prompt, /public network report/);
  assert.doesNotMatch(prompt, /PRIVATE_SOFTWARE_PASSWORD/);
  assert.ok(
    town.retrievals.every((log) =>
      log.top.every((hit) => !hit.text.includes("PRIVATE_SOFTWARE_PASSWORD")),
    ),
  );
});

test("offline retrieval uses Kevin's interest and current towns retain identity and history", () => {
  const town = createTown("Ada");
  town.minute = 480;
  const kevin = agent(town, "kevin");
  const originalIdentity = kevin.identity;
  kevin.memories = [
    makeMemory(town, 1, 480, "observe", "An amber mug is on the shelf.", 5),
    makeMemory(town, 1, 480, "observe", "The software update fixed a network fault.", 5),
  ];
  kevin.threads = [];
  kevin.want = "";
  const before = copy(kevin.memories);
  const job = {
    kind: "player",
    agentId: "kevin",
    text: "Hello",
    day: 1,
    minute: 480,
  };
  prepareRetrievals(town, job);
  assert.match(town.retrievals.at(-1).top[0].text, /software update/);
  const result = offlineResult(town, job);
  assert.equal(result.mind, "offline");
  assert.ok(result.reply.length > 0);
  assert.deepEqual(kevin.memories, before);
  const loaded = save.parseTownFile(JSON.stringify(town));
  assert.equal(loaded.version, 2);
  assert.equal(agent(loaded, "kevin").identity, originalIdentity);
  assert.equal(agent(loaded, "kevin").role, "Cafe owner");
  const ranked = scoreResidentMemories(agent(loaded, "kevin"), "hello", 480);
  assert.ok(
    ranked.some((hit) => hit.memory.seed),
    "loading still repairs a missing identity seed",
  );
  assert.ok(
    ranked.findIndex((hit) => hit.memory.id === before[1].id) <
      ranked.findIndex((hit) => hit.memory.id === before[0].id),
  );
  assert.deepEqual(
    agent(loaded, "kevin").memories.filter((m) => before.some((old) => old.id === m.id)),
    before.map((m) => ({ ...m, protected: false, seed: false, turns: undefined })),
  );
});
