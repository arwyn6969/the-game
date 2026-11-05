import type { AgentId, Town } from "./types";
import { libraryLearningEvidence } from "./community";

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
