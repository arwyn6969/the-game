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
const { parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const say = (town, text) => {
  const result = offlineResult(town, {
    kind: "player",
    agentId: "kevin",
    text,
    day: town.day,
    minute: town.minute,
  });
  applyResult(town, result);
  return result.reply;
};

function wageTown() {
  const town = createTown("Mira");
  town.day = 3;
  town.minute = 1430;
  for (const day of [2, 3, 4])
    person(town, "player").memories.push({
      id: `test-wage-${day}`,
      day,
      minute: 0,
      type: "favor",
      source: "event",
      text: "Hobbs Cafe paid me 5 for a shift I actually worked.",
      importance: 7,
      keywords: [],
    });
  return town;
}

test("a wage follow-up after midnight keeps yesterday relative to the original question after reload", () => {
  let town = wageTown();
  assert.match(say(town, "Was I paid yesterday?"), /paid you 5 on day 2/);
  town.day = 4;
  town.minute = 1;
  town = parseTownFile(exportTown(town));
  assert.ok(town);
  const reply = say(town, "How much?");
  assert.match(reply, /paid you 5 on day 2/);
  assert.doesNotMatch(reply, /paid you 5 on day 3/);
});

test("a new explicit wage date becomes the subject of the next short follow-up", () => {
  const town = wageTown();
  say(town, "Was I paid yesterday?");
  say(town, "What about today?");
  assert.match(say(town, "How much?"), /paid you 5 on day 3/);
});

test("one model conversation can change each directed relationship only once", () => {
  const town = createTown("Mira");
  for (const id of ["data", "amelia"])
    person(town, id).relationships[id === "data" ? "amelia" : "data"].score = 0;
  const relationship = { owner: "data", about: "amelia", delta: 1, note: "We compared records." };
  const result = parseMind(
    { kind: "talk", a: "data", b: "amelia", day: town.day, minute: town.minute },
    JSON.stringify({
      lines: [{ speaker: "data", text: "We should compare those sources before deciding." }],
      relationships: [
        relationship,
        relationship,
        relationship,
        { owner: "amelia", about: "data", delta: -1, note: "I still need the costs." },
        { owner: "amelia", about: "data", delta: -1, note: "Repeated proposal." },
      ],
    }),
  );
  assert.ok(result);
  applyResult(town, result);
  assert.equal(person(town, "data").relationships.amelia.score, 1);
  assert.equal(person(town, "amelia").relationships.data.score, -1);
  assert.equal(town.social.at(-1).changes.length, 2);
  const loaded = parseTownFile(exportTown(town));
  assert.ok(loaded);
  assert.equal(person(loaded, "data").relationships.amelia.score, 1);
});

test("a repeated resident in a dawn response cannot start multiple projects or override its first plan", () => {
  const town = createTown("Mira");
  const draft = (place, text) => ({
    id: "data",
    summary: `Compare records at ${place}.`,
    blocks: [{ from: 0, to: 24, place, spot: "out", status: "comparing records" }],
    project: { owner: "data", action: "start", kind: "notes", text, place },
  });
  const before = person(town, "data").memories.length;
  const result = parseMind(
    { kind: "plan", agents: ["data"], day: town.day, minute: town.minute, weekly: false },
    JSON.stringify({ plans: [draft("library", "First notes."), draft("park", "Second notes.")] }),
  );
  assert.ok(result);
  applyResult(town, result);
  assert.equal(person(town, "data").plan.beats[12].place, "library");
  assert.equal(person(town, "data").memories.length, before + 1);
  assert.deepEqual(
    person(town, "data").projects.map((item) => item.text),
    ["First notes."],
  );
});

test("duplicate reflection rows retain the two-reflection bound per resident", () => {
  const town = createTown("Mira");
  const before = person(town, "data").memories.length;
  const result = parseMind(
    { kind: "reflect", agents: ["data"], day: town.day, minute: town.minute, weekly: false },
    JSON.stringify({
      agents: [
        { id: "data", reflections: ["First interpretation.", "Second interpretation."] },
        { id: "data", reflections: ["Repeated interpretation.", "One more interpretation."] },
      ],
    }),
  );
  assert.ok(result);
  applyResult(town, result);
  assert.equal(person(town, "data").memories.length, before + 2);
  assert.deepEqual(
    person(town, "data")
      .memories.slice(-2)
      .map((item) => item.text),
    ["First interpretation.", "Second interpretation."],
  );
});
