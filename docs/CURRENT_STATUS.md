# Current project status

Updated 3 November 2026. This file is the single current source/deployment and assignment index. Earlier dated statements are evidence, not active instructions.

## Source and deployment

| Layer                   | State                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consolidated source     | PR #67 merged as `c183e32d3dc4de923490471da2d30a66caf788a7`; controls, work guidance, meeting reliability, café and personal-model controls share one baseline         |
| Source qualification    | [Verify 41456836140](https://github.com/arwyn6969/the-game/actions/runs/41456836140) passed at `722a66c`; its tree matches deployed `c183e32`                          |
| Production              | Runtime `c183e32d3dc4`, Worker `c4098113-6b5c-43db-8ff4-b39d64e2eb72`, at https://www.arwyn.party/thegame/                                                             |
| Production verification | 2 November: four public asset hashes match, eight endpoint and seven routing checks pass; all 18 binding definitions, seven secret definitions and 52 routes preserved |
| Rollback                | Previous Worker version `c4b89bfc-d9e4-48d1-ba1d-930280eaa8f5`; preserve database contents and browser saves                                                           |

The user authorized live publication on 2 November. The release owner was this consolidation/deployment chat on `codex/live-release-20261102`, based on `c183e32`; this follow-up records deployment evidence only. [Release receipt](review/live-release-2026-11-02/README.md). No database migration, model call, budget/secret change or wallet transaction was needed. Grok and historical testing automations remain paused.

## Next work, in order

Active release: this chat owns publication of connection recovery
[PR #69](https://github.com/arwyn6969/the-game/pull/69), merged as `6079050`, and
[PR #70](https://github.com/arwyn6969/the-game/pull/70) on `codex/playtest-fixes`.
The user authorized publication and another in-app-browser bug hunt on 3 November.
The integration preserves both fixes, existing saves, AI/accounting contracts,
production bindings and routes; no database migration or secret/budget change.

PR #70 fixes manuscript recipient persistence, speech attribution, a visible
Stop control, scoped activity notices, inventory copy, sidebar labels, replay
clock guards and explanations for partial Hour skips. Its first CI run passed
unit/build/general browser checks, then the café check timed out because it
selected Hour by the previous tooltip. The café check now waits for the named
Hour button to finish its actual operation. Current integrated CI must pass
before merge/publication. Focused and existing manuscript browser suites pass
at desktop and phone sizes; typecheck, lint (one existing warning), 484 town
tests, full tests and build passed before integration.
[Playtest handoff](handoffs/playtest-fixes-2026-11-02.md).

The connection fix keeps Check AI connection available while a failed note is
visible. Its Verify run passed before merge. Synthetic desktop/phone recovery
preserves the draft and town without a model call or replay from checking.
[Connection evidence](review/ai-connection-recovery-2026-11-02/README.md).

Publication evidence will be recorded in the release workspace and this PR;
a source merge alone does not establish a production deployment.

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
