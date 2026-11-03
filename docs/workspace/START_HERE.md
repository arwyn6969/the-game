# THE GAME workspace guide

Updated 3 November 2026. [Current project status](../CURRENT_STATUS.md) owns the
source, deployed revision and current assignment. Use [AGENTS.md](../../AGENTS.md),
the [branch lifecycle](../BRANCHES.md) and [collaboration workflow](../COLLABORATION.md)
before starting work.

`product/` is the primary checkout. Main is `49cf76f`; production runtime
`2ea974b` has the same verified tree. Both connection recovery and the eight
playtest fixes are published. The current audit branch is
`codex/live-playtest-20261103`. [Publication and new findings](../review/live-playtest-2026-11-03/README.md)
record one successful hosted reply and three presentation issues for the next fix.
Grok and historical automations remain paused; no separate hosting lane is active.

The root empty repository is a wrapper, not the product source repository.
Historical checkouts, private configuration and saved towns remain recovery
material. Preserve them. [Consolidation](../CONSOLIDATION.md) and the
[roadmap](../ROADMAP.md) supersede older alignment/hosting assignments.
