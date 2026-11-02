/** Isolated geometry evidence. Uses real world/path modules; implements no coffee runtime. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = (name) => new URL(name, import.meta.url);
const key = ({ x, y }) => `${x},${y}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const same = (a, b) => Boolean(a && b && a.x === b.x && a.y === b.y);
const config = {
  brewerFixture: { x: 5, y: 19 },
  brewStand: { x: 5, y: 18 },
  shelfFixture: { x: 6, y: 19 },
  shelfLogicalSlots: 2,
  placementStand: { x: 6, y: 18 },
  customerStand: { x: 7, y: 19 },
  cafeDoor: { x: 17, y: 20 },
  outsideDoor: { x: 18, y: 20 },
};
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});

try {
  const { cell, walkable, zoneAt, nearestWalkable } =
    await server.ssrLoadModule("/src/game/world.ts");
  const { findPath } = await server.ssrLoadModule("/src/game/path.ts");
  const checks = [];
  const check = (name, predicate) => {
    assert.ok(predicate, name);
    checks.push(name);
  };
  const stands = ["brewStand", "placementStand", "customerStand"];
  for (const name of stands) {
    const tile = config[name];
    check(
      `${name} is exact walkable cafe floor`,
      walkable(tile.x, tile.y) && zoneAt(tile.x, tile.y) === "cafe",
    );
    check(`${name} is not normalized to another tile`, same(nearestWalkable(tile.x, tile.y), tile));
  }
  for (const name of ["brewerFixture", "shelfFixture"]) {
    const tile = config[name];
    check(
      `${name} is blocked cafe counter furniture`,
      !walkable(tile.x, tile.y) &&
        cell(tile.x, tile.y)?.decor === "counter" &&
        zoneAt(tile.x, tile.y) === "cafe",
    );
  }
  check(
    "brew stand reaches brewer by one cardinal step",
    distance(config.brewStand, config.brewerFixture) === 1,
  );
  check(
    "placement stand reaches shelf by one cardinal step",
    distance(config.placementStand, config.shelfFixture) === 1,
  );
  check(
    "customer stand reaches shelf by one cardinal step",
    distance(config.customerStand, config.shelfFixture) === 1,
  );
  check(
    "brew and placement stands are adjacent",
    distance(config.brewStand, config.placementStand) === 1,
  );

  function route(name, start, target, occupied = []) {
    const blocked = new Set(occupied.map(key));
    check(
      `${name}: exact endpoints are walkable`,
      walkable(start.x, start.y) && walkable(target.x, target.y),
    );
    check(`${name}: destination is unoccupied`, !blocked.has(key(target)));
    const path = findPath(start, target, blocked);
    check(
      `${name}: route ends at exact destination`,
      same(start, target) ? path.length === 0 : same(path.at(-1), target),
    );
    check(
      `${name}: every step is cardinal, walkable and unoccupied`,
      path.every(
        (point, index) =>
          distance(index ? path[index - 1] : start, point) === 1 &&
          walkable(point.x, point.y) &&
          !blocked.has(key(point)),
      ),
    );
    return { name, start, target, occupied, steps: path.length, path };
  }

  const routes = stands.map((name) =>
    route(
      `door-to-${name}-other-stations-occupied`,
      config.cafeDoor,
      config[name],
      stands.filter((other) => other !== name).map((other) => config[other]),
    ),
  );
  routes.push(
    route("outside-door-to-customer", config.outsideDoor, config.customerStand, [
      config.brewStand,
      config.placementStand,
    ]),
  );
  routes.push(
    route("brew-to-placement", config.brewStand, config.placementStand, [config.customerStand]),
  );
  routes.push(
    route("placement-to-brew", config.placementStand, config.brewStand, [config.customerStand]),
  );

  const approach = { x: 7, y: 18 };
  const direct = route("approach-to-brew-clear", approach, config.brewStand, [
    config.customerStand,
  ]);
  const detour = route("approach-to-brew-placement-occupied", approach, config.brewStand, [
    config.placementStand,
    config.customerStand,
  ]);
  check("occupied intermediate stand requires a longer real route", detour.steps > direct.steps);
  routes.push(direct, detour);

  // findPath permits an occupied goal. This probe explicitly exposes that fact.
  // The below admission gate is a proposed coffee adapter requirement, not existing coffee code.
  const occupiedGoal = new Set([key(config.brewStand)]);
  const rawOccupiedGoalRoute = findPath(approach, config.brewStand, occupiedGoal);
  check(
    "raw findPath permits its occupied goal; caller must gate it",
    same(rawOccupiedGoalRoute.at(-1), config.brewStand),
  );
  const guarded = occupiedGoal.has(key(config.brewStand))
    ? { status: "waiting-for-station", actorPosition: { ...approach }, path: [] }
    : {
        status: "routing",
        actorPosition: { ...approach },
        path: findPath(approach, config.brewStand, occupiedGoal),
      };
  check(
    "proposed occupied-goal gate waits without movement",
    guarded.status === "waiting-for-station" &&
      same(guarded.actorPosition, approach) &&
      guarded.path.length === 0,
  );
  const afterVacated = route("occupied-brew-then-vacated", approach, config.brewStand);
  routes.push(afterVacated);

  // Demonstrate why routes are never requested to blocked fixture coordinates.
  const normalizedFixture = nearestWalkable(config.shelfFixture.x, config.shelfFixture.y);
  check(
    "blocked shelf target would be normalized; exact fixture reach must be checked separately",
    !same(normalizedFixture, config.shelfFixture),
  );
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      ["world", "path"].map(async (name) => [
        `src/game/${name}.ts`,
        createHash("sha256")
          .update(await readFile(new URL(`../../../src/game/${name}.ts`, import.meta.url)))
          .digest("hex"),
      ]),
    ),
  );
  const result = {
    status: "passed",
    evidenceKind: "isolated geometry probe using actual world.ts and path.ts",
    sourceHashes,
    config,
    checkCount: checks.length,
    checks,
    routes,
    occupancyEdge: {
      rawFindPathReachesOccupiedGoal: true,
      rawOccupiedGoalRoute,
      proposedGuard: guarded,
      resumedRoute: afterVacated.path,
      detourExtraSteps: detour.steps - direct.steps,
    },
    limitations: [
      "No complete simulation or real entity occupancy run was tested; occupied tiles are explicit synthetic blocked sets.",
      "No production coffee movement, queue, staffing, custody, serving, reservation or UI behavior exists or was implemented by this probe.",
      "findPath allows an occupied goal and normalizes blocked furniture; callers need exact floor targets plus current occupancy checks.",
      "One brew stand supports one simultaneous brewer. Two logical shelf slots are a proposed capacity setting, not two walkable tiles or measured throughput.",
      "Path lengths are grid steps, not measured simulation duration. Collision arbitration and commitments need later integration tests.",
    ],
  };
  await writeFile(output("geometry-probe.json"), `${JSON.stringify(result, null, 2)}\n`);
  const report = `# Coffee station geometry probe\n\nResult: **passed ${checks.length} assertions** against the actual \`world.ts\` and \`path.ts\` modules, loaded by Vite without application configuration. No runtime code changed.\n\n| Role | Coordinates | Evidence |\n| --- | --- | --- |\n| Brewer fixture | (5,19) | Existing blocked café counter |\n| Brew stand | (5,18) | Exact café floor, cardinal-adjacent to brewer |\n| Shelf fixture | (6,19) | Existing blocked café counter; proposed two logical cup slots |\n| Staff placement stand | (6,18) | Exact café floor, cardinal-adjacent to shelf and brew stand |\n| Customer collection stand | (7,19) | Exact café floor, cardinal-adjacent to shelf |\n\nAll three entry routes from café door (17,20) reach their exact destination while the other two station positions are occupied. Door route lengths: ${routes
    .slice(0, 3)
    .map((item) => `${item.target.x},${item.target.y}: ${item.steps} steps`)
    .join(
      "; ",
    )}. Outside door (18,20) also reaches the customer stand. Staff movement between brew and placement is one step in either direction. All recorded paths use cardinal walkable tiles and avoid the supplied occupied positions.\n\nAn occupied intermediate placement stand changes the probe approach (7,18) → brew (5,18) from ${direct.steps} to ${detour.steps} steps. An occupied destination requires waiting, then a fresh route after it clears. **Raw findPath permits a goal even when that goal is in the occupied set.** The probe's explicit destination gate waits at (7,18); this is a required future adapter guard, not production coffee behavior. Ordinary navigation already has separate occupant checks.\n\nBlocked furniture is never used as a movement goal: findPath would normalize it to a nearby walkable tile. The probe checks exact floor endpoints before routing, exact destination after routing, and one-step fixture reach separately.\n\n**Scope limit:** no complete simulation or real entity occupancy run was tested. These are static map/path checks with synthetic occupied sets. No staffing capacity, queue fairness, payment, custody, animation, movement arbitration, or collection behavior was integration-tested. One brew stand permits one simultaneous brewer; two logical shelf slots are a proposed item capacity, not evidence of doubled throughput.\n\nReproduce with Node 24: \`node docs/implementation/a02-coffee-service-2026-11-01-evidence/geometry-probe.mjs\`. Source hashes, all paths and checks are in [geometry-probe.json](geometry-probe.json).\n`;
  await writeFile(output("geometry-probe.md"), report);
  console.log(
    JSON.stringify({
      status: result.status,
      checkCount: checks.length,
      routes: routes.map(({ name, steps }) => ({ name, steps })),
      detourExtraSteps: result.occupancyEdge.detourExtraSteps,
      outputs: ["geometry-probe.json", "geometry-probe.md"],
    }),
  );
} finally {
  await server.close();
}
