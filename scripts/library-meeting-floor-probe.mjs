/**
 * Select an already granted NPC floor for an explicitly authorized operator
 * probe. This never grants a turn, makes a choice or changes the normal queue.
 */
export function currentDiscussionFloorJob(town, { observation, isFresh } = {}) {
  if (typeof observation !== "function" || typeof isFresh !== "function") return null;
  try {
    const active =
      town.discussions?.sessions.filter((meeting) => meeting.status === "active") ?? [];
    if (active.length !== 1) return null;
    const meeting = active[0];
    if (meeting.pending || !meeting.floor || meeting.floor.actor === "player") return null;
    const member = meeting.members.find((candidate) => candidate.id === meeting.floor.actor);
    const resident = town.agents.find((candidate) => candidate.id === meeting.floor.actor);
    if (
      !member ||
      !resident ||
      member.choice !== "accepted" ||
      !member.arrived ||
      member.mode !== "participating"
    )
      return null;
    if (
      !Number.isSafeInteger(town.day) ||
      town.day < 1 ||
      !Number.isSafeInteger(town.minute) ||
      town.minute < 0 ||
      town.minute >= 1440 ||
      !Number.isSafeInteger(meeting.epoch) ||
      meeting.epoch < 1 ||
      !Number.isSafeInteger(member.revision) ||
      member.revision < 1 ||
      typeof meeting.id !== "string" ||
      !meeting.id ||
      typeof meeting.floor.id !== "string" ||
      !meeting.floor.id
    )
      return null;
    const view = observation(town, member.id, meeting.id);
    if (
      view.meeting?.id !== meeting.id ||
      !view.availableActions?.some((action) => action.kind === "speak")
    )
      return null;
    const job = {
      kind: "act",
      task: "discussion",
      day: town.day,
      minute: town.minute,
      agentId: member.id,
      meetingId: meeting.id,
      sessionRevision: meeting.epoch,
      actorRevision: member.revision,
      turnId: meeting.floor.id,
    };
    return isFresh(town, job) ? job : null;
  } catch {
    return null;
  }
}
