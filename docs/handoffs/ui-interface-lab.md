# UI interface comparison handoff

22 October 2026. Owner: UI comparison chat `01a163ef-0e5c-7fa1-a877-54ba8f8b8176`.

## Result

Three working arrangements of the real game interface, with an Original comparison option: Plaza Cream floating windows and action dock; Hobbs Hearth resident sidebar and central windows; Library Ink tool sidebar and reading desk. Larger reading text, paper surfaces, reusable pixel SVG icons, full scrolling Choice terms and a compact reply composer are implemented. The responsive candidates share one mobile reading-sheet interaction.

Source: `codex/ui-interface-lab`, based on `adb1f47`; main fetched at `dab257b`. Explicit dependency: PR #41 / `codex/cloudflare-hosted-ai`. This UI-only branch retains the latest hosted recovery behavior. It does not integrate or redeploy the parent work.

Local preview: `http://127.0.0.1:8186/?uiPreview=1&skin=plaza-cream`. The comparison is opt-in; the normal URL keeps the original arrangement and colors. The compact Interface menu shares the existing status row, with its React ownership outside the town focus/dismissal boundary. It reserves no separate toolbar row during play. The same TownApp and canvas remain mounted throughout selection; appearance preferences are outside the Town schema.

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

Implementation commit `a2e2246` was pushed to `origin/codex/ui-interface-lab`. Creating the draft PR was then rejected by automatic approval review: it considered publishing source/assets/documentation in a PR beyond the user's local-preview authorization. No PR was created, and no alternate PR-creation path was attempted. The local comparison and checks are complete; opening the draft PR awaits explicit user authorization.

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
