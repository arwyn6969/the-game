# Northern: reading a manuscript beside him

22 October 2026. Follow-up on [draft PR #42](https://github.com/arwyn6969/the-game/pull/42), explicitly dependent on the manuscript and grounding work. The user authorized adjacent-ground reading, clear current action options, and one further bounded real-AI trial.

## Change and boundaries

The shared engine/UI read rule permits the actor's own held manuscript, or a manuscript on the same ground tile or one tile north, south, east or west in the same zone. It returns the current saved words without pickup, relocation, revision change or ownership change. Distant/diagonal/across-zone ground items, blocked item tiles, another holder and stale revisions remain unavailable. Writing still requires holding.

The observation now contains current action templates with exact item IDs/revisions. Bring options include allowed destinations; generated speech/manuscript fields have explicit limits. The AI chooses freely from those options, and the engine rechecks its proposal. Metadata does not disclose unread words. Fiction remains permitted, and authored claims remain unverified.

The trial retains the same synthetic town, starting positions, exact free model, 1,200-output-token cap, 12-second deadline, single attempt, pacing and stop rules. Its allowance is at most eight and is reduced to remaining free requests under the saved 24/day operator ceiling. The preflight at 14:05 UTC showed 20 already used, leaving at most four for this trial. Production limits, routes and ledgers are unchanged.

## Local verification before the real trial

The [exact rejected seventh read](ground-read-replay.json) from the previous real trial now succeeds at source `7a5142b`: Northern reads his actual saved ledger at the noticeboard while the manuscript stays on the ground. Every item field, inference-usage counter and financial field stays unchanged; export/import preserves the item. This is a local replay with zero provider requests, not a new model choice.

Combined source `a311124` passed Node 24 typecheck, lint (zero errors, one inherited unused-disable warning), all **920 script + 55 typed tests**, **383 town tests**, diagnostics and a credential-free build. `DATABASE_URL` was absent and migrations skipped. The first full-suite invocation hit the sandbox's loopback-socket restriction in the existing port-collision test; the complete rerun with loopback access passed. Dense full-page/action-option prompt coverage remains below the unchanged 8,000-character cap.

The browser receipt and real-provider outcome will be recorded here after completion. No real generation has been performed for this follow-up yet.
