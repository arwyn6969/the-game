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

Delivery is a feature branch and draft PR. Merge and live publication remain separate.
