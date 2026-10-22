# Manuscript prototype — integration receipt

22 October 2026. [Draft PR #42](https://github.com/arwyn6969/the-game/pull/42), feature branch `codex/northern-community-evening-20261022`, checkout `community-evening-plan/`. Current main `dab257bb4911d8abf63b412aca5e427cc0dcb2ab` is an ancestor. Final runtime source is `aed388c`, followed by test receipts and documentation. The separate hosting owner's uncommitted Cloudflare/auth/database changes were not copied or edited.

## What this candidate establishes

One optional communal manuscript has exactly one saved location: legal ground or an actor's hand. All eight actors use the same validated commands. NPCs can approach, pick up, carry, put down, write actual original text, read the saved revision, speak or wait. A bring intention uses the existing navigation pass and respects earlier paid work and library appointments. It does not call a model at each tile. The player can introduce, carry, put down and read the manuscript through accessible controls. A selected AI resident needs to be beside or holding it to enter the trial.

Procedural Canvas art draws the actual ground/held/reading state in the current art style. The item follows walking interpolation in four directions. Historical replay omits current physical objects because historical custody is not recorded. Static furniture and decorative books are not new interactable containers.

The optional `act` route requests one strict decision, with at most one transmitted provider attempt and 1,200 output tokens per request. The UI trial permits at most eight decisions, one pending request at a time. Movement suppresses further requests until the intention resolves. Speech/wait parks the trial. Failure pauses it without authored action or dialogue. Reloaded pending requests do not automatically restart. Actual item revisions and current reach are checked before execution, independently of the AI response.

The four existing AI routes remain valid without configuring `act`. The new migration only expands the existing authenticated budget allowlist; its source is committed, but it has not run against production. Action requests count as background work and do not borrow the player conversation exemption.

## Validation

- Node 24 locked offline install succeeded.
- Final integrated `npm run typecheck` passed after the UI result-narrowing fix.
- Full automated suite: **904/904 JavaScript tests and 55/55 typed tests passed**. The first sandboxed run hit an existing localhost port-binding test's `EPERM`; rerunning with local socket permission passed without changing assertions.
- `npm run test:town`: **367/367 passed**. Includes 14 physical core cases and a new cross-layer parser → executor → navigation → save/reload → actual text regression.
- `npm run lint`: zero errors; one existing unused-disable warning in `src/lib/auth/use-current-user.ts`.
- `npm run diagnose:town` completed; its observations are diagnostic evidence, not a release verdict.
- Credential-free `npm run build` passed. Migration runner confirmed `DATABASE_URL` absent and skipped database execution. Existing chunk-size and dependency directive warnings remain.
- Integrated provider/prompt/grounding checks passed 22/22; independent backend routing/budget/parser checks passed 47/47.
- Typical actual-core prompt sizes measured without a provider: 3,887 characters for the blank ground manuscript, 4,121 while held and 5,443 after a maximum-length read. These are character counts, not token or cost estimates.
- Final focused parser/provider/core tests passed 9/9 after follow-up fixes. An accidental run with the machine's default Node 23 rejected direct TypeScript imports; the required Node 24 rerun passed.
- Existing built-preview browser regressions passed at 1280×800 and 390×844, covering keyboard/touch movement, pause, conversation entry, reload, portable import/export, identity import, library and interruption journeys. [Saved results](manuscript-2026-10-22/existing-browser-regressions.json). External requests were blocked by the isolated browser fixture.

- New manuscript [desktop/phone journeys](manuscript-2026-10-22/README.md) passed: actual pickup/write/read/place, all four carry directions, keyboard/touch movement, replay exclusion, reload/import/export, nearby invitation guard, wait parking, late valid response after player/clock changes, stopped-response rejection, hidden-tab dispatch prevention and unavailable inference. No page errors or horizontal overflow. Three inspected screenshots and a machine receipt are saved alongside the harness.

Synthetic model responses validate mechanics, call cadence and failure handling only; they do not establish live model quality, latency or cost. The final build was repeated after the UI guards and passed without database credentials. The current PR's required `verify` check remains its own gate; local success does not replace it.

## Next release gate and deferred work

The later authorized [first real-AI trial](northern-real-ai-2026-10-22/README.md) completed: four requests and $0 cost demonstrated the physical tool bridge, but unsupported financial claims exposed a narrative-grounding failure. Correct the small own-facts/document-provenance gap and qualify that correction before enabling actions or expanding the event. Review this candidate and reconcile its narrow pool/budget edits with the separate hosting owner's adapter changes. Hosting merge, publication, route configuration, budget changes and production migration remain separate operator actions.

The full Northern reading/play programme remains the next product packet, with its roles and acceptance tasks in [Northern's Park Players](../design/northern-park-players.md). Invitations, accepted roles, collective piece choice, rehearsal decisions, participation/consequences and a return summary are not implemented by this physical proof. Neither are table surface slots, hand-to-hand giving, movable furniture, crafting, a general inventory grid, bespoke reach animation, continuous shared-server activity or the release-wide removal of older authored/offline NPC behavior. These are explicit scope boundaries, not claims of completed gameplay.

Lane receipts: [core](../handoffs/manuscript-core.md), [AI](../handoffs/manuscript-ai.md), [UI](../handoffs/manuscript-ui.md). Pre-implementation source comparison: [audit](physical-source-audit-2026-10-22.json).
