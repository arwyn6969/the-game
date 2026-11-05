import assert from "node:assert/strict";
import { after, test } from "node:test";
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
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { BABA_LOAF } = await server.ssrLoadModule("/src/game/effects.ts");
const { relationshipCommitments } = await server.ssrLoadModule(
  "/src/components/town/relationship-commitments.ts",
);

test("resident cards show only identified commitments and keep personal work in the journal", () => {
  const town = createTown("Card regression");
  const player = town.agents.find((agent) => agent.id === "player");
  const projects = [
    { id: "cafe", kind: "shift", place: "cafe", text: "Cafe shift terms" },
    { id: "grocery", kind: "shift", place: "grocery", text: "Grocery shift terms" },
    { id: "bread", kind: "other", place: "grocery", text: BABA_LOAF },
    { id: "notes", kind: "notes", place: "library", text: "Personal Arwyn notes" },
    { id: "unknown", kind: "shift", text: "An unbound shift" },
    { id: "done", kind: "shift", place: "cafe", text: "Old shift", status: "done" },
    { id: "dropped", kind: "shift", place: "cafe", text: "Cancelled", status: "dropped" },
    { id: "foreign", kind: "shift", place: "cafe", text: "Other work", owner: "kevin" },
  ].map((project) => ({ owner: "player", status: "open", day: 1, ...project }));
  player.projects = projects;
  const before = structuredClone(town);
  const ids = (resident) => relationshipCommitments(town, resident).map((project) => project.id);
  assert.deepEqual(ids("kevin"), ["cafe"]);
  assert.deepEqual(ids("baba"), ["grocery", "bread"]);
  for (const resident of ["arwyn", "sub", "northern", "data", "amelia"])
    assert.deepEqual(ids(resident), []);
  assert.deepEqual(ids("player"), ["cafe", "grocery", "bread", "notes", "unknown"]);
  assert.deepEqual(town, before, "Rendering must not change commitments, rapport or money");
});

test("saved open shift stays associated with its employer through export/import", () => {
  const town = createTown("Retained commitment");
  const project = {
    id: "retained-shift",
    owner: "player",
    kind: "shift",
    status: "open",
    place: "cafe",
    text: "Cafe shift, 16:00 to 19:00; 5 coins for 180 eligible minutes.",
    day: 1,
  };
  town.agents.find((agent) => agent.id === "player").projects.push(project);
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  assert.deepEqual(relationshipCommitments(restored, "kevin"), [project]);
  assert.deepEqual(relationshipCommitments(restored, "arwyn"), []);
  assert.ok(relationshipCommitments(restored, "player").some((item) => item.id === project.id));
});
