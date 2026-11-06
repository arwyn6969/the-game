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
const {
  makeMemory,
  pushMemory,
  scoreResidentMemories,
  scoreResidentContext,
  resolveMemoryReference,
} = await server.ssrLoadModule("/src/game/memory.ts");
const { promptMemories } = await server.ssrLoadModule("/src/game/retrieval.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);

test("an old answer outranks a fresh unrelated observation and stays attributed after reload", () => {
  const town = createTown("Mira");
  town.day = 60;
  const resident = person(town, "arwyn");
  resident.memories = [
    makeMemory(town, 1, 420, "chat", "Mira said the sapphire violin is inside Cedar.", 6, {
      with: "player",
      turns: [{ speaker: "player", text: "The sapphire violin is inside Cedar." }],
    }),
    ...Array.from({ length: 12 }, (_, index) =>
      makeMemory(town, 60, 420 + index, "observe", `Someone watered the flowers ${index}.`, 6),
    ),
  ];
  const saved = exportTown(town);
  const restored = parseTownFile(saved);
  const answer = promptMemories(restored, person(restored, "arwyn"), {
    kind: "player",
    agentId: "arwyn",
    text: "Where is the sapphire violin?",
    day: 60,
    minute: 450,
  })[0];
  assert.match(answer.text, /sapphire violin/);
  assert.equal(answer.source, "statement");
  assert.equal(answer.day, 1);
  assert.equal(exportTown(town), saved, "ranking never rewrites retained history");
});

test("limited concept matching recalls an earlier wage account without verifying it", () => {
  const town = createTown("Mira");
  const resident = person(town, "sub");
  resident.memories = [
    makeMemory(town, 1, 420, "chat", "Northern said his salary had not arrived.", 6),
    makeMemory(town, 45, 420, "observe", "Clouds moved across the sky.", 6),
  ];
  const answer = scoreResidentMemories(resident, "What about the wages?", 44 * 1440 + 420)[0];
  assert.match(answer.memory.text, /salary/);
  assert.equal(answer.memory.source, "statement");
  assert.equal(answer.memory.day, 1);
  assert.equal(town.favors.length, 0);
});

test("each NPC notices an existing interest without adding knowledge or rewriting identity", () => {
  const town = createTown("Mira");
  const examples = {
    kevin: "A software upgrade is proposed.",
    arwyn: "The source records disagree.",
    northern: "A practice lesson is proposed.",
    baba: "The bread stock is low.",
    sub: "The manuscript needs revision.",
    data: "The experiment needs a measurement.",
    amelia: "The budget needs a funding source.",
  };
  for (const [id, text] of Object.entries(examples)) {
    const resident = person(town, id);
    resident.memories = [
      makeMemory(town, 1, 420, "observe", "An amber cup is on the table.", 5),
      makeMemory(town, 1, 420, "observe", text, 5),
    ];
    const before = structuredClone(resident);
    const ranked = scoreResidentMemories(resident, "Hello", 420);
    assert.equal(ranked[0].memory.text, text, id);
    assert.ok(ranked[0].roleRelevance > 0 && ranked[0].roleRelevance <= 0.25);
    assert.equal(ranked.length, 2);
    assert.deepEqual(resident, before);
  }
  const player = person(town, "player");
  assert.equal(scoreResidentMemories(player, "Hello", 420)[0]?.roleRelevance ?? 0, 0);
});

test("explicit questions beat recurring wants and keyword repetition does not inflate relevance", () => {
  const town = createTown("Mira");
  const resident = person(town, "kevin");
  resident.memories = [
    makeMemory(town, 1, 420, "chat", "The sapphire violin is inside Cedar.", 6),
    makeMemory(town, 30, 420, "observe", "Software network technology equipment arrived.", 10),
  ];
  const background = "Software network technology equipment ".repeat(40);
  const ranked = scoreResidentContext(
    resident,
    "Where is the sapphire violin?",
    background,
    29 * 1440 + 420,
  );
  assert.match(ranked[0].memory.text, /sapphire violin/);
  const once = scoreResidentMemories(resident, "sapphire violin", 420)[0].relevance;
  const repeated = scoreResidentMemories(resident, "sapphire violin ".repeat(30), 420)[0].relevance;
  assert.equal(repeated, once);
});

test("joint recall follows shared conversation while private related records stay absent", () => {
  const town = createTown("Mira");
  town.day = 20;
  const a = person(town, "arwyn"),
    b = person(town, "sub");
  for (const [resident, other] of [
    [a, b],
    [b, a],
  ]) {
    resident.memories = [
      makeMemory(town, 1, 420, "chat", "The sapphire violin is inside Cedar.", 6, {
        with: other.id,
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        makeMemory(town, 19, 420 + index, "chat", `Clouds passed the window ${index}.`, 6, {
          with: other.id,
        }),
      ),
      makeMemory(town, 20, 420, "chat", "Where did we put the sapphire violin?", 6, {
        with: other.id,
        turns: [{ speaker: "sub", text: "Where did we put the sapphire violin?" }],
      }),
    ];
  }
  a.memories.push(
    makeMemory(town, 20, 421, "chat", "PRIVATE_SAPPHIRE_VIOLIN_SENTINEL", 10, { with: "kevin" }),
  );
  const recalled = promptMemories(town, a, {
    kind: "talk",
    a: "arwyn",
    b: "sub",
    day: 20,
    minute: 422,
  });
  assert.ok(recalled.some((memory) => memory.text.includes("inside Cedar")));
  assert.ok(recalled.every((memory) => !memory.text.includes("SENTINEL")));
  assert.ok(town.retrievals.at(-1).top.every((memory) => !memory.text.includes("SENTINEL")));
});

test("old cached ASCII keywords do not prevent recall of an accented name", () => {
  const town = createTown("Mira");
  const memory = makeMemory(town, 1, 420, "chat", "Estée lent the emerald notebook.", 6);
  memory.keywords = ["lent", "emerald", "notebook"];
  const resident = {
    id: "arwyn",
    memories: [makeMemory(town, 1, 420, "observe", "A notebook lies on the table.", 6), memory],
  };
  assert.equal(scoreResidentMemories(resident, "Estée", 420)[0].memory.id, memory.id);
  assert.equal(scoreResidentMemories(resident, "Estee", 420)[0].memory.id, memory.id);
});

test("bounded archives retain an early equal-importance encounter and resolve its original reference", () => {
  const town = createTown("Mira");
  const resident = person(town, "arwyn");
  resident.memories = [];
  const original = makeMemory(town, 1, 420, "chat", "Our first meeting was beside the willow.", 6, {
    with: "player",
    turns: [{ speaker: "player", text: "Meet beside the willow." }],
  });
  pushMemory(resident, original);
  for (let index = 1; index <= 160; index++) {
    pushMemory(
      resident,
      makeMemory(town, 2, index, "chat", `Routine exchange ${index}.`, 6, { with: "player" }),
    );
  }
  assert.ok(
    resident.memories.filter((memory) => memory.id.startsWith("archive-chat-")).length <= 8,
  );
  const restored = parseTownFile(exportTown(town));
  const found = resolveMemoryReference(person(restored, "arwyn").memories, original.id);
  assert.ok(found);
  assert.equal(found.text, original.text);
  assert.equal(found.source, "statement");
  assert.deepEqual(found.turns, original.turns);
  assert.equal(found.day, 1);
  assert.equal(
    resolveMemoryReference([found, { ...found, id: original.id }], original.id),
    undefined,
  );
  assert.equal(resolveMemoryReference([{ ...found }, { ...found }], found.id), undefined);
  assert.equal(resolveMemoryReference([found], "missing"), undefined);
});
