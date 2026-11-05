# Café payroll/refund and concurrent-tab qualification

5 November follow-up: the existing tab harness now covers ready-first and
cancel-first queued saves at both sizes. All eight journeys and 36 focused
domain/runtime tests pass. No product defect or runtime edit was needed; one
canonical cup-or-refund outcome, original wage hold and 90 coins survive retry
and recovery. [Results](../review/coffee-payroll-tabs-2026-11-04/ready-cancel-results-2026-11-05.json).
The user requested faster delivery. Stop extending automatic acceptance packets
after this check; next prioritize PR integration review and a brief human playtest.
Normal full Verify runs once after the consolidated push; no merge/publication.

Owner: this Codex chat; `product/`, `codex/relationship-feedback`, draft PR #71.
Starting head `0f25093`, main base `49cf76f`, new coverage code `9549a90`.
User authorized checks, reproduced fixes and PR updates on 4 November.

Starting-head [Verify 41833236897](https://github.com/arwyn6969/the-game/actions/runs/41833236897)
passed all steps. No CI or additional runtime failure required a fix. Added four
source payroll/refund cases plus four real two-tab desktop/phone journeys,
including stale refund/staffing and overlapping service-start writes. Exact saved
bytes, complete losing backup/download, original wage/refund rights, owned cup,
attendance and identities survive; recovery requires service authorization again.

Full suite: 1,195 script + 55 typed tests; 500 town tests. Typecheck, lint (one
inherited warning), formatting, diagnostics, credential-free build/migration skip
and final browser journeys pass. Full-purse fixtures explicitly open with 2,082
coins; browser fixtures conserve the ordinary 90. [Evidence and limits](../review/coffee-payroll-tabs-2026-11-04/README.md).

Verify now runs the new tab harness against its built preview and retains
artifacts. Check the updated PR head separately; starting-head green is not its
qualification. Next technical #65 gap is downgrade/recovery protection. The exact
simultaneous ready/cancel browser race, broader browser/device coverage, screen
readers and human diagnostic remain open. No production/provider changes.

The existing runtime fix for shared café stations remains `54e39e6`; no save,
API, account, identity or attendance rule changed in this packet. Branch uploads
and PR updates are authorized. Merge and hosted publication are separate.
