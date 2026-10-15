import type { Sql } from "../db.ts";
import { validReservation } from "./policy.ts";
import type { BudgetLease, BudgetPolicy, BudgetReservation, BudgetStore } from "./policy.ts";

export class SqlMindBudgetStore implements BudgetStore {
  private sql: Pick<Sql, "query">;
  constructor(sql: Pick<Sql, "query">) {
    this.sql = sql;
  }
  async reserve(request: BudgetReservation, policy: BudgetPolicy): Promise<BudgetLease | null> {
    if (!validReservation(request)) throw new Error("Invalid mind budget reservation");
    const rows = await this.sql.query<{ id: string }>(
      "select * from mind_budget_reserve($1,$2,$3,$4,$5,$6::jsonb)",
      [
        request.user,
        request.kind,
        request.calls,
        request.microusd,
        request.leaseMs,
        JSON.stringify(policy),
      ],
    );
    return rows[0] ? { id: rows[0].id, calls: request.calls, microusd: request.microusd } : null;
  }
  async finish(lease: BudgetLease, knownAttempts: number | null): Promise<void> {
    await this.sql.query("select mind_budget_finish($1,$2)", [lease.id, knownAttempts]);
  }
}

type Entry = BudgetReservation &
  BudgetLease & { started: number; expires: number; completed: boolean };
/** Development only: process-local limits explicitly reset on server restart. */
export class EphemeralMindBudgetStore implements BudgetStore {
  private entries: Entry[] = [];
  private sequence = 0;
  private now: () => number;
  constructor(now = Date.now) {
    this.now = now;
  }
  async reserve(request: BudgetReservation, policy: BudgetPolicy): Promise<BudgetLease | null> {
    if (!validReservation(request)) throw new Error("Invalid mind budget reservation");
    const now = this.now();
    this.entries = this.entries.filter((entry) => entry.started > now - 86_400_000);
    const all = this.entries;
    const user = all.filter((entry) => entry.user === request.user);
    const live = all.filter((entry) => !entry.completed && entry.expires > now);
    const sum = (entries: Entry[], field: "calls" | "microusd") =>
      entries.reduce((total, entry) => total + entry[field], 0);
    const background = request.kind !== "player";
    if (
      sum(all, "calls") + request.calls >
        policy.dailyCalls - (background ? policy.interactiveReserveCalls : 0) ||
      sum(all, "microusd") + request.microusd >
        policy.dailyMicrousd - (background ? policy.interactiveReserveMicrousd : 0) ||
      sum(user, "calls") + request.calls >
        policy.playerDailyCalls - (background ? policy.playerInteractiveReserveCalls : 0) ||
      sum(
        user.filter((entry) => entry.started > now - 60_000),
        "calls",
      ) +
        request.calls >
        policy.playerMinuteCalls - (background ? policy.playerInteractiveReserveMinuteCalls : 0) ||
      live.length >= policy.concurrent ||
      (background &&
        live.filter((entry) => entry.kind !== "player").length >= policy.backgroundConcurrent)
    )
      return null;
    const entry: Entry = {
      ...request,
      id: `local-${++this.sequence}`,
      started: now,
      expires: now + request.leaseMs,
      completed: false,
    };
    this.entries.push(entry);
    return { id: entry.id, calls: entry.calls, microusd: entry.microusd };
  }
  async finish(lease: BudgetLease, knownAttempts: number | null): Promise<void> {
    const entry = this.entries.find((item) => item.id === lease.id);
    if (!entry || entry.completed) return;
    if (
      knownAttempts !== null &&
      Number.isSafeInteger(knownAttempts) &&
      knownAttempts >= 0 &&
      knownAttempts <= entry.calls
    ) {
      entry.microusd = Math.ceil((entry.microusd * knownAttempts) / entry.calls);
      entry.calls = knownAttempts;
    }
    entry.completed = true;
  }
}
