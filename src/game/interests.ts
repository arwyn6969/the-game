import type { AgentId } from "./types";

export const TECHNOLOGY_KEYWORDS = [
  "technology",
  "technologies",
  "it",
  "information technology",
  "data",
  "software",
  "hardware",
  "network",
  "networks",
  "networking",
] as const;

// Interests affect attention, not identity, access to knowledge, or saved history.
const MEMORY_INTERESTS: Partial<Record<AgentId, { keywords: readonly string[]; weight: number }>> =
  {
    kevin: { keywords: TECHNOLOGY_KEYWORDS, weight: 0.25 },
    arwyn: {
      keywords: ["records", "record", "sources", "source", "library", "evidence"],
      weight: 0.25,
    },
    northern: {
      keywords: ["study", "studying", "lesson", "practice", "student", "wage", "wages"],
      weight: 0.25,
    },
    baba: {
      keywords: ["grocery", "stock", "bread", "receipt", "receipts", "tab", "tabs"],
      weight: 0.25,
    },
    sub: {
      keywords: ["writing", "manuscript", "story", "stories", "revision", "reader"],
      weight: 0.25,
    },
    data: {
      keywords: [...TECHNOLOGY_KEYWORDS, "experiment", "measurement", "hypothesis", "testing"],
      weight: 0.25,
    },
    amelia: {
      keywords: ["budget", "budgets", "funding", "cost", "costs", "incentive", "affordability"],
      weight: 0.25,
    },
  };

export function memoryInterestScore(agentId: AgentId, eventText: string): number {
  const interest = MEMORY_INTERESTS[agentId];
  if (!interest) return 0;
  const normalized = ` ${eventText.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const isRelated = interest.keywords.some((keyword) =>
    keyword === "it"
      ? /(?:^|[^\p{L}\p{N}])(?:IT|I\.T\.)(?=$|[^\p{L}\p{N}])/u.test(eventText)
      : normalized.includes(` ${keyword} `),
  );
  // One capped bonus per memory: repeating keywords cannot increase its weight.
  return isRelated ? interest.weight : 0;
}
