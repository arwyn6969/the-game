// Labelled synthetic poses and willing NPC decisions for deterministic local QA.
// No production schedule, speech, model or consent is changed by this fixture.
export async function followingFixture(
  load,
  { name = "Companion visitor", target = "arwyn", meeting = true, late = false } = {},
) {
  const { createTown } = await load("town");
  const d = await load("discussions");
  const { planFromBlocks } = await load("plan");
  const town = createTown(name);
  town.minute = 610;
  town.paused = true;
  town.guide = 3;
  town.sawHint = true;
  const person = (id) => town.agents.find((a) => a.id === id);
  for (const a of town.agents) {
    a.tile = { ...a.home };
    a.path = [];
    a.callUsed = true;
  }
  const poses = {
    player: { x: late ? 39 : 43, y: 22 },
    arwyn: { x: 44, y: 21 },
    northern: { x: 42, y: 21 },
    sub: { x: 43, y: 20 },
  };
  for (const [id, tile] of Object.entries(poses)) person(id).tile = tile;
  for (const id of ["arwyn", "northern", "sub"])
    person(id).plan = planFromBlocks(town.day, "Synthetic library visit", [
      { from: 0, to: 24, place: "library", status: "visiting the library", spot: "out" },
    ]);
  let serial = 0;
  const command = (id, kind, fields = {}) => {
    const m = town.discussions.sessions.at(-1);
    const r = d.applyDiscussionCommand(town, id, {
      kind,
      meetingId: m.id,
      expectedRevision: m.members.find((a) => a.id === id).revision,
      commandId: `fixture:${++serial}`,
      ...fields,
    });
    if (!r.ok) throw new Error(r.message);
    return r;
  };
  if (meeting) {
    const r = d.createLibraryDiscussion(town, "Synthetic source-checking discussion", "arwyn");
    if (!r.ok) throw new Error(r.message);
    for (const id of ["arwyn", "northern", "sub"]) {
      command(id, "read-invitation");
      command(id, "accept");
      command(id, id === target ? "participate" : "listen");
    }
    // Clear decision cues unrelated to the single explicitly tested speaker.
    for (const m of town.discussions.sessions.at(-1).members)
      if (m.id !== target) m.decisionNeeded = false;
  }
  return { town, command, target };
}
