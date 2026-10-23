# UI interface comparison handoff

22 October 2026. Owner: UI comparison chat `01a163ef-0e5c-7fa1-a877-54ba8f8b8176`.

## Result

Three working arrangements of the real game interface, with an Original comparison option: Plaza Cream floating windows and action dock; Hobbs Hearth resident sidebar and central windows; Library Ink tool sidebar and reading desk. Larger reading text, paper surfaces, reusable pixel SVG icons, full scrolling Choice terms and a compact reply composer are implemented. The responsive candidates share one mobile reading-sheet interaction.

Source: `codex/ui-interface-lab`, based on `adb1f47`; main fetched at `dab257b`. Explicit dependency: PR #41 / `codex/cloudflare-hosted-ai`. This UI branch retains the latest hosted recovery behavior. The original local comparison did not integrate or redeploy the parent; the authorised release below supersedes that delivery boundary.

Local preview: `http://127.0.0.1:8186/?uiPreview=1&skin=plaza-cream`. The original comparison was opt-in; the authorised release below promotes Hearth and the menu to the normal URL. The compact Interface menu shares the existing status row, with its React ownership outside the town focus/dismissal boundary. It reserves no separate toolbar row during play. The same TownApp and canvas remain mounted throughout selection; appearance preferences are outside the Town schema.

## Validation actually run

- Node 24.19.0; typecheck passed.
- Full lint passed with zero errors; one inherited unused eslint-disable warning in `src/lib/auth/use-current-user.ts` remains.
- `npm test`: 897 script tests and 55 typed auth/data tests passed (952 total).
- `npm run test:town`: 349 passed.
- `npm run diagnose:town`: ran successfully; its observations are not a release verdict.
- Authentication invariant: preview and build agree, sign-in enabled.
- Local Vercel-target build and Cloudflare `/thegame` build passed without database credentials or migrations. Existing dependency bundling warnings remain.
- Focused interface browser receipt: 19 desktop checks and 17 phone checks passed. Covers keyboard/touch movement, normal conversation, export/import/reload, four-layout switching, exact paused town/save preservation, stable canvas/panel nodes, draft/tab/Choices/toolbar-focus retention, visible reply/send targets, unavailable AI and a delayed synthetic reply applied exactly once after switching. Wide real-component captures were also produced.
- Full Plaza accessibility harness: 54 audited surfaces and 27 essential checks passed, no detected WCAG or best-practice violations, no failed checks, and no external browser requests. Includes 1280×800, 390×844, 640×400, text enlargement/spacing and 320px reduced-motion journeys.
- Hearth and Library Ink: 40 bounded contrast/overflow surfaces passed across desktop, phone, narrow and short viewports.
- Independent source review checked stable mounting, UI preference storage, single-panel behavior, form/action handlers and responsive fallbacks. Two layout findings were fixed and retested.

Receipts are retained under ignored `artifacts/ui-skins/` and `artifacts/ui-skins-a11y/`. Representative screenshots are committed under `docs/design/ui-interfaces/`.

The first sandboxed unit run had three localhost-listen permission failures (894/897 passed); the same complete suite passed with local networking permitted. `npm ci` could not resolve registry.npmjs.org. Development used an APFS clone of the existing dependency installation after verifying identical package-lock hashes; no dependency or lockfile changes were made.

## Practical limits

Thirteen incomplete automated accessibility rule results require manual review. Automated checks do not establish WCAG conformance, screen-reader comfort, a physical phone keyboard or native zoom usability. AI timing tests used intercepted synthetic responses; no new live provider call or wallet signing was performed.

The original world/sprite/portrait renderer is retained. Generated concept scenery and large illustrated portraits are separate future artwork. Draggable windows, simultaneous utility panels and bubbles following moving residents are also separate features. The shared reply-composer improvement is present in Original as well as the three candidates.

The live game, authentication/provider configuration, save schema, simulation and wallet spending rules were not changed. No merge or production publication has been performed.

## Source review delivery

Implementation commit `a2e2246` was pushed to `origin/codex/ui-interface-lab`. Creating the draft PR was then rejected by automatic approval review: it considered publishing source/assets/documentation in a PR beyond the user's local-preview authorization. No PR was created, and no alternate PR-creation path was attempted. That was the local-preview delivery boundary. The user explicitly authorised getting these changes live on 23 October, superseding the earlier publication block; release work is recorded below.

## Compact selector follow-up

The user requested less screen space for skin controls. One native Interface menu now replaces the four always-visible buttons and shares the existing status row. Its React ownership stays outside TownApp; switching does not remount the game. It measures about 88 × 32px on desktop and 88 × 44px with a coarse pointer. The separate comparison bar reserves zero height during play. Before town entry a small fallback row keeps the menu available.

Typecheck and lint passed (the same inherited unused-disable warning remains). The updated focused browser receipt passed 39 checks: 20 at 1280 × 800 and 19 at 390 × 844, including all four interfaces at 320px. No horizontal overflow, browser exceptions or console errors were detected. Native Escape retained the conversation node, Together tab, exact draft and saved town; switching retained focus, stable game nodes and the existing delayed-reply behavior. The harness now waits for the preceding close action's intentional canvas-focus frame before focusing the selector. Broad unit/build/accessibility results above predate this bounded follow-up and were not rerun.

Fresh receipt: ignored `artifacts/ui-skins-compact/report.json`. Current local-browser proof: `docs/design/ui-interfaces/compact-interface-menu.png`. This follow-up has not been pushed or published.

## Compact main toolbar follow-up

The user requested more space for the town after compacting the skin selector. The three candidate skins now use 18px icons beside their labels, tighter dock padding, 40px desktop buttons and 44px touch buttons. Wallets and Stamps use shorter visible captions with their full accessible names and titles retained. All seven tools fit at 630px; smaller viewports scroll the same single row. Library Ink's desktop tool rail narrows from 160px to 144px. An inset focus outline stays visible inside the scrolling row. No action handlers or game state changed.

Fresh isolated Hearth measurements: desktop dock 64.78px → 48.38px; 390px and 630px dock 89.55px → 52.38px (37.17px recovered). No document overflow was detected across all four interfaces at 1280px, 390px and 630px. The strict 320px target check exposed inherited Original Go to/Help widths of 42.66px/38.84px; a preview-only 44px minimum width fixes those controls. The ordinary game URL's Original controls are unaffected.

The final focused receipt passed 48 checks (24 desktop, 24 phone), with zero browser or console errors. It checks all seven controls in all four interfaces, 44px touch targets, 320px Help access through the scrolling row, and the existing conversation/draft/save/movement/reload/delayed-reply journeys. The same paused fixture gained 16.41px of map height on desktop and 37.17px on phone; the phone map also starts 37.17px higher. Typecheck, lint and changed-file formatting passed, with the same inherited unused-disable lint warning. Broad unit/build/accessibility results were not rerun for this presentation-only follow-up. Fresh geometry, summary, `checks/report.json` and captures are under ignored `artifacts/ui-tools-compact/`; the representative proof is `docs/design/ui-interfaces/compact-main-toolbar.png`. This follow-up remains local and has not been pushed or published.

## Compact clock controls follow-up

The user requested pause/speed controls beside the clock. The three candidate skins now group clock and transport in one compact header section: 36px fine-pointer desktop buttons and 44px responsive/touch buttons. Pause is an icon with its existing accessible name and a tooltip; 1×, 4× and Hour remain text. At 630px the entire header fits one line. Below 560px brand and money sit above the clock/control row; wrapping handles enlarged text and extra replay content. The wrapper uses display:contents plus visual ordering for Original, retaining its existing visual arrangement. No clock/speed action handler or town schema changed.

Fresh Hearth measurements: HUD 62.19px → 45px at 1280px, 91.39px → 53px at 630px, and 91.39px → 81px at 390px. The same fixture gains 17.19px, 38.39px and 10.39px of map height respectively. Clock and controls remain centered on the same row at ordinary text size; no overflow was detected across all four interfaces at 1280/630/390/320px.

The stable focused receipt passed 52/52 checks (25 desktop, 27 phone) with zero browser or console errors. Pause/1×/4×/Hour actions and pressed states, focus without speed/save changes, same-row alignment for all three candidates at 320/390/630/1280px, 44px touch targets, Original compatibility, and bounded 320px enlarged-text wrapping passed. Existing conversation, save, movement, reload, import/export and delayed-reply checks still pass. The harness waits for asynchronous coordinated saves and respects the existing Hour behavior of advancing up to 60 minutes or stopping for a job. A transient desktop close-panel navigation wait during editing did not recur on stable source. The 320px canvas retains its existing minimum height; the taller viewports gain the space measured above.

Typecheck, lint and changed-file formatting passed, with the same inherited unused-disable warning. Broad unit/build/accessibility results were not rerun for this presentation-only follow-up. Native local-browser proof: `docs/design/ui-interfaces/compact-clock-controls.png`. Baselines and fresh synthetic checks are under ignored `artifacts/ui-clock-compact/`. This follow-up remains local and has not been pushed or published.

## Authorised production release — 23 October 2026

The user asked to get these changes live. Hobbs Hearth becomes the ordinary-URL default; all four styles remain in the compact Interface menu. URL skin → saved appearance preference → Hearth is preserved, including safe fallback for denied storage and invalid IDs. Appearance preferences stay separate from version-2 town saves. The uiPreview flag is no longer required, and former preview-only sizing/menu paths now apply consistently.

The already-deployed hosting/recovery prerequisite PR #41 had a passing current Verify and no unresolved review threads. It was merged as `b8381df` and incorporated into this branch before release. The UI-only diff was independently reviewed against `adb1f47`: no simulation, save-schema, auth, provider or accounting changes, no lost gameplay/form/clock callbacks, and a stable unkeyed TownApp. Review identified low-contrast accepted-AI badge text in the three skins; it now uses the light chrome text colour. Existing remote production settings, routes, secrets and bindings are to be preserved.

Fresh local checks: 965 application tests passed (910 script tests and 55 typed auth/data tests), 349 town tests passed, typecheck and lint passed with the inherited unused-disable warning. Diagnose completed as observations. Thirteen appearance-preference tests cover URL/storage/default/denial behavior. The normal-URL release harness passed 67 browser checks and the default-Hearth accessibility audit passed 54 surfaces/27 essential checks with zero WCAG or best-practice violations. Fourteen incomplete accessibility results retain manual review limits. The entry menu now uses a named banner landmark. The Node build passed and explicitly skipped database migrations. Fresh results are under `artifacts/ui-release-default/`. CI now runs the focused normal-URL interface browser harness alongside existing delayed-AI checks.

Target: `https://www.arwyn.party/thegame/`, existing Worker `the-game-production`, production Hyperdrive `5992f69d7a4d41c1b5dcacd6f2b92887` and Images binding. The first live audit found stamp/Leather runtime `858ecaac181a`, Worker `2aa20e83-310a-45eb-a211-811618202e10`, and incorporated exact source dependency `60630d5`. Before UI publication, the library-meeting owner independently merged and deployed PR #44. Current main is now `f7d5ae5`, preserving manuscript prerequisite #42, hosting/recovery #41 and stamp/Leather #43; live runtime `2b2b8a4dbb7a62b3d5db20b8f2aca4ec4396a7f1` is Worker `8852b4fc-0ca5-4217-8f71-6c7420cd0d72`. This current-main dependency is incorporated into the UI release, superseding the earlier PR #43-only review stack. Other owners’ PR heads/status are untouched. Current `8852b4fc` is the immediate UI rollback reference; the prior `2aa20e83` remains the library release rollback reference. [The published library release](../review/library-meeting-release-2026-10-23/README.md) records exact source, migrations, production configuration and acceptance limits. No migration, secret upload or paid model/wallet operation is part of this UI release.

The combined UI/current-production head requires fresh regression/build/CI checks before deployment, including manuscripts and library meetings alongside the interface journeys. The integration preserves the already-live manual-action lane (`actionConcurrent: 1`), global/player limits, interactive reserves, `$0`-only routing and `backgroundConcurrent: 0`; no UI release step changes these settings. The existing forward migrations remain applied and must not be rerun through validation builds. Deployment will use the generated production configuration with `--keep-vars`, preserving remote secrets, variables, bindings and routes. The production account, Worker and exact current version must be rechecked immediately before publication so a concurrent release cannot be overwritten.

The current sheet-position correction reserves both above-world town tools and the resident ribbon while excluding bottom docks and side rails. Geometry observers clean up on replacement/unmount; the sheet inset does not resize observed controls or trigger the child-list observer. The combined browser run must confirm control hit targets and panel non-overlap across the preserved layouts. These corrections and current-main integration have no new pass claim until their fresh combined checks complete.

Current-main candidate `d3e9216` passed 1,048 script tests and 55 typed tests locally, typecheck/lint (one inherited warning), the full delayed-AI/replay journey, 67 interface checks, 30 meeting/manuscript assertion groups, 12 focused feature axe states, and strict desktop/phone interruptions. The full accessibility audit passed 54 surfaces/27 essential checks with zero detected violations; 19 incomplete results, plus five in feature audits, retain manual-review limits. Independent review and 24 computed contrast checks across all four interfaces passed. Production Cloudflare build and Wrangler packaging passed without migrations.

[Runtime Verify 39998085745](https://github.com/arwyn6969/the-game/actions/runs/39998085745) passed typecheck, lint, 415 town tests, the full application suite, authority experiments, diagnostics, Node build, built-game browser checks and both fixture-wallet stamp suites. Chromium dependency installation took 7 minutes 44 seconds. The 20-minute job limit then cancelled the interface harness during the phone journey and skipped later accessibility/private-wallet/build steps; this is not a passing CI claim. The job allowance is now 40 minutes, retaining every check and assertion. A fresh current-head run is required for main integration. The actual deployment and public verification receipt will follow this candidate evidence.
