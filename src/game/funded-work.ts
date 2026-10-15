/** Authoritative funded-work commands used by the integrated town runtime. */
import type { AgentId, Project } from "./types";
import type { FundedTown as Town } from "./economy-types";
import type { AccountId, EconomyCommand, EconomyContext, EconomyState } from "./economy-types";
import {
  accountBalance,
  availableFunds,
  ensureProjectAccount,
  failEconomy,
  releaseFunds,
  requireEconomy,
  reserveFunds,
  runEconomyCommand,
  transferFunds,
} from "./economy";
import { beatAt } from "./plan";
import { zoneAt } from "./world";

export type WorkTime = { day: number; minute: number };
export type WorkOffer = {
  id: string;
  revision: number;
  worker: AgentId;
  payer: AccountId;
  issuer: AgentId;
  task: string;
  requiredEvidence: string[];
  fee: number;
  expires: WorkTime;
  cancellation: "Incomplete checks earn no fee; completed checks earn the full fee, including failure or uncertainty.";
  status: "open" | "accepted" | "cancelled";
};
export type WorkEvidence = {
  id: string;
  agreementId: string;
  worker: AgentId;
  key: string;
  source: string;
  detail: string;
  at: WorkTime;
  commandId: string;
};
export type WorkReport = {
  outcome: "success" | "failure" | "uncertain";
  text: string;
  evidenceIds: string[];
};
export type WorkAgreement = {
  id: string;
  offerId: string | null;
  worker: AgentId;
  payer: AccountId;
  issuer: AgentId;
  task: string;
  fee: number;
  holdId: string;
  kind: "check" | "cafe-shift";
  status: "active" | "suspended" | "completed" | "cancelled";
  requiredEvidence: string[];
  evidenceIds: string[];
  report: WorkReport | null;
  accepted: WorkTime;
  cancellation: string;
  eligibleMinutes: number;
  attendance: string[];
  requiredMinutes: number;
  payrollApprovalId: string | null;
};
export type WorkReceipt = {
  id: string;
  agreementId: string;
  worker: AgentId;
  payer: AccountId;
  amount: number;
  outcome: "success" | "failure" | "uncertain" | "attendance" | "legacy";
  evidenceIds: string[];
  report: string;
  at: WorkTime;
  payableId: string;
  commandId: string;
};
export type WorkPayable = {
  id: string;
  agreementId: string;
  worker: AgentId;
  payer: AccountId;
  amount: number;
  holdId: string;
  status: "earned" | "settled";
  reason: string | null;
  transactionId: string | null;
};
export type LegacyWageEvidence = {
  day: number;
  minute: number;
  shiftHours: number;
  paidToday: boolean;
  projects: Project[];
  plan: Town["agents"][number]["plan"];
};
export type LegacyWageClaim = {
  id: string;
  worker: AgentId;
  classification: "already-paid" | "active-unworked" | "completed-unpaid" | "partial" | "ambiguous";
  payer: "till:cafe" | "till:grocery" | null;
  amount: number | null;
  resolution: "paid" | "unresolved" | "underfunded" | "protected" | "recognised" | "settled";
  evidence: LegacyWageEvidence;
  holdId: string | null;
  agreementId: string | null;
  reason: string;
};
export type ProjectFundingApproval = {
  id: string;
  projectId: string;
  donor: "kevin" | "baba";
  account: "till:cafe" | "till:grocery";
  amount: 4;
  expires: WorkTime;
  consumed: boolean;
};
export type PayrollApproval = {
  id: string;
  kind: "legacy-recognition" | "cafe-replacement";
  worker: AgentId;
  payer: "till:cafe" | "till:grocery";
  issuer: AgentId;
  claimId: string | null;
  confirmedMinutes: number;
  fee: number;
  requiredMinutes: 180;
  expires: WorkTime;
  cancellation: string;
  consumed: boolean;
};
export type FundedProject = {
  id: string;
  account: AccountId;
  administrator: "kevin";
  status: "funded" | "closed";
  approvals: [string, string];
  contributions: [{ account: "till:cafe"; amount: 4 }, { account: "till:grocery"; amount: 4 }];
  refunds: number | null;
};
export type FundedWorkState = {
  offers: WorkOffer[];
  agreements: WorkAgreement[];
  evidence: WorkEvidence[];
  receipts: WorkReceipt[];
  payables: WorkPayable[];
  legacyClaims: LegacyWageClaim[];
  payrollApprovals: PayrollApproval[];
  approvals: ProjectFundingApproval[];
  projects: FundedProject[];
};

export const CHECK_CANCELLATION =
  "Incomplete checks earn no fee; completed checks earn the full fee, including failure or uncertainty." as const;
export const CAFE_CANCELLATION =
  "The disclosed full wage is reserved for 180 employer-bound eligible minutes. Interruption and cancellation suspend future attendance; accrued minutes and the full hold remain until a disclosed funded replacement or settlement is accepted. No fractional wage.";

const now = (town: Town): WorkTime => ({ day: town.day, minute: town.minute });
const expired = (town: Town, at: WorkTime) =>
  town.day * 1440 + town.minute > at.day * 1440 + at.minute;
const validTime = (at: WorkTime) =>
  !!at &&
  Number.isInteger(at.day) &&
  at.day >= 1 &&
  Number.isInteger(at.minute) &&
  at.minute >= 0 &&
  at.minute < 1440;
const validId = (value: string) =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,119}$/.test(value);
const validFee = (value: number) => Number.isInteger(value) && value > 0 && value <= 999;
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
function bind(command: EconomyCommand, kind: string, terms: unknown) {
  if (command.kind !== kind || canonical(command.terms) !== canonical(terms))
    failEconomy("wrong-terms", "The command does not match these disclosed terms.");
}
function trusted(command: EconomyCommand, actor?: AgentId) {
  if (command.authority !== "simulation" || (actor && command.actor !== actor))
    failEconomy(
      "wrong-authority",
      "This action needs the trusted game authority and the named actor.",
    );
}
function workerAuthority(command: EconomyCommand, worker: AgentId) {
  if (
    command.actor !== worker ||
    command.authority === "model" ||
    (command.authority === "ui" && worker !== "player")
  )
    failEconomy(
      "wrong-worker",
      "Only the named worker can accept, report or cancel this agreement.",
    );
}
function issuerFor(account: string): AgentId | null {
  if (typeof account !== "string") return null;
  if (account === "till:cafe") return "kevin";
  if (account === "till:grocery") return "baba";
  if (account.startsWith("agent:")) return account.slice(6) as AgentId;
  if (account.startsWith("project:")) return "kevin";
  return null;
}
function state(town: Town): FundedWorkState {
  const economy = requireEconomy(town);
  economy.work ??= {
    offers: [],
    agreements: [],
    evidence: [],
    receipts: [],
    payables: [],
    legacyClaims: classifyLegacyPayroll(town),
    payrollApprovals: [],
    approvals: [],
    projects: [],
  };
  return economy.work;
}
export function initialiseFundedWork(town: Town): FundedWorkState {
  return state(town);
}
function agreementById(town: Town, id: string): WorkAgreement {
  const agreement = state(town).agreements.find((item) => item.id === id);
  if (!agreement) return failEconomy("missing-agreement", "This funded agreement does not exist.");
  return agreement;
}
function unique(town: Town, id: string) {
  const work = state(town);
  if (
    !validId(id) ||
    [
      ...work.offers,
      ...work.agreements,
      ...work.evidence,
      ...work.payables,
      ...work.receipts,
      ...work.legacyClaims,
      ...work.payrollApprovals,
      ...work.approvals,
      ...work.projects,
    ].some((entry) => entry.id === id)
  )
    failEconomy("duplicate-id", "This financial record ID is invalid or already used.");
}
function wageAccount(place: string) {
  return place === "grocery" ? ("till:grocery" as const) : ("till:cafe" as const);
}

/** Labels preserved records; it never infers a lost payment or attributes mixed minutes to an employer. */
export function classifyLegacyPayroll(town: Town): LegacyWageClaim[] {
  return town.agents.flatMap((agent): LegacyWageClaim[] => {
    const projects = (agent.projects ?? []).filter(
      (project) => project.owner === agent.id && project.kind === "shift",
    );
    const active = projects.filter((project) => project.status === "open");
    const places = new Set(
      projects
        .filter((project) => project.day === town.day || project.status === "open")
        .map((project) => project.place ?? "cafe"),
    );
    if (agent.id === "kevin") places.add("cafe");
    if (agent.id === "baba") places.add("grocery");
    const hasActive = active.length > 0 || agent.id === "kevin" || agent.id === "baba";
    const progress = Number.isFinite(agent.shiftHours) && agent.shiftHours > 0;
    if (!hasActive && !progress && !agent.paidToday) return [];
    const place = places.size === 1 ? [...places][0] : null;
    const validProjects = projects
      .filter((project) => project.status === "open" || project.day === town.day)
      .every(
        (project) =>
          validId(project.id) &&
          typeof project.text === "string" &&
          project.text.trim().length > 0 &&
          Number.isInteger(project.day) &&
          project.day >= 1 &&
          project.day <= town.day &&
          ["cafe", "grocery"].includes(project.place ?? "cafe"),
      );
    const plannedMinutes =
      agent.plan?.day === town.day && Array.isArray(agent.plan.beats)
        ? new Set(
            agent.plan.beats
              .filter(
                (beat) =>
                  Number.isInteger(beat.hour) &&
                  beat.hour >= 0 &&
                  beat.hour < 24 &&
                  beat.place === place &&
                  beat.spot === "out",
              )
              .map((beat) => beat.hour),
          ).size * 60
        : 0;
    const bound =
      (place === "cafe" || place === "grocery") &&
      validProjects &&
      plannedMinutes >= 180 &&
      hasActive;
    const payer = bound ? wageAccount(place) : null;
    const amount = bound ? (place === "cafe" ? 5 : 4) : null;
    const classification: LegacyWageClaim["classification"] = agent.paidToday
      ? "already-paid"
      : !bound
        ? "ambiguous"
        : !progress
          ? "active-unworked"
          : agent.shiftHours >= 3 && hasActive
            ? "completed-unpaid"
            : "partial";
    const reason =
      classification === "already-paid"
        ? "The old record says this shift was already paid; it cannot earn another wage."
        : classification === "partial" || classification === "ambiguous"
          ? "The legacy aggregate cannot prove all employer-bound minutes. Preserve it for explicit funded recognition."
          : classification === "completed-unpaid"
            ? "One identifiable employer and a completed unpaid aggregate establish an outstanding full wage claim."
            : "The active workplace agreement needs its full wage reserved before other spending.";
    return [
      {
        id: `legacy:${town.day}:${agent.id}`,
        worker: agent.id,
        classification,
        payer,
        amount,
        resolution: agent.paidToday
          ? "paid"
          : classification === "partial" || classification === "ambiguous"
            ? "unresolved"
            : "underfunded",
        evidence: structuredClone({
          day: town.day,
          minute: town.minute,
          shiftHours: agent.shiftHours,
          paidToday: agent.paidToday,
          projects,
          plan: agent.plan,
        }),
        holdId: null,
        agreementId: null,
        reason,
      },
    ];
  });
}

function protectOnDraft(town: Town, context: EconomyContext) {
  const work = state(town);
  for (const claim of work.legacyClaims) {
    if (claim.resolution !== "underfunded" || !claim.payer || !claim.amount) continue;
    if (availableFunds(town, claim.payer) < claim.amount) {
      claim.reason = `The prior ${claim.amount}-coin wage claim is not fully funded.`;
      continue;
    }
    claim.holdId = `hold:${claim.id}`;
    claim.agreementId = claim.id;
    reserveFunds(town, context, {
      id: claim.holdId,
      account: claim.payer,
      amount: claim.amount,
      agreementId: claim.id,
      purpose: "Protect the recorded prior wage before project contributions",
    });
    claim.resolution = "protected";
    claim.reason = "The full recorded wage is reserved.";
    if (claim.classification === "completed-unpaid") {
      const payable: WorkPayable = {
        id: `payable:${claim.id}`,
        agreementId: claim.id,
        worker: claim.worker,
        payer: claim.payer,
        amount: claim.amount,
        holdId: claim.holdId,
        status: "earned",
        reason: "A recorded completed unpaid shift awaits settlement.",
        transactionId: null,
      };
      work.payables.push(payable);
      work.receipts.push({
        id: `receipt:${claim.id}`,
        agreementId: claim.id,
        worker: claim.worker,
        payer: claim.payer,
        amount: claim.amount,
        outcome: "legacy",
        evidenceIds: [],
        report: "Recognised from labelled legacy records; no historical earnings were fabricated.",
        at: now(town),
        payableId: payable.id,
        commandId: context.command.id,
      });
    }
  }
}
export function protectPayroll(town: Town, command: EconomyCommand) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "protect-payroll", {});
    trusted(command);
    protectOnDraft(draft, context);
    return structuredClone(state(draft).legacyClaims);
  });
}
export function payrollFundingReasons(town: Town, account: AccountId): string[] {
  const work = requireEconomy(town).work;
  if (!work) return ["Payroll has not been classified and protected."];
  return work.legacyClaims
    .filter(
      (claim) =>
        (claim.payer === account || claim.payer === null) &&
        (claim.resolution === "unresolved" || claim.resolution === "underfunded"),
    )
    .map((claim) => `${claim.worker}: ${claim.reason}`);
}

export type NewWorkOffer = Omit<WorkOffer, "status" | "cancellation">;
export function createWorkOffer(town: Town, command: EconomyCommand, offer: NewWorkOffer) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, "offer-work", offer);
    trusted(command, offer.issuer);
    if (
      issuerFor(offer.payer) !== offer.issuer ||
      !draft.agents.some((agent) => agent.id === offer.worker) ||
      !validFee(offer.fee) ||
      !validTime(offer.expires) ||
      expired(draft, offer.expires) ||
      !Number.isInteger(offer.revision) ||
      offer.revision < 1 ||
      !offer.task.trim() ||
      !offer.requiredEvidence.length ||
      new Set(offer.requiredEvidence).size !== offer.requiredEvidence.length ||
      offer.requiredEvidence.some((id) => !validId(id))
    )
      failEconomy(
        "invalid-offer",
        "A work offer needs a named eligible worker, payer, bounded evidence, fee and valid expiry.",
      );
    accountBalance(draft, offer.payer);
    if (
      offer.payer.startsWith("project:") &&
      !state(draft).projects.some(
        (project) => project.account === offer.payer && project.status === "funded",
      )
    )
      failEconomy("project-unfunded", "This project has no funded custody account.");
    if (offer.payer.startsWith("project:") && offer.fee !== 2)
      failEconomy(
        "invalid-unit-fee",
        "Every bounded prototype project check is one disclosed two-coin unit.",
      );
    unique(draft, offer.id);
    const saved: WorkOffer = {
      ...structuredClone(offer),
      cancellation: CHECK_CANCELLATION,
      status: "open",
    };
    state(draft).offers.push(saved);
    return saved;
  });
}
export function workAcceptanceTerms(offer: WorkOffer) {
  return {
    offerId: offer.id,
    revision: offer.revision,
    worker: offer.worker,
    payer: offer.payer,
    fee: offer.fee,
    task: offer.task,
    requiredEvidence: offer.requiredEvidence,
    expires: offer.expires,
    cancellation: offer.cancellation,
  };
}
export function acceptWorkOffer(town: Town, command: EconomyCommand, offerId: string) {
  return runEconomyCommand(town, command, (draft, context) => {
    const offer = state(draft).offers.find((item) => item.id === offerId);
    if (!offer) return failEconomy("missing-offer", "This work offer is unavailable.");
    bind(command, "accept-work", workAcceptanceTerms(offer));
    workerAuthority(command, offer.worker);
    if (offer.status !== "open" || expired(draft, offer.expires))
      failEconomy("stale-offer", "This work offer was accepted, cancelled or expired.");
    if (
      state(draft).agreements.some(
        (item) =>
          item.worker === offer.worker &&
          item.kind === "cafe-shift" &&
          item.status === "active" &&
          wageInterval(draft, item),
      )
    )
      failEconomy(
        "worker-committed",
        "The worker has an active paid commitment; suspend it by agreement before accepting this task.",
      );
    if (offer.payer.startsWith("till:") && payrollFundingReasons(draft, offer.payer).length)
      failEconomy(
        "payroll-pending",
        "Prior payroll must be recognised and funded before new work.",
      );
    const id = `work:${offer.id}`;
    unique(draft, id);
    const holdId = `hold:${id}`;
    reserveFunds(draft, context, {
      id: holdId,
      account: offer.payer,
      amount: offer.fee,
      agreementId: id,
      purpose: offer.task,
    });
    const agreement: WorkAgreement = {
      id,
      offerId: offer.id,
      worker: offer.worker,
      payer: offer.payer,
      issuer: offer.issuer,
      task: offer.task,
      fee: offer.fee,
      holdId,
      kind: "check",
      status: "active",
      requiredEvidence: [...offer.requiredEvidence],
      evidenceIds: [],
      report: null,
      accepted: now(draft),
      cancellation: offer.cancellation,
      eligibleMinutes: 0,
      attendance: [],
      requiredMinutes: 0,
      payrollApprovalId: null,
    };
    state(draft).agreements.push(agreement);
    offer.status = "accepted";
    return agreement;
  });
}
export function recordWorkEvidence(
  town: Town,
  command: EconomyCommand,
  input: Omit<WorkEvidence, "at" | "commandId">,
) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, "record-work-evidence", input);
    trusted(command, input.worker);
    const agreement = agreementById(draft, input.agreementId);
    if (
      agreement.kind !== "check" ||
      agreement.status !== "active" ||
      agreement.worker !== input.worker ||
      !agreement.requiredEvidence.includes(input.key) ||
      !input.source.trim() ||
      !input.detail.trim()
    )
      failEconomy(
        "invalid-evidence",
        "Only a trusted recorded observation belonging to this active bounded task counts as evidence.",
      );
    if (
      agreement.evidenceIds.some(
        (id) => state(draft).evidence.find((evidence) => evidence.id === id)?.key === input.key,
      )
    )
      failEconomy("duplicate-evidence", "This required observation was already recorded.");
    unique(draft, input.id);
    const evidence: WorkEvidence = {
      ...structuredClone(input),
      at: now(draft),
      commandId: command.id,
    };
    state(draft).evidence.push(evidence);
    agreement.evidenceIds.push(evidence.id);
    return evidence;
  });
}
export function submitWorkReport(
  town: Town,
  command: EconomyCommand,
  agreementId: string,
  report: WorkReport,
) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, "submit-work-report", { agreementId, report });
    const agreement = agreementById(draft, agreementId);
    workerAuthority(command, agreement.worker);
    if (
      agreement.kind !== "check" ||
      agreement.status !== "active" ||
      !["success", "failure", "uncertain"].includes(report.outcome) ||
      !report.text.trim() ||
      new Set(report.evidenceIds).size !== report.evidenceIds.length ||
      report.evidenceIds.some((id) => !agreement.evidenceIds.includes(id))
    )
      failEconomy(
        "invalid-report",
        "The bounded check needs the worker's report and its own recorded observation IDs.",
      );
    agreement.report = structuredClone(report);
    return agreement;
  });
}
function trySettle(town: Town, context: EconomyContext, payable: WorkPayable) {
  if (payable.status === "settled") return;
  if (accountBalance(town, `agent:${payable.worker}`) + payable.amount > 999) {
    payable.reason =
      "The worker's purse cannot receive the full fee yet. Its earned payable and reserved funds remain.";
    return;
  }
  const transactionId = `payment:${payable.id}`;
  transferFunds(town, context, {
    id: transactionId,
    from: payable.payer,
    to: `agent:${payable.worker}`,
    amount: payable.amount,
    purpose: "Settle the completed funded work unit",
    agreementId: payable.agreementId,
    holdId: payable.holdId,
  });
  payable.status = "settled";
  payable.transactionId = transactionId;
  payable.reason = null;
  const claim = state(town).legacyClaims.find((item) => item.agreementId === payable.agreementId);
  if (claim) claim.resolution = "settled";
}
function earn(
  town: Town,
  context: EconomyContext,
  agreement: WorkAgreement,
  outcome: WorkReceipt["outcome"],
  report: string,
) {
  const work = state(town);
  if (work.payables.some((item) => item.agreementId === agreement.id))
    failEconomy("already-earned", "This bounded unit has already earned its fee.");
  const payable: WorkPayable = {
    id: `payable:${agreement.id}`,
    agreementId: agreement.id,
    worker: agreement.worker,
    payer: agreement.payer,
    amount: agreement.fee,
    holdId: agreement.holdId,
    status: "earned",
    reason: null,
    transactionId: null,
  };
  const receipt: WorkReceipt = {
    id: `receipt:${agreement.id}`,
    agreementId: agreement.id,
    worker: agreement.worker,
    payer: agreement.payer,
    amount: agreement.fee,
    outcome,
    evidenceIds: [...agreement.evidenceIds],
    report,
    at: now(town),
    payableId: payable.id,
    commandId: context.command.id,
  };
  agreement.status = "completed";
  work.payables.push(payable);
  work.receipts.push(receipt);
  trySettle(town, context, payable);
  return { receipt, payable };
}
function readyCheck(town: Town, agreement: WorkAgreement): WorkReport | null {
  if (
    agreement.kind !== "check" ||
    !["active", "suspended"].includes(agreement.status) ||
    !agreement.report
  )
    return null;
  return agreement.requiredEvidence.every((key) =>
    state(town).evidence.some(
      (evidence) =>
        evidence.agreementId === agreement.id &&
        evidence.worker === agreement.worker &&
        evidence.key === key &&
        agreement.report!.evidenceIds.includes(evidence.id),
    ),
  )
    ? agreement.report
    : null;
}
export function completeWorkUnit(town: Town, command: EconomyCommand, agreementId: string) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "complete-work", { agreementId });
    const agreement = agreementById(draft, agreementId);
    trusted(command, agreement.worker);
    if (agreement.kind !== "check" || agreement.status !== "active" || !agreement.report)
      failEconomy("work-incomplete", "This bounded check has no complete report.");
    const report = readyCheck(draft, agreement);
    if (!report)
      return failEconomy(
        "evidence-incomplete",
        "Every disclosed evidence interaction must be recorded and cited before this check earns a fee.",
      );
    return earn(draft, context, agreement, report.outcome, report.text);
  });
}
export function settleWorkPayable(town: Town, command: EconomyCommand, payableId: string) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "settle-work-payable", { payableId });
    const payable = state(draft).payables.find((item) => item.id === payableId);
    if (!payable) return failEconomy("missing-payable", "This earned payable does not exist.");
    trusted(command, issuerFor(payable.payer) ?? undefined);
    trySettle(draft, context, payable);
    return payable;
  });
}
export function cancelWorkAgreement(town: Town, command: EconomyCommand, agreementId: string) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "cancel-work", { agreementId });
    const agreement = agreementById(draft, agreementId);
    workerAuthority(command, agreement.worker);
    const payable = state(draft).payables.find((item) => item.agreementId === agreement.id);
    const completedReport = readyCheck(draft, agreement);
    if (payable) trySettle(draft, context, payable);
    else if (completedReport)
      earn(draft, context, agreement, completedReport.outcome, completedReport.text);
    else if (agreement.kind === "cafe-shift" && agreement.eligibleMinutes > 0)
      agreement.status = "suspended";
    else if (agreement.status === "active" || agreement.status === "suspended") {
      releaseFunds(
        draft,
        context,
        agreement.holdId,
        "Cancellation releases only the incomplete, unearned unit.",
      );
      agreement.status = "cancelled";
    }
    return agreement;
  });
}
export function suspendWorkAgreement(
  town: Town,
  command: EconomyCommand,
  agreementId: string,
  resume = false,
) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, resume ? "resume-work" : "suspend-work", { agreementId });
    const agreement = agreementById(draft, agreementId);
    workerAuthority(command, agreement.worker);
    if (agreement.status !== (resume ? "suspended" : "active"))
      failEconomy(
        "invalid-work-status",
        "This agreement cannot change attendance in its current state.",
      );
    agreement.status = resume ? "active" : "suspended";
    return agreement;
  });
}

export function approvePayrollAgreement(
  town: Town,
  command: EconomyCommand,
  approval: Omit<PayrollApproval, "consumed">,
) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, "approve-payroll-agreement", approval);
    trusted(command, approval.issuer);
    if (
      issuerFor(approval.payer) !== approval.issuer ||
      !validTime(approval.expires) ||
      expired(draft, approval.expires) ||
      approval.requiredMinutes !== 180 ||
      approval.fee !== (approval.payer === "till:cafe" ? 5 : 4) ||
      approval.cancellation !== CAFE_CANCELLATION ||
      !draft.agents.some((agent) => agent.id === approval.worker)
    )
      failEconomy(
        "invalid-payroll-approval",
        "A funded wage agreement requires its employer's current disclosed approval.",
      );
    if (approval.kind === "legacy-recognition") {
      const claim = state(draft).legacyClaims.find((item) => item.id === approval.claimId);
      if (
        !claim ||
        claim.worker !== approval.worker ||
        !recognisableClaim(claim, approval.payer, approval.confirmedMinutes) ||
        claim.evidence.paidToday ||
        !Number.isInteger(approval.confirmedMinutes) ||
        approval.confirmedMinutes < 0 ||
        approval.confirmedMinutes > Math.min(180, Math.round(claim.evidence.shiftHours * 60))
      )
        failEconomy(
          "invented-progress",
          "The employer may recognise only preserved unpaid minutes or explicitly replace the same unworked funded agreement.",
        );
    } else if (
      approval.kind !== "cafe-replacement" ||
      approval.payer !== "till:cafe" ||
      approval.claimId !== null ||
      approval.confirmedMinutes !== 0
    )
      failEconomy(
        "invalid-payroll-approval",
        "A new cafe replacement begins at zero minutes under the bounded five-coin terms.",
      );
    unique(draft, approval.id);
    const saved: PayrollApproval = { ...structuredClone(approval), consumed: false };
    state(draft).payrollApprovals.push(saved);
    return saved;
  });
}
function recognisableClaim(claim: LegacyWageClaim, payer: AccountId, confirmedMinutes: number) {
  return (
    claim.resolution === "unresolved" ||
    (claim.classification === "active-unworked" &&
      claim.resolution === "protected" &&
      claim.payer === payer &&
      confirmedMinutes === 0)
  );
}
function approvedPayroll(
  town: Town,
  approvalId: string,
  kind: PayrollApproval["kind"],
  worker: AgentId,
  payer: AccountId,
  claimId: string | null,
  confirmedMinutes: number,
): PayrollApproval {
  const approval = state(town).payrollApprovals.find((item) => item.id === approvalId);
  if (
    !approval ||
    approval.kind !== kind ||
    approval.worker !== worker ||
    approval.payer !== payer ||
    approval.claimId !== claimId ||
    approval.confirmedMinutes !== confirmedMinutes ||
    approval.consumed ||
    expired(town, approval.expires)
  )
    return failEconomy(
      "payroll-unapproved",
      "Read and accept the current employer-approved wage terms first.",
    );
  return approval;
}
export function recogniseLegacyClaim(
  town: Town,
  command: EconomyCommand,
  claimId: string,
  payer: "till:cafe" | "till:grocery",
  confirmedMinutes: number,
  approvalId: string,
) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "recognise-legacy-payroll", {
      claimId,
      payer,
      confirmedMinutes,
      approvalId,
      fee: payer === "till:cafe" ? 5 : 4,
      requiredMinutes: 180,
      cancellation: CAFE_CANCELLATION,
    });
    const claim = state(draft).legacyClaims.find((item) => item.id === claimId);
    if (!claim || !recognisableClaim(claim, payer, confirmedMinutes) || claim.evidence.paidToday)
      failEconomy(
        "invalid-claim",
        "Preserved unpaid unresolved evidence or the same protected unworked agreement can receive an explicitly funded replacement.",
      );
    workerAuthority(command, claim.worker);
    const approval = approvedPayroll(
      draft,
      approvalId,
      "legacy-recognition",
      claim.worker,
      payer,
      claimId,
      confirmedMinutes,
    );
    if (
      !Number.isInteger(confirmedMinutes) ||
      confirmedMinutes < 0 ||
      confirmedMinutes > Math.min(180, Math.round(claim.evidence.shiftHours * 60))
    )
      failEconomy(
        "invented-progress",
        "Recognition cannot invent more minutes than the preserved legacy record.",
      );
    const amount = payer === "till:cafe" ? 5 : 4;
    const id = `recognition:${claim.id}`;
    unique(draft, id);
    const holdId = `hold:${id}`;
    if (claim.resolution === "protected" && claim.holdId)
      releaseFunds(
        draft,
        context,
        claim.holdId,
        "The worker accepts the employer-approved funded replacement of the same unworked full-wage agreement; reserve the entire wage again in this atomic command.",
      );
    reserveFunds(draft, context, {
      id: holdId,
      account: payer,
      amount,
      agreementId: id,
      purpose: "Explicit full-wage funded recognition of preserved legacy progress",
    });
    const agreement: WorkAgreement = {
      id,
      offerId: null,
      worker: claim.worker,
      payer,
      issuer: issuerFor(payer)!,
      task: "Recognised legacy workplace attendance",
      fee: amount,
      holdId,
      kind: "cafe-shift",
      status: "suspended",
      requiredEvidence: [],
      evidenceIds: [],
      report: null,
      accepted: now(draft),
      cancellation: CAFE_CANCELLATION,
      eligibleMinutes: confirmedMinutes,
      attendance: [],
      requiredMinutes: 180,
      payrollApprovalId: approval.id,
    };
    state(draft).agreements.push(agreement);
    Object.assign(claim, {
      payer,
      amount,
      resolution: "recognised",
      holdId,
      agreementId: id,
      reason:
        "The worker explicitly accepted funded recognition; labelled old evidence remains unchanged.",
    });
    approval.consumed = true;
    if (confirmedMinutes >= 180)
      earn(
        draft,
        context,
        agreement,
        "legacy",
        "Explicit funded recognition of the preserved completed aggregate.",
      );
    return agreement;
  });
}
export function cafeAgreementTerms(id: string, worker: AgentId, approvalId: string) {
  return {
    id,
    worker,
    approvalId,
    payer: "till:cafe",
    fee: 5,
    requiredMinutes: 180,
    fromMinute: 960,
    toMinute: 1140,
    cancellation: CAFE_CANCELLATION,
  };
}
export function createFundedCafeAgreement(
  town: Town,
  command: EconomyCommand,
  id: string,
  worker: AgentId,
  approvalId: string,
) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "accept-funded-cafe-shift", cafeAgreementTerms(id, worker, approvalId));
    workerAuthority(command, worker);
    const approval = approvedPayroll(
      draft,
      approvalId,
      "cafe-replacement",
      worker,
      "till:cafe",
      null,
      0,
    );
    if (
      !draft.agents.some((agent) => agent.id === worker) ||
      state(draft).agreements.some(
        (agreement) =>
          agreement.worker === worker &&
          agreement.kind === "cafe-shift" &&
          agreement.status !== "cancelled" &&
          agreement.status !== "completed",
      ) ||
      state(draft).legacyClaims.some(
        (claim) => claim.worker === worker && !["paid", "settled"].includes(claim.resolution),
      )
    )
      failEconomy(
        "prior-work-pending",
        "Resolve or explicitly replace the worker's existing recorded wage agreement first.",
      );
    unique(draft, id);
    const holdId = `hold:${id}`;
    reserveFunds(draft, context, {
      id: holdId,
      account: "till:cafe",
      amount: 5,
      agreementId: id,
      purpose: "Full 5-coin cafe wage for 180 eligible minutes",
    });
    const agreement: WorkAgreement = {
      id,
      offerId: null,
      worker,
      payer: "till:cafe",
      issuer: "kevin",
      task: "Cafe attendance, 16:00–19:00",
      fee: 5,
      holdId,
      kind: "cafe-shift",
      status: "active",
      requiredEvidence: [],
      evidenceIds: [],
      report: null,
      accepted: now(draft),
      cancellation: CAFE_CANCELLATION,
      eligibleMinutes: 0,
      attendance: [],
      requiredMinutes: 180,
      payrollApprovalId: approval.id,
    };
    state(draft).agreements.push(agreement);
    approval.consumed = true;
    return agreement;
  });
}
export function recordCafeAttendance(town: Town, command: EconomyCommand, agreementId: string) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "record-cafe-attendance", { agreementId, day: draft.day, minute: draft.minute });
    const agreement = agreementById(draft, agreementId);
    trusted(command, agreement.worker);
    const worker = draft.agents.find((agent) => agent.id === agreement.worker)!;
    const beat = beatAt(worker, draft.minute);
    const stamp = `${draft.day}:${draft.minute}`;
    if (
      agreement.kind !== "cafe-shift" ||
      !["till:cafe", "till:grocery"].includes(agreement.payer) ||
      agreement.status !== "active" ||
      !wageInterval(draft, agreement) ||
      beat.place !== (agreement.payer === "till:cafe" ? "cafe" : "grocery") ||
      beat.spot !== "out" ||
      zoneAt(worker.tile.x, worker.tile.y) !== beat.place
    )
      failEconomy(
        "ineligible-minute",
        "Only employer-bound planned and physically attended cafe minutes count for this agreement.",
      );
    if (agreement.attendance.includes(stamp))
      failEconomy("duplicate-minute", "This employer-bound minute was already credited.");
    agreement.attendance.push(stamp);
    agreement.eligibleMinutes++;
    if (agreement.eligibleMinutes >= agreement.requiredMinutes)
      return earn(
        draft,
        context,
        agreement,
        "attendance",
        "180 employer-bound eligible cafe minutes completed.",
      );
    return { agreementId, eligibleMinutes: agreement.eligibleMinutes, stamp };
  });
}

/** Employer-bound intervals preserve recognised original timetables. */
export function wageInterval(town: Town, agreement: WorkAgreement): boolean {
  const worker = town.agents.find((agent) => agent.id === agreement.worker);
  if (!worker) return false;
  const approval = town.economy?.work?.payrollApprovals.find(
    (item) => item.id === agreement.payrollApprovalId,
  );
  if (approval?.kind === "cafe-replacement") return town.minute >= 960 && town.minute < 1140;
  if (worker.id === "kevin") return town.minute >= 480 && town.minute < 1020;
  if (worker.id === "baba") return town.minute >= 480 && town.minute < 1080;
  const beat = beatAt(worker, town.minute);
  return (
    beat.spot === "out" && beat.place === (agreement.payer === "till:cafe" ? "cafe" : "grocery")
  );
}

export function approveLibraryContribution(
  town: Town,
  command: EconomyCommand,
  approval: Omit<ProjectFundingApproval, "consumed">,
) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, "approve-library-contribution", approval);
    trusted(command, approval.donor);
    if (
      approval.amount !== 4 ||
      issuerFor(approval.account) !== approval.donor ||
      !validTime(approval.expires) ||
      expired(draft, approval.expires) ||
      !validId(approval.projectId)
    )
      failEconomy(
        "invalid-contribution",
        "Each named donor must explicitly approve four available business coins and an expiry.",
      );
    unique(draft, approval.id);
    const saved = { ...structuredClone(approval), consumed: false };
    state(draft).approvals.push(saved);
    return saved;
  });
}
export function fundLibraryProject(
  town: Town,
  command: EconomyCommand,
  projectId: string,
  approvalIds: [string, string],
) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "fund-library-project", { projectId, approvalIds });
    trusted(command, "kevin");
    const work = state(draft);
    const approvals = approvalIds.map((id) =>
      work.approvals.find((approval) => approval.id === id),
    );
    if (
      approvals.some(
        (approval) =>
          !approval ||
          approval.projectId !== projectId ||
          approval.consumed ||
          expired(draft, approval.expires),
      ) ||
      new Set(approvals.map((approval) => approval?.donor)).size !== 2
    )
      failEconomy(
        "funding-unapproved",
        "Both Kevin and Baba must make distinct current funding decisions.",
      );
    if (work.projects.some((project) => project.id === projectId))
      failEconomy("project-exists", "This project already has its funding decision.");
    protectOnDraft(draft, context);
    for (const account of ["till:cafe", "till:grocery"] as const) {
      const reasons = payrollFundingReasons(draft, account);
      if (reasons.length) failEconomy("payroll-pending", reasons.join(" "));
      if (availableFunds(draft, account) < 4)
        failEconomy(
          "funding-unavailable",
          `${account} cannot contribute four available coins after protecting payroll.`,
        );
    }
    unique(draft, projectId);
    ensureProjectAccount(draft, context, projectId);
    const project: FundedProject = {
      id: projectId,
      account: `project:${projectId}`,
      administrator: "kevin",
      status: "funded",
      approvals: [...approvalIds],
      contributions: [
        { account: "till:cafe", amount: 4 },
        { account: "till:grocery", amount: 4 },
      ],
      refunds: null,
    };
    for (const approval of approvals) {
      transferFunds(draft, context, {
        id: `contribution:${approval!.id}`,
        from: approval!.account,
        to: project.account,
        amount: 4,
        purpose: "Explicitly approved common library contribution",
        agreementId: project.id,
      });
      approval!.consumed = true;
    }
    work.projects.push(project);
    return project;
  });
}
export function closeFundedProject(town: Town, command: EconomyCommand, projectId: string) {
  return runEconomyCommand(town, command, (draft, context) => {
    bind(command, "close-funded-project", { projectId });
    const work = state(draft);
    const project = work.projects.find((item) => item.id === projectId);
    if (!project || project.status !== "funded")
      return failEconomy("project-unavailable", "This project is not open for closure.");
    trusted(command, project.administrator);
    for (const payable of work.payables.filter(
      (item) => item.payer === project.account && item.status === "earned",
    ))
      trySettle(draft, context, payable);
    if (work.payables.some((item) => item.payer === project.account && item.status === "earned"))
      failEconomy(
        "earned-payable-pending",
        "An earned liability must be paid before project custody can be refunded.",
      );
    for (const agreement of work.agreements.filter(
      (item) => item.payer === project.account && ["active", "suspended"].includes(item.status),
    )) {
      if (agreement.kind !== "check")
        failEconomy("unsupported-closure", "This prototype closes only bounded check units.");
      const report = readyCheck(draft, agreement);
      if (report) earn(draft, context, agreement, report.outcome, report.text);
      else {
        releaseFunds(
          draft,
          context,
          agreement.holdId,
          "Project closure cancels only the incomplete, unearned unit.",
        );
        agreement.status = "cancelled";
      }
    }
    if (work.payables.some((item) => item.payer === project.account && item.status === "earned"))
      failEconomy(
        "earned-payable-pending",
        "An honestly completed check must be paid before its reserved money can be refunded.",
      );
    const remaining = accountBalance(draft, project.account);
    if (remaining !== availableFunds(draft, project.account) || remaining % 2 !== 0)
      failEconomy(
        "refund-unavailable",
        "Prototype closure requires all unearned funds released and an even unencumbered balance.",
      );
    const refund = remaining / 2;
    if (refund > 0)
      for (const contribution of project.contributions)
        transferFunds(draft, context, {
          id: `refund:${project.id}:${contribution.account}`,
          from: project.account,
          to: contribution.account,
          amount: refund,
          purpose: "Return all unspent common custody equally to its two equal contributors",
          agreementId: project.id,
        });
    project.status = "closed";
    project.refunds = refund;
    for (const offer of work.offers.filter(
      (item) => item.payer === project.account && item.status === "open",
    ))
      offer.status = "cancelled";
    return project;
  });
}
/** Bookkeeping boundary only. S2 must compose the ordinary movement, scheduling and day rules. */
export function advanceFundedDay(town: Town, command: EconomyCommand) {
  return runEconomyCommand(town, command, (draft) => {
    bind(command, "advance-funded-day", { nextDay: draft.day + 1 });
    trusted(command);
    draft.day++;
    draft.minute = 0;
    return { day: draft.day };
  });
}

/** Additive UI projections: balances remain in their existing authoritative town locations. */
export function fundedWorkSummary(town: Town, worker?: AgentId) {
  const work = town.economy?.work;
  if (!work)
    return {
      offers: [],
      agreements: [],
      evidence: [],
      receipts: [],
      payables: [],
      legacyClaims: [],
      payrollApprovals: [],
      holds: [],
      fundingReasons: ["Funded work has not been initialized."],
    };
  const agreementIds = new Set(
    [...work.agreements, ...work.legacyClaims]
      .filter((item) => !worker || item.worker === worker)
      .map((item) => ("agreementId" in item ? item.agreementId : item.id)),
  );
  return structuredClone({
    offers: work.offers.filter((item) => !worker || item.worker === worker),
    agreements: work.agreements.filter((item) => !worker || item.worker === worker),
    evidence: work.evidence.filter((item) => !worker || item.worker === worker),
    receipts: work.receipts.filter((item) => !worker || item.worker === worker),
    payables: work.payables.filter((item) => !worker || item.worker === worker),
    legacyClaims: work.legacyClaims.filter((item) => !worker || item.worker === worker),
    payrollApprovals: work.payrollApprovals.filter((item) => !worker || item.worker === worker),
    holds: requireEconomy(town).holds.filter((hold) => agreementIds.has(hold.agreementId)),
    fundingReasons: [
      ...payrollFundingReasons(town, "till:cafe"),
      ...payrollFundingReasons(town, "till:grocery"),
    ],
  });
}

export function projectFundingSummary(town: Town, projectId: string) {
  const economy = requireEconomy(town);
  const work = economy.work;
  const project = work?.projects.find((item) => item.id === projectId) ?? null;
  const account = `project:${projectId}` as const;
  const blockers = [
    ...payrollFundingReasons(town, "till:cafe"),
    ...payrollFundingReasons(town, "till:grocery"),
  ];
  const approvals = work?.approvals.filter((item) => item.projectId === projectId) ?? [];
  if (!project) {
    for (const donor of ["kevin", "baba"] as const)
      if (
        !approvals.some(
          (approval) =>
            approval.donor === donor && !approval.consumed && !expired(town, approval.expires),
        )
      )
        blockers.push(`${donor}'s current four-coin funding decision is pending.`);
    for (const till of ["till:cafe", "till:grocery"] as const)
      if (availableFunds(town, till) < 4)
        blockers.push(`${till} has fewer than four available coins.`);
  }
  const earnedPayables =
    work?.payables.filter((item) => item.payer === account && item.status === "earned") ?? [];
  if (earnedPayables.length) blockers.push("Earned payables must settle before final closure.");
  return structuredClone({
    project,
    balance: project ? accountBalance(town, account) : 0,
    available: project ? availableFunds(town, account) : 0,
    holds: economy.holds.filter((hold) => hold.account === account),
    paid:
      work?.payables
        .filter((payable) => payable.payer === account && payable.status === "settled")
        .reduce((sum, payable) => sum + payable.amount, 0) ?? 0,
    earnedPayables,
    approvals,
    blockers,
  });
}

export function validateFundedWork(town: Town, economy: EconomyState): string[] {
  try {
    return validateWorkRecords(town, economy);
  } catch {
    return ["The funded-work extension has malformed records; retain the raw save for recovery."];
  }
}
function validateWorkRecords(town: Town, economy: EconomyState): string[] {
  const work = economy.work;
  const workKinds = new Set([
    "protect-payroll",
    "offer-work",
    "accept-work",
    "record-work-evidence",
    "submit-work-report",
    "complete-work",
    "settle-work-payable",
    "cancel-work",
    "suspend-work",
    "resume-work",
    "approve-payroll-agreement",
    "recognise-legacy-payroll",
    "accept-funded-cafe-shift",
    "record-cafe-attendance",
    "approve-library-contribution",
    "fund-library-project",
    "close-funded-project",
  ]);
  if (work === undefined)
    return economy.commandReceipts.some((receipt) => workKinds.has(receipt.kind))
      ? ["Recorded funded-work commands are missing their durable work state."]
      : [];
  if (!work || typeof work !== "object" || Array.isArray(work))
    return ["The funded-work extension must be an object."];
  const errors: string[] = [];
  for (const key of [
    "offers",
    "agreements",
    "evidence",
    "receipts",
    "payables",
    "legacyClaims",
    "payrollApprovals",
    "approvals",
    "projects",
  ] as const)
    if (!Array.isArray(work[key])) errors.push(`Funded work ${key} must be an array.`);
  if (errors.length) return errors;
  const ids = new Set<string>();
  for (const record of [
    ...work.offers,
    ...work.agreements,
    ...work.evidence,
    ...work.receipts,
    ...work.payables,
    ...work.legacyClaims,
    ...work.payrollApprovals,
    ...work.approvals,
    ...work.projects,
  ]) {
    if (!record || !validId(record.id) || ids.has(record.id))
      errors.push("Funded work has an invalid or duplicate record ID.");
    else ids.add(record.id);
  }
  if (errors.length) return errors;
  const actorExists = (id: AgentId) => town.agents.some((agent) => agent.id === id);
  const knownAccount = (account: AccountId) => Object.hasOwn(economy.openingBalances, account);
  const recordedCommand = (id: string) =>
    economy.commandReceipts.find((receipt) => receipt.id === id);
  const commandTerms = (id: string): unknown => {
    const receipt = recordedCommand(id);
    return receipt ? (JSON.parse(receipt.payload) as { terms: unknown }).terms : null;
  };
  const approvedCommand = (kind: string, actor: AgentId, terms: unknown) =>
    economy.commandReceipts.some(
      (receipt) =>
        receipt.kind === kind &&
        receipt.authority === "simulation" &&
        receipt.actor === actor &&
        canonical(commandTerms(receipt.id)) === canonical(terms),
    );
  for (const command of economy.commandReceipts) {
    if (command.kind === "protect-payroll") {
      if (!Array.isArray(command.value))
        errors.push("A payroll protection command has no preserved claim projection.");
      else
        for (const raw of command.value) {
          const original = raw as unknown as LegacyWageClaim;
          const retained = work.legacyClaims.find((claim) => claim.id === original.id);
          if (
            !retained ||
            retained.worker !== original.worker ||
            retained.classification !== original.classification ||
            canonical(retained.evidence) !== canonical(original.evidence)
          )
            errors.push(`Recorded legacy payroll ${original.id} was discarded or rewritten.`);
        }
    }
    const collection =
      command.kind === "offer-work"
        ? work.offers
        : command.kind === "record-work-evidence"
          ? work.evidence
          : command.kind === "approve-payroll-agreement"
            ? work.payrollApprovals
            : command.kind === "approve-library-contribution"
              ? work.approvals
              : command.kind === "fund-library-project"
                ? work.projects
                : null;
    if (collection) {
      const original = command.value as unknown as { id: string };
      if (!collection.some((record) => record.id === original.id))
        errors.push(`Durable ${command.kind} record ${original.id} was discarded.`);
    }
  }
  for (const hold of economy.holds) {
    const kind = recordedCommand(hold.commandId)?.kind;
    if (
      ["accept-work", "accept-funded-cafe-shift", "recognise-legacy-payroll"].includes(
        kind ?? "",
      ) &&
      !work.agreements.some(
        (agreement) => agreement.id === hold.agreementId && agreement.holdId === hold.id,
      )
    )
      errors.push(`Funded work reservation ${hold.id} has lost its original agreement.`);
    if (
      kind === "protect-payroll" &&
      !work.legacyClaims.some((claim) => claim.id === hold.agreementId)
    )
      errors.push(`Protected prior payroll ${hold.id} has lost its labelled claim.`);
  }
  for (const offer of work.offers)
    if (
      !actorExists(offer.worker) ||
      issuerFor(offer.payer) !== offer.issuer ||
      !validFee(offer.fee) ||
      !validTime(offer.expires) ||
      !["open", "accepted", "cancelled"].includes(offer.status) ||
      !Array.isArray(offer.requiredEvidence) ||
      offer.requiredEvidence.length === 0 ||
      new Set(offer.requiredEvidence).size !== offer.requiredEvidence.length ||
      offer.requiredEvidence.some((key) => !validId(key)) ||
      offer.cancellation !== CHECK_CANCELLATION ||
      !Number.isInteger(offer.revision) ||
      offer.revision < 1 ||
      typeof offer.task !== "string" ||
      !offer.task.trim()
    )
      errors.push(`Invalid funded work offer ${offer.id}.`);
  for (const offer of work.offers) {
    const { status: _status, cancellation: _cancellation, ...terms } = offer;
    if (!knownAccount(offer.payer) || !approvedCommand("offer-work", offer.issuer, terms))
      errors.push(`Offer ${offer.id} has no recorded payer approval.`);
    if (offer.payer.startsWith("project:") && offer.fee !== 2)
      errors.push(`Project offer ${offer.id} violates the two-coin bounded unit.`);
  }
  for (const agreement of work.agreements) {
    if (
      !actorExists(agreement.worker) ||
      issuerFor(agreement.payer) !== agreement.issuer ||
      !validFee(agreement.fee) ||
      !["active", "suspended", "completed", "cancelled"].includes(agreement.status) ||
      !["check", "cafe-shift"].includes(agreement.kind) ||
      !validTime(agreement.accepted) ||
      !Array.isArray(agreement.evidenceIds) ||
      !Array.isArray(agreement.requiredEvidence) ||
      !Array.isArray(agreement.attendance) ||
      !Number.isInteger(agreement.eligibleMinutes) ||
      agreement.eligibleMinutes < 0 ||
      agreement.eligibleMinutes > agreement.requiredMinutes ||
      new Set(agreement.attendance).size !== agreement.attendance.length
    )
      errors.push(`Invalid funded work agreement ${agreement.id}.`);
    if (
      agreement.kind === "check" &&
      (!agreement.offerId ||
        !work.offers.some(
          (offer) =>
            offer.id === agreement.offerId &&
            offer.status === "accepted" &&
            offer.worker === agreement.worker &&
            offer.payer === agreement.payer &&
            offer.fee === agreement.fee &&
            offer.issuer === agreement.issuer &&
            offer.task === agreement.task &&
            offer.cancellation === agreement.cancellation &&
            canonical(offer.requiredEvidence) === canonical(agreement.requiredEvidence),
        ))
    )
      errors.push(`Agreement ${agreement.id} does not match its accepted offer.`);
    if (
      agreement.status === "completed" &&
      !work.payables.some((payable) => payable.agreementId === agreement.id)
    )
      errors.push(`Completed agreement ${agreement.id} has no retained payable.`);
    const hold = economy.holds.find((item) => item.id === agreement.holdId);
    const payable = work.payables.find((item) => item.agreementId === agreement.id);
    const expectedRemaining =
      agreement.status === "cancelled" || payable?.status === "settled" ? 0 : agreement.fee;
    if (
      !hold ||
      hold.account !== agreement.payer ||
      hold.agreementId !== agreement.id ||
      hold.amount !== agreement.fee ||
      hold.remaining !== expectedRemaining
    )
      errors.push(`Agreement ${agreement.id} does not retain its correct full-fee reservation.`);
    if (
      agreement.kind === "check" &&
      (agreement.payrollApprovalId !== null ||
        agreement.requiredMinutes !== 0 ||
        agreement.eligibleMinutes !== 0 ||
        agreement.attendance.length !== 0)
    )
      errors.push(`Check ${agreement.id} contains unrelated wage progress.`);
    if (agreement.kind === "cafe-shift") {
      const approval = work.payrollApprovals.find(
        (item) => item.id === agreement.payrollApprovalId,
      );
      if (
        !approval ||
        !approval.consumed ||
        approval.worker !== agreement.worker ||
        approval.payer !== agreement.payer ||
        approval.fee !== agreement.fee ||
        agreement.requiredMinutes !== 180 ||
        agreement.eligibleMinutes !== approval.confirmedMinutes + agreement.attendance.length ||
        agreement.cancellation !== CAFE_CANCELLATION ||
        agreement.offerId !== null
      )
        errors.push(
          `Wage agreement ${agreement.id} does not match its employer-approved funded terms.`,
        );
    }
    if (
      new Set(agreement.evidenceIds).size !== agreement.evidenceIds.length ||
      agreement.evidenceIds.some(
        (id) =>
          !work.evidence.some(
            (evidence) => evidence.id === id && evidence.agreementId === agreement.id,
          ),
      )
    )
      errors.push(`Agreement ${agreement.id} has repeated or foreign observations.`);
    if (
      agreement.report &&
      (!["success", "failure", "uncertain"].includes(agreement.report.outcome) ||
        typeof agreement.report.text !== "string" ||
        !agreement.report.text.trim() ||
        !Array.isArray(agreement.report.evidenceIds) ||
        new Set(agreement.report.evidenceIds).size !== agreement.report.evidenceIds.length ||
        agreement.report.evidenceIds.some((id) => !agreement.evidenceIds.includes(id)))
    )
      errors.push(`Agreement ${agreement.id} has an invalid bounded report.`);
  }
  for (const evidence of work.evidence)
    if (
      !actorExists(evidence.worker) ||
      !validTime(evidence.at) ||
      typeof evidence.source !== "string" ||
      !evidence.source.trim() ||
      typeof evidence.detail !== "string" ||
      !evidence.detail.trim() ||
      !work.agreements.some(
        (agreement) =>
          agreement.id === evidence.agreementId &&
          agreement.worker === evidence.worker &&
          agreement.requiredEvidence.includes(evidence.key) &&
          agreement.evidenceIds.includes(evidence.id),
      )
    )
      errors.push(`Invalid recorded work evidence ${evidence.id}.`);
  for (const evidence of work.evidence) {
    const { at: _at, commandId, ...terms } = evidence;
    const command = recordedCommand(commandId);
    if (
      !command ||
      command.kind !== "record-work-evidence" ||
      command.authority !== "simulation" ||
      command.actor !== evidence.worker ||
      canonical(commandTerms(commandId)) !== canonical(terms) ||
      command.day !== evidence.at.day ||
      command.minute !== evidence.at.minute
    )
      errors.push(`Observation ${evidence.id} has no trusted evidence command.`);
  }
  const earnedAgreements = new Set<string>();
  for (const payable of work.payables) {
    if (
      !actorExists(payable.worker) ||
      !validFee(payable.amount) ||
      !["earned", "settled"].includes(payable.status) ||
      earnedAgreements.has(payable.agreementId) ||
      !work.receipts.some(
        (receipt) =>
          receipt.payableId === payable.id &&
          receipt.agreementId === payable.agreementId &&
          receipt.worker === payable.worker &&
          receipt.payer === payable.payer &&
          receipt.amount === payable.amount,
      )
    )
      errors.push(`Invalid or duplicate earned payable ${payable.id}.`);
    earnedAgreements.add(payable.agreementId);
    if (payable.status === "settled" && !payable.transactionId)
      errors.push(`Settled payable ${payable.id} has no payment transaction.`);
    const agreement = work.agreements.find((item) => item.id === payable.agreementId);
    const claim = work.legacyClaims.find((item) => item.agreementId === payable.agreementId);
    if (
      !(
        agreement &&
        agreement.status === "completed" &&
        agreement.worker === payable.worker &&
        agreement.payer === payable.payer &&
        agreement.fee === payable.amount &&
        agreement.holdId === payable.holdId
      ) &&
      !(
        claim &&
        claim.classification === "completed-unpaid" &&
        ["protected", "settled"].includes(claim.resolution) &&
        claim.worker === payable.worker &&
        claim.payer === payable.payer &&
        claim.amount === payable.amount &&
        claim.holdId === payable.holdId
      )
    )
      errors.push(`Payable ${payable.id} has no legitimately completed funded work.`);
    const hold = economy.holds.find((item) => item.id === payable.holdId);
    if (
      !hold ||
      hold.account !== payable.payer ||
      hold.agreementId !== payable.agreementId ||
      hold.amount !== payable.amount ||
      hold.remaining !== (payable.status === "earned" ? payable.amount : 0) ||
      hold.releases.length !== 0
    )
      errors.push(`Payable ${payable.id} has lost its earned reservation.`);
    const payments = economy.transactions.filter(
      (transaction) => transaction.holdId === payable.holdId,
    );
    const transaction = payments[0];
    if (
      payable.status === "settled"
        ? payments.length !== 1 ||
          !transaction ||
          transaction.id !== payable.transactionId ||
          transaction.from !== payable.payer ||
          transaction.to !== `agent:${payable.worker}` ||
          transaction.amount !== payable.amount ||
          transaction.agreementId !== payable.agreementId
        : payable.transactionId !== null || payments.length !== 0
    )
      errors.push(`Payable ${payable.id} disagrees with its actual wage transfer.`);
  }
  const receiptAgreements = new Set<string>();
  for (const receipt of work.receipts) {
    const payable = work.payables.find((item) => item.id === receipt.payableId);
    const command = recordedCommand(receipt.commandId);
    if (
      !validTime(receipt.at) ||
      !validFee(receipt.amount) ||
      typeof receipt.report !== "string" ||
      !receipt.report.trim() ||
      !Array.isArray(receipt.evidenceIds) ||
      new Set(receipt.evidenceIds).size !== receipt.evidenceIds.length ||
      !["success", "failure", "uncertain", "attendance", "legacy"].includes(receipt.outcome) ||
      receiptAgreements.has(receipt.agreementId) ||
      !payable ||
      payable.agreementId !== receipt.agreementId ||
      payable.worker !== receipt.worker ||
      payable.payer !== receipt.payer ||
      payable.amount !== receipt.amount ||
      !command ||
      ![
        "protect-payroll",
        "complete-work",
        "cancel-work",
        "close-funded-project",
        "record-cafe-attendance",
        "recognise-legacy-payroll",
      ].includes(command.kind) ||
      command.day !== receipt.at.day ||
      command.minute !== receipt.at.minute
    )
      errors.push(`Receipt ${receipt.id} is malformed, duplicated or unrelated to earned work.`);
    receiptAgreements.add(receipt.agreementId);
    const agreement = work.agreements.find((item) => item.id === receipt.agreementId);
    if (
      agreement?.kind === "check" &&
      (!agreement.report ||
        receipt.outcome !== agreement.report.outcome ||
        receipt.report !== agreement.report.text ||
        canonical(receipt.evidenceIds) !== canonical(agreement.evidenceIds) ||
        agreement.requiredEvidence.some(
          (key) =>
            !work.evidence.some(
              (evidence) =>
                evidence.agreementId === agreement.id &&
                evidence.key === key &&
                agreement.report!.evidenceIds.includes(evidence.id),
            ),
        ))
    )
      errors.push(`Receipt ${receipt.id} cannot prove the disclosed completed check.`);
    if (agreement?.kind === "cafe-shift" && agreement.eligibleMinutes !== 180)
      errors.push(`Receipt ${receipt.id} lacks the full eligible attendance.`);
  }
  for (const claim of work.legacyClaims)
    if (
      !actorExists(claim.worker) ||
      !claim.evidence ||
      typeof claim.evidence.paidToday !== "boolean" ||
      !Number.isFinite(claim.evidence.shiftHours) ||
      claim.evidence.shiftHours < 0 ||
      !validTime(claim.evidence) ||
      !Array.isArray(claim.evidence.projects) ||
      !["already-paid", "active-unworked", "completed-unpaid", "partial", "ambiguous"].includes(
        claim.classification,
      ) ||
      !["paid", "unresolved", "underfunded", "protected", "recognised", "settled"].includes(
        claim.resolution,
      ) ||
      (claim.classification === "already-paid" &&
        (claim.resolution !== "paid" || claim.holdId || claim.agreementId)) ||
      (claim.resolution === "protected" &&
        (!claim.holdId || !claim.agreementId || !claim.payer || !validFee(claim.amount!)))
    )
      errors.push(`Invalid labelled legacy payroll ${claim.id}.`);
  for (const claim of work.legacyClaims) {
    const worker = town.agents.find((agent) => agent.id === claim.worker)!;
    const rawTown: Town = {
      ...town,
      day: claim.evidence.day,
      minute: claim.evidence.minute,
      agents: [
        {
          ...worker,
          shiftHours: claim.evidence.shiftHours,
          paidToday: claim.evidence.paidToday,
          projects: claim.evidence.projects,
          plan: claim.evidence.plan,
        },
      ],
    };
    const classified = classifyLegacyPayroll(rawTown)[0];
    if (
      !classified ||
      classified.id !== claim.id ||
      classified.classification !== claim.classification ||
      (claim.resolution !== "recognised" &&
        !(claim.resolution === "settled" && claim.classification !== "completed-unpaid") &&
        (classified.payer !== claim.payer || classified.amount !== claim.amount))
    )
      errors.push(`Legacy wage ${claim.id} contradicts its preserved employer evidence.`);
    if (
      claim.resolution === "protected" ||
      (claim.resolution === "settled" && claim.classification === "completed-unpaid")
    ) {
      const hold = economy.holds.find((item) => item.id === claim.holdId);
      if (
        !hold ||
        hold.account !== claim.payer ||
        hold.amount !== claim.amount ||
        hold.agreementId !== claim.agreementId ||
        hold.remaining !== (claim.resolution === "settled" ? 0 : claim.amount)
      )
        errors.push(`Legacy wage ${claim.id} is not protected by its full disclosed wage.`);
    }
    if (
      (claim.classification === "partial" || claim.classification === "ambiguous") &&
      !["unresolved", "recognised", "settled"].includes(claim.resolution)
    )
      errors.push(
        `Ambiguous legacy wage ${claim.id} was resolved without explicit funded recognition.`,
      );
    if (
      claim.resolution === "recognised" ||
      (claim.resolution === "settled" && claim.classification !== "completed-unpaid")
    ) {
      const agreement = work.agreements.find((item) => item.id === claim.agreementId);
      if (
        !agreement ||
        agreement.worker !== claim.worker ||
        agreement.payer !== claim.payer ||
        agreement.fee !== claim.amount ||
        agreement.holdId !== claim.holdId ||
        !work.payrollApprovals.some(
          (approval) =>
            approval.id === agreement.payrollApprovalId &&
            approval.claimId === claim.id &&
            approval.consumed,
        )
      )
        errors.push(`Legacy wage ${claim.id} has no employer-approved funded recognition.`);
    }
  }
  for (const approval of work.payrollApprovals) {
    const { consumed: _consumed, ...terms } = approval;
    if (
      !validTime(approval.expires) ||
      !actorExists(approval.worker) ||
      !["legacy-recognition", "cafe-replacement"].includes(approval.kind) ||
      issuerFor(approval.payer) !== approval.issuer ||
      !["till:cafe", "till:grocery"].includes(approval.payer) ||
      approval.fee !== (approval.payer === "till:cafe" ? 5 : 4) ||
      approval.requiredMinutes !== 180 ||
      !Number.isInteger(approval.confirmedMinutes) ||
      approval.confirmedMinutes < 0 ||
      approval.confirmedMinutes > 180 ||
      typeof approval.consumed !== "boolean" ||
      approval.cancellation !== CAFE_CANCELLATION ||
      !approvedCommand("approve-payroll-agreement", approval.issuer, terms) ||
      (approval.consumed
        ? work.agreements.filter((agreement) => agreement.payrollApprovalId === approval.id)
            .length !== 1
        : work.agreements.some((agreement) => agreement.payrollApprovalId === approval.id))
    )
      errors.push(`Invalid recorded employer approval ${approval.id}.`);
    if (approval.kind === "legacy-recognition") {
      const claim = work.legacyClaims.find((item) => item.id === approval.claimId);
      if (
        !claim ||
        claim.worker !== approval.worker ||
        claim.evidence.paidToday ||
        approval.confirmedMinutes > Math.min(180, Math.round(claim.evidence.shiftHours * 60))
      )
        errors.push(`Employer approval ${approval.id} invents legacy progress.`);
    } else if (
      approval.claimId !== null ||
      approval.confirmedMinutes !== 0 ||
      approval.payer !== "till:cafe"
    )
      errors.push(`Cafe approval ${approval.id} must begin with zero minutes.`);
  }
  for (const approval of work.approvals)
    if (
      !validTime(approval.expires) ||
      approval.amount !== 4 ||
      !["kevin", "baba"].includes(approval.donor) ||
      issuerFor(approval.account) !== approval.donor ||
      typeof approval.consumed !== "boolean"
    )
      errors.push(`Invalid donor approval ${approval.id}.`);
  for (const approval of work.approvals) {
    const { consumed: _consumed, ...terms } = approval;
    if (
      !approvedCommand("approve-library-contribution", approval.donor, terms) ||
      (approval.consumed &&
        !work.projects.some((project) => project.approvals.includes(approval.id)))
    )
      errors.push(`Donor approval ${approval.id} lacks its authored financial decision.`);
  }
  for (const project of work.projects)
    if (
      project.account !== `project:${project.id}` ||
      project.administrator !== "kevin" ||
      !["funded", "closed"].includes(project.status) ||
      !Array.isArray(project.approvals) ||
      project.approvals.length !== 2 ||
      !Array.isArray(project.contributions) ||
      project.contributions.length !== 2 ||
      project.contributions[0]?.account !== "till:cafe" ||
      project.contributions[1]?.account !== "till:grocery" ||
      project.contributions.some((contribution) => contribution.amount !== 4) ||
      project.approvals.some(
        (id) =>
          !work.approvals.some(
            (approval) =>
              approval.id === id && approval.projectId === project.id && approval.consumed,
          ),
      ) ||
      (project.status === "closed" && (!Number.isInteger(project.refunds) || project.refunds! < 0))
    )
      errors.push(`Invalid funded project ${project.id}.`);
  for (const project of work.projects) {
    for (const approvalId of project.approvals) {
      const approval = work.approvals.find((item) => item.id === approvalId)!;
      if (
        !economy.transactions.some(
          (transaction) =>
            transaction.id === `contribution:${approvalId}` &&
            transaction.from === approval.account &&
            transaction.to === project.account &&
            transaction.amount === 4 &&
            transaction.agreementId === project.id,
        )
      )
        errors.push(`Project ${project.id} has no actual approved contribution.`);
    }
    if (project.status === "closed") {
      if (
        accountBalance(town, project.account) !== 0 ||
        work.payables.some(
          (payable) => payable.payer === project.account && payable.status === "earned",
        ) ||
        work.agreements.some(
          (agreement) =>
            agreement.payer === project.account &&
            ["active", "suspended"].includes(agreement.status),
        )
      )
        errors.push(`Closed project ${project.id} retains unaccounted custody or liabilities.`);
      for (const contribution of project.contributions)
        if (
          project.refunds! > 0 &&
          !economy.transactions.some(
            (transaction) =>
              transaction.id === `refund:${project.id}:${contribution.account}` &&
              transaction.from === project.account &&
              transaction.to === contribution.account &&
              transaction.amount === project.refunds &&
              transaction.agreementId === project.id,
          )
        )
          errors.push(`Project ${project.id} lacks its equal full refund.`);
    }
  }
  return errors;
}
