import type { FundedTown as Town } from "./economy-types";
import { AGENT_IDS } from "./types";
import { auditEconomy, initializeEconomy } from "./economy";
import { protectPayroll } from "./funded-work";
import { MAX_TOWN_FILE_BYTES, validateTown } from "./save";

export type TownFileReport =
  { status: "ready"; town: Town } | { status: "unreadable"; raw: string; reason: string };

export type EconomyMigrationResult =
  { ok: true; migrated: boolean } | { ok: false; reason: string };

function adoptMigration(town: Town, draft: Town) {
  // Absent optional fields stay absent in the portable/live town contract.
  const clean = JSON.parse(JSON.stringify(draft)) as Town;
  const agents = clean.agents.map((agent) => {
    const original = town.agents.find((item) => item.id === agent.id);
    if (!original) return agent;
    Object.assign(original, agent);
    return original;
  });
  const favors = clean.favors.map((favor) => {
    const original = town.favors.find((item) => item.id === favor.id);
    if (!original) return favor;
    Object.assign(original, favor);
    return original;
  });
  Object.assign(town, clean, { agents, favors });
}

/**
 * Activate funded work after loading or at the first authoritative action.
 * Opening balances are a migration snapshot, not income or historical earnings.
 * A malformed existing extension is never replaced with new books.
 */
export function initializeFundedEconomy(town: Town): EconomyMigrationResult {
  try {
    if (Object.hasOwn(town, "economy")) {
      const errors = auditEconomy(town);
      if (errors.length || !validateTown(structuredClone(town)))
        return {
          ok: false,
          reason: `The saved financial records cannot be validated${errors.length ? `: ${errors.join("; ")}` : ""}. Preserve the original backup.`,
        };
      if (town.economy?.work !== undefined) return { ok: true, migrated: false };
      // A core-only snapshot is valid accounting, but is not ready to fund work.
      // Finish payroll classification atomically without a second opening entry.
      const draft = structuredClone(town);
      const protectedResult = attachPayroll(draft);
      if (!protectedResult.ok) return protectedResult;
      adoptMigration(town, draft);
      return { ok: true, migrated: true };
    }
    const draft = structuredClone(town);
    if (
      draft.version !== 2 ||
      !Array.isArray(draft.agents) ||
      draft.agents.length !== AGENT_IDS.length
    ) {
      return {
        ok: false,
        reason: "A complete version-2 town is required before funding can start.",
      };
    }
    const cash = new Map(draft.agents.map((a) => [a.id, a.money]));
    const tills = { ...draft.tills };
    if (
      AGENT_IDS.some((id) => !cash.has(id)) ||
      [...cash.values(), tills.cafe, tills.grocery].some((n) => !Number.isSafeInteger(n) || n < 0)
    ) {
      return {
        ok: false,
        reason:
          "Opening balances must be valid whole coins. Preserve the original town for recovery.",
      };
    }
    if (
      draft.agents.some(
        (a) =>
          !Number.isFinite(a.shiftHours) || a.shiftHours < 0 || typeof a.paidToday !== "boolean",
      )
    )
      return {
        ok: false,
        reason:
          "A legacy work or payment record is invalid. Preserve the original progress and payment flag for recovery.",
      };
    const financialIds = [
      ...(draft.favors ?? []).map((f) => f.id),
      ...draft.agents.flatMap((a) => (a.projects ?? []).map((p) => p.id)),
    ];
    if (
      financialIds.some((id) => typeof id !== "string" || !id) ||
      new Set(financialIds).size !== financialIds.length
    ) {
      return {
        ok: false,
        reason:
          "Debt and work IDs are missing or duplicated. Preserve the original records for recovery.",
      };
    }
    const debts = structuredClone(draft.favors ?? []);
    const projects = new Map(draft.agents.map((a) => [a.id, structuredClone(a.projects ?? [])]));
    if (debts.some((f) => !Number.isSafeInteger(f.amount) || f.amount < 0)) {
      return {
        ok: false,
        reason: "A legacy debt has an invalid amount. Preserve its original creditor and terms.",
      };
    }
    // Keep existing non-financial v1 repairs, while retaining every valid coin,
    // debt amount and financial ID rather than applying the old purse caps.
    if (!validateTown(draft))
      return { ok: false, reason: "The legacy town needs recovery before funding can start." };
    for (const agent of draft.agents) {
      agent.money = cash.get(agent.id)!;
      agent.projects = projects.get(agent.id)!;
    }
    draft.tills = tills;
    draft.favors = debts;
    initializeEconomy(draft);
    const result = attachPayroll(draft);
    if (!result.ok) return result;
    adoptMigration(town, draft);
    return { ok: true, migrated: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "The financial records need recovery. Preserve the original town.",
    };
  }
}

function attachPayroll(draft: Town): EconomyMigrationResult {
  const result = protectPayroll(draft, {
    id: "migration:protect-payroll",
    kind: "protect-payroll",
    actor: "kevin",
    authority: "simulation",
    terms: {},
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  const errors = auditEconomy(draft);
  if (draft.economy?.work === undefined || errors.length || !validateTown(draft))
    return {
      ok: false,
      reason: `The migrated records cannot be validated${errors.length ? `: ${errors.join("; ")}` : ""}. The original town is unchanged.`,
    };
  return { ok: true, migrated: true };
}

/** Explicit funded import; failed migration returns the exact original file. */
export function importFundedTown(text: string): TownFileReport {
  try {
    if (
      text.length > MAX_TOWN_FILE_BYTES ||
      new TextEncoder().encode(text).byteLength > MAX_TOWN_FILE_BYTES
    ) {
      return {
        status: "unreadable",
        raw: text,
        reason: "The town file exceeds the 8 MiB import limit.",
      };
    }
    const data = JSON.parse(text);
    const town = data && typeof data === "object" && "town" in data ? data.town : data;
    if (!town || typeof town !== "object")
      return { status: "unreadable", raw: text, reason: "This file is not a version-2 town." };
    const result = initializeFundedEconomy(town);
    if (!result.ok) return { status: "unreadable", raw: text, reason: result.reason };
    if (!validateTown(town))
      return {
        status: "unreadable",
        raw: text,
        reason: "The saved town cannot be validated. Preserve the original backup.",
      };
    return { status: "ready", town };
  } catch {
    return {
      status: "unreadable",
      raw: text,
      reason: "This file cannot be read. Preserve the original backup for recovery.",
    };
  }
}
