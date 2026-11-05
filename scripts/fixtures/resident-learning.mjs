import assert from "node:assert/strict";

/** Synthetic library history built with real game actions, never handcrafted result events. */
export async function residentLearningFixture(server) {
  const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
  const { libraryActions, applyLibraryAction, advanceLibraryProject } =
    await server.ssrLoadModule("/src/game/community.ts");
  const { learningContext } = await server.ssrLoadModule("/src/game/learning.ts");
  const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
  const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
  const resident = (town, id) => town.agents.find((agent) => agent.id === id);
  const state = (town) => town.economy.projects.library;
  const act = (town, kind, argument) => {
    const action = libraryActions(town).find((action) => {
      const [candidate, arg] = JSON.parse(action.id);
      return candidate === kind && (argument === undefined || argument === arg);
    });
    assert.ok(action, `${kind}:${argument} must be available`);
    assert.equal(action.disabledReason, undefined, action.disabledReason);
    const result = applyLibraryAction(town, action.id);
    assert.equal(result.ok, true, result.reply);
    return result;
  };
  function testedIndex(mapping = "Birch") {
    const town = createTown("Mira");
    act(town, "accept", "reference");
    resident(town, "player").tile = { ...ANCHORS.library };
    for (const key of [
      "card:equipment",
      "card:dorm",
      "card:room",
      "card:kevin",
      "box:Birch",
      "box:Alder",
      "box:Cedar",
    ])
      act(town, "inspect", key);
    act(town, "report", "reference");
    act(town, "request", "source");
    for (const [record, box] of [
      ["hobbs-equipment", "Birch"],
      ["dorm-repair", "Alder"],
      ["room-access", mapping],
    ])
      act(town, "map", `${record}:${box}`);
    act(town, "submit", "player");
    act(town, "test");
    for (let minute = 0; minute < 100 && state(town).lookup.status === "routing"; minute++)
      advanceTown(town, 1);
    assert.equal(state(town).lookup.status, "done");
    return town;
  }
  function reviewFailure(town, observer = false) {
    town.day++;
    town.minute = 8 * 60;
    resident(town, "arwyn").tile = { x: 43, y: 20 };
    resident(town, "data").tile = observer ? { x: 44, y: 20 } : { x: 6, y: 6 };
    advanceLibraryProject(town);
    assert.equal(learningContext(town, "arwyn")[0]?.status, "needs-correction");
  }
  function correct(town) {
    resident(town, "player").tile = { ...ANCHORS.library };
    act(town, "correct");
    assert.equal(learningContext(town, "arwyn")[0]?.status, "ready-to-try");
  }
  return { resident, state, act, testedIndex, reviewFailure, correct };
}
