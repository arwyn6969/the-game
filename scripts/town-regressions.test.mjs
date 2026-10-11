import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { advanceTown, stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { offlineResult, prepareRetrievals } = await server.ssrLoadModule("/src/game/offline.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { plain } = await server.ssrLoadModule("/src/game/text.ts");
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
const settle = (town, changes = {}) =>
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

// These assert the previous review's diagnostic scenarios; diagnostics alone are not a verdict.
test("day-5 and day-30 exports and older pretty v1 saves round trip", () => {
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
      JSON.stringify({ version: 1, town }, null, 2),
    ]) {
      assert.deepEqual(save.parseTownFile(old), legacy, "raw and wrapped v1 remain supported");
    }
    assert.ok(
      agent(town, "northern").memories.some((m) => m.text.includes("paid me 5")),
      "offered afternoon shifts earn wages in ordinary play",
    );
  }
});

test("older v1 files repair absent optional fields while keeping personal history", () => {
  const town = debtTown();
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
  assert.equal(imported.version, 1);
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
  test(`${action} rejects a referenced debt owned by other participants`, () => {
    const town = debtTown();
    town.favors[0].from = "northern";
    const before = balances(town);
    settle(town, { action });
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
    const before = balances(town);
    settle(town, edit);
    assert.deepEqual(balances(town), before);
    assert.equal(town.favors[0].status, "owed");
  });
}
test("matching forgiveness and breaking settle once without moving money", () => {
  for (const [action, status] of [
    ["forgive", "forgiven"],
    ["break", "broken"],
  ]) {
    const town = debtTown();
    const before = balances(town);
    settle(town, { action });
    assert.equal(town.favors[0].status, status);
    assert.deepEqual(balances(town), before);
    const relation = agent(town, "player").relationships.baba.score;
    settle(town, { action });
    assert.equal(agent(town, "player").relationships.baba.score, relation);
  }
});

test("settlement uses the debt's amount and pays once", () => {
  const town = debtTown();
  const before = balances(town);
  settle(town);
  assert.equal(agent(town, "player").money, before[5] - 2);
  assert.equal(agent(town, "baba").money, before[3] + 2);
  assert.equal(town.favors[0].status, "paid");
  const paid = balances(town);
  settle(town);
  settle(town, { action: "break" });
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
test("a zero-money favor can be completed without changing balances", () => {
  const town = debtTown(0);
  const before = balances(town);
  settle(town);
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
    const town = shiftTown("player");
    const player = agent(town, "player");
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
  say(town, "I'll take the bread on a tab.");
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

test("a player can accept Kevin's shift by asking, then be paid for the hours", () => {
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
  const offer = say(town, "I accept the cafe shift.", "kevin");
  assert.match(offer.reply, /Sixteen hundred/);
  assert.ok(player.projects.some((p) => p.kind === "shift" && p.status === "open" && p.place === "cafe"));
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
  say(town, "I accept the cafe shift.", "kevin");
  say(town, "I quit the shift.", "kevin");
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
  say(town, "I accept the cafe shift.", "kevin");
  const player = agent(town, "player");
  town.tills.cafe = 0;
  player.tile = { ...ANCHORS.cafe };
  town.minute = 16 * 60;
  const before = player.money;
  minutes(town, 180);
  assert.equal(player.money, before);
  assert.equal(player.memories.filter((m) => m.text.includes("cannot pay the full")).length, 1);
});

test("offline bread offer, inspection and repayment never duplicate a charge", () => {
  const town = createTown("Ada");
  const before = balances(town);
  say(town, "I'll take the bread on a tab.");
  say(town, "I'll take the bread on a tab.");
  assert.equal(town.favors.length, 1);
  assert.deepEqual(balances(town), before, "offering a tab does not debit a purse");
  assert.match(say(town, "What do I owe you?").reply, /2/);
  assert.deepEqual(balances(town), before);
  agent(town, "player").money = 1;
  say(town, "I want to pay my bread tab");
  assert.equal(town.favors[0].status, "owed");
  agent(town, "player").money = 20;
  say(town, "I want to pay my tab of 2. Here is your money.");
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
  kevin.memories.push(makeMemory(town, 30, town.minute, "favor", "Fresh cafe bread stock ledger wage paid today", 10, { protected: true }));
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
