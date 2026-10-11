# Sol handoff

Implemented and locally validated on 11 October 2026. The setup branch remains unmerged, so the implementation targets `codex/agent-collaboration-setup`.

- Repository: `arwyn6969/the-game`; checkout `/workspace/the-game`; branch `codex/sol-foundation`.
- Base SHA: `b8d6c97ebe5d88b2f97a56e5e5edc82287554ad1`.
- Validated implementation head SHA: `47e8134749e5e7428a62b97ab553f05500506369`. The following delivery commit adds only this handoff; GitHub's branch head identifies that documentation revision.
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

| Command | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund --cache /workspace/.cache/npm` | Passed, 428 packages; lockfile unchanged |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero errors; one inherited unused-disable warning at `src/lib/auth/use-current-user.ts:59` |
| `npm run test:town` | 34 passed: existing town-day module plus 33 targeted regressions; zero failures/skips |
| `npm test` | 232 script tests and 55 app/auth tests passed; zero failures/skips |
| `npm run diagnose:town` | Scenarios completed; their repaired behaviors are separately asserted by the regression suite |
| `env -u DATABASE_URL -u XAI_API_KEY npm run build` | Passed; migration explicitly skipped; inherited dependency/bundler warnings remain |
| `git diff --check` | Passed |

CI repeats install, typecheck, lint, game/full tests, diagnostics and a build on Node 24 with empty database/provider variables and read-only repository permissions. It has not yet run on GitHub.

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
