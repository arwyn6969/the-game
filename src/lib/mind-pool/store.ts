import type { Sql } from "../db.ts";
import type { Candidate, Completion, Lease, MindKind, QuotaStore } from "./types.ts";

export class SqlQuotaStore implements QuotaStore {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async reserve(
    candidate: Candidate,
    kind: MindKind,
    tokens: number,
    leaseMs: number,
  ): Promise<Lease | null> {
    const rows = await this.sql.query<{ attempt_id: string; json_mode: boolean }>(
      "select * from mind_pool_reserve($1, $2, $3, $4, $5::jsonb, $6)",
      [
        candidate.provider.id,
        candidate.route.model,
        kind,
        tokens,
        JSON.stringify(candidate.provider.limits),
        Math.ceil(leaseMs),
      ],
    );
    const row = rows[0];
    return row ? { id: row.attempt_id, jsonMode: row.json_mode } : null;
  }

  async finish(candidate: Candidate, lease: Lease, completion: Completion): Promise<void> {
    await this.sql.query("select mind_pool_finish($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [
      lease.id,
      candidate.provider.id,
      candidate.route.model,
      completion.outcome,
      completion.status,
      Math.round(completion.latencyMs),
      completion.actualTokens,
      Math.ceil(completion.accountCooldownMs ?? 0),
      Math.ceil(completion.modelCooldownMs ?? 0),
      completion.disableAccount ?? false,
      completion.disableModel ?? false,
      completion.disableJsonMode ?? false,
    ]);
  }
}
