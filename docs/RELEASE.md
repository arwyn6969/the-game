# Trust repair release — 12 October 2026

The tested game was published to the existing https://thegame.grok.me project through Grok's **Re-Publish** control at approximately **12:11 UTC on 12 October 2026**. Grok reported **Published / Live**, and live browser checks confirmed the new assets and explicit shift controls. The user chose to publish this release first and build the fair library/community project afterward.

## Source and review

- Release source: `4e7786c30431e6701c8477d6ddb0b5ffa8ba8ca1` on `main`.
- [PR #8](https://github.com/arwyn6969/the-game/pull/8) merged the consent, conversation and recovery follow-up into [PR #7](https://github.com/arwyn6969/the-game/pull/7). The updated PR #7 passed CI before merging to `main`.
- Both merge results preserve the exact tested tree from `cd05ec331c2d8d2138fd0b838ef03fb90e855219`: `74f57bb2bec3f4042b1160c82d0b08c1f25c5dac`. That tree includes PR #7's usable-loaf update `96f25e63bd916665809ced93fee7ac2593ec92b8`.
- [Main CI passed](https://github.com/arwyn6969/the-game/actions/runs/38246523222). Grok fetched the release commit and verified its tree before copying the source, preserving existing `public/__grok` assets, `scripts/install-page.html`, startup and workspace instructions. The platform build, typecheck and 64 town tests passed.
- Detailed implementation, review and local browser evidence: [trust follow-up handoff](handoffs/trust-followup.md). Its statements about no merge/publication describe the handoff's earlier state.

## What players receive

- Explicit **Choices** show terms before bread acceptance, eating, repayment or shift changes. Free text and model output cannot create those player transactions or commitments. Used, stale or invalid quotes fail without applying the action.
- Bread acceptance records the loaf and tab together. Eating consumes the loaf while leaving its debt owed. Existing saved loaves remain usable.
- A recurring cafe shift quotes 16:00–19:00 and requires the full three game hours. Pay depends on available till funds; there is no partial wage or unpaid credit carried past midnight. Lunch cannot earn this shift's pay, and legacy shifts keep their planned hours.
- Replies stay reachable, with **Newest reply** for returning from older messages. Drafts survive actions; settled tabs no longer fill the conversation header. Keyboard and phone controls remain available.
- Unreadable saves offer complete raw download/copy, an explicitly incomplete preview and honest clipboard fallback. Blocked storage can be retried. Recovery and ordinary imports preserve the replacement town's pause and identity consistently.

Version-1 saves, the 8 MiB import limit and earlier first-day improvements remain supported. Runtime provider, auth, PWA, preview contract, host and production configuration are unchanged. Offline play needs no API key.

## Completed validation

Node 24 checks on the tested tree passed: typecheck; lint with one existing auth-file unused-disable warning; 64 town tests; and 317 total script/app/auth tests, none skipped. Thirty-day diagnostics found no world-audit issues, and all measured exports imported successfully. The day-30 export was 819,492 UTF-8 bytes, with 29 legitimate Northern wages.

The production build passed with `DATABASE_URL` and `XAI_API_KEY` unset. CI likewise blanks both values. Build invokes the migration script, but this source has no root SQL migrations, so it also returns before connecting to a database when a URL is present. Nested opt-in auth SQL is not applied.

Local browser checks at 1280×800 and 390×844 used the actual game, UI and save code with an offline mind stub. They covered explicit loaf acceptance/eating/payment, shifts, long conversation scrolling, preserved drafts, movement, pause, import and reload. Recovery preserved a 480,063-byte damaged payload exactly despite denied clipboard access; storage retry recovered an existing town. The handoff records the fixtures and hash. Earlier first-day validation also covered a 4,900,879-byte wrapped v1 save and PWA install pages; those historical checks are not fresh hosted evidence.

## Hosted verification and limits

After publication, the live page reloaded `/assets/index-BRHZJgAE.js` and `/assets/routes-DqiKlare.js`, replacing the previously observed `index-BYyPuu8a.js` and `routes-Bvog04vK.js`. This corroborates the publication and the builder's source report; no immutable deployment identifier was supplied.

The test browser had no existing town and showed the naming gate. A synthetic **ReleaseCheck** town verified naming, the initial paused 07:00 state, keyboard movement to Kevin, visible **Choices** and terms, shift acceptance with money unchanged at 4, and preservation of an unsent draft. At 390×844 the composer remained reachable; holding the phone's East control for 500 ms moved the canvas camera's x position from 173 to 301 while the clock stayed at 07:00. Reload preserved the name, location, paused clock and agreement; explicit cancellation left money at 4. Ignored screenshots are under `artifacts/trust-review/`: `published-status-20261012.png` and `live-mobile-shift-20261012.png`.

Chrome's **Allow file URLs** permission blocked hosted file-import automation. Hosted old-save import and recovery were **not verified**; their local tests remain passed. Hosted loaf/eating/payment, full shift payout, auth/PWA flows and physical phone keyboards were not exercised in this smoke test. The live badge showed **MIND ON**; checks used deterministic actions and made no dialogue request. This does not establish real provider response quality or availability.

This Chrome profile logged a React hydration warning on both the earlier and released bundles, alongside wallet-extension errors. No functional failure was observed in these checks; the cause of that warning was not established.

## Rollback evidence

Before source replacement, Grok created the private builder snapshot `/workspace/artifacts/source-before-4e7786c.tar.gz`, SHA-256 `d1eb6292334090acf4bcd0d3ba76398abd2c854f03f58f3b41b22a133accfe6b`. It is a pre-change **builder source** backup, not a confirmed exact copy of the previous hosted deployment. A local download was not completed, and no previous deployment identifier was available. Recovery from that archive still depends on its availability in the builder.

Previous GitHub main `88f5039ab5743c3b6370a64b2e6d88a7de128da0` is a separate source reference. If a rollback becomes necessary, verify the intended source before republishing through the existing project; use a new revert commit for GitHub changes rather than rewriting history. No pre-existing live browser save required backup in the test profile. Private archives and town saves remain outside Git.

## Remaining product work

The funded library/community project and Astra direction in [PR #5](https://github.com/arwyn6969/the-game/pull/5) follow this publication. Funding, reserved wages, work receipts and shared outcomes remain unimplemented. Free-form AI prose can still make unsupported claims, and private-seed filtering covers routine offline greetings rather than every online disclosure. Real provider dialogue and physical phone keyboards were not tested in the local validation pass.
