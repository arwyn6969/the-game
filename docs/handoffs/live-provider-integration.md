# Live provider integration for seven residents

Prepared 12 October 2026. This combines the provider pool with the current seven-resident conversation and save fixes in `codex/seven-resident-coherence`.

## Integration

The pool source originated in the separate `llm-pool` checkout, commit `0838167`, with its subsequent model and reasoning configuration updates. That checkout and its ongoing account setup were not edited. Its older `mind.functions.ts`, town implementation and handoff were not copied over this game's newer logic.

`MIND_PROVIDER_MODE=pool` now routes the existing server functions through the pool using the current `MIND_SYSTEM`, prompt builder, parser and effect guards. Unsupported mode values fail closed. Legacy mode retains the existing bounded Grok gateway. The pool cannot fall through to a paid Grok request. The game's existing online save marker remains `mind: "grok"`; player-facing history labels these as AI replies. Server response diagnostics distinguish the actual provider/model, attempts, outcome, HTTP status, elapsed time and reported total tokens.

Existing Gemini, Cohere and OpenRouter credentials were reused in an ignored local environment file with private permissions. No account or credential was created in this integration. No key values were printed or added to source. Local configuration remains private; catalog defaults keep every provider disabled until an operator enables it.

## Production preview repair

The first browser test reproduced a crash when PGlite's bundled server module could not find `pglite.data`. Nitro had bundled the JavaScript without copying its relative binary dependencies. A build hook now copies `pglite.data`, `pglite.wasm` and `initdb.wasm` from the installed package beside the generated module. The artifact can initialize the local quota database and apply the pool migration. A regression test checks that all binaries match and that missing source assets fail the build.

Database migration validation used no live database. The built PGlite instance was also initialized directly, and the production browser request exercised the real quota ledger.

## Conversation evidence and safeguards

A controlled browser runner, `scripts/live-seven.mjs --run`, uses an isolated synthetic town and at most 13 paced player requests. Every accepted result must be saved as live AI, displayed in full, and preserve money, debt and the player's project agreements. It also checks history after reload. It is opt-in and does not run under `npm test`.

The initial Gemini attempt failed with a service error; a diagnostic request independently returned HTTP 503. Cohere was used for the fixed-provider comparison. A small output allowance initially truncated a reply because its reasoning used output tokens. The local comparison allowance was corrected within configured quota limits.

The live wage scenario exposed a guard that removed the receipt date. Wage grounding now preserves the original day/time, handles a question about yesterday, and rejects future, wrong-amount and non-event receipts. The player's actual message is supplied to the guard. Historical transcript entries are retained.

The complete fixed-provider run applied 13 live Cohere replies across all seven residents, with no changes to money, debts or player agreements and no page errors. All 13 diagnostics reported Cohere `command-a-plus-05-2026`, HTTP 200 and successful output; total reported usage was 22,445 tokens. End-to-end reply times ranged from 2,327 to 4,679 ms, averaging 3,295 ms. Conversations survived reload. Mobile checks at 390×844 displayed the saved Data and Amelia replies, retained history on reload and fit the header/composer without horizontal overflow; they made no additional provider calls.

The quality review found reversed help offers, a promise of an exact inventory count without records, and repeated references to an internal “open thread.” The shared model instructions now preserve help direction, acknowledge unnamed tasks before estimating duration, disallow promised missing counts and keep internal machinery out of speech. The player prompt also stopped highlighting one private thread irrespective of relevance. Targeted live follow-up checks cover the affected residents. A successful connection or valid JSON alone is not a conversational-quality verdict.

Seven follow-up live replies across Northern, Baba, Sub and Data passed the same state/reload checks. Review confirmed corrected help direction, no promised exact inventory count and no internal-thread wording in these answers. Follow-up latency ranged from 2,301 to 8,372 ms. A final isolated live reply on port 8081 verified the operational pool configuration. In total, 21 successful live player replies were checked, alongside the earlier diagnostic failures described above.

The supplied version-1 town passed a read-only migration check: eight actors after adding Data and Amelia; original residents, stored memories, positions, plans, projects, money, debts, notices and game time retained; source bytes unchanged. It was not imported into the user's browser or sent to a model.

## Validation and operation

Typecheck and lint passed; lint reports only the inherited auth directive warning. Game tests: 136 passed. Full suite: 361 script tests plus 55 app/auth tests, 416 total, all passed. Production build passed with database and Grok credentials unset. A scan of client assets found none of the configured provider key values.

Build with `DATABASE_URL` and `XAI_API_KEY` unset. Then `npm run ai:pool -- preview` loads `.env.local` and serves the built game on `127.0.0.1:8081`. The ordinary dev command retains port 8080. Browser storage is preserved across the preview restart.

The configured local dialogue route prefers the tested Cohere provider, with Gemini and OpenRouter available as bounded fallbacks. Ranking describes this test setup, not a general model benchmark. Planning/reflection preferences remain configured separately.

Local PGlite quota records reset when the server restarts and do not coordinate with other applications using these accounts. Provider account quotas remain authoritative. Shared Postgres is required by the pool for recognized deployments. Live planning, reflections, autonomous dialogue, sustained free-tier capacity and a fifteen-resident game need additional measurement beyond the small player-conversation run.
