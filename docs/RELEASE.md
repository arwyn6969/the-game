# First-day release

The combined release includes the reliability branch `df95ee6da39c9ad0519c8742a880ec48381e5edd` and the player-experience branch `46e7e369929e8fc0234ff73393b48bb0660d6e2e`. Both were reviewed and merged into `codex/first-day-integration`; its PR targets `main` so one reviewed version becomes the source for the next iteration.

## What players receive

- Clear directions to Hobbs, keyboard and touch movement, and a conversation panel with reachable controls. Private character notes require the optional developer inspector.
- Residents avoid occupied tiles, and a crowded click offers a choice of residents. Empty space between the phone movement buttons allows taps through to the town.
- Correct debt ownership, full and repeat-safe settlement, wages earned from actual attendance, and conservative offline dialogue. A question retrieves the relevant personal memory.
- Version-1 saves and older imports remain compatible. Portable exports omit replay frames; the UI and parser share an 8 MiB byte limit. Failed browser saves show a warning and a backup button.
- Time and movement hold while a mind request is pending. A delayed reply preserves a newer unsent draft and cannot change a town imported during the request.

The runtime model, provider, auth, PWA routes, preview contract and existing host are preserved. Offline play needs no API key.

## Validation on 11 October 2026

- Node 24.19.0; clean `npm ci` installed the locked 428 packages.
- Typecheck passed. Lint passed with one inherited unused-disable warning in `src/lib/auth/use-current-user.ts`.
- `npm test`: 240 script tests and 55 app/auth tests passed; none skipped. The player-lane conversation and collision tests now run in this command and in `npm run test:town` (42 passed).
- Thirty-day offline diagnostics: all measured exports imported successfully; day 5 used 194,455 UTF-8 bytes and day 30 used 836,737. Northern received 29 legitimate wages by day 30. These observations supplement the asserted regression tests.
- A production build passed with `DATABASE_URL` and `XAI_API_KEY` unset; database migrations were skipped.
- Chromium browser checks at 1280×800 and 390×844 passed naming, direction help, keyboard/touch movement, pause, keyboard and actual canvas conversation entry, hidden private fields, bread repayment, download, a 4,900,879-byte older wrapped save, import, reload, quota warning and emergency backup. The phone composer and close button also stayed visible at 390×540.
- Browser tests using a mocked delayed server response passed the clock/movement hold, unsent-draft preservation and importing a different town while a request was pending. No real provider requests were made.
- PWA install pages, their assets and reload passed desktop and both iOS instruction variants.

Local browser evidence and synthetic fixtures are ignored under `artifacts/`. A physical phone keyboard and real AI dialogue were not tested. The provider gateway's shared in-process budget, retry policy and availability-by-key check remain limitations for a later online-service pass.

## Publication and rollback

GitHub merges and Grok Build publication are separate operations. This cloud workspace has GitHub access and a verified build, but no Grok Build publishing session or configured Vercel project credentials. Do not claim this release is live until the existing project has actually published it and the hosted result is verified.

Read-only requests to the hosted site succeeded. Its public JavaScript already contains some conversation improvements, but still rejects imports at 1.5 million bytes/characters and lacks this release's save-failure warning. Its exact source SHA is unknown. A Chromium check of the hosted site was blocked by certificate trust in this container; TLS verification was kept enabled.

Before updating the hosted project, export its current source as the exact rollback copy and download any browser town you want to back up. Keep these personal saves out of Git. GitHub's previous main commit is `ee5ff6575300bbe8a3ff6509ffb1bc2fcd1e85e3`; it is a source rollback reference, not proof of the current hosted revision. Reverting a release should use a new revert commit or the saved hosted export, without rewriting shared history.

Use the current integrated `main` source, not an old lane's whole-project export. If the builder supports GitHub import, select `arwyn6969/the-game` and confirm its exact commit. Otherwise apply the current-source archive through its supported import workflow. Preserve hosting, server secrets and database configuration. After publishing, verify the existing https://thegame.grok.me address, old-save import, normal conversation, reload and the backup warning using a separate test browser. Record the deployed commit when the publisher supplies it.

## Ready-to-paste instruction for the existing Grok Build project

```text
Publish the reviewed first-day release for THE GAME at the existing thegame.grok.me address. Use the current main branch of https://github.com/arwyn6969/the-game and read docs/RELEASE.md. Confirm the source commit before editing. This source combines the player interface and the simulation/save fixes; an older lane export is incomplete.

First export the currently hosted project for rollback. Import or apply the current integrated source through your supported workflow. Preserve the existing host, auth, PWA, database configuration, runtime Grok provider and server secrets. Offline play works without an API key; do not make adding a key a prerequisite or change providers.

Run the repository checks and a production build without pointing local validation at a live database. Verify desktop and phone movement/conversation, a version-1 save above the old 1.5 MB limit, reload and failed-save backup feedback. Publish this verified version to the existing project and report the actual live URL and source commit. If this project cannot fetch or import the source, report the specific supported import step; do not publish stale source or claim a publish occurred.
```

## Next iteration

After verifying the hosted release, use first-day play feedback to improve the next concrete interaction. The leading candidate is a clear offline path to agree a player shift and see attendance/wage progress. Real AI-service fault and budget tests follow when a server-side key is available; they do not block offline play.
