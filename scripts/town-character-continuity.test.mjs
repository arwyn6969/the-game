import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
const { createTown, addSpecialists } = await load("town");
const save = await load("save");
const { auditEconomy, initializeEconomy } = await load("economy");
const { forkTown, validateTownIdentity } = await load("identity");
const { AGENT_IDS, NPC_IDS } = await load("types");
const { offlineResult } = await load("offline");
const { applyResult } = await load("effects");
const { characterFoundation, characterPersonalReply } = await load("character-foundations");
const { buildPrompt } = await load("prompt");
const discussions = await load("discussions");
const original = await readFile(
  new URL("./fixtures/legacy-eight-resident-town.json", import.meta.url),
  "utf8",
);
const person = (town, id) => town.agents.find((a) => a.id === id);
const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(async () => {
  if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage);
  else delete globalThis.localStorage;
  await server.close();
});
const ask = (town, id, text) =>
  offlineResult(town, {
    kind: "player",
    agentId: id,
    text,
    day: town.day,
    minute: town.minute,
  });

test("Socrates and Estee arrive with their own perspectives, zero funds and no prior local relationships", () => {
  const town = createTown("Mira");
  initializeEconomy(town);
  assert.equal(town.agents.length, 10);
  assert.equal(NPC_IDS.length, 9);
  assert.equal(
    Object.values(town.economy.openingBalances).reduce((a, b) => a + b, 0),
    90,
  );
  assert.deepEqual(auditEconomy(town), []);
  assert.match(person(town, "socrates").identity, /Plato.*Apology.*Symposium/);
  assert.match(person(town, "estee").identity, /demonstrations.*customer/);
  for (const id of ["socrates", "estee"]) {
    assert.equal(person(town, id).money, 0);
    assert.ok(Object.values(person(town, id).relationships).every((r) => r.score === 0));
    assert.equal(person(town, id).projects.length, 0);
    const greeting = ask(town, id, "Hello");
    assert.equal(greeting.delta, 0);
    assert.equal(greeting.favor, null);
  }
});

test("an actual eight-resident export retains its people, identity and books through additive arrival", () => {
  const old = JSON.parse(original).town;
  old.day = 9;
  old.minute = 615;
  const raw = JSON.stringify({ version: 2, town: old });
  const town = save.parseTownFile(raw);
  assert.ok(town);
  assert.equal(town.identityRegistry.worldId, old.identityRegistry.worldId);
  assert.equal(town.identityRegistry.rootWorldId, old.identityRegistry.rootWorldId);
  for (const previous of old.agents) {
    assert.deepEqual(
      town.identityRegistry.characters[previous.id],
      old.identityRegistry.characters[previous.id],
    );
    for (const field of [
      "name",
      "identity",
      "selfSentence",
      "want",
      "money",
      "threads",
      "projects",
      "relationships",
    ])
      assert.deepEqual(
        person(town, previous.id)[field],
        previous[field],
        `${previous.id}.${field}`,
      );
    for (const memory of previous.memories)
      assert.ok(
        person(town, previous.id).memories.some(
          (m) => m.id === memory.id && m.text === memory.text,
        ),
      );
  }
  const books = structuredClone(town.economy);
  delete books.openingBalances["agent:socrates"];
  delete books.openingBalances["agent:estee"];
  assert.deepEqual(books, old.economy);
  for (const id of ["socrates", "estee"]) {
    assert.equal(person(town, id).memories[0].day, 9);
    assert.equal(person(town, id).memories[0].minute, 615);
  }
  const once = save.exportTown(town);
  addSpecialists(town);
  assert.equal(save.exportTown(town), once);
  const restored = save.parseTownFile(once);
  assert.deepEqual(restored.identityRegistry, town.identityRegistry);
  assert.deepEqual(restored.economy, town.economy);
  assert.deepEqual(save.parseTownFile(raw).identityRegistry, town.identityRegistry);
});

test("arrival in a previously forked town preserves its lineage and gives newcomers their own local origins", () => {
  const old = JSON.parse(original).town;
  const fork = forkTown(old);
  const town = save.parseTownFile(JSON.stringify({ version: 2, town: fork }));
  assert.ok(town);
  assert.equal(town.identityRegistry.parentWorldId, old.identityRegistry.worldId);
  for (const previous of old.agents)
    assert.deepEqual(
      town.identityRegistry.characters[previous.id],
      fork.identityRegistry.characters[previous.id],
    );
  for (const id of ["socrates", "estee"]) {
    const entry = town.identityRegistry.characters[id];
    assert.equal(entry.originWorldId, town.identityRegistry.worldId);
    assert.equal(Object.hasOwn(entry, "forkedFromCharacterId"), false);
  }
  assert.ok(validateTownIdentity(town.identityRegistry, AGENT_IDS));
  assert.ok(save.parseTownFile(save.exportTown(town)));
  const next = forkTown(town);
  assert.ok(validateTownIdentity(next.identityRegistry, AGENT_IDS));
  const rewritten = structuredClone(town.identityRegistry);
  rewritten.characters.kevin.originWorldId = rewritten.worldId;
  delete rewritten.characters.kevin.forkedFromCharacterId;
  assert.equal(
    validateTownIdentity(rewritten, AGENT_IDS),
    false,
    "arrival cannot rewrite an original resident's lineage",
  );
});

test("a corrupt pre-arrival ledger is rejected before people, balances or identities are changed", () => {
  const old = JSON.parse(original).town;
  old.agents[0].money++;
  const before = structuredClone(old);
  assert.equal(save.validateTown(old), false);
  assert.deepEqual(old, before);
  const raw = JSON.stringify({ version: 2, town: old });
  assert.equal(save.readTownFile(raw).raw, raw);
});

test("the first arrival save retains the exact previous bytes and refuses a full backup store", () => {
  const data = new Map([[save.TOWN_STORAGE_KEY, original]]);
  let full = true;
  const box = {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (full && key.startsWith(save.TOWN_BACKUP_PREFIX))
        throw new DOMException("Full", "QuotaExceededError");
      data.set(key, value);
    },
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: box });
  const report = save.readTownSave();
  assert.equal(report.status, "ready");
  assert.equal(data.get(save.TOWN_STORAGE_KEY), original);
  assert.equal(save.saveTownWithStatus(report.town).ok, false);
  assert.equal(data.get(save.TOWN_STORAGE_KEY), original);
  full = false;
  assert.equal(save.saveTownWithStatus(report.town).ok, true);
  assert.ok(
    [...data.entries()].some(
      ([key, raw]) => key.startsWith(save.TOWN_BACKUP_PREFIX) && raw === original,
    ),
  );
  assert.equal(save.readTownSave().town.agents.length, 10);
});

test("personal conversation reaches every resident offline and changes no account or obligation", () => {
  const town = createTown("Mira");
  initializeEconomy(town);
  const before = structuredClone(town.economy);
  const personal = [],
    ambitions = [];
  for (const id of NPC_IDS) {
    const result = ask(town, id, "What do you enjoy?");
    const ambition = ask(town, id, "What would you like to learn?");
    personal.push(result.reply);
    ambitions.push(ambition.reply);
    assert.equal(result.reply, characterFoundation(id).personalReply);
    assert.equal(ambition.reply, characterFoundation(id).ambitionReply);
    for (const reply of [result, ambition]) {
      assert.equal(reply.delta, 0);
      for (const field of ["favor", "project", "notice", "thread"])
        assert.equal(reply[field], null);
      applyResult(town, reply);
    }
  }
  assert.equal(new Set(personal).size, 9);
  assert.equal(new Set(ambitions).size, 9);
  assert.deepEqual(town.economy, before);
  assert.equal(town.favors.length, 0);
  assert.match(ask(town, "sub", "What interests you?").reply, /Digital art.*meme/);
  assert.match(ask(town, "arwyn", "What would you like to try?").reply, /do not have a grand plan/);
  assert.equal(characterPersonalReply("kevin", "What was the latest stock price?"), null);
  assert.match(
    ask(town, "estee", "How could I market something?").reply,
    /one person.*benefit.*objection/,
  );
  assert.match(
    ask(town, "socrates", "Can you help me examine fairness?").reply,
    /concrete case.*reasons/,
  );
  assert.match(ask(town, "sub", "Tell me about digital art.").reply, /who made it.*sources/);
});

test("shared public dispositions do not reveal Kevin's origin or another resident's private outlook", () => {
  const town = createTown("Mira");
  person(town, "kevin").identity = "PRIVATE_ORIGIN_SENTINEL Bitcoin Stamps founder";
  person(town, "kevin").want = "PRIVATE_WANT_SENTINEL";
  const prompt = buildPrompt(town, {
    kind: "talk",
    a: "kevin",
    b: "socrates",
    day: 1,
    minute: 420,
  });
  assert.doesNotMatch(prompt, /PRIVATE_\w+_SENTINEL|Bitcoin Stamps founder/);
  assert.match(prompt, /Plato|philosophical/);
  assert.match(prompt, /startingDisposition/);
});

test("new-town Arwyn and Sub keep light and sourced starting points without rewriting old biographies", () => {
  const town = createTown("Mira");
  assert.doesNotMatch(
    person(town, "arwyn").identity,
    /origins are|back room|author|founder|Arwyn Hughes/i,
  );
  assert.match(person(town, "sub").identity, /digital art.*Rare Pepe.*Counterparty/);
  assert.doesNotMatch(person(town, "sub").identity, /confession|romance|trying to lie|sand.*truth/);
  const old = JSON.parse(original).town;
  const restored = save.parseTownFile(original);
  assert.equal(person(restored, "arwyn").identity, person(old, "arwyn").identity);
  assert.equal(person(restored, "sub").identity, person(old, "sub").identity);
});

test("Socrates and Estee can be proposed facilitators with three independent invitations and unchanged meeting limits", () => {
  for (const facilitator of ["socrates", "estee"]) {
    const town = createTown("Mira");
    town.minute = 610;
    const expected =
      facilitator === "socrates" ? ["socrates", "arwyn", "sub"] : ["estee", "northern", "sub"];
    const seats = {
      arwyn: { x: 44, y: 21 },
      northern: { x: 42, y: 21 },
      sub: { x: 43, y: 20 },
      socrates: { x: 42, y: 21 },
      estee: { x: 44, y: 21 },
    };
    for (const id of expected) person(town, id).tile = seats[id];
    person(town, "player").tile = { x: 43, y: 22 };
    assert.equal(
      discussions.createLibraryDiscussion(town, "What makes an invitation useful?", facilitator).ok,
      true,
    );
    const meeting = town.discussions.sessions.at(-1);
    assert.deepEqual(
      meeting.members.map(({ id }) => id),
      [...expected, "player"],
    );
    assert.equal(meeting.members[0].choice, "pending");
    for (const id of expected) {
      for (const kind of ["read-invitation", "accept", "participate"]) {
        const result = discussions.applyDiscussionCommand(town, id, {
          kind,
          meetingId: meeting.id,
          expectedRevision: meeting.members.find((m) => m.id === id).revision,
          commandId: `${id}:${kind}`,
        });
        assert.equal(result.ok, true, result.message);
      }
    }
    assert.deepEqual(discussions.validateDiscussions(town), []);
    assert.ok(save.parseTownFile(save.exportTown(town)));
    const wrong = structuredClone(town);
    wrong.discussions.sessions.at(-1).members[2].id = "baba";
    assert.ok(discussions.validateDiscussions(wrong).length);
    assert.equal(discussions.DISCUSSION_LIMITS.decisions, 16);
  }
});
