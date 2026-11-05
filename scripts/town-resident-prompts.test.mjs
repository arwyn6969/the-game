import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const cacheDir = await mkdtemp(join(tmpdir(), "town-resident-prompts-"));
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  cacheDir,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { characterProfile } = await server.ssrLoadModule("/src/game/characters.ts");
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { NPC_IDS } = await server.ssrLoadModule("/src/game/types.ts");
const resident = (town, id) => town.agents.find((agent) => agent.id === id);
const singleContext = (prompt) =>
  JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]);
const talkContext = (prompt) => ({
  a: JSON.parse(prompt.split("\nA: ")[1].split("\nB: ")[0]),
  b: JSON.parse(prompt.split("\nB: ")[1]),
});

test("every resident keeps the same public starting perspective in paired and player conversations", () => {
  const town = createTown("Mira");
  for (const id of NPC_IDS) {
    const otherId = id === "arwyn" ? "baba" : "arwyn";
    const paired = talkContext(
      buildPrompt(town, { kind: "talk", a: id, b: otherId, day: 1, minute: 420 }),
    );
    const own = singleContext(
      buildPrompt(town, {
        kind: "player",
        agentId: id,
        text: "What matters to you?",
        day: 1,
        minute: 420,
      }),
    );
    assert.deepEqual(paired.a.perspective, own.perspective);
    assert.equal(paired.a.perspective.startingPrinciple, characterProfile(id).reflection);
    assert.equal(paired.a.perspective.publicRole, characterProfile(id).publicRole);
    assert.notEqual(paired.a.perspective.voice, paired.b.perspective.voice);
  }
});

test("a shared prompt cannot acquire private identity, motives, personal relationship notes or third-party history", () => {
  const town = createTown("Mira");
  const a = resident(town, "arwyn");
  const b = resident(town, "baba");
  a.identity = "PRIVATE_IDENTITY_SENTINEL";
  a.selfSentence = "PRIVATE_OUTLOOK_SENTINEL";
  a.want = "PRIVATE_WANT_SENTINEL";
  a.relationships.baba = { score: 3, note: "PRIVATE_REGARD_SENTINEL" };
  a.threads = [{ id: "private-thread", text: "PRIVATE_THREAD_SENTINEL", open: true, hidden: true }];
  a.memories.push(
    makeMemory(town, 1, 410, "chat", "PRIVATE_THIRD_PARTY_SENTINEL", 10, { with: "kevin" }),
  );
  const sharedText = "We discussed checking the public reference before making a claim.";
  const turns = [
    { speaker: "arwyn", text: "We should check the public reference before making a claim." },
    { speaker: "baba", text: "I agree that clear evidence matters here." },
  ];
  a.memories.push(makeMemory(town, 1, 415, "chat", sharedText, 8, { with: "baba", turns }));
  b.memories.push(makeMemory(town, 1, 415, "chat", sharedText, 8, { with: "arwyn", turns }));
  const prompt = buildPrompt(town, { kind: "talk", a: "arwyn", b: "baba", day: 1, minute: 420 });
  assert.doesNotMatch(prompt, /PRIVATE_\w+_SENTINEL/);
  assert.match(prompt, /public reference/);
  const { a: packet } = talkContext(prompt);
  assert.ok(packet.relationship);
  for (const field of ["identity", "selfSentence", "want", "threads", "learning"])
    assert.equal(field in packet, false, field);
});

test("weekly review asks for an evidenced choice and parses bounded provenance without forcing identity change", () => {
  const town = createTown("Mira");
  const job = { kind: "plan", agents: ["arwyn"], weekly: true, day: 7, minute: 300 };
  const prompt = buildPrompt(town, job);
  assert.match(prompt, /Stability is a valid outcome/);
  assert.match(prompt, /selfEvidence/);
  assert.doesNotMatch(prompt, /Identity drifts|each resident rewrites/);
  const plan = {
    id: "arwyn",
    summary: "Review the library references.",
    blocks: [{ from: 0, to: 24, place: "library", spot: "out", status: "reviewing references" }],
    selfSentence: "I now check a reference before repeating it.",
    selfEvidence: ["own-receipt"],
    selfReason: "The failed lookup showed why an unverified card can mislead.",
  };
  const parsed = parseMind(job, JSON.stringify({ plans: [plan] }));
  assert.deepEqual(parsed.plans[0].selfEvidence, ["own-receipt"]);
  assert.equal(parsed.plans[0].selfReason, plan.selfReason);
  for (const selfEvidence of [[], [""], [17], ["a", "b", "c", "d"], ["x".repeat(81)]]) {
    const invalid = parseMind(job, JSON.stringify({ plans: [{ ...plan, selfEvidence }] }));
    assert.equal(invalid.plans[0].selfEvidence, undefined);
  }
  const unchanged = { ...plan };
  delete unchanged.selfSentence;
  delete unchanged.selfReason;
  delete unchanged.selfEvidence;
  assert.equal(
    parseMind(job, JSON.stringify({ plans: [unchanged] })).plans[0].selfSentence,
    undefined,
  );
});

test("reflection permits an honest unchanged outlook and requests a testable next method", () => {
  const town = createTown("Mira");
  const job = { kind: "reflect", agents: ["data"], weekly: true, day: 7, minute: 420 };
  const prompt = buildPrompt(town, job);
  assert.match(prompt, /one or two first-person reflections/);
  assert.match(prompt, /observable result that would support or challenge/);
  assert.match(prompt, /A plan to try is not a learned skill/);
  assert.doesNotMatch(prompt, /Also rewrite selfSentence|exactly 2 first-person/);
  const result = parseMind(
    job,
    JSON.stringify({
      agents: [{ id: "data", reflections: ["I still lack evidence to change my view."] }],
    }),
  );
  assert.deepEqual(result.agents[0].reflections, ["I still lack evidence to change my view."]);
});

test("all-resident planning and reflection keep bounded context with the richer starting perspectives", () => {
  const town = createTown("Mira");
  for (const kind of ["plan", "reflect"]) {
    const prompt = buildPrompt(town, { kind, agents: NPC_IDS, weekly: true, day: 7, minute: 420 });
    assert.ok(prompt.length < 14000, `${kind}: ${prompt.length}`);
    const people = JSON.parse(prompt.split("\nPeople: ")[1]);
    assert.equal(people.length, NPC_IDS.length);
    for (const person of people) {
      assert.equal(person.perspective.startingPrinciple, characterProfile(person.id).reflection);
    }
  }
});
