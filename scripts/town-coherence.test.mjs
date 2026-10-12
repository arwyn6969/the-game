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
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { applyResult, applyPlayerAction, playerActions } =
  await server.ssrLoadModule("/src/game/effects.ts");
const { recentConversation, groundPlayerReply } = await server.ssrLoadModule(
  "/src/game/conversation.ts",
);
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { requestMind, validateMindRequest } = await server.ssrLoadModule("/src/lib/mind.gateway.ts");
const resident = (town, id) => town.agents.find((agent) => agent.id === id);
const playerJob = (town, text, agentId = "arwyn") => ({
  kind: "player",
  agentId,
  text,
  day: town.day,
  minute: town.minute,
});
const packet = (town, text, agentId = "arwyn") =>
  JSON.parse(
    buildPrompt(town, playerJob(town, text, agentId))
      .split("\nResident: ")[1]
      .split("\nCurrent beat:")[0],
  );
const reply = (town, text, answer, agentId = "arwyn", extra = {}) =>
  applyResult(town, {
    kind: "player",
    mind: "grok",
    agentId,
    playerText: text,
    reply: answer,
    delta: 0,
    note: "",
    ...extra,
  });

test("six chronological pair-specific turns survive unrelated high-ranking memories", () => {
  const town = createTown("Ada");
  for (let i = 0; i < 5; i++) {
    town.minute += 1;
    reply(town, `Question ${i}`, `Answer ${i}`);
  }
  reply(town, "Private question", "Private answer", "baba");
  const arwyn = resident(town, "arwyn");
  for (let i = 0; i < 8; i++)
    arwyn.memories.push(
      makeMemory(town, 2, 500, "observe", `Urgent library stock inventory ${i}`, 10),
    );
  const context = packet(town, "Why did you say that?");
  assert.deepEqual(
    context.recentConversation.map((turn) => turn.text),
    ["Question 2", "Answer 2", "Question 3", "Answer 3", "Question 4", "Answer 4"],
  );
  assert.deepEqual(
    context.recentConversation.map((turn) => turn.speaker),
    ["player", "arwyn", "player", "arwyn", "player", "arwyn"],
  );
  assert.ok(
    context.recentConversation.every(
      (turn) => turn.memoryId && turn.day === 1 && turn.source === "statement",
    ),
  );
  assert.deepEqual(recentConversation(arwyn, "player", 0), []);
});

test("structured dialogue preserves a long answer and its date after export and reload", () => {
  const town = createTown("Ada");
  const answer = `${"A careful explanation. ".repeat(22)}The lesson is tomorrow at noon.`;
  reply(town, "When is the lesson?", answer);
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  restored.day = 2;
  const context = packet(restored, "Was that today or tomorrow?");
  assert.equal(context.recentConversation.at(-1).text, answer);
  assert.equal(context.recentConversation.at(-1).day, 1);
  assert.match(
    buildPrompt(restored, playerJob(restored, "When?")),
    /relative to the original event/,
  );
});

test("legacy exchanges stay attributed as legacy prose rather than inventing a speaker", () => {
  const town = createTown("Ada");
  const arwyn = resident(town, "arwyn");
  arwyn.memories.push(
    makeMemory(town, 1, 421, "chat", "Ada asked about records. Arwyn said they were upstairs.", 7, {
      with: "player",
    }),
  );
  const turns = recentConversation(arwyn, "player");
  assert.equal(turns.at(-1).speaker, null);
  assert.equal(turns.at(-1).legacy, true);
  assert.match(turns.at(-1).text, /upstairs/);
});

test("retrieved evidence carries its complete stored fact, ID, date and source", () => {
  const town = createTown("Ada");
  const text = `The emerald violin appointment is ${"important because of the old record; ".repeat(4)}on day 3, at 16:00.`;
  const memory = makeMemory(town, 1, 422, "chat", text, 10, { with: "player" });
  resident(town, "arwyn").memories.push(memory);
  const item = packet(town, "Tell me the emerald violin appointment").memories.find(
    (entry) => entry.id === memory.id,
  );
  assert.equal(item.text, text);
  assert.equal(item.source, "statement");
  assert.equal(item.day, 1);
  assert.equal(item.minute, 422);
});

test("a spoken claim and a generated reflection do not acquire event provenance", () => {
  const town = createTown("Ada");
  reply(town, "I already paid you", "Let us check the record.", "baba");
  applyResult(town, {
    kind: "reflect",
    mind: "grok",
    agents: [{ id: "baba", reflections: ["I think the player paid."] }],
  });
  const memories = resident(town, "baba").memories;
  assert.equal(
    memories.find((memory) => memory.turns?.[0]?.text === "I already paid you").source,
    "statement",
  );
  assert.equal(memories.at(-1).source, "reflection");
  assert.equal(town.favors.length, 0);
});

test("a corrected statement remains in the recent context with its original attribution", () => {
  const town = createTown("Ada");
  reply(town, "The record is dated 1900", "I will treat that as your report.");
  reply(town, "Correction: it says 1908", "Thank you; your correction is 1908.");
  const turns = packet(town, "Which date did I correct it to?").recentConversation;
  assert.equal(turns.at(-2).text, "Correction: it says 1908");
  assert.equal(turns.at(-2).speaker, "player");
  assert.equal(turns.at(-2).source, "statement");
});

test("joint NPC prompts redact private identities, wants, threads and third-party exchanges", () => {
  const town = createTown("Ada");
  const a = resident(town, "arwyn"),
    b = resident(town, "baba");
  a.identity = "SECRET_IDENTITY";
  a.want = "SECRET_DESIRE";
  a.threads.push({ id: "private", text: "SECRET_THREAD", hidden: true, open: true });
  a.memories.push(makeMemory(town, 1, 420, "chat", "SECRET_THIRD_PARTY", 10, { with: "kevin" }));
  b.memories.push(
    makeMemory(town, 1, 420, "reflect", "SECRET_REFLECTION", 10, { protected: true }),
  );
  const prompt = buildPrompt(town, { kind: "talk", day: 1, minute: 420, a: a.id, b: b.id });
  assert.doesNotMatch(prompt, /SECRET_/);
  const diagnostic = town.retrievals.filter((entry) => [a.id, b.id].includes(entry.agentId));
  assert.ok(
    diagnostic.every((entry) => entry.top.every((memory) => !memory.text.includes("SECRET_"))),
  );
});

test("mutually recorded NPC speech remains available to the same pair only", () => {
  const town = createTown("Ada");
  applyResult(town, {
    kind: "talk",
    mind: "offline",
    a: "arwyn",
    b: "baba",
    lines: [{ speaker: "arwyn", text: "We discussed the brass catalogue key." }],
    relationships: [],
  });
  const known = buildPrompt(town, { kind: "talk", day: 1, minute: 420, a: "arwyn", b: "baba" });
  const other = buildPrompt(town, { kind: "talk", day: 1, minute: 420, a: "arwyn", b: "sub" });
  assert.match(known, /brass catalogue key/);
  assert.doesNotMatch(other, /brass catalogue key/);
});

test("player context reports relevant current debts and quotes without exposing a third-party tab", () => {
  const town = createTown("Ada");
  town.favors.push({
    id: "mine",
    from: "player",
    to: "baba",
    text: "Bread",
    amount: 2,
    status: "owed",
    day: 1,
  });
  town.favors.push({
    id: "private",
    from: "northern",
    to: "baba",
    text: "SECRET_DEBT",
    amount: 6,
    status: "owed",
    day: 1,
  });
  const context = packet(town, "What do I owe you?", "baba");
  assert.equal(context.currentFacts.openObligationCount, 1);
  assert.equal(context.currentFacts.obligations[0].id, "mine");
  assert.ok(context.currentFacts.offeredChoices.some((action) => action.label === "Pay 2"));
  assert.doesNotMatch(JSON.stringify(context.currentFacts), /SECRET_DEBT/);
});

test("model prose alone cannot falsely confirm an unpaid tab", () => {
  const town = createTown("Ada");
  town.favors.push({
    id: "mine",
    from: "player",
    to: "baba",
    text: "Bread",
    amount: 2,
    status: "owed",
    day: 1,
  });
  const money = resident(town, "player").money;
  reply(town, "I already paid", "Your tab is paid.", "baba");
  const answer = recentConversation(resident(town, "baba"), "player").at(-1).text;
  assert.match(answer, /still open/);
  assert.doesNotMatch(answer, /is paid/);
  assert.equal(town.favors[0].status, "owed");
  assert.equal(resident(town, "player").money, money);
});

test("explicit player choices record event receipts separately from ordinary speech", () => {
  const town = createTown("Ada");
  resident(town, "player").tile = { ...resident(town, "baba").tile };
  const action = playerActions(town, "baba").find((choice) =>
    choice.label.startsWith("Accept bread"),
  );
  assert.equal(applyPlayerAction(town, "baba", action.id).ok, true);
  const turn = recentConversation(resident(town, "baba"), "player").at(-1);
  assert.equal(turn.source, "event");
  assert.match(turn.text, /received one loaf/);
});

test("another worker's wage memory cannot confirm that the player was paid", () => {
  const town = createTown("Ada");
  const kevin = resident(town, "kevin");
  kevin.memories.push(makeMemory(town, 1, 420, "favor", "I paid Northern 5 for a wage.", 8));
  assert.match(groundPlayerReply(town, kevin, "I've paid you 5."), /no wage receipt/);
});

test("online NPC favors retain valid effects and record their actual result", () => {
  const town = createTown("Ada");
  town.favors.push({
    id: "tab",
    from: "northern",
    to: "baba",
    text: "Apples",
    amount: 2,
    status: "owed",
    day: 1,
  });
  const before = resident(town, "northern").money;
  applyResult(town, {
    kind: "talk",
    mind: "grok",
    a: "northern",
    b: "baba",
    lines: [{ speaker: "northern", text: "I paid you 999." }],
    relationships: [],
    favor: { action: "pay", from: "northern", to: "baba", id: "tab", amount: 999, text: "Apples" },
  });
  assert.equal(town.favors[0].status, "paid");
  assert.equal(resident(town, "northern").money, before - 2);
  const turn = recentConversation(resident(town, "baba"), "northern").at(-1);
  assert.match(turn.text, /Apples, 2, paid/);
  assert.doesNotMatch(turn.text, /999/);
});

test("failed NPC payments are not stored as successful speech", () => {
  const town = createTown("Ada");
  resident(town, "northern").money = 0;
  town.favors.push({
    id: "tab",
    from: "northern",
    to: "baba",
    text: "Apples",
    amount: 2,
    status: "owed",
    day: 1,
  });
  applyResult(town, {
    kind: "talk",
    mind: "grok",
    a: "northern",
    b: "baba",
    lines: [{ speaker: "northern", text: "I paid you." }],
    relationships: [],
    favor: { action: "pay", from: "northern", to: "baba", id: "tab", amount: 2, text: "Apples" },
  });
  assert.equal(town.favors[0].status, "owed");
  assert.match(recentConversation(resident(town, "baba"), "northern").at(-1).text, /not completed/);
});

test("model completion claims cannot finish a resident project", () => {
  const town = createTown("Ada");
  const arwyn = resident(town, "arwyn");
  arwyn.projects.push({
    id: "index",
    owner: "arwyn",
    text: "Build an index",
    kind: "notes",
    status: "open",
    day: 1,
  });
  reply(town, "Is it done?", "I finished the index.", "arwyn", {
    project: { owner: "arwyn", action: "done", id: "index", kind: "notes", text: "Build an index" },
  });
  assert.equal(arwyn.projects.find((project) => project.id === "index").status, "open");
  assert.match(recentConversation(arwyn, "player").at(-1).text, /no verified completion/);
  reply(town, "What happened?", "I've fixed the catalogue.");
  assert.match(recentConversation(arwyn, "player").at(-1).text, /no verified completion/);
});

test("bounded dawn prompts and parsing operate only on requested residents", () => {
  const town = createTown("Ada");
  const job = { kind: "plan", day: 1, minute: 300, weekly: false, agents: ["arwyn", "baba"] };
  const prompt = buildPrompt(town, job);
  const people = JSON.parse(prompt.split("\nPeople: ")[1]);
  assert.deepEqual(
    people.map((person) => person.id),
    ["arwyn", "baba"],
  );
  assert.ok(prompt.length < 14000);
  const plan = (id) => ({
    id,
    summary: "A day",
    blocks: [{ from: 0, to: 24, place: "library", spot: "out", status: "Reading" }],
  });
  const parsed = parseMind(job, JSON.stringify({ plans: [plan("arwyn"), plan("kevin")] }));
  assert.deepEqual(
    parsed.plans.map((person) => person.id),
    ["arwyn"],
  );
  assert.equal(parseMind(job, JSON.stringify({ plans: [plan("kevin")] })), null);
});

test("long histories and full ledgers leave room for public personas within the gateway budget", () => {
  const town = createTown("Ada");
  const a = resident(town, "baba"),
    b = resident(town, "northern");
  for (const person of [a, b]) {
    person.identity = "i".repeat(600);
    person.want = "w".repeat(180);
    person.selfSentence = "s".repeat(160);
    person.memories = [];
    person.threads = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`,
      text: "t".repeat(100),
      open: true,
    }));
    person.projects = Array.from({ length: 3 }, (_, i) => ({
      id: `p${i}`,
      owner: person.id,
      kind: "other",
      text: "p".repeat(100),
      status: "open",
      day: 1,
    }));
    for (let i = 0; i < 4; i++)
      person.memories.push(makeMemory(town, 1, 423, "observe", "a".repeat(420), 10));
    person.memories.push(
      makeMemory(town, 1, 420, "favor", "z".repeat(420), 1, { protected: true }),
    );
  }
  for (let i = 0; i < 3; i++) {
    a.memories.push(
      makeMemory(town, 1, 420 + i, "chat", "x".repeat(420), 7, {
        with: "player",
        turns: [
          { speaker: "player", text: "x".repeat(400) },
          { speaker: "baba", text: "y".repeat(700) },
        ],
      }),
    );
  }
  for (let i = 0; i < 24; i++)
    town.favors.push({
      id: `d${i}`,
      from: "player",
      to: "baba",
      amount: 2,
      text: "z".repeat(180),
      status: "owed",
      day: 1,
    });
  const playerPrompt = buildPrompt(town, playerJob(town, "a".repeat(400), "baba"));
  const context = JSON.parse(playerPrompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]);
  assert.ok(playerPrompt.length + 900 < 14000, "allow 900 chars for a public persona");
  assert.equal(context.recentConversation.length, 6);
  assert.equal(context.currentFacts.openObligationCount, 24);
  assert.equal(context.currentFacts.obligationsOmitted, 20);
  assert.equal(context.currentFacts.choicesOmitted, 21);
  assert.deepEqual(
    town.retrievals.at(-1).top.map((memory) => memory.text),
    context.memories.map((memory) => memory.text),
  );
  town.favors = town.favors.map((favor) => ({ ...favor, from: "northern" }));
  for (let i = 0; i < 2; i++) {
    const turns = Array.from({ length: 4 }, (_, n) => ({
      speaker: n % 2 ? "baba" : "northern",
      text: String(i).repeat(700),
    }));
    for (const person of [a, b])
      person.memories.push(
        makeMemory(town, 1, 425 + i, "chat", `shared ${i}`, 7, {
          with: person.id === "baba" ? "northern" : "baba",
          turns,
        }),
      );
  }
  const talk = buildPrompt(town, { kind: "talk", a: "baba", b: "northern", day: 1, minute: 426 });
  assert.ok(talk.length + 1800 < 14000, "allow two 900-char public personas");
  const pairPacket = JSON.parse(talk.split("\nA: ")[1].split("\nB: ")[0]);
  assert.equal(pairPacket.obligationsOmitted, 20);
  assert.ok(pairPacket.recentConversation.length >= 2);
  assert.equal(pairPacket.recentConversation.at(-1).text, "1".repeat(700));
  assert.equal(
    pairPacket.recentConversation.length + (pairPacket.omittedContext?.recentConversation ?? 0),
    6,
  );
});

const request = { kind: "player", user: "A synthetic fixture question." };
test("missing keys and exhausted limits make zero provider attempts", async () => {
  let count = 0;
  const fetcher = async () => {
    count++;
    throw new Error("must not fetch");
  };
  const offline = await requestMind(request, { fetcher });
  const limited = await requestMind(request, { apiKey: "fixture", allowed: false, fetcher });
  assert.equal(count, 0);
  assert.equal(offline.diagnostics.outcome, "offline");
  assert.equal(limited.diagnostics.outcome, "rate-limit");
  assert.equal(limited.diagnostics.attempts, 0);
});

test("provider HTTP failure is one attempt with no unmetered retry", async () => {
  let count = 0;
  const result = await requestMind(request, {
    apiKey: "fixture",
    fetcher: async () => {
      count++;
      return new Response("private provider error", { status: 500 });
    },
  });
  assert.equal(count, 1);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.outcome, "http-error");
  assert.doesNotMatch(JSON.stringify(result), /fixture|private provider error/);
});

test("malformed provider content produces an explicit fallback reason", async () => {
  for (const content of ["not JSON", "[]", "null", "{broken", "x".repeat(20001)]) {
    const result = await requestMind(request, {
      apiKey: "fixture",
      fetcher: async () => Response.json({ choices: [{ message: { content } }] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.outcome, "malformed");
  }
});

test("valid provider JSON carries usage but still requires job-specific parsing", async () => {
  const result = await requestMind(request, {
    apiKey: "fixture",
    fetcher: async () =>
      Response.json({
        choices: [{ message: { content: '{"unrelated":true}' } }],
        usage: { prompt_tokens: 123, completion_tokens: 5 },
      }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.inputTokens, 123);
  assert.equal(result.diagnostics.outputTokens, 5);
  assert.equal(
    parseMind(
      { kind: "player", day: 1, minute: 420, agentId: "arwyn", text: "Hello" },
      result.text,
    ),
    null,
  );
  assert.throws(() => validateMindRequest({ kind: "player", user: "x".repeat(14001) }));
});

test("abort and transport failures are distinguished without exposing exception text", async () => {
  const controller = new AbortController();
  controller.abort();
  const timeout = await requestMind(request, {
    apiKey: "fixture",
    signal: controller.signal,
    fetcher: async () => {
      throw new Error("secret");
    },
  });
  const unreachable = await requestMind(request, {
    apiKey: "fixture",
    fetcher: async () => {
      throw new Error("secret");
    },
  });
  assert.equal(timeout.diagnostics.outcome, "timeout");
  assert.equal(unreachable.diagnostics.outcome, "unreachable");
  assert.doesNotMatch(JSON.stringify([timeout, unreachable]), /secret/);
});
