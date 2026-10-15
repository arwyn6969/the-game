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
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { visibleSocialEvents, cleanSocial, MAX_SOCIAL_EVENTS } =
  await server.ssrLoadModule("/src/game/social.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const resident = (town, id) => town.agents.find((a) => a.id === id);
const talk = (town, extra = {}) =>
  applyResult(town, {
    kind: "talk",
    mind: "offline",
    a: "data",
    b: "amelia",
    lines: [
      { speaker: "data", text: "We need evidence for the library proposal." },
      {
        speaker: "amelia",
        text: "We need a named budget and clear terms before promising payment.",
      },
    ],
    relationships: [
      { owner: "data", about: "amelia", delta: 1, note: "Amelia asked for clear terms." },
    ],
    ...extra,
  });
const near = (town) => {
  resident(town, "data").tile = { x: 30, y: 20 };
  resident(town, "amelia").tile = { x: 31, y: 20 };
  resident(town, "player").tile = { x: 30, y: 21 };
};

test("one exchange records attributed speech, both memories and actual directional changes", () => {
  const town = createTown("Ada");
  talk(town);
  const events = visibleSocialEvents(town, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].turns.length, 2);
  assert.equal(events[0].memories.length, 2);
  assert.deepEqual(events[0].changes, [
    { owner: "data", about: "amelia", before: 0, after: 1, note: "Amelia asked for clear terms." },
  ]);
  assert.equal(events[0].turns[1].speaker, "amelia");
  assert.equal(resident(town, "amelia").relationships.data.score, 0);
});
test("out-of-range viewing does not confer player knowledge; witnessing records a statement", () => {
  const town = createTown("Ada");
  resident(town, "player").tile = { x: 5, y: 23 };
  talk(town);
  assert.equal(visibleSocialEvents(town, false).length, 0);
  assert.equal(
    resident(town, "player").memories.some((m) => m.text.includes("named budget")),
    false,
  );
  near(town);
  town.minute++;
  talk(town);
  assert.equal(visibleSocialEvents(town, false).length, 1);
  const heard = resident(town, "player").memories.find((m) => m.text.includes("named budget"));
  assert.equal(heard.source, "statement");
});
test("relationship caps record applied change rather than proposed delta", () => {
  const town = createTown("Ada");
  resident(town, "data").relationships.amelia.score = 3;
  talk(town);
  assert.deepEqual(town.social[0].changes, []);
});

test("only applied participant schedule changes become recorded intentions", () => {
  const town = createTown("Ada");
  const hour = Math.floor(town.minute / 60);
  const blocks = [
    { from: hour, to: 24, place: "library", spot: "out", status: "checking the original source" },
  ];
  talk(town, {
    replan: [
      { id: "data", blocks },
      { id: "kevin", blocks },
    ],
  });
  assert.deepEqual(town.social[0].intentions, [
    { agentId: "data", fromHour: hour, place: "Library", activity: "checking the original source" },
  ]);
});
test("watch mode hides seed disclosures and private-seed reflections", () => {
  const town = createTown("Ada");
  talk(town, { revealedSeed: true });
  applyResult(town, {
    kind: "reflect",
    mind: "offline",
    agents: [{ id: "kevin", reflections: ["I do not know who I am, the man under the apron."] }],
  });
  assert.equal(visibleSocialEvents(town, true).length, 0);
  assert.equal(visibleSocialEvents(town, false).length, 0);
});
test("replay filters future dialogue and reflections by their recorded date", () => {
  const town = createTown("Ada");
  talk(town);
  town.minute += 20;
  applyResult(town, {
    kind: "reflect",
    mind: "offline",
    agents: [
      { id: "data", reflections: ["Amelia asked for a named budget; that remains her account."] },
    ],
  });
  assert.equal(visibleSocialEvents(town, true, { day: 1, minute: town.minute - 1 }).length, 1);
  assert.equal(visibleSocialEvents(town, true).filter((e) => e.kind === "reflection").length, 1);
});
test("existing dialogue is deduplicated without synthesising old relationship changes", () => {
  const town = createTown("Ada");
  talk(town);
  delete town.social;
  const events = visibleSocialEvents(town, true);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].changes, []);
  assert.ok(events[0].id.startsWith("legacy-"));
});
test("social history round-trips through version-two export and import", () => {
  const town = createTown("Ada");
  near(town);
  talk(town);
  const loaded = parseTownFile(exportTown(town));
  assert.ok(loaded);
  assert.deepEqual(loaded.social, town.social);
  assert.equal(visibleSocialEvents(loaded, false).length, 1);
});
test("history is bounded and malformed imported rows are discarded", () => {
  const town = createTown("Ada");
  for (let i = 0; i < MAX_SOCIAL_EVENTS + 5; i++) {
    town.minute++;
    talk(town);
  }
  assert.equal(town.social.length, MAX_SOCIAL_EVENTS);
  const valid = town.social[0];
  assert.deepEqual(
    cleanSocial([null, { ...valid, participants: ["unknown"] }, { ...valid, minute: 1440 }]),
    [],
  );
  const sanitized = cleanSocial([
    {
      ...valid,
      secret: false,
      text: "Kevin does not know who he is, the man under the apron.",
      memories: [{ agentId: "data", memoryId: "x", extra: "discard" }],
    },
  ]);
  assert.equal(sanitized[0].secret, true);
  assert.equal(sanitized[0].memories[0].extra, undefined);
});
