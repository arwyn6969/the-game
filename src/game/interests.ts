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
