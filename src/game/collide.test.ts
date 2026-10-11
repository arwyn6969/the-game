import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPath } from "./path.ts";
import { pickAgents } from "./render.ts";
import { stepMinute } from "./sim.ts";
import { createTown } from "./town.ts";
import type { AgentId } from "./types.ts";

describe("people do not share a tile", () => {
  it("walks around someone standing in the way", () => {
    const around = findPath({ x: 10, y: 10 }, { x: 12, y: 10 }, new Set(["11,10"]));
    assert.equal(around.some((p) => p.x === 11 && p.y === 10), false);
    assert.equal(around.at(-1)?.x, 12);
  });

  it("splits two people who loaded on the same square", () => {
    const town = createTown("Ada");
    const kevin = town.agents.find((agent) => agent.id === "kevin");
    const baba = town.agents.find((agent) => agent.id === "baba");
    assert.ok(kevin && baba);
    baba.tile = { x: kevin.tile.x, y: kevin.tile.y };
    stepMinute(town, false);
    const tiles = town.agents.map((agent) => `${agent.tile.x},${agent.tile.y}`);
    assert.equal(new Set(tiles).size, tiles.length);
  });

  it("offers every person under the pointer", () => {
    const positions = {
      kevin: { x: 10, y: 10 },
      baba: { x: 10, y: 10 },
    } as Record<AgentId, { x: number; y: number }>;
    const hits = pickAgents(10.5 * 32, 10.4 * 32, 0, 0, positions);
    assert.deepEqual(hits.slice(0, 2).sort(), ["baba", "kevin"]);
  });
});
