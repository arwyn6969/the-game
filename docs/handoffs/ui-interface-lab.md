# UI interface comparison handoff

22 October 2026. Owner: UI comparison chat `01a163ef-0e5c-7fa1-a877-54ba8f8b8176`.

## Result

Three working arrangements of the real game interface, with an Original comparison option: Plaza Cream floating windows and action dock; Hobbs Hearth resident sidebar and central windows; Library Ink tool sidebar and reading desk. Larger reading text, paper surfaces, reusable pixel SVG icons, full scrolling Choice terms and a compact reply composer are implemented. The responsive candidates share one mobile reading-sheet interaction.

Source: `codex/ui-interface-lab`, based on `adb1f47`; main fetched at `dab257b`. Explicit dependency: PR #41 / `codex/cloudflare-hosted-ai`. This UI-only branch retains the latest hosted recovery behavior. It does not integrate or redeploy the parent work.

Local preview: `http://127.0.0.1:8186/?uiPreview=1&skin=plaza-cream`. The comparison is opt-in; the normal URL keeps the original arrangement and colors. The comparison bar stays outside the town focus/dismissal boundary. The same TownApp and canvas remain mounted throughout selection; appearance preferences are outside the Town schema.

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
