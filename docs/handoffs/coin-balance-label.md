# Coin balance wording — 22 October 2026

Owner: coin-label chat `01a1645b-b94d-7b90-8ec1-074018dd0bd5`.
Checkout: `coin-balance-label/`; branch: `codex/coin-balance-label`.
Base: current `origin/main`, `dab257bb4911d8abf63b412aca5e427cc0dcb2ab`.

The player balance now reads “4 coins” rather than “4 on you” in the header, player details and journal. A balance of one uses “1 coin”. The value still comes from `player.money`; this is a copy change without simulation or save changes.

Validation with Node 24.19.0:

- Typecheck and changed-file ESLint passed.
- Full ESLint completed with zero errors and one existing unused-disable warning in `src/lib/auth/use-current-user.ts:59`.
- `npm test` passed: 881 script tests and 55 TypeScript tests. The initial sandbox run blocked a local socket check; the rerun with local socket access passed.
- `npm run test:town` passed all 349 tests; `npm run diagnose:town` completed as an observation run.
- Focused actual Chromium checks at 1280×800 and 390×844 passed: visible “4 coins”, keyboard/touch movement, pause, local conversation, reload, synthetic town download/import and no horizontal page overflow or console/page errors. Both screenshots were inspected. Disposable local test data only; no production account or model calls.
- Local browser receipt and screenshots: ignored `artifacts/coin-label/`.

No production build, physical-device or assistive-technology run was made for this copy edit. Singular wording was checked in source; browser fixtures retained the initial four-coin balance. The local checkout reused installed dependencies with an identical lockfile.

Delivery: implementation `7c42ccc`, pushed to its own upstream, and [draft PR #45](https://github.com/arwyn6969/the-game/pull/45). Merge and live publication remain separate.

## Current-main refresh — 26 October 2026

The user explicitly requested merge/publication and completion of the coin UI
follow-up. This mobile release chat now owns delivery, reusing the original
branch and PR #45. Ordinary merge `39d048f` brings it forward to main
`4a5ae77d531b984320203daa86449c168bd0fe15` with verified mobile recovery. The
remaining runtime diff is exactly the original three labels; none of the older
implementation replaces current game features. The independent AI fix is live
as Worker `673fe14a-ba0f-450c-87bb-dc4cd96130c2`; its publication receipt is
included in this follow-up.

Current Node 24 typecheck, lint (one inherited warning) and the credential-free
normal build pass with database migration skipped. A disposable Chromium run
at 1280×800 and 390×844 passes the header/player-card/journal wording for zero,
one, four and 120 coins, in-view geometry, reload, keyboard/touch movement,
pause, local conversation and download/import. The first variant fixture
incorrectly changed a purse while retaining its initialized ledger; the save
validator rejected it. The corrected fixtures start from a fresh exported town
before ledger initialization, and all eight cases pass without product changes
or weakened validation. No user browser, account, real model or production data
was used. [Current evidence](../review/coin-balance-2026-10-26/README.md).

The full current application run and required PR Verify gate are in progress.
Coin-label publication is not yet claimed.

## Published follow-up — 26 October 2026

The complete final Verify passed on `ee9ea343a49b8462a360bd82d8631898f2525caf`
before PR #45 merged as `2e5de222ab0d190b6f49ee51fb0dbdd4707aa092`. The
verified and merged trees match. Production Worker
`82c1f2d0-dcf5-4387-8934-549a7ba267f2` now serves explicit coin units and
retains the AI recovery fix. Actual hosted phone/desktop checks pass all three
coin surfaces, AI dismissal/reopen, draft retention and no automatic replay.
Public assets match; all bindings/runtime settings remain.
[Complete release evidence and rollback](../review/coin-balance-2026-10-26/README.md).
Earlier candidate statements above describe their pre-publication checkpoints.
