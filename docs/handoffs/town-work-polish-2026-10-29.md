# Work choices, funding and navigation polish

Owner: Codex polish chat. Branch `codex/town-work-polish-20261029`.
Explicit dependency: PR #61 at `cd44d165002ddd75b6c92e5ce0efb9ac4fecd568`.
This patch builds on its control/library repairs; integrate #61 first, then
refresh and verify this branch against main. Detailed private testing notes
remain local and are not part of this implementation packet.

Resident overviews now preview their existing structured choices. Review
choices opens the Together tab, expands the terms and focuses its summary.
Choices initially open when entering a conversation; a deliberate collapse
survives clock ticks and tab changes. Reviewing has no financial or agreement
effect. Distant/replay choices remain readable and cannot be accepted.

Cafe offers state the coins available after payroll and existing reservations,
the five-coin requirement and that the till does not refill overnight. An
unfunded offer shows its actual available amount. Grocery guidance distinguishes
recorded agreements and earned claims from a new shift offer. These are views
of existing rules: no payroll, transfer, creditor, schema or save behavior changes.

Destination and walking labels use PlaceId titles, and actual row-zone labels
recognize Townhouse Row. How to play uses the active interface's surface color.
Existing resident identities, authored dialogue and AI/hosting contracts remain.

## Verification

Node 24.19.0 passes 1,111 script tests and 55 typed tests. The four new guidance
regressions cover nonmutating quote previews, protected payroll, a real sale
changing funding availability, serialization and accurate grocery guidance.
The targeted 51-test set also covers existing wages/legacy claims and commerce.
Typecheck, lint (one inherited unused-disable warning) and a credential-free
build pass; DATABASE_URL is absent and production migration is skipped.

Browser verification covers desktop 1280×800 and phone 390×844, including
explicit review without town writes, focus, retained disclosure choice,
movement, local conversation, pause, reload and import/export. Final browser
and interface results are recorded when the candidate completes those gates.
Raw synthetic towns, screenshots and reports remain ignored in artifacts/.

## Next milestones

1. A useful repeatable local week: clear funded work, useful purchases and a
   reason to return the next day. Specify funding and optional participation;
   protect earned wages and prove conservation, duplicate protection and reload.
2. A dependable optional AI social scene: legal actions, useful speech and a
   coherent ending when a final request fails or the cap is reached. Retain
   limits and real accounting; qualify with synthetic cases before free live use.
3. A private authoritative server alpha: two clients share the same town,
   changes survive server restart, and the world progresses without a browser.
   Establish ownership, privacy, backup/restore and immediate human control
   before adding multiplayer, map expansion or agent-created buildings.

Five uncoached human sessions and real phone/assistive-technology checks remain
acceptance gates. Automation cannot establish enjoyment or physical-device
usability. Source integration, hosted publication and any paid/live inference
remain separate steps.
