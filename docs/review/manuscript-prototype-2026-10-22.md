# Manuscript prototype — integration receipt

22 October 2026. Feature branch `codex/northern-community-evening-20261022`, checkout `community-evening-plan/`. Current main `dab257bb4911d8abf63b412aca5e427cc0dcb2ab` is an ancestor. The separate hosting owner's uncommitted Cloudflare/auth/database changes were not copied or edited.

## What this candidate establishes

One optional communal manuscript has exactly one saved location: legal ground or an actor's hand. All eight actors use the same validated commands. NPCs can approach, pick up, carry, put down, write actual original text, read the saved revision, speak or wait. A bring intention uses the existing navigation pass and respects earlier paid work and library appointments. It does not call a model at each tile. The player can introduce, carry, put down and read the manuscript through accessible controls. A selected AI resident needs to be beside or holding it to enter the trial.

Procedural Canvas art draws the actual ground/held/reading state in the current art style. The item follows walking interpolation in four directions. Historical replay omits current physical objects because historical custody is not recorded. Static furniture and decorative books are not new interactable containers.

The optional `act` route requests one strict decision, with at most one transmitted provider attempt and 1,200 output tokens per request. The UI trial permits at most eight decisions, one pending request at a time. Movement suppresses further requests until the intention resolves. Speech/wait parks the trial. Failure pauses it without authored action or dialogue. Reloaded pending requests do not automatically restart. Actual item revisions and current reach are checked before execution, independently of the AI response.

The four existing AI routes remain valid without configuring `act`. The new migration only expands the existing authenticated budget allowlist; its source is committed, but it has not run against production. Action requests count as background work and do not borrow the player conversation exemption.

## Validation

- Node 24 locked offline install succeeded.
- Full automated suite: **904/904 JavaScript tests and 55/55 typed tests passed**. The first sandboxed run hit an existing localhost port-binding test's `EPERM`; rerunning with local socket permission passed without changing assertions.
- `npm run test:town`: **367/367 passed**. Includes 14 physical core cases and a new cross-layer parser → executor → navigation → save/reload → actual text regression.
- `npm run lint`: zero errors; one existing unused-disable warning in `src/lib/auth/use-current-user.ts`.
- `npm run diagnose:town` completed; its observations are diagnostic evidence, not a release verdict.
- Credential-free `npm run build` passed. Migration runner confirmed `DATABASE_URL` absent and skipped database execution. Existing chunk-size and dependency directive warnings remain.
- Integrated provider/prompt/grounding checks passed 22/22; independent backend routing/budget/parser checks passed 47/47.
- Typical actual-core prompt sizes measured without a provider: 3,887 characters for the blank ground manuscript, 4,121 while held and 5,443 after a maximum-length read. These are character counts, not token or cost estimates.

The final UI typecheck and desktop/phone browser receipts are added after their integrated journeys finish. Synthetic model responses validate mechanics, call cadence and failure handling only; they do not establish live model quality, latency or cost.

## Next release gate and deferred work

Complete local UI acceptance, review this candidate and reconcile its narrow pool/budget edits with the separate hosting owner's adapter changes. Then qualify an explicitly configured action route in one bounded real-AI trial before enabling it for players. Record actual attempts, tokens, elapsed time and failures; unknown usage stays unknown. Hosting merge, publication, route configuration, budget changes and production migration remain separate operator actions.

The full Northern reading/play programme remains the next product packet, with its roles and acceptance tasks in [Northern's Park Players](../design/northern-park-players.md). Invitations, accepted roles, collective piece choice, rehearsal decisions, participation/consequences and a return summary are not implemented by this physical proof. Neither are table surface slots, hand-to-hand giving, movable furniture, crafting, a general inventory grid, bespoke reach animation, continuous shared-server activity or the release-wide removal of older authored/offline NPC behavior. These are explicit scope boundaries, not claims of completed gameplay.

Lane receipts: [core](../handoffs/manuscript-core.md), [AI](../handoffs/manuscript-ai.md), [UI](../handoffs/manuscript-ui.md). Pre-implementation source comparison: [audit](physical-source-audit-2026-10-22.json).
