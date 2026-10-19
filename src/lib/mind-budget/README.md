# AI call and cost reservations

Every AI job uses the same budget boundary in legacy and pool modes. Shared Postgres reservations enforce rolling 24-hour global cost and call allowances, per-user rolling 24-hour and minute call allowances, and global concurrency. There is no separate per-user monetary or concurrency cap. Background jobs leave capacity for direct player replies. Per-user identity comes from the existing verified authentication middleware, never a player name or client-supplied ID. The ledger stores hashed identity, job kind and usage accounting; no conversation text or credentials.

Production requires `DATABASE_URL`, existing authentication, the `20261013_mind_budget.sql` migration, and `MIND_BUDGET_CONFIG`. No production database or secrets are configured by this change. Without usable shared accounting or conservative price configuration, jobs fall back locally. Local development uses a finite process-local call allowance; it resets on restart and is explicitly not a durable monetary guarantee. For an isolated production-build preview, an operator may explicitly set `MIND_BUDGET_LOCAL_DEV=true`; never use this on a public host. Recognized Grok/Vercel deployments always require shared accounting. Request headers and player names cannot enable local mode.

`MIND_BUDGET_CONFIG` is JSON with these fields (the example is policy structure, not a provider price quote):

```json
{
  "version": 1,
  "dailyCalls": 500,
  "playerDailyCalls": 100,
  "playerMinuteCalls": 6,
  "playerInteractiveReserveCalls": 20,
  "playerInteractiveReserveMinuteCalls": 2,
  "concurrent": 4,
  "backgroundConcurrent": 2,
  "interactiveReserveCalls": 100,
  "dailyMicrousd": 1000000,
  "interactiveReserveMicrousd": 200000,
  "inputNanousdPerToken": null,
  "outputNanousdPerToken": null
}
```

Set both tariff fields to conservative **maximum** input/output nanodollars per token across every enabled model, tier and failover provider. One nanodollar is 0.000000001 USD. Include billed reasoning and avoid assuming cache discounts. Null tariffs are accepted only for local ephemeral development. Zero tariffs are an explicit operator assertion that all enabled services cannot bill; configuration cannot verify a provider's billing dashboard. Review tariffs whenever models, provider pricing or account tiers change. This caps the application's conservative reservations under the declared tariffs, not charges made by other applications or provider accounting differences.

The request reserves its maximum possible attempt count and worst-case input/output cost before any provider call. A successful response with trusted adapter diagnostics may release unused attempts. A failure, timeout, missing diagnostics, failed finish or crashed worker retains the worst-case reservation: a failed provider-ledger finish can make its diagnostics incomplete. Leases free concurrency after expiry but do not refund daily call/cost accounting. Database failures never permit unmetered requests.

For human playtests, use the [AI preflight procedure](../../../docs/implementation/ai-playtest.md) before enabling requests. The read-only CLI checks configuration and, only with `--inspect-db`, shared accounting metadata and aggregate headroom. It cannot prove a real sign-in, account billing terms or deployed-build identity. `--zero-spend` requires `dailyMicrousd: 0` and `interactiveReserveMicrousd: 0` and rejects positive request cost estimates. A literal zero ceiling rejects every positive-cost reservation at runtime while retaining finite call and concurrency limits. Zero configured tariffs still need independent proof that every reachable provider route cannot bill.
