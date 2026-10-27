# Hosted meeting pass recovery — 27 October 2026

Owner: current social assessment chat. Branch `codex/meeting-pass-recovery-20261027`,
base `c7fa07ad1fc20fcbd6ecc99a7aae82e05421c2d3`. Scope: discussion pass queue,
facilitator guidance, per-player share of the same free pool and focused tests.
No save migration, mobile, auth, provider or hosting migration.

PR #58 is live at runtime `4780d7b2f4cb`. Its real-provider headless full meeting
passed in fourteen calls and six utterances. The hosted browser attempt used
sixteen calls (one upstream timeout, fifteen successful responses) but produced
only Sub's one spoken line. Two explicit Starts, with the same cap and charges,
ended at the sixteen-decision boundary. The paused town reload retained Day 1
19:37, four coins and the closed record. Raw private evidence stays ignored in
`artifacts/full-meeting-release-20261026/`; no full exported live town was
obtained through the browser download bridge.

A red engine regression reproduced repeated pass/requeue without new input.
The fix parks a passer, retains participating attention, and offers a fresh
choice only after actual newly heard speech. Speech still uses the ordinary
queue. Prompts ask a willing facilitator to rejoin and respond to heard words;
all offered opt-outs remain. Player allocation rises from 32 to the existing
shared 48, preserving the one direct-reply reserve, every previous charge,
zero monetary ceiling, free model, one concurrent call, two starts/minute,
31-second pacing, sixteen decisions, six utterances and existing deadlines.

Local 1,100 script + 55 typed tests, 428 town tests, typecheck/lint, diagnostics
and both builds pass. Application source bb66aa8 completed sixteen successful
real-provider calls, four spoken turns and two distinct NPC speakers, $0, with
all thirty prior ledger rows retained. Independent full-town/knowledge replay
passes. The first CI run caught an old fixture assumption about parked speakers;
its cancellation case now tests a late legal request-turn and retains automatic
late-speech coverage. [Evidence](../review/meeting-pass-recovery-2026-10-27/README.md).
Current-head Verify, release receipt and hosted retest remain pending.
At most sixteen new operator calls and sixteen new hosted calls, with actual
provider-day headroom checked first and total provider-day ceiling 48. Any
failure or legitimate quiet choice must be recorded honestly. Never reset a
ledger or force another resident to manufacture acceptance. Mobile stays on hold.

## Published and hosted result

PR #60 passed Verify 40432562897 at 01470e2, merged as a26714e and published
Worker c4b89bfc-d9e4-48d1-ba1d-930280eaa8f5, runtime 01470e291065. All public
assets, routes, binding definitions and runtime settings pass preservation.
Rollback c13e181a-8360-4559-aed9-0b10c66be579. Current receipts live on branch
codex/meeting-pass-recovery-receipt-20261027 from merged main.

Fresh hosted test FAILED unattended acceptance: sixteen settled calls, five
spoken turns, two actual speakers, $0, 31,200 known tokens. Decision 11 proposed
an unavailable action (the precise kind was not saved). One same-meeting resume
retained eleven charges; the final decision 16 was an invalid HTTP 200
completion (subtype unknown), not a timeout. Operator manually closed the
exhausted meeting, with no new inference; all lines/four coins/paused Day 2
23:08 survived reload. Opt-out UI continuation was observed; exact hosted
recipient replay is unverified because the raw export was unavailable.

Next focus: non-content rejection diagnostics and legal action/completion
reliability; final failed request must not leave an unusable Resume at 16/16.
Do not guess a rejected kind, silently coerce an NPC decision, refund charges,
force speech, or spend remaining free requests as though they could fund a
fresh full test. Provider reports 48/50 used, two remaining; production has
38 rolling settled charges. Mobile and future automation stay on hold.
