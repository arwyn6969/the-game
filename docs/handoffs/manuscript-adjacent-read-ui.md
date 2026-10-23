# Adjacent-ground manuscript reading — UI lane

22 October 2026. Based on integrated `d27e455`, with the existing manuscript UI lane preserved. Scope: `ManuscriptTools.tsx`, the unique manuscript browser harness, this handoff and its evidence. The core owns `canReadPhysicalItem` and command execution; no renderer, gateway, prompt, save or hosting edits accompany this lane.

The Read button now uses the core's authoritative `canReadPhysicalItem(town, "player", item)` predicate. It permits a held manuscript or reading from the same/cardinal-adjacent legal ground tile in the same place, without requiring pickup. The help explains the alternatives and why another resident's held manuscript is unavailable. The existing command/result path reveals only text actually returned by Read.

The expanded local synthetic browser journeys add same-tile/cardinal-adjacent ground reads, unchanged item/custody/revision and unchanged paused canvas, disabled diagonal/distant/other-held reading, and nearby conversation entry/draft preservation. Existing touch/keyboard movement, pause, replay, reload, import/export and finite AI-session paths remain in the harness. Faithful browser execution awaits the core helper integration; no fake core or live provider is used.

## Integrated result

Integrated root core/UI `7a5142b` and state-aware AI prompt `a311124`; tested source merge `457322c7a835126bbc68a5c1c5b5f8f72ad6db24`. Typecheck and focused ESLint passed. Both 1280×800 desktop and 390×844 touch-browser journeys passed all new and retained cases with synthetic transport. Read did not alter the ground item's custody, revision or content, and the paused canvas was byte-identical before/after, ruling out a phantom held pose. Nearby conversation entry and per-resident draft preservation also passed. The mobile conversation closure uses the existing Escape path after draft verification to avoid clicking an already-closing panel during focus restoration.

The [dedicated receipt and inspected screenshots](../review/manuscript-ground-read-2026-10-22/README.md) record the result. No credentials, live provider calls, production settings, renderer changes or hosting changes were used. The local QA preview was stopped after verification.
