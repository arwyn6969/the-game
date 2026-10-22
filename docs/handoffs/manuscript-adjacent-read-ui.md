# Adjacent-ground manuscript reading — UI lane

22 October 2026. Based on integrated `d27e455`, with the existing manuscript UI lane preserved. Scope: `ManuscriptTools.tsx`, the unique manuscript browser harness, this handoff and its evidence. The core owns `canReadPhysicalItem` and command execution; no renderer, gateway, prompt, save or hosting edits accompany this lane.

The Read button now uses the core's authoritative `canReadPhysicalItem(town, "player", item)` predicate. It permits a held manuscript or reading from the same/cardinal-adjacent legal ground tile in the same place, without requiring pickup. The help explains the alternatives and why another resident's held manuscript is unavailable. The existing command/result path reveals only text actually returned by Read.

The expanded local synthetic browser journeys add same-tile/cardinal-adjacent ground reads, unchanged item/custody/revision and unchanged paused canvas, disabled diagonal/distant/other-held reading, and nearby conversation entry/draft preservation. Existing touch/keyboard movement, pause, replay, reload, import/export and finite AI-session paths remain in the harness. Faithful browser execution awaits the core helper integration; no fake core or live provider is used.
