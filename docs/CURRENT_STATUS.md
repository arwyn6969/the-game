# Current project status

Updated 5 November 2026. This file is the single current source/deployment and assignment index. Earlier dated statements are evidence, not active instructions.

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

## F1 local following — bounded implementation owner

5 November 2026: this Codex chat owns F1 “accompany and remember”, including
its independent deterministic controller and coordinated additive save/UI/simulation
integration. Branch `codex/followers-local`, implementation checkout `a01-replay/`
(reused clean historical checkout; its prior branch remains intact).
Fetched main: `49cf76f2236f12ff79b092f4e1df84e13f9b5a42`.
Starting base/head: `2ee631fa62ca9ecbba9aab4453d7bfd7c3b69399`.
Explicit unmerged dependency: PR #71's truthful shared-activity presentation and
café station handover fix, needed for F1 journal/activity and conflicting-control
acceptance. #71 remains owned by its existing chat; `product/` is untouched.
The managed worktree tool rejected nested `product/` because the chat's registered
workspace is the empty wrapper; this clean existing product worktree is reused.
Acceptance: one nearby resident, ordinary movement, exact discussion receipts,
immediate takeover, explicit Resume, bounded saved journal, old-save/recovery
compatibility, synthetic source/browser checks at 1280×800 and 390×844. No F2–F4,
provider/hosting/payment changes, upload, merge, publication or paid inference.
Local implementation is complete. Twenty focused source cases, 525 town tests,
1,220 script + 55 typed tests, typecheck, lint (one inherited warning), diagnostics,
credential-free build and eight desktop/phone synthetic browser journeys pass.
All four existing interface layouts fit. Four explicitly requested synthetic
speaker calls and zero follower/live calls were measured. No remote action.
[Consolidated evidence and limits](review/followers-local-2026-11-05/README.md) ·
[proposed PR](review/followers-local-2026-11-05/proposed-pr.md) ·
[handoff](handoffs/followers-local-2026-11-05.md).
A short human playtest, physical devices/screen readers and future integration CI
remain open. Implementation head: `40c67dc7c2699a295698aacac0b22283625bddeb` (local, unuploaded).

## Next work, in order

5 November: this Codex chat owns the bounded ready-versus-cancel check on PR #71,
starting at `966baae`, main base `49cf76f`. Reuse the existing concurrent-tab
harness for both save orderings; preserve one outcome, the wage hold and 90 coins.
Both orderings now pass at both sizes, along with all eight tab journeys and 36
focused domain/runtime tests. No runtime defect or edit was needed. [Results](review/coffee-payroll-tabs-2026-11-04/ready-cancel-results-2026-11-05.json).
The starting head's [Verify](https://github.com/arwyn6969/the-game/actions/runs/41856251217)
passed every step. The user requested faster delivery: finish this focused gap,
update the PR once, then prioritize integration review and a short human playtest
over further automatic edge-case packets. Merge/publication remain separate.

Current owner: this Codex chat, branch `codex/relationship-feedback`, fetched main
base `49cf76f2236f12ff79b092f4e1df84e13f9b5a42`. Runtime fix `ea55743` and
mixed-week regression `f9005ac` are committed. The 3 November audit is
retained as documentation commit `27e486f`.

**LIVE-01, LIVE-02 and LIVE-03 are fixed and locally qualified.** Overview and
Together recognize witnessed shared activities without invented chat/rapport;
resident cards scope commitments to the identified counterparty; café activation
acknowledges existing agreements. A follow-on seven-day core journey covers
library/reading/manuscript/café play, full wage earning, refund replay,
Stop/resume, daily reload and retained cup/wage rights at pilot closure.

Current full suite: 1,200 script + 55 typed tests pass (505 town tests). Typecheck, lint (one inherited
warning), credential-free build, diagnostics and desktop/phone browser journeys
pass. No live inference or production changes. [Evidence and limits](review/relationship-feedback-2026-11-04/README.md)
and [continuation handoff](handoffs/relationship-feedback-2026-11-04.md).

The user explicitly authorized upload and draft creation on 4 November.
Initial draft head `f2f2d46` was pushed and [draft PR #71](https://github.com/arwyn6969/the-game/pull/71)
is open against main. The prior automatic approval restriction is resolved for
this upload. Merge and hosted publication are separate.

The next #65 packet is now locally qualified in `648f697`: eight desktop/phone
synthetic browser journeys cover pending-AI Stop, valid/unavailable late replies,
manual takeover, restore, explicit resume and reload authority. No runtime defect
was reproduced. [Café AI evidence and limits](review/coffee-ai-interruptions-2026-11-04/README.md).
The harness is added to Verify; CI must qualify the current PR head separately.

Full-shift and handover packet completed locally in `54e39e6`, continuing PR #71
from head `05be3ab` and freshly fetched main `49cf76f`. Both desktop/phone sizes
qualify 179 unpaid → 180 paid exactly once, no overtime or repeated settlement,
and ordinary partial-order handover with retained ownership and separate wages.

The checks reproduced and fixed a real two-worker station deadlock. A waiting
brewer now stages off shared equipment while the other worker moves to placement;
only active service goals change, preserving normal navigation and manual control.
The matched two-order runtime comparison finishes at 32/64 minutes with one
worker and 32/55 with two; reservations are 5 versus 10 coins, total funds 90.
Both worker-role orientations pass. [Evidence and checks](review/coffee-shift-handover-2026-11-04/README.md)
· [handoff](handoffs/coffee-shift-handover-2026-11-04.md).

Local source gates, build, diagnostics and all four new browser journeys pass.
The updated PR head needs its own CI result. No production or live inference.
Prior packet: this Codex chat owned CI follow-up plus café payroll/refund and
actual concurrent-tab checks on PR #71, starting at `0f25093` on
`codex/relationship-feedback`. Fresh main remains `49cf76f`. The user authorized
checks, fixes for reproduced failures and PR updates on 4 November. [CI 41833236897](https://github.com/arwyn6969/the-game/actions/runs/41833236897)
passed every step at `0f25093`, including private-wallet checks and Cloudflare
packaging; no CI failure required a fix.

Payroll/refund and concurrent-tab packet is locally complete in `9549a90`.
Four source cases preserve earlier troubled wages across ready/library/payroll
interleaving, and independently settle earned full-purse wages and refunds in
either order through reload/replay. Four actual desktop/phone tab journeys
preserve canonical save bytes, complete losing backups/downloads, cup ownership,
attendance and wage holds; explicit recovery revokes automatic service.
No additional runtime defect was reproduced. Full suite, source gates, diagnostics,
credential-free build and all four browser journeys pass. [Evidence and limits](review/coffee-payroll-tabs-2026-11-04/README.md)
· [handoff](handoffs/coffee-payroll-tabs-2026-11-04.md). Verify includes these tests;
the updated head requires its own CI result. No production or provider calls.
Current-head [Verify 41841845121](https://github.com/arwyn6969/the-game/actions/runs/41841845121)
passed every step at `6e29a0c`, including the new concurrent-tab journeys.

Latest packet: this Codex chat owns café downgrade/recovery on PR #71,
starting at `6e29a0c` against fetched main `49cf76f`, authorized 4 November.
Locally complete in `2307655`: execute actual recorded rollback `c183e32` on a
disposable same-origin town with ready cup, pending refund and partial/earned
wages, save/export, then reopen with current. Four desktop/phone enabled/off
journeys and five source cases preserve complete books, identities and claims,
refuse unsupported data with exact raw recovery, and use the recovered cup once.
Fixed misleading disabled-pilot copy that still invited a new trial. Current
recovery explains retained tickets, cups and wage reservations. No schema/API or
simulation-rule change. Source gates, diagnostics, two credential-free builds
and final browser journeys pass; updated-head CI is separate. [Evidence and limits](review/coffee-downgrade-2026-11-04/README.md)
· [handoff](handoffs/coffee-downgrade-2026-11-04.md).

This qualifies only the pinned local browser rollback, not arbitrary older builds,
deployed/PWA/subpath rollback. No production/provider changes. Broader browser/server races,
broader browsers, real auth/model compatibility, physical devices/screen readers
and human acceptance remain open.

The prior [eight-fix handoff](handoffs/playtest-fixes-2026-11-02.md) and
[connection-recovery evidence](review/ai-connection-recovery-2026-11-02/README.md)
retain their original validation details. The merged baseline’s Verify passed,
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
