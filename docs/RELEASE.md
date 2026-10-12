# Character social UI release — 12 October 2026

The character cards and town conversation view are live at https://thegame.grok.me. The user asked Codex to finish PR #23 and get it live. PR #23 was already merged; Codex republished the existing Grok project at approximately **21:12 UTC** and observed **Published / Live**, then independently reloaded the public site. The existing host, access setting, provider configuration and platform assets were preserved.

## Source and checks

- [PR #23](https://github.com/arwyn6969/the-game/pull/23) merged as `8a35f3c877297b7a588aa8d38d6590e486f917cd`. Its [CI passed](https://github.com/arwyn6969/the-game/actions/runs/38306356336).
- The builder reported its current preview as main `bebee6e6a4e66a755797c10138f43cde5999658c`, Git tree `98088b36bcc38eeb644f1808f8b7c55968819c99`. This includes the subsequent shortcut cleanup and remembered-deeds changes in PRs #24–27. [Main CI passed](https://github.com/arwyn6969/the-game/actions/runs/38307500398): typecheck, lint, town tests, full tests, diagnostics and production build with database/model credentials blank.
- Codex reran the current full suite on Node 24.19.0: **381 script + 55 app/auth tests = 436 passed**, no failures or skips. The original feature's broader local browser validation is recorded in [its handoff](handoffs/character-social-ui.md).
- Before publication, a fresh preview town verified name entry, all eight portrait controls and the Overview, Strengths and Progress tabs. No model request or production database migration was made in these release checks.

The builder's complete directory was not compared byte for byte with Git. Existing platform/share-image differences remain. No immutable deployment identifier was supplied.

## Independent hosted evidence

After publication, the public DOM and an independent HTTP read both referenced:

- `/assets/styles-CLWjHggc.css`
- `/assets/index-aLD7_fZq.js`
- `/assets/routes-Caou6kDT.js`

The prior public JavaScript was `index-DfOxM9UA.js` / `routes-tO5YEMX5.js`. The new route contains the character social controls and the latest closed-bread-tab follow-up, which was absent from the prior route. This corroborates publication of the current candidate rather than only a successful button click.

Hosted checks at **1280×800** and **390×844** verified character overview cards, the rapport dial, conversation history, the Town life transcript, explicit watch mode, camera following and Return to me. The phone card retained access to the portrait strip and time controls; neither layout had horizontal overflow. Temporary viewport overrides were reset afterward.

The existing browser town was exported before publication and after reload/inspection. Identity, all actor locations and balances, every original memory text, agreements and social history were retained. Day 1, 07:00 and Pause were retained. Export bytes differ only because save loading added explicit `seed: false` to the existing Data and Amelia memories; no memory text was changed or added. Private exports and screenshots remain ignored under `artifacts/social-release/`.

This Chrome profile still reports the previously documented React hydration warning alongside wallet-extension errors. No functional failure was observed. This is not a claim of an error-free browser session. Hosted file import/recovery, new NPC exchanges with score/plan changes, real provider replies, full wage/bread transactions and physical-device keyboards were not exercised in this release smoke check; the relevant local regressions remain passed.

## Recovery

The prior public bundle identifiers and the local before/after town exports are recorded in the ignored release artifacts. The GitHub runtime source before this publication was already merged; no Git history was rewritten. To recover an earlier application version, verify the intended Git source and use a new revert commit and this same project's publication control, preserving platform assets and browser towns. There is no verified immutable deployment ID for one-click rollback.

The records below describe earlier releases.

---

# Graphics release — 12 October 2026

The town graphics are live at https://thegame.grok.me. The user authorized the release and sending the import/publication instruction to the existing Grok Build chat. Codex used that project's **Re-Publish** control, observed **Published / Live**, and independently reloaded the public site to verify the new artwork and asset versions. The existing hosting project and access setting were preserved.

## Source and validation

- [PR #15](https://github.com/arwyn6969/the-game/pull/15) merged to `main` as `6de583c6373d0fc0395132ea742ec0745787c799`.
- Release tree: `8e32159bc05ea59d952e139a0aaf09bccef08a5c`, identical to the tested graphics branch at `70ff38f1db170631ee8c0ad073158de321f9c36e`.
- [PR CI](https://github.com/arwyn6969/the-game/actions/runs/38266203155) and [merged-main CI](https://github.com/arwyn6969/the-game/actions/runs/38267369548) passed.
- Local Node 24.19.0 checks passed: clean locked install, typecheck, lint with one inherited warning, 65 town regressions, 263 script tests plus 55 app/auth tests, diagnostics, production build and the portable desktop/phone graphics checks. See [the graphics record](design/town-graphics.md).
- Grok reported importing that exact SHA/tree, preserving its new neon `public/og.jpg` and `public/x-banner.jpg`, install assets/page, startup, private workspace configuration and existing auth/PWA/preview contracts. Those platform/share-image differences mean the complete builder directory is not asserted to be byte-identical to the Git tree.
- Grok reported passing typecheck, lint (one existing warning), 65 town tests, production build and desktop/phone save, interaction and renderer checks. Validation used no database URL and made no model call. Source preservation archives stayed outside Git.

## Hosted evidence

The public DOM after publication references:

- `/assets/styles-DBNjT0WP.css`
- `/assets/index-s7xxS05I.js`
- `/assets/routes-BqltyZ2C.js`

These match Grok's validated build report. The builder had reported the earlier public route as `routes-F9dsbGkd.js`. Independent screenshots show the neon interface, warm café planks/rug, detailed furniture/residents, readable name labels and new square art. Hosted layouts at **1280×800** and **390×844** had no horizontal overflow; phone movement controls stayed visible. Viewport overrides were reset afterward.

An existing browser town reloaded with the same identity, day/time, wallet, cast, favours and notices, with Pause selected. Before/after downloads retained all original memory texts. An already-queued background mind job completed during this window, adding chats and moving residents; the snapshots are therefore not claimed to be byte-identical. Seed/protected flags were repaired by the existing save validator. No live dialogue was submitted for this smoke check.

Private town backups and screenshots are under ignored `artifacts/graphics-release/`; they are not committed. `published-status.png`, `live-desktop.png` and `live-mobile.png` record the publication and hosted layouts. The public game remains open and paused in the in-app browser. Hosted old-save import/recovery, full gameplay transactions, physical phone keyboards and provider response quality were not independently exercised in this release smoke check.

## Recovery

The previous GitHub main was `65d93a905f256abdcdddc21d7612e7d4b8b07d53`. The builder file view showed `source-before-6de583c.tar.gz` and a preservation manifest after the import. They are private builder-source recovery artifacts, not an immutable identifier for the former deployment. No immutable deployment ID was supplied; publication is corroborated by the UI status, new public assets and visible artwork. Use a new revert commit and the existing project's publishing workflow if recovery is required, preserving browser towns and platform assets.

The earlier trust-repair release record below is historical; its source and bundle identifiers describe that release.

---

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
