# Sol handoff

## 15 October 2026 — permanent identity tooling

The user approved tooling first, then multiplayer. `codex/stamp-identity-tooling` starts from the committed quality candidate `80ee299` in a separate checkout. [The implementation plan and receipt](../implementation/stamp-identity-tooling.md) document the six-stage sequence and first completed packet: secure world/resident IDs, deterministic legacy migration, strict validation, scoped tooling references, explicit restore/fork imports and original-byte recovery. Existing Town v2, personalities, debts, game accounts and local engine keys remain.

Node 24.19.0 fresh offline install, typecheck, lint (one inherited warning), 267 town regressions, 559 full tests, 30-day diagnostics and a production build passed. Built desktop/phone journeys verified the import choices, fork/reload, corrupt identity rejection, movement, conversation and existing funded library paths. [Evidence](../review/stamp-identity-2026-10-15/validation.json) includes the reviewed storage fixes for reload retries and redundant v1 backups. No wallet operation, paid call, production database migration, merge or publication occurred. The next packet is wallet compatibility, server-verified ownership and read-only stamp selection/optional heads; the old fixed roster still needs a later shared-world migration.

## 15 October 2026 — current game backlog

Current delivery is `codex/game-quality-review`, integrating main through `4a39cdf`; final game rules and replay/search guard fixes are at `128e1d4`. The [implementation receipt](../reviews/2026-10-15-game-quality-delivery.md) records the 539 passing tests, desktop/phone built and delayed-AI journeys, year-long synthetic checks, evidence and remaining gates. The [delivery guide](../implementation/game-quality-delivery.md) covers the funded library, durable work, inventory, saves and operator budget setup. The [roadmap](../ROADMAP.md) is reconciled with implemented scope. Cross-device saves and a continuously running shared town remain explicitly deferred. Human playtesting, physical accessibility checks, live configuration and separately authorized publication remain open; no production action or paid call was performed.

The provider and earlier integration notes below are historical, not the current assignment or release verdict.

## 12 October 2026 — provider activation follow-up

- User authorized free-provider enrollment and private local key configuration. Gemini, Cohere trial, NVIDIA NIM and OpenRouter free access were verified with synthetic JSON requests. Secrets and account-specific preferences are in ignored local files with mode 0600. No production secrets, database or deployment were changed; Groq, Mistral and Ollama remain disabled where free access or a running local model was unavailable.
- Updated the Gemini catalog to the model actually available during setup (`gemini-3.8-flash`), added optional compatible reasoning effort, and increased bounded request timeouts to 12 seconds within a 30-second deadline. NVIDIA uses Nemotron 3 Ultra for deliberate work and Super for dialogue. Preferences remain editable and are not benchmarked intelligence scores.
- Added endpoint checks for recognizable provider key prefixes plus a regression covering foreign providers and custom hosts. This prevents those copied-key mix-ups from transmitting credentials. It cannot identify unprefixed keys. CLI status reports the check without displaying any secret.
- Validation after these changes: 345 tests passed (290 script plus 55 app/auth), typecheck passed, lint passed with one inherited auth warning, and build passed with the database URL unset. All four live game jobs succeeded; the quota-limited run demonstrated Gemini timeout → Cohere and exhausted preferred allocations → OpenRouter. A fifth stress request timed out after the other allocations were deliberately exhausted; the router returned a bounded unreachable result for existing offline handling. These checks establish connectivity/fallback, not full-game quality or sustained load capacity.
- Local provider setup did not purchase credits or paid upgrades. All account-specific credentials remain outside the reviewable source diff.

The original implementation evidence below describes its earlier state before provider setup.

## 12 October 2026 — private AI provider pool

- Branch: `codex/free-api-pool`, isolated local checkout `llm-pool`, based on current main `9377857c3283a6a2ef19dc39912d0ff4e2d0a30a`. The user explicitly requested multiple free providers, then intelligent-first routing and model choices by service; this authorizes the opt-in provider addition beyond the earlier milestone's provider freeze.
- Added ranked, per-job model routes for planning, reflection, resident dialogue and player replies; seven provider templates; OpenAI-compatible and Cohere v2 adapters; bounded attempts/timeouts; explicit JSON-format retry; health/cooldowns; and an atomic SQL quota/lease ledger. Original gateway exports and town/save signatures remain compatible.
- Setup, private model preferences, quota/billing limits and commands are in [the provider-pool guide](../AI_PROVIDER_POOL.md). CLI commands are `init`, `status`, `demo`, `dev`, `usage`, and `reset-health`. A local ignored configuration was generated with all providers disabled. No keys were created or configured.
- Node 24.19.0 clean `npm ci`, typecheck, lint (zero errors, one inherited auth unused-disable warning), full tests (289 script tests plus 55 app/auth tests: 344 total), 65 town tests, 30-day diagnostics and production build passed. Diagnostics found no world-audit issues and all measured exports imported. Build ran with `DATABASE_URL` and `XAI_API_KEY` unset and skipped the database migration. The 26 new pool tests execute the migration/SQL functions in disposable PGLite with mocked provider responses, including concurrent reservations, lease expiry, quota boundaries, ranked selection, 429, invalid JSON, errors, timeout, and format retry. The CLI demo showed Gemini 429 → Groq success without external model calls.
- The new root migration invalidated the old test assumption that the app has no application migrations. Updated that test to assert the new application migration is present while preserving the assertion that auth SQL remains outside the root migration set.
- The actual local pool-mode startup applied the migration in PGLite and returned HTTP 200. `check:auth` confirmed dev/build agree with sign-in on. Server-only pool code/key variable names were absent from generated static JS. No UI changes were made; no new desktop/mobile interaction pass was needed for this backend/tooling diff.
- Remaining limits: real provider entitlement, live response quality/latency, zero-cost account configuration and production Postgres contention are untested. Rankings are editable preferences, not measured intelligence scores. Local PGLite is process-local and resets on restart; multi-instance limits require shared Postgres and the reviewed migration. Grok/Vercel pool deployment refuses a missing shared DB. Other hosts must supply it explicitly. The existing save marker `mind: "grok"` still denotes online output; actual provider/model attribution lives only in the server ledger. Per-player fairness and stale client-result handling remain separate work.
- No merge, hosted publication, production secret update, production database migration, paid call or provider account signup was performed.

The earlier handoff below remains historical evidence.

The later integration pass combines this branch with the completed player-experience branch, wires save feedback/import limits, and verifies the shared game. Current release evidence and publishing limitations are recorded in [docs/RELEASE.md](../RELEASE.md); the independent-lane record below remains historical evidence.

Implemented and locally validated on 11 October 2026. The setup branch remains unmerged, so the implementation targets `codex/agent-collaboration-setup`.

- Repository: `arwyn6969/the-game`; checkout `/workspace/the-game`; branch `codex/sol-foundation`.
- Base SHA: `b8d6c97ebe5d88b2f97a56e5e5edc82287554ad1`.
- Validated implementation head SHA: `47e8134749e5e7428a62b97ab553f05500506369`. Subsequent delivery commits change only this handoff; GitHub's branch head identifies the documentation revision.
- Draft PR: [#3 — Make town saves, economy, and retrieval reliable](https://github.com/arwyn6969/the-game/pull/3), targeting `codex/agent-collaboration-setup`. GitHub API access now succeeds; the previous environment access blocker is resolved. Native HTTPS Git read and push also succeeded.

## Implemented outcomes

1. The 17 inherited template failures now pass. PWA unit fixtures use an empty temporary workspace rather than inheriting THE GAME's share metadata; a separate integration assertion preserves the real title, game type and share card. App-env fixtures exercise auth-off configuration separately from the auth-on default and explicit overrides. Public brand-tool documentation replaces references to absent private skill files while retaining marker, expiry, background-task and atomic-write assertions. Required install-page CSS and the existing favicon rendered as a 180px PNG are committed; textual install instructions replace missing decorative images. Authentication, PWA routes and preview contracts remain enabled.
2. Portable saves omit paths and replay frames from a copy, retaining memories, identity, debts, notices and names. Import accepts raw or wrapped v1 files up to 8 MiB measured in UTF-8. Quota handling retries only without replay and never prunes live or saved meaningful history. Failures are observable through additive APIs; original void callers still work.
3. Settlement binds the referenced owed favor to its actual debtor and creditor for payment, forgiveness and breaking. Payments use the stored amount, require valid balances and sufficient funds, conserve money at the 999-coin cap, complete zero-money favors, and are idempotent once settled.
4. Work credit is actual attended minutes divided by 60 in the existing `shiftHours` field. A planned out-of-home interval at the workplace plus a permanent job or an open shift project is required. Three hours earns 5 at the cafe or 4 at the grocery, once per day. Approved afternoon shifts can extend beyond ordinary shop hours. Empty/partial tills and full purses defer the complete wage without marking it paid; credit and paid status reset at midnight. Existing v1 integer work counters continue to load without a schema migration.
5. Offline bread requests open one tab, inspection reports it, and explicit payment settles it once when funds and purse capacity permit. Repayment/inspection take precedence over bread keywords. Unknown and hostile text has zero trust delta. A vague introduction no longer invents a Northern/Kevin commitment.
6. Online selection includes the current player question and uses only the queried resident's memory stream. One shared selector builds both prompt memories and diagnostics, including forced protected memories, identical clipped text, order and packet seed position. Different questions in one minute produce distinct diagnostics.

## Changed files

- Engine: `src/game/save.ts`, `effects.ts`, `sim.ts`, `offline.ts`, `prompt.ts`, new `retrieval.ts`, and `text.ts`.
- Tests/diagnostics: `scripts/town-day.test.mjs`, new `town-regressions.test.mjs`, `diagnose-town.mjs`, `brand-check.test.mjs`, `check-auth-invariant.test.mjs`, `grok-pwa-plugin.test.mjs`, `with-app-env.test.mjs`, and `write-atomic.test.mjs`.
- Tooling/platform: `package.json`, `.github/workflows/verify.yml`, `scripts/install-page.html`, `public/__grok/icon-180.png`, `public/__grok/install/styles.css`, `docs/BRAND_ASSETS.md`, and this handoff.
- Narrow lint repair: `src/lib/app-data/client.server.ts` documents the existing malformed-token hash fallback in its empty catch; no authentication logic changed. `text.ts` preserves control-character sanitization without the prohibited regex.

No Grok-owned game UI, renderer, styles or game assets were edited. No completed Grok diff was integrated. The frozen `Town` schema and all existing exported engine signatures are preserved. The separate legacy Python checkout `/workspace/THE_GAME` remains unchanged.

## Validation

Node `24.19.0`, npm `11.9.0`, committed lockfile; no production database or model credentials used. A repeated clean installation and final checks passed after the implementation stabilized.

| Command                                                     | Actual result                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund --cache /workspace/.cache/npm` | Passed, 428 packages; lockfile unchanged                                                           |
| `npm run typecheck`                                         | Passed                                                                                             |
| `npm run lint`                                              | Passed, zero errors; one inherited unused-disable warning at `src/lib/auth/use-current-user.ts:59` |
| `npm run test:town`                                         | 34 passed: existing town-day module plus 33 targeted regressions; zero failures/skips              |
| `npm test`                                                  | 232 script tests and 55 app/auth tests passed; zero failures/skips                                 |
| `npm run diagnose:town`                                     | Scenarios completed; their repaired behaviors are separately asserted by the regression suite      |
| `env -u DATABASE_URL -u XAI_API_KEY npm run build`          | Passed; migration explicitly skipped; inherited dependency/bundler warnings remain                 |
| `git diff --check`                                          | Passed                                                                                             |

CI repeats install, typecheck, lint, game/full tests, diagnostics and a build on Node 24 with empty database/provider variables and read-only repository permissions. GitHub's `verify` job passed on PR #3 at head `7d20d638f7303cf2ff1db938f55c31e5552d5dee`; the following documentation update records that result.

Browser checks used system Chromium through Playwright against `npm run dev` on port 8080, with synthetic QA towns and the runtime provider key unset. At 1280×800 and 390×844, keyboard/touch movement, pause and resume controls, offline conversation entry and tab inspection, download, file import/replacement and reload all passed without page errors. Resident panels were opened through the existing QA helper; selecting residents on the canvas was not tested. The PWA tutorial passed desktop, mobile iOS 18 and iOS 27 cases, keyboard link focus, responsive overflow, asset/manifest requests and reload. Screenshots and browser harnesses are retained under ignored `artifacts/` in this task; synthetic downloaded towns are not committed. These are browser emulation checks, not physical-device or live-provider tests.

## Save compatibility evidence and additive APIs

Regression assertions compare complete normalized day-5/day-30 towns against imported exports; only replay and disposable paths differ. Older raw and pretty wrapped v1 files also round trip, including retained replay. An older fixture missing optional arrays/counters repairs them while retaining its name, identity, meaningful memory, notice and debt. Boundary tests accept exactly 8 MiB, reject one extra byte, and reject multi-byte text that is below the character count but above the byte limit. Storage-failure tests compare the entire live town before and after both failed writes and a replay-only retry.

The day-30 diagnostic export is about 637 KB in UTF-8, below the current UI's 1.5 MB file gate; it imports successfully. Northern earns 29 cafe wages by day 30 in ordinary deterministic play. The planted violin fact appears first in the actual prompt and diagnostic. The historical baseline snapshot remains unchanged.

`src/game/save.ts` exports:

```ts
saveTown(town: Town): void; // existing contract, still non-throwing
saveTownWithStatus(town: Town): SaveResult;
getLastSaveResult(): SaveResult | null;
MAX_TOWN_FILE_BYTES; // 8 * 1024 * 1024
// SaveResult:
// { ok: true, bytes: number, replayOmitted: boolean }
// | { ok: false, reason: "unavailable" | "serialization" | "quota" | "storage" }
```

`promptMemories(town, agent, job)` in `src/game/retrieval.ts` is additive. `prepareRetrievals` and `buildPrompt` retain their signatures and record the shared prospective prompt packet once when unchanged. `logRetrieval` retains its original standalone ranking contract; logs prepared for a prompt instead describe the selected packet. No default player UI needs technical retrieval data.

## Integration requests for Grok

- Show persistent unsaved feedback after `saveTownWithStatus` fails, or read `getLastSaveResult()` after existing void saves. Keep the live town playable and offer download. Acceptance: injected quota failure leaves every memory/debt unchanged and visibly reports unsaved state; successful recovery clears the failure. This UI wiring remains outstanding in Grok's lane.
- Replace `TownApp.tsx`'s literal `file.size > 1_500_000` with `MAX_TOWN_FILE_BYTES` so older large replay-bearing v1 files can reach the compatible parser. Acceptance: an older 1.6–3.6 MB v1 file loads, while files over the shared UTF-8 limit are rejected. The current import preview also reads a raw top-level day, so wrapped saves show `?`; unwrap for that preview if changing it.
- A player earns a shift only after an explicit shift project plus matching plan interval and attendance; visiting a counter or changing a status string does not qualify. Keep the promised wage and actual attendance visible through in-world feedback.
- Keep resident-private wants, hidden threads and technical diagnostics out of default player panels. Existing UI exposure belongs to Grok's pending work; backend prompt retrieval does not pool private knowledge across residents.

## Mind gateway review and remaining limits

`src/lib/mind.functions.ts` retains the existing Grok provider and hosting. Its process-local rolling limit is 12 logical calls per minute shared across all players; it neither identifies a player nor coordinates quotas across instances. One active player can exhaust another's budget, while multiple instances can multiply the limit. Provider retry calls are not separately counted.

A non-401/403/429 HTTP failure triggers a second request without JSON mode, including server failures, with no idempotency key or backoff. Each request allows 25 seconds, so the pair can outlive the UI's 45-second timeout; the UI does not cancel underlying provider work. Availability reports only key presence, not provider health. No paid calls, live quota test or retry fault injection was performed.

`TownApp.tsx` checks that a result belongs to the same town object, which protects imports that replace it, but has no clock/job epoch check for that object's changing memories, position and schedule. The clock can continue during pending mind work. A delayed plan/transaction proposal can therefore apply to changed state; offline fallback and an uncancelled timed-out server request can overlap. Integration should use a request generation and explicit relevance rules for job day/minute, plus cancellation where possible. These risks are documented for a separate gateway/orchestration pass; this milestone validates monetary proposals centrally and does not claim to resolve per-player budget or stale-result handling.

No release, merge, production migration, hosting change or Grok publication was performed.
