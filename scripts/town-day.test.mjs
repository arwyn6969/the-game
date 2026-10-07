import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const townMod = await server.ssrLoadModule("/src/game/town.ts");
const simMod = await server.ssrLoadModule("/src/game/sim.ts");
const effects = await server.ssrLoadModule("/src/game/effects.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");

const town = townMod.createTown("Ada");
simMod.advanceTown(town, 2 * 1440);
const spread = effects.spreadView(town);
assert.ok(spread.holders.length >= 2, "question should travel by day 2");
assert.ok(spread.notes.length >= 1, "board should carry the question");
const kevin = town.agents.find((a) => a.id === "kevin");
const seed = kevin.threads.find((t) => t.seed);
assert.equal(seed.open, true);
assert.equal(seed.hidden, true);
effects.applyResult(town, {
  kind: "talk",
  mind: "grok",
  a: "kevin",
  b: "arwyn",
  lines: [{ speaker: "kevin", text: "fine" }],
  relationships: [],
  favor: { action: "pay", from: "kevin", to: "arwyn", amount: 0, text: "nothing" },
  thread: { owner: "kevin", action: "close", id: "kevin-seed", text: "done" },
  notice: null,
  project: null,
  replan: [],
});
assert.equal(kevin.threads.find((t) => t.seed).open, true);
for (const agent of town.agents) assert.ok(Number.isFinite(agent.money) && agent.money >= 0);
assert.equal(save.validateTown(JSON.parse(JSON.stringify(town))), true);
assert.ok(town.scrub.some((frame) => frame.d === 1), "yesterday should stay on the scrubber");
const player = town.agents.find((a) => a.id === "player");
assert.ok(player.plan.beats.length === 24);
const arwyn = town.agents.find((a) => a.id === "arwyn");
arwyn.memories.push({
  id: "m-carried",
  day: 2,
  minute: 10,
  type: "chat",
  text: "Kevin asked who he is, the man under the apron, and for help.",
  importance: 8,
  keywords: [],
  protected: false,
});
const round = JSON.parse(JSON.stringify(town));
assert.equal(save.validateTown(round), true);
const carried = round.agents.find((a) => a.id === "arwyn").memories.find((m) => m.text.includes("man under the apron"));
assert.equal(carried.protected, true);
assert.ok(carried.keywords.length > 0, "empty keywords should be rebuilt on load");
for (let i = 0; i < 30; i++) {
  round.agents[0].memories.push({
    id: `fill-${i}`,
    day: 1,
    minute: i,
    type: "observe",
    text: `An ordinary minute ${i} with nothing to keep.`,
    importance: 2,
    keywords: ["ordinary"],
  });
}
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {},
};
save.saveTown(round);
assert.ok(
  round.agents.find((a) => a.id === "arwyn").memories.some((m) => m.text.includes("man under the apron")),
  "quota shed must not drop the question",
);
const offline = await server.ssrLoadModule("/src/game/offline.ts");
const first = offline.offlineResult(town, { kind: "talk", day: town.day, minute: town.minute, a: "baba", b: "sub" });
town.minute = (town.minute + 180) % 1440;
const second = offline.offlineResult(town, { kind: "talk", day: town.day, minute: town.minute, a: "baba", b: "sub" });
assert.notEqual(first.lines[0].text, second.lines[0].text, "a later hour should not repeat the same line");
assert.ok(first.lines[0].text.length > 20);
await server.close();
console.log("town-day ok");
