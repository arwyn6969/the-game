import type { AgentId, Town } from "./types";
import type { FundedTown, EconomyCommand } from "./economy-types";
import { initializeFundedEconomy } from "./economy-migration";
import {
  approvePayrollAgreement,
  CAFE_CANCELLATION,
  recogniseLegacyClaim,
  suspendWorkAgreement,
  recordCafeAttendance,
  settleWorkPayable,
  wageInterval,
  type PayrollApproval,
} from "./funded-work";
import { makeMemory, pushMemory } from "./memory";
import { zoneAt, placeTitle } from "./world";

export const runtimeCommand = (
  _town: Town,
  kind: string,
  actor: AgentId,
  terms: EconomyCommand["terms"],
  suffix: string,
): EconomyCommand => ({
  id: `${kind}:${suffix}`,
  kind,
  actor,
  authority: "simulation",
  terms,
});

export function activateFundedTown(town: Town): { ok: boolean; reason?: string } {
  if ((town as FundedTown).economy?.work) return { ok: true };
  const result = initializeFundedEconomy(town);
  if (!result.ok) return result;
  // Existing NPC agreements are authored town decisions. Player recognition
  // always remains an explicit choice; ambiguous evidence is never inferred.
  const work = (town as FundedTown).economy!.work!;
  for (const claim of [...work.legacyClaims]) {
    if (
      claim.worker === "player" ||
      claim.classification !== "active-unworked" ||
      claim.resolution !== "protected" ||
      !claim.payer
    )
      continue;
    const issuer = claim.payer === "till:cafe" ? "kevin" : "baba";
    const approval: Omit<PayrollApproval, "consumed"> = {
      id: `approval:${claim.id}`,
      kind: "legacy-recognition",
      worker: claim.worker,
      payer: claim.payer,
      issuer,
      claimId: claim.id,
      confirmedMinutes: 0,
      fee: claim.payer === "till:cafe" ? 5 : 4,
      requiredMinutes: 180,
      expires: { day: town.day + 365, minute: 1439 },
      cancellation: CAFE_CANCELLATION,
    };
    const approved = approvePayrollAgreement(
      town,
      runtimeCommand(town, "approve-payroll-agreement", issuer, approval, claim.id),
      approval,
    );
    if (!approved.ok) continue;
    const terms = {
      claimId: claim.id,
      payer: claim.payer,
      confirmedMinutes: 0,
      approvalId: approval.id,
      fee: approval.fee,
      requiredMinutes: 180,
      cancellation: CAFE_CANCELLATION,
    };
    const recognized = recogniseLegacyClaim(
      town,
      runtimeCommand(town, "recognise-legacy-payroll", claim.worker, terms, claim.id),
      claim.id,
      claim.payer,
      0,
      approval.id,
    );
    if (recognized.ok) {
      const agreementId = recognized.value.id;
      suspendWorkAgreement(
        town,
        runtimeCommand(town, "resume-work", claim.worker, { agreementId }, agreementId),
        agreementId,
        true,
      );
    }
  }
  return { ok: true };
}

/** New structured attendance survives midnight; cash is never minted by time. */
export function advanceFundedPayroll(town: Town) {
  if (!activateFundedTown(town).ok) return;
  const funded = town as FundedTown;
  for (const agreement of [...funded.economy!.work!.agreements]) {
    if (
      agreement.kind !== "cafe-shift" ||
      agreement.status !== "active" ||
      !wageInterval(funded, agreement)
    )
      continue;
    const worker = town.agents.find((agent) => agent.id === agreement.worker)!;
    if (
      zoneAt(worker.tile.x, worker.tile.y) !==
      (agreement.payer === "till:cafe" ? "cafe" : "grocery")
    )
      continue;
    const result = recordCafeAttendance(
      funded,
      runtimeCommand(
        town,
        "record-cafe-attendance",
        agreement.worker,
        { agreementId: agreement.id, day: town.day, minute: town.minute },
        `${agreement.id}:${town.day}:${town.minute}`,
      ),
      agreement.id,
    );
    if (!result.ok) continue;
    const current = funded.economy!.work!.agreements.find((item) => item.id === agreement.id)!;
    const resident = town.agents.find((agent) => agent.id === agreement.worker)!;
    resident.shiftHours = current.eligibleMinutes / 60;
    if (current.status === "completed") {
      const payable = funded.economy!.work!.payables.find(
        (item) => item.agreementId === current.id,
      )!;
      resident.paidToday = payable.status === "settled";
      pushMemory(
        resident,
        makeMemory(
          town,
          town.day,
          town.minute,
          "favor",
          payable.status === "settled"
            ? `${placeTitle(current.payer === "till:cafe" ? "cafe" : "grocery")} paid me ${current.fee} for a shift I actually worked.`
            : `My earned ${current.fee}-coin wage remains payable and reserved.`,
          7,
          { protected: true, source: "event" },
        ),
      );
    }
  }
  for (const payable of [...funded.economy!.work!.payables]) {
    if (payable.status !== "earned") continue;
    const worker = town.agents.find((agent) => agent.id === payable.worker);
    if (!worker || worker.money + payable.amount > 999) continue;
    const actor: AgentId = payable.payer === "till:grocery" ? "baba" : "kevin";
    settleWorkPayable(
      funded,
      runtimeCommand(
        town,
        "settle-work-payable",
        actor,
        { payableId: payable.id },
        `${payable.id}:${town.day}:${town.minute}`,
      ),
      payable.id,
    );
  }
}
