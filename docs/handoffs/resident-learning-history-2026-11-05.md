# Resident learning history handoff

5 November 2026. Sole coordinated core/UI owner: this Codex chat. Local branch
`codex/resident-growth`, checkout `a02-economy/`. Started from clean
`a2d0c86a68e2f43dd32df5dc15069a8371915f38`, retaining required resident-growth
implementation `0186b964a0590511b301d91fe0c9605872feb9fa`. Fetched main was
`c49facc52136cfda0270627e3e6aef51f5ab4588`; PR #71 is now included there, but
this local packet does not merge it or F1. Other checkouts remain untouched.

Implementation commit: **`e0e2b5c` — Show witnessed library learning history on
character cards**. The following documentation receipt records the completed
acceptance. [Consolidated evidence, screenshots, limits and unperformed human
checklist](../review/resident-learning-history-2026-11-05/README.md).

Players can open **Learning you've seen** in an ordinary character Overview.
The pure `publicLearningHistory` API exposes dated rows derived from shared
actual events or exact event-source observation receipts. It recomputes state
from that intersection. Hidden private mastery/status cannot promote it; a later
lookup alone does not invent earlier learning. Arwyn demonstrates one lookup;
Data only observes. Empty states, read-only viewing and replay hiding are honest.
No Town schema, duplicated ledger, new trial, financial rule or provider change.

Validation on Node 24.22.1 and the committed lockfile:

- 39 focused resident cases, including 12 new public-history cases, pass.
- Typecheck and lint pass; lint retains one inherited auth warning.
- 523 town cases and 1,218 script + 55 typed tests pass (town cases overlap).
- Diagnostics complete; credential-free build passes with auth enabled and
  migrations explicitly skipped. No `.env*` or app-env file was present.
- Real built Chromium at 1280×800 and 390×844 passes all seven evidence states,
  Data's observed result, keyboard expansion, phone touch scrolling, Watch/replay
  privacy, local conversation, keyboard/touch movement, pause, reload and ordinary
  download/reimport. Full economy records, balances and the one original reuse
  event remain intact. DOM text/accessibility names exclude private sentinels,
  internal event references and `plan-self-*` provenance. Zero browser errors and
  zero inference requests. Twenty-three screenshots retained with the evidence.
- `git diff --check` is clean. Final browser-harness edits passed targeted ESLint.

Sandbox loopback restrictions were resolved with normal escalation. Initial
browser failures were harness timing/input assumptions; the inherited phone
following layout needs **Return to me** before reliably reopening from the
resident strip. Watch remains on and was tested in that route. This known layout
limit and untested direct pointer access while following are documented.

No human, physical-device, screen-reader, other-engine or live-provider acceptance
was performed. No remote upload, main merge, production access, hosted publication
or spending. The next outcome is one ordinary-player explanation of the
failed/corrected/different-record library story, using the checklist. This is one
authored learning example, not general autonomous learning.
