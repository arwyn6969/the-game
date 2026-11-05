# THE GAME workspace guide

Updated 4 November 2026. [Current project status](../CURRENT_STATUS.md) owns the
source, deployed revision and current assignment. Use [AGENTS.md](../../AGENTS.md),
the [branch lifecycle](../BRANCHES.md) and [collaboration workflow](../COLLABORATION.md)
before starting work.

`product/` is the primary checkout. Main is `49cf76f`; production runtime
`2ea974b` has the same verified tree. Both connection recovery and the eight
playtest fixes are published. The current branch is `codex/relationship-feedback`.
The three presentation findings are fixed, and a follow-on mixed seven-day core
regression passes. [Current evidence](../review/relationship-feedback-2026-11-04/README.md)
records the earlier relationship/pending-AI phase. [Draft PR #71](https://github.com/arwyn6969/the-game/pull/71) is open following
the user’s explicit upload approval on 4 November.
Eight pending-AI café interruption journeys now pass locally.
Full UI shift earning and two-worker handover now pass in `54e39e6`, with a
station-deadlock fix and 1,191 script + 55 typed tests.
[Current café evidence](../review/coffee-shift-handover-2026-11-04/README.md).
Next local packet: troubled payroll/refunds, then concurrency/recovery for #65.
Grok and historical automations remain paused; no separate hosting lane is active.

The root empty repository is a wrapper, not the product source repository.
Historical checkouts, private configuration and saved towns remain recovery
material. Preserve them. [Consolidation](../CONSOLIDATION.md) and the
[roadmap](../ROADMAP.md) supersede older alignment/hosting assignments.
