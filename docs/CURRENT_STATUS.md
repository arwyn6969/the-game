# Current project status

Updated 3 November 2026. This file is the single current source/deployment and assignment index. Earlier dated statements are evidence, not active instructions.

## Source and deployment

| Layer                   | State                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consolidated source | PR #69 merged as `6079050`; PR #70 merged as `49cf76f2236f12ff79b092f4e1df84e13f9b5a42`; connection recovery and eight playtest fixes included |
| Source qualification | [Verify 41616048834](https://github.com/arwyn6969/the-game/actions/runs/41616048834) passed every step at `2ea974b`; its tree exactly matches merged `49cf76f` |
| Production | Runtime `2ea974be7097`, Worker `6bf8d2d2-68ca-4624-8611-67b2c0f18531`, at https://www.arwyn.party/thegame/ |
| Production verification | 3 November: four public asset hashes, eight endpoints and seven redirects pass; all 18 bindings, seven secret definitions, runtime settings and 52 routes preserved |
| Rollback | Worker `c4098113-6b5c-43db-8ff4-b39d64e2eb72`; preserve database contents and browser saves |

The user authorized merge/publication and another in-app-browser bug hunt on
3 November. Both PRs merged after passing current checks with no unresolved review
threads. [Publication and live-play evidence](review/live-playtest-2026-11-03/README.md).
No database migration, secret/budget change or wallet transaction occurred.
Publication used no model calls; subsequent authorized play tested one fresh
hosted Arwyn reply successfully. Grok and historical testing automations remain paused.

## Next work, in order

Latest follow-up: this chat completed publication and a live desktop playtest.
Audit notes are on `codex/live-playtest-20261103`, based on merged main `49cf76f`.
The source-check/lookup/library-reading path, one hosted reply, shift acceptance,
pilot activation and reload pass. Three reproduced findings remain: shared
reading missing from relationship history; unrelated commitments on resident
Together cards; café activation incorrectly denying an existing shift.
[Handoff](handoffs/live-playtest-2026-11-03.md) and
[reproductions](review/live-playtest-2026-11-03/findings.json).
These are recorded for the next bounded fix, not runtime changes in this audit.

The prior [eight-fix handoff](handoffs/playtest-fixes-2026-11-02.md) and
[connection-recovery evidence](review/ai-connection-recovery-2026-11-02/README.md)
retain their original validation details. The integrated Verify now passes,
including the corrected café Hour readiness selector.

1. [#64 — consolidated release and useful hosted meeting](https://github.com/arwyn6969/the-game/issues/64): publication complete; next, fresh auth/allowance evidence, one bounded hosted trial, then physical-device/accessibility and five-player return-visit acceptance.
2. [#65 — café pilot acceptance](https://github.com/arwyn6969/the-game/issues/65): mixed seven-day play, pending-AI Stop, accounting/control interleavings and the three-to-five-person diagnostic.
3. [#66 — personal-model compatibility](https://github.com/arwyn6969/the-game/issues/66): actual user-selected endpoint/local-server compatibility, browser permissions, privacy and cancellation.

These are acceptance packets, not automatic authorizations or active assignments to another chat. One owner and one bounded outcome per follow-up. Do not reopen old feature lanes for work already consolidated.

## Implemented boundaries

- Seven residents and the player; movement, conversation, memory, work, inventory, funded library consequences, manuscript interactions and voluntary meetings.
- Versioned browser-local saves, old-save import, recovery, identity and restore/fork support. The game is not yet a production shared persistent world.
- Hosted AI with existing validation/accounting, local authored dialogue, and optional personal-source controls in this source. Personal keys remain tab-only; real provider/local compatibility is open.
- Café is an explicitly enabled finite pilot. Sales, refunds, cups and wages are separate durable facts. Its seven-day admission and storage bounds are not an indefinitely sustainable-economy claim.
- Identity/stamp appearance and private watch-only tooling remain distinct from public funding, spending, trading or redemption.

The next product outcome is a dependable week in town: understandable work, a useful social activity, preserved consequences and an observed reason to return. Human enjoyment cannot be inferred from passing automation.

## Evidence and navigation

[Consolidation](CONSOLIDATION.md) · [branch lifecycle](BRANCHES.md) · [roadmap](ROADMAP.md) · [collaboration](COLLABORATION.md) · [verification receipt](review/consolidation-2026-11-02/README.md).

[Prior status entries](CURRENT_STATUS_HISTORY_2026-11-02.md) retain their original dates and limitations. Use the [source manifest](review/consolidation-2026-11-02/source-manifest.json) and recovery tags for historical receipts; do not merge an old status preamble over this current index.
