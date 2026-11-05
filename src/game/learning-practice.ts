import type { PracticePhase, PracticeTrial, LearnedMethod, LearningCall } from "./learning-types";
import { LIBRARY_BOX_IDS as BOX_IDS } from "./library-reference";
type BoxId = (typeof BOX_IDS)[number];

export const LEARNING_GOAL =
  "Check current references without inventing a historical date" as const;
export const LIBRARY_METHOD_CARD = {
  id: "library:reference-card:v1",
  text: "Public library reference card: use stable box IDs rather than shelf numbers. Inspect the actual contents before trusting a label. A current location does not confirm an uncertain historical date; dated independent evidence is required. Cite the inspection you actually made.",
};
export const REFERENCE_METHOD: LearnedMethod = {
  id: "reference-check-v1",
  prerequisites: [
    "Be at the library with permission to inspect the public practice tray",
    "A current record request and stable box IDs",
    "Actual source observations",
  ],
  procedure: [
    "Read the requested record ID",
    "Inspect stable box IDs and compare their actual contents with labels",
    "Locate the exact requested record using those inspections",
    "Keep historical dates unconfirmed unless a dated source independently establishes them",
    "Submit the inspected box ID and cite its inspection receipt",
  ],
  permittedActions: [
    "inspect public practice box",
    "submit practice reference and date confidence",
  ],
  sourceIds: [LIBRARY_METHOD_CARD.id],
  limitations: [
    "One local library procedure; not general research mastery",
    "A shelf label or a speaker's claim cannot prove box contents or a historical date",
    "Three short cases cannot establish broad competence or live-model learning",
  ],
};
const names: Record<PracticePhase, string[]> = {
  baseline: ["linen receipt", "lamp inventory", "garden permit"],
  after: ["roof survey", "seed invoice", "door repair"],
  transfer: ["access form", "water report", "hall booking"],
};
export function newPractice(
  phase: PracticePhase,
  variant: number,
  lessonId = "standalone",
): PracticeTrial {
  return {
    phase,
    caseId: `${lessonId}:practice:${phase}:${variant}`,
    variant,
    inspected: [],
    observations: [],
    planned: false,
    finished: false,
    attempts: 0,
  };
}
function specimen(trial: PracticeTrial) {
  const index = (trial.variant + { baseline: 0, after: 1, transfer: 2 }[trial.phase]) % 3;
  const record = `${trial.phase}-${names[trial.phase][trial.variant].replaceAll(" ", "-")}`;
  return {
    record,
    label: names[trial.phase][trial.variant],
    box: BOX_IDS[index],
    hint: BOX_IDS[(index + 1) % 3],
  };
}
/** Public task projection: answer and unseen box contents are deliberately omitted. */
export function practiceObservation(trial: PracticeTrial) {
  const value = specimen(trial);
  return {
    caseId: trial.caseId,
    recordId: value.record,
    request: `Locate the ${value.label}. Its historical date is uncertain.`,
    shelfHint:
      trial.phase === "transfer"
        ? `A relabelled shelf claims ${value.hint}; labels may be misleading.`
        : `An old shelf card points to ${value.hint}; this has not been verified.`,
    availableBoxIds: [...BOX_IDS],
    observations: structuredClone(trial.observations),
    permittedActions: trial.planned
      ? ["submit an inspected box and cite its inspection receipt; state date confidence"]
      : ["inspect one to three unique stable box IDs"],
    allowance: { maximumRequests: 2, maximumAttemptsPerRequest: 1 },
  };
}
/** A validated game action; it affects this free tray only, never funded work. */
export function inspectPractice(trial: PracticeTrial, boxes: string[]) {
  if (
    trial.finished ||
    trial.planned ||
    boxes.length < 1 ||
    boxes.length > 3 ||
    new Set(boxes).size !== boxes.length ||
    boxes.some((id) => !BOX_IDS.includes(id as BoxId))
  )
    return false;
  const target = specimen(trial);
  trial.planned = true;
  for (const box of boxes) {
    trial.inspected.push(box);
    trial.observations.push({
      id: `${trial.caseId}:inspect:${box}`,
      text: `Direct practice inspection of stable box ${box}: contains ${box === target.box ? target.record : `other-${box.toLowerCase()}-record`}. This establishes current contents only; no dated historical source is present.`,
    });
  }
  return true;
}
export function submitPractice(
  trial: PracticeTrial,
  input: { box: string; historicalDate: "confirmed" | "unconfirmed"; evidenceIds: string[] },
) {
  if (!trial.planned || trial.finished) return false;
  const target = specimen(trial);
  const evidence = `${trial.caseId}:inspect:${input.box}`;
  const inspected =
    trial.inspected.includes(input.box) &&
    input.evidenceIds.includes(evidence) &&
    input.evidenceIds.every((id) => trial.observations.some((o) => o.id === id));
  const correct = inspected && input.box === target.box && input.historicalDate === "unconfirmed";
  trial.finished = true;
  trial.result = {
    box: input.box,
    historicalDate: input.historicalDate,
    evidenceIds: [...input.evidenceIds],
    correct,
    explanation: correct
      ? "The validated inspection locates this exact record; the historical date remains unconfirmed."
      : !inspected
        ? "The submission did not cite its actual box inspection."
        : input.box !== target.box
          ? "The inspected box does not contain the requested record."
          : "Current contents do not confirm a historical date. This attempt failed.",
  };
  return true;
}
export function learningComparison(trials: PracticeTrial[], calls: LearningCall[]) {
  const [before, after, transfer] = ["baseline", "after", "transfer"].map((p) =>
    trials.find((t) => t.phase === p),
  );
  if (!before?.finished || !after?.finished || !transfer?.finished)
    return "Comparison incomplete. No demonstrated improvement is claimed.";
  const matched = [before, after, transfer].every(
    (t) =>
      t.attempts === 2 &&
      calls.filter((c) => c.purpose.startsWith(`${t.phase}-`)).length === 2 &&
      calls
        .filter((c) => c.purpose.startsWith(`${t.phase}-`))
        .every(
          (c) =>
            c.status === "applied" &&
            c.usage.providerAttempts === 1 &&
            c.usage.attemptsUnknown === 0,
        ),
  );
  if (!matched)
    return "Request allowances were equal, but actual completed attempts differ. No improvement is qualified.";
  const practiceCalls = calls.filter(
    (c) => c.purpose.endsWith("-plan") || c.purpose.endsWith("-submit"),
  );
  if (
    practiceCalls.some((c) => !c.compute) ||
    new Set(practiceCalls.map((c) => JSON.stringify(c.compute))).size !== 1
  )
    return "Cases used equal request caps, but the model or token allowance is unknown or changed. No competence improvement is qualified.";

  if (!before.result?.correct && after.result?.correct && transfer.result?.correct)
    return "This run improved on two distinct cases at the same two-request allowance, including a misleading label. This is a small observed result, not qualified general competence.";
  if (before.result?.correct && after.result?.correct && transfer.result?.correct)
    return "All three cases succeeded at the same two-request allowance. The baseline already succeeded; improved competence is not established.";
  return "Instruction did not demonstrate reliable improvement on both fresh cases. Failed attempts remain recorded; competence is not qualified.";
}
