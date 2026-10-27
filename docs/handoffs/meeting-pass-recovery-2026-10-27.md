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

Focused forty-two tests pass. Full checks, real-provider retained-ledger
acceptance, current Verify, release receipt and hosted retest remain pending.
At most sixteen new operator calls and sixteen new hosted calls, with actual
provider-day headroom checked first and total provider-day ceiling 48. Any
failure or legitimate quiet choice must be recorded honestly. Never reset a
ledger or force another resident to manufacture acceptance. Mobile stays on hold.
