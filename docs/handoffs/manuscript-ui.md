# Manuscript UI and procedural art

22 October 2026. UI lane based on `dd50d26`, branch `codex/manuscript-ui-20261022`.

Implemented the optional one-manuscript interface in Inventory and Library. Introduction creates the core's single blank communal manuscript on the library floor. The existing loaf, tabs and furniture remain separate. A nearby keyboard/touch button and precise ground-canvas hit target expose inspection; actual player read commands reveal the text. Carried state and the reading pose come from structured physical state, never status prose. A purple closed booklet follows the holder's interpolated position in all four walking directions; a valid reading pose opens it. Current objects are absent from historical replay.

The explicit eight-decision resident trial requires `mindAvailability.actions`, runs town time at 1× and follows the chosen resident. Its dedicated `act` runner marks requests before awaiting, records known/unknown diagnostic counts, parses the actual model action, validates the actor/session revision and invokes the core command directly. It does not use the legacy offline fallback. Existing non-physical job behavior is unchanged in this prototype. Import, replay, local-only selection and stop invalidate/pause the trial. A model wait or speech parks the session; starting another bounded trial is an explicit action with new accounting.

Owned files: `render.ts`, `TownApp.tsx`, `PlayerTools.tsx`, `CharacterSocial.tsx`, new `ManuscriptTools.tsx`, and minimal styles. Frozen types, core, prompt/gateway, auth and hosting were not edited.

Validation before integration: Node 24 locked offline install completed. Prettier applied. Focused ESLint has zero errors (the dispatch hook warning was repaired using a current callback ref). The isolated lane cannot fully typecheck or start a faithful browser preview before the core and AI modules are integrated: the real physical module is intentionally not copied or replaced by a fake module; frozen `act` additions require the core/AI guards. Actual local desktop/phone browser checks will follow on the integrated source; no live provider calls or hosting changes have occurred.

Remaining checks: integrated typecheck/lint, mocked-transport local browser paths at 1280×800 and 390×844, manual pickup/read/place, AI pending/stale response rejection, finite request parking, render/replay and portable save round trip. Synthetic responses will exercise mechanics only and cannot qualify real AI autonomy or provider capacity.
