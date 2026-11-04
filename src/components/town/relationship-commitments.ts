import type { AgentId, Project, Town } from "../../game/types";
import { BABA_LOAF } from "../../game/effects";

/** Only authored commitments with an identified counterparty belong on their card. */
export function relationshipCommitments(town: Town, resident: AgentId): Project[] {
  const projects = town.agents.find((agent) => agent.id === "player")?.projects ?? [];
  return projects.filter((project) => {
    if (project.owner !== "player" || project.status !== "open") return false;
    if (resident === "player") return true;
    const employer =
      project.place === "cafe" ? "kevin" : project.place === "grocery" ? "baba" : null;
    if (project.kind === "shift") return resident === employer;
    return resident === "baba" && project.kind === "other" && project.text === BABA_LOAF;
  });
}
