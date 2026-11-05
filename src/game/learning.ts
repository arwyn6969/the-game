import type { AgentId, Town } from "./types";
import { libraryLearningEvidence, publicLibraryLearningEvents } from "./community";

export type PublicLearningStage =
  | "needs-correction"
  | "ready-to-try"
  | "observed-reuse"
  | "demonstrated-reuse"
  | "lookup-succeeded";
export type PublicLearningEntry = {
  id: string;
  day: number;
  minute: number;
  stage: PublicLearningStage;
  summary: string;
};

/** Player-safe history derived only from receipts shared with this resident. */
export function publicLearningHistory(town: Town, residentId: AgentId): PublicLearningEntry[] {
  const events = publicLibraryLearningEvents(town, residentId);
  const hasFailure = events.some((item) => item.kind === "failure");
  const hasCorrection = events.some((item) => item.kind === "correction");
  return events.map(({ id, day, minute, kind }) => {
    let stage: PublicLearningStage;
    let summary: string;
    if (kind === "failure") {
      stage = "needs-correction";
      summary = "Northern's independent search did not find the community room access note.";
    } else if (kind === "correction") {
      stage = "ready-to-try";
      summary =
        "The index was corrected using direct box inspections. The revised checking method was ready to try.";
    } else {
      stage =
        hasFailure && hasCorrection
          ? residentId === "arwyn"
            ? "demonstrated-reuse"
            : "observed-reuse"
          : "lookup-succeeded";
      summary =
        stage === "lookup-succeeded"
          ? "Arwyn found the Hobbs equipment register in Birch."
          : "Arwyn used the revised checking method to find the Hobbs equipment register in Birch, a different record from the failed search.";
      summary +=
        residentId === "arwyn"
          ? " This shows one successful lookup, not general mastery."
          : " This records Arwyn's result; this resident has not demonstrated the method themselves.";
    }
    return { id, day, minute, stage, summary };
  });
}

export type LearningContext = {
  method: string;
  status: "needs-correction" | "ready-to-try" | "observed-reuse" | "demonstrated-reuse";
  evidence: { id: string; summary: string }[];
  nextStep: string;
  limit: string;
};

/** A small, derived account of a tested method, never a skill inferred from self-praise. */
export function learningContext(town: Town, residentId: AgentId): LearningContext[] {
  const evidence = libraryLearningEvidence(town, residentId);
  if (!evidence) return [];
  const status = evidence.reuse
    ? evidence.reuse.demonstrator === residentId
      ? "demonstrated-reuse"
      : "observed-reuse"
    : evidence.correction
      ? "ready-to-try"
      : "needs-correction";
  return [
    {
      method:
        "Check stable box IDs against direct inspections; keep unsupported mappings provisional.",
      status,
      evidence: [evidence.failure, evidence.correction, evidence.reuse]
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map(({ id, summary }) => ({ id, summary })),
      nextStep:
        status === "needs-correction"
          ? "Correct the failed reference using direct evidence before relying on it."
          : status === "ready-to-try"
            ? "Try the corrected method on a different record when at the library."
            : "Keep checking new records; this result does not verify every reference.",
      limit:
        status === "demonstrated-reuse"
          ? "One engine-guided transfer trial, not general mastery or proof of independent learning."
          : "Witnessing or describing a method does not demonstrate personal competence.",
    },
  ];
}
