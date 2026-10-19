# AI-enabled human playtest preparation

The approved spending ceiling for this round is **$0**. Use the existing provider pool and hosting. A key's presence, a successful key check or `freeTierConfirmed: true` does not establish that a model request cannot bill. Keep generation blocked until every reachable route has verified free-only account/model terms and the remaining checks below pass. Do not buy credits, enable billing, create replacement accounts or use legacy Grok as fallback.

The existing tool is `scripts/ai-pool.mjs`, documented in [the provider guide](../AI_PROVIDER_POOL.md). Its catalog, private configuration and `status` command describe enabled providers, key presence, local ceilings and route preference. `status` makes no model calls, but it does not inspect account billing, live quota or player authentication. Some historical setup helpers invoke generation endpoints; do not run a smoke helper as an authentication check.

## Configuration and shared accounting

Use Node 24. Pass an existing private environment file directly to Node; keep credentials outside Git and client-side `VITE_` variables. Do not copy historical whole-project files over the current candidate. Use the intended environment's current pool configuration, including the current replacement OpenRouter key rather than an earlier integration copy.

```sh
node --env-file=/absolute/private/environment.env scripts/ai-playtest-preflight.mjs \
  --pool-config /absolute/private/mind-pool.local.json --zero-spend
```

This command performs no network access. It reports allowlisted configuration facts and reservation estimates, with no credentials, account identifiers, database URL, prompts or transcripts. Missing shared accounting, explicit budget policy or authentication configuration blocks the preflight. The $0 option requires `dailyMicrousd: 0` and `interactiveReserveMicrousd: 0` and rejects positive request cost estimates. These zero ceilings prevent any positive-cost reservation at runtime. Zero tariffs are still an operator assertion requiring independent verification; all call and concurrency limits remain finite. A larger configured daily allowance fails this round's preflight.

After identifying the existing shared database for the intended environment, explicitly inspect it:

```sh
node --env-file=/absolute/private/environment.env scripts/ai-playtest-preflight.mjs \
  --pool-config /absolute/private/mind-pool.local.json --zero-spend --inspect-db
```

The database check uses a read-only transaction with short timeouts. It checks the expected budget schema, budget function bodies, required privileges, the budget serialization lock row and aggregate accounting/headroom. It does not migrate, reserve, finish, reset health or call a provider. Auth and provider-pool schema/readiness require separate verification. Preserve the redacted JSON privately with the exact source commit and environment/build reference. A successful snapshot neither reserves capacity nor proves per-user headroom; concurrent work can change it immediately. All application workers must use the same verified policy and database.

Verify the [budget policy](../../src/lib/mind-budget/README.md) against every enabled fallback, including failed attempts, format retries and billed reasoning. Inspect actual account/model terms and remaining quotas independently. Provider call/token ceilings and shared global monetary reservations are separate limits. Per-user limits cover call attempts, not individual monetary or concurrency caps. Null tariffs, ephemeral accounting and an unchecked `freeTierConfirmed` flag do not meet this round's requirements. Do not run `npm run build` with a live `DATABASE_URL`; that command migrates.

## Provider and player authentication

Use non-generation provider endpoints where available, with redirects rejected and a bounded timeout. Retain only verification booleans and necessary numeric limits, never raw responses or keys:

- [Cohere key check](https://docs.cohere.com/v2/reference/check-api-key) verifies whether the key is active. It does not identify the account's billing tier or remaining quota.
- [OpenRouter current-key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) reports the key's credit cap and remaining allowance. Check that the current key retains its $0 cap, and that every OpenRouter route remains `openrouter/free` or a named `:free` model. A null/unlimited cap does not satisfy this round.
- [Gemini model metadata](https://ai.google.dev/api/models) checks key access to the configured model without generating text. It does not establish the project's current billing tier. NVIDIA likewise needs current account entitlement and non-billing verification; key presence and a public model listing are insufficient.

Use the exact candidate build on an existing authenticated host or registered private preview. The credential-free ports 8181–8185 cannot establish the hosted OAuth callback or account identity. Preserve the current broker, cookie, bearer, origin and preview-gate verification paths. Do not enable local password signup, disable authentication or invent a test identity.

Through the normal browser/client flow, verify genuine sign-in and a fresh `/api/auth/get-session?disableCookieCache=true` result. Record only whether the session is authenticated, non-development and unexpired. Check sign-out and unauthenticated rejection of protected requests. Gate-materialized sessions intentionally hide app sign-out and can reappear on the next verified request; use the platform's sign-out or an independent unsigned browser context for that negative check. A passed `check:auth` verifies configuration agreement, not a real session. Confirm the registered callback matches the exact test origin, and that the served build matches the recorded candidate. Keep personal identity and session tokens outside receipts.

## Bounded live acceptance

Only after the above prerequisites are verified, use a dedicated browser profile and fresh synthetic town. Preserve personal towns. Start with one explicit player reply; background planning, reflection and resident dialogue can also trigger requests and must have verified free-only routes and finite quotas before starting the game clock. Record the actual route, elapsed time, reported usage, whether the reply was applied and any local fallback. Provider-returned model identity is separate from the router's configured model label.

Compare shared accounting and provider quota before and after. Stop on an unexpected route, billing change, authentication failure, missing ledger entry or exhaustion. Do not retry around limits or reset counters. Follow the [human protocol](game-quality-playtest.md) for the five sessions only after the bounded acceptance succeeds. Human observations, screen-reader acceptance and conversation quality remain pending until actually observed.

The preflight always leaves `readyForAiPlaytest: false`: its result covers configuration and database checks only. Genuine sign-in, provider non-billing terms, deployed-build/callback identity, per-user headroom and final operator verification remain separate evidence.
