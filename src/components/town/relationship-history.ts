import type { AgentId, Town } from "../../game/types";
import type { validateReadingEvening } from "../../game/reading-evening";

export type SharedActivity = {
  id: string;
  title: string;
  day: number;
  minute: number;
  text: string;
};

type ReadingHistory = Pick<Parameters<typeof validateReadingEvening>[1], "evening" | "events">;

const stamp = (at: { day: number; minute: number }) => (at.day - 1) * 1440 + at.minute;

/** Presentation only: recorded attendance and heard speech never create rapport or chat. */
export function sharedActivities(town: Town, resident: AgentId): SharedActivity[] {
  const activities: SharedActivity[] = [];
  const library = town.economy?.projects?.library as unknown as ReadingHistory | undefined;
  const reading = library?.evening;
  const scene = library?.events.find((event) => event.id === `reading:${reading?.eventId}:scene`);
  if (
    reading?.status === "done" &&
    reading.attendedByPlayer &&
    reading.completedAt &&
    reading.outcome &&
    scene?.participants.includes("player") &&
    scene.participants.includes(resident) &&
    stamp(scene) === stamp(reading.completedAt) &&
    stamp(scene) <= stamp(town)
  ) {
    activities.push({
      id: scene.id,
      title: "Northern's first reading",
      day: scene.day,
      minute: scene.minute,
      text: reading.outcome,
    });
  }

  for (const meeting of town.discussions?.sessions ?? []) {
    // A hidden recipient is not evidence that the player saw them attend.
    // Show only speech by this resident that the player actually heard.
    const heard = meeting.utterances.filter(
      (turn) =>
        stamp(turn.at) <= stamp(town) &&
        (resident === "player"
          ? turn.speaker === "player" || turn.recipientIds.includes("player")
          : turn.speaker === resident && turn.recipientIds.includes("player")),
    );
    const latest = heard.at(-1);
    if (latest) {
      activities.push({
        id: `discussion:${meeting.id}`,
        title: "Library discussion",
        day: latest.at.day,
        minute: latest.at.minute,
        text: `${town.agents.find((agent) => agent.id === latest.speaker)?.name ?? latest.speaker}: ${latest.text}`,
      });
    }
  }

  return activities.sort((a, b) => stamp(b) - stamp(a) || a.id.localeCompare(b.id));
}

export function hasSharedHistory(town: Town, resident: AgentId): boolean {
  return (
    resident === "player" ||
    Boolean(
      town.agents
        .find((agent) => agent.id === resident)
        ?.memories.some((memory) => memory.type === "chat" && memory.with === "player"),
    ) ||
    sharedActivities(town, resident).length > 0
  );
}
