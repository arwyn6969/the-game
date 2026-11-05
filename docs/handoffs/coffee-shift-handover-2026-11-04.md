# Full shifts, worker handover and station fix

Owner: this Codex chat. Checkout `product/`, branch `codex/relationship-feedback`,
draft PR #71. Main base `49cf76f`; starting PR head `05be3ab`; code `54e39e6`.
The user authorized the checks, fixes and PR update on 4 November.

Full 180-minute earning passes through normal UI at 1280×800 and 390×844:
no pay at 179, one five-coin payment at 180, no overtime or duplicate on
export/import/reload. Two handover journeys preserve the original partially
brewed customer order, both workers' contributions and independent wage holds.

The capacity regression reproduced a station deadlock: the former brewer and
incoming brewer blocked one another at adjacent stations. Café goals now give
placement priority and allow an idle authorized worker to make room. Navigation,
step budgets, collision checks, payroll and manual control remain unchanged.
One-worker ready times are 32/64 game minutes; two-worker times 32/55, with eight
parallel preparation intervals and wage reservations 5 versus 10. The opposite
worker-role orientation also passes. These are controlled two-order runs.

Validation: 1,191 script + 55 typed tests, 496 town tests, typecheck, lint (one
inherited warning), formatting, clean diagnostics, credential-free build with
migration skipped, and four final browser journeys pass. [Evidence](../review/coffee-shift-handover-2026-11-04/README.md).
Both source and browser regressions are wired into Verify. Require current-head
CI before any future integration. No merge/publication was requested or done.

Next bounded packet: café ready/refund transitions alongside earlier troubled
payroll; preserve old wages and refund holds, prove refusal/settlement ordering
and exact-once retries. Then actual two-tab café conflict and downgrade/recovery.
Physical devices, screen readers, participant comprehension/enjoyment and real
hosted/personal-model compatibility retain separate acceptance.

Production stays at the 3 November receipt. Existing towns, private configuration,
cast, save/API contracts and source history are preserved; Grok/automations stay
paused. Branch uploads and PR #71 updates are already authorized.
