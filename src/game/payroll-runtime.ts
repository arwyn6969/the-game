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
import { rememberPaidWork } from "./social";

export const FUNDED_CAFE_SHIFT_TEXT =
  "Funded cafe attendance, 16:00 to 19:00; 5 reserved for 180 eligible minutes. Progress and earned wages survive midnight; no fractional wage.";
export const fundedWorkProjectId = (agreementId: string) => `work-item:${agreementId}`;

/** Completing work frees its commitment slot even when its wage must wait. */
export function closeCompletedWorkItems(town: Town, agreementId: string) {
  const work = town.economy?.work;
  const agreement = work?.agreements.find((item) => item.id === agreementId);
  const claim = work?.legacyClaims.find((item) => item.agreementId === agreementId);
  const completed = agreement?.kind === "cafe-shift" && agreement.status === "completed";
  const legacyCompleted =
    claim?.classification === "completed-unpaid" &&
    work?.payables.some((item) => item.agreementId === agreementId);
  if (!completed && !legacyCompleted) return;
  const workerId = agreement?.worker ?? claim!.worker;
  const payer = agreement?.payer ?? claim!.payer;
  const worker = town.agents.find((item) => item.id === workerId);
  if (!worker) return;
  const workplace = payer === "till:grocery" ? "grocery" : "cafe";
  const originalIds = new Set(
    claim?.evidence.projects
      .filter((item) => (item.place ?? "cafe") === workplace)
      .map((item) => item.id),
  );
  const approval = work?.payrollApprovals.find((item) => item.id === agreement?.payrollApprovalId);
  for (const project of worker.projects)
    if (
      project.owner === workerId &&
      project.kind === "shift" &&
      project.status === "open" &&
      (originalIds.has(project.id) ||
        (approval?.kind === "cafe-replacement" &&
          project.id === fundedWorkProjectId(agreement!.id) &&
          (project.place ?? "cafe") === "cafe"))
    )
      project.status = "done";
}

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
      closeCompletedWorkItems(town, current.id);
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
      if (payable.status === "settled") {
        const transaction = funded.economy!.transactions.find(
          (item) => item.id === payable.transactionId,
        );
        rememberPaidWork(
          town,
          resident.id,
          current.payer === "till:cafe" ? "cafe" : "grocery",
          current.fee,
          payable.transactionId ?? payable.id,
          transaction && { day: transaction.day, minute: transaction.minute },
        );
      }
    }
  }
  for (const payable of [...funded.economy!.work!.payables]) {
    if (payable.status !== "earned") continue;
    const worker = town.agents.find((agent) => agent.id === payable.worker);
    if (!worker || worker.money + payable.amount > 999) continue;
    const actor: AgentId = payable.payer === "till:grocery" ? "baba" : "kevin";
    const settled = settleWorkPayable(
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
    if (settled.ok && settled.value.status === "settled" && payable.payer.startsWith("till:")) {
      closeCompletedWorkItems(town, payable.agreementId);
      const resident = town.agents.find((agent) => agent.id === payable.worker)!;
      resident.paidToday = true;
      pushMemory(
        resident,
        makeMemory(
          town,
          town.day,
          town.minute,
          "favor",
          `${placeTitle(payable.payer === "till:cafe" ? "cafe" : "grocery")} paid me ${payable.amount} for a shift I actually worked.`,
          7,
          { protected: true, source: "event" },
        ),
      );
      const transaction = funded.economy!.transactions.find(
        (item) => item.id === settled.value.transactionId,
      );
      rememberPaidWork(
        town,
        resident.id,
        payable.payer === "till:cafe" ? "cafe" : "grocery",
        payable.amount,
        settled.value.transactionId ?? payable.id,
        transaction && { day: transaction.day, minute: transaction.minute },
      );
    }
  }
}
