# A02 readiness: independent integrity and economics audit

Review input and independent findings are retained below. Final selected decisions and dispositions are in the [canonical readiness plan](../a02-cafe-readiness-astra-2026-11-01.md).

1 November 2026. Read-only source/design review in `a02-economy`, source main
`a26714e03192a17acaa963d7d2681e74a1ac425b`, design head at review start
`7105913`. Only this uniquely named report was written. No game/runtime code,
shared records, database, wallet, external chat or live inference was used.
This is an adversarial design audit, not proof that coffee is implemented.

## Verdict and selected direction

The proposed **funded attendance shift plus separately reserved coffee orders**
can reconcile the user's intended café with the existing wage contract. It is
more faithful to buying coffee to support staff than the earlier zero-margin
piecework model. It also makes quiet periods and routine automatic service
understandable. Its correctness depends on the explicit rules below; the
earlier piecework tests do not qualify the new accounting or integration.

Recommend one shipping wage basis for the pilot: keep the existing **5 coins /
180 eligible game minutes**, protect the whole wage before acceptance, and
assign service only within an active eligible funded shift with current routine
consent. A 2-coin coffee purchase is held until a named ready cup exists. Ready
releases that hold as unrestricted café cash; it does **not** pay another
2-coin fee. Completed sales can fund later protected shifts. The buyer can
cancel for a full refund before ready, including after partial preparation;
the business bears that labor cost. Cancellation never confiscates protected
attendance or an earned wage. Ready, collected and consumed stay separate.

The user-facing sentence must change from “your 2 coins pay this worker” to a
precise business claim such as “coffee sales support café wages.” A particular
cup may have several contributors and its revenue may fund a later shift.
Never claim that preparing one cup itself earned a particular shift wage.

## Financial invariants

Let `B` be the actual café till, `L` protected prior obligations, `S` the sum of
current unsettled shift holds, `O` the sum of refundable unready-order and
pending-refund holds, and `H` other valid holds. Then:

`available = B − L − S − O − H >= 0`.

For the coffee/shift activity alone:

`B_end = B_start + 2 × purchases − 2 × paid refunds − 5 × paid shifts`.

Ready releases an order's existing hold; it creates **no new transfer into the
till**. Salary and order holds never cover each other. Add unrelated genuine
receipts/expenditure separately when reconciling the full town. Preserve each
town's initially audited total, not a hardcoded 90 for imported towns. Ninety
is the new-town test fixture. The existing ledger already audits opening cash
against transfers, issuance/retirement and every historical hold event
([economy.ts](../../../src/game/economy.ts):253–655).

### I01 — Do not spend preorders to bootstrap an unfunded shift

Three paid but unprepared coffees add 6 to the till **and 6 to refund holds**;
they add zero available cash. If there is no active funded worker and fewer
than 5 available coins, those preorders cannot finance the first shift while
remaining fully refundable. Initial legitimate café capital can bootstrap the
service. Later exhaustion must produce honest unavailability; do not quietly
borrow refundable money, introduce an unpaid Kevin, or promise a guaranteed
job every day. Display cash and obligations separately in diagnostic evidence.

### I02 — Preserve legacy priority and independent reservations

New coffee or shift actions must initialize/audit existing payroll and obey
`payrollFundingReasons`. Existing unprotected/ambiguous prior café claims block
new discretionary commitments. Newly unrestricted coffee revenue may protect
those prior claims before it funds another worker. Existing funded holds are
not redistributed. `activateFundedTown` already retries protection when enough
real cash arrives, and `protectOnDraft` prioritizes completed-unpaid claims
([payroll-runtime.ts](../../../src/game/payroll-runtime.ts):72–95;
[funded-work.ts](../../../src/game/funded-work.ts):356–428). A total till balance
alone is never admission evidence.

### I03 — Attendance, service and payment are independent facts

The existing shift pays for 180 employer-bound attended minutes, including
quiet periods; it does not require cups. Interruption retains the full hold
after any accrued attendance, but **does not mean the whole wage is already
earned**. Full earning occurs at 180, and there is no implied fractional wage
([funded-work.ts](../../../src/game/funded-work.ts):719–765, 1042–1094). Preserve
that contract for accepted work. Do not make a shelf blockage, customer
cancellation or refusal to drink revoke it. Display `minutes / 180`, reserved,
earned and settled accurately. A suspended worker may leave funds reserved
indefinitely; the pilot cannot guarantee circulation against that choice.

### I04 — No invented staff capacity

New agreements use fixed 16:00–19:00 replacement terms; creating an agreement
does not author a resident's willingness or plan. Kevin's initial agreement
can complete after 180 attended minutes while his authored café schedule and
cup animation continue. Presence/status after that is **not** an active paid
worker. Count only a currently eligible funded agreement and explicit service
routine consent. Existing Kevin payroll and any additional worker wages must
appear separately in experiments. Do not create free owner throughput or
overwrite authored NPC commitments to make the staffing figures work
([funded-work.ts](../../../src/game/funded-work.ts):957–1094).

### I05 — Full purses preserve liabilities

The source refuses transfers taking an agent above 999. A worker who completes
the shift retains the funded earned payable until settlement can succeed. A
buyer may fill their purse after buying, so cancellation can require
`refund-pending`: clear preparation assignment and cup entitlement, retain the
entire named money hold, and retry payment when capacity exists. Neither branch
may remove the liability because the order stops being active service. The
refund recipient is always the original buyer, whether cancellation came from
that buyer, trusted closure, or another disclosed cause
([economy.ts](../../../src/game/economy.ts):1310–1338;
[funded-work.ts](../../../src/game/funded-work.ts):615–675).

## State, interruption and concurrency

### I06 — Decide cancellation versus ready atomically

`queued/preparing → refund-pending/refunded` and `preparing → ready` compete
for the same order revision. Exactly one wins. Ready must create the unique
cup, finish its work evidence and release precisely its escrow hold together.
Cancellation must release the assignment/station/inventory entitlement and
create/settle its refund together. There is never both a refunded coffee and a
usable cup. No separate unguarded “credit revenue” action follows ready.

Money command IDs must bind actor, world context, terms, order, relevant
revision and exact payload. A retry of the same accepted command returns its
prior receipt before stale checks; a reused ID with changed payload rejects.
The source already stages complete Town mutations and enforces append-only
financial effects ([economy.ts](../../../src/game/economy.ts):930–1044), but
coffee needs domain checks and exact back-references in both directions.

### I07 — Tick order must match the old wage clock

`stepMinute` calls `advanceFundedPayroll` **before** incrementing the minute,
then moves residents and advances other activities
([sim.ts](../../../src/game/sim.ts):178–232). A coffee routine must not count
post-movement service as though it were the same attended interval, or reject
the final valid coffee minute because payroll just marked the shift complete.

A coherent integration is: initialize/protect existing payroll; snapshot the
current interval's agreement, position and control eligibility; advance coffee
work from that snapshot, completing ready atomically if eligible; run the
unchanged attendance calculation; then advance clock/movement normally. Retain
a stable absolute interval ID so a retry between coffee commit and payroll or
clock advance cannot add work twice. Re-read records after every commit. At
19:00 stop new work; do not extend the worker's commitment to finish a cup.

Ordinary service unavailability must not prevent an eligible attendance minute.
Corrupt coffee/ledger state is different: it is a recovery stop, not permission
to bypass validation. An in-memory successful tick whose save fails is not a
durable success; retain the full state and failure notice. Do not selectively
roll back cup or money while keeping an already-committed payroll outcome.

### I08 — A handover must retain work provenance and release old control

If a funded worker pauses or reaches shift end with an unfinished order, make
the assignment relinquishment explicit and resumable by another consenting
funded worker. Preserve segments identifying actual contributor, shift,
phase, interval and amount of work; a successor must not be attributed the
entire product. The old worker keeps their attendance and wage rights. The new
worker is paid through their own funded shift, never through a second per-cup
fee. Do not retain an inaccessible worker-held cup indefinitely or let a
detached automation session finish it after manual takeover.

Resource policy must accompany handover: a paused incomplete brew cannot both
occupy the only machine and advertise it as free. Either retain the lease
until resume/cancel, or implement an explicit safe stage/storage transition.
Name the selected policy and test it. Do not add invisible storage simply to
avoid a blocked counter. Completed paid cups remain buyer-owned under café
custody; absence can fill pickup capacity without undoing payroll.

### I09 — Reacquire object references after financial commits

`runEconomyCommand` replaces the Town clone. It deliberately preserves resident,
favor and some `economy.projects` object identity, but not a new `Town.coffee`
object ([economy.ts](../../../src/game/economy.ts):1008–1036). Payroll/library
commits can detach a cached coffee order/session reference. A loop mutating that
old reference may appear to progress but fail to update the current town.
Use immutable ID lookups after every commit, or explicitly support stable
projection identity with tests. Test a coffee phase adjacent to payroll,
library payment and cup collection in the same tick, not just isolated methods.

## Authority, validation and recovery

### I10 — Narrow café source authority is required

UI commands currently authorize only the player's purse and specifically
recorded existing work cases; `simulation` bypasses that source check and
therefore requires a trusted validating caller
([economy.ts](../../../src/game/economy.ts):143–161, 1063–1154). Coffee needs
explicit guards for its sale hold, permitted release and exact buyer refund.
Do not relabel user input as simulation or grant general till permission.
NPC purchases need their own deterministic consent/budget policy or validated
proposal; being in the café, having money or saying “coffee” is not consent.
Routine control permission cannot authorize a purchase for someone else or an
unlimited new financial commitment. Sole available staff cannot accept their
own order if the chosen first-slice rule prohibits self-service.

### I11 — Validate missing state as well as malformed state

An absent coffee extension is valid for an old save **only when no coffee ledger
effects require it**. Deleting `Town.coffee` from a save containing coffee sale,
hold or ready-release records must not silently erase obligations or restart
order numbering. Cross-validate every order against payment/hold/release/refund,
every cup against its one ready order, every assignment against a real staff
agreement and every resource lease against its occupant. Reject duplicate IDs,
orphan effects, impossible phases, bad capacity counts, forged work and
unsupported rules versions before normalization.

Wire the validator into raw import, `validateTown`, financial command auditing,
serialization/export and saved-error reporting—not just one UI action.
The existing physical/library validators establish this pattern
([save.ts](../../../src/game/save.ts):229–255, 457–470, 525–529, 632–640,
823–866). Preserve original bytes when invalid; do not delete cups, reset
balances, invent refunds or reissue a missing item as automatic repair.

### I12 — Local restore/fork is not shared-world proof

Use local order/cup IDs resolved through `townRecordRef` and the current
identity registry. Restore keeps its world; explicit fork clones the local
story and creates new identities. A stale original-world action envelope must
not execute in its fork. Historical origin is provenance, not current authority
([identity.ts](../../../src/game/identity.ts):254–296). Test current active,
ready, consumed, pending-refund and earned-unsettled states in both paths.
Validate the current-world action envelope before dispatch/replay, while keeping
local-ID historical ledger receipts intact. Do not require cloned old receipt
payloads to name the fork's new world or rewrite append-only receipt history.
The envelope can establish current scope before executing a canonical local
command; historical creation scope is provenance rather than executable authority.

Local editable saves, local “simulation” authority and receipts do not establish
an external payment, NFT, one-person identity, unique global cup or protection
against importing the same story twice. Do not connect this pilot directly to
asset claims or external rewards. A future external claim requires a separately
authoritative ledger, control grants and copied-save/parallel-claim handling.

### I13 — Long-term history is a real readiness gate

Economy receipts/holds are append-only; attendance already records each eligible
minute. Saved files have an **8 MiB import/export limit**
([save.ts](../../../src/game/save.ts):19, 774–786, 856–862). Adding a financial
command, quotation or redundant snapshot on every coffee tick can rapidly
inflate save size and repeated full-ledger audits. Do not create quotes during
rendering. Keep coffee evidence compact while retaining exact replay proof;
do not truncate financial receipts to conceal growth.

Require a genuine engine 7/30-day stress run with serialized bytes, import/export
success and timing measurements on the selected state layout. Test storage
quota failure, interrupted save, stale second tab and recovery copies. An
unbounded longevity claim needs archival/checkpoint design; an explicitly
bounded local pilot can expose a safe admission limit before reaching failure,
while retaining settlement/collection/recovery. This review did not measure
those limits, and the separate arithmetic model cannot substitute for them.

### I14 — Facts and knowledge must remain scoped

Preparation, ready, received, consumed, wage earned and wage settled are
different events. A customer can know their receipt and a worker their work;
public counter labels can expose the named ready cup. They do not make all
purses, payroll, private NPC memories or later drinking globally known.
Existing `rememberPaidWork` is specifically a player/employer event
([social.ts](../../../src/game/social.ts):150 onward), not a generic permission
to broadcast every coffee transaction. Distinguish contribution attribution
from a claimed conversation or satisfaction. No collectible, preference bonus
or autonomous repeat purchase should be manufactured from the service receipt.

## Required adversarial acceptance matrix

| Case | Required outcome |
| --- | --- |
| Till below 5, three refundable preorders | No new shift funded from those holds; no fake worker or wage |
| Quiet funded shift, zero coffee | Existing eligible attendance earns agreed wage; no coffee invented |
| Full shift hold plus several coffee holds | Every refund and wage remains independently covered |
| Coffee revenue arrives with old underfunded wages | Old claims protected first; no new discretionary commitment jumps them |
| Buyer cancels after 29/30 work minutes | Full pre-ready refund, no cup/revenue; attendance rights unchanged |
| Ready races cancellation, pause or reassignment | One revision winner; no cup-plus-refund, duplicate contributor or release |
| Ready on final eligible attendance minute | One cup/revenue release and one appropriate wage outcome; no overtime |
| Customer absent and shelf fills | No forced collection/expiry; salary rights unchanged; honest unavailable service |
| Worker/full-refund-recipient purse at 999 | Exact funded payable survives; one eventual settlement |
| Payroll commit between coffee read and write | Current state changes correctly; no mutation of detached records |
| Retry after coffee commit before clock advance | Interval not counted twice; prior receipt reused |
| Same command ID changed actor/terms/order | Reject unchanged; fresh ID with stale revision also rejects |
| Forged model completion or UI café release | Reject; only valid deterministic action and exact authority accepted |
| Delete coffee field but keep its ledger effects | Preserve raw save and reject; no empty-state recreation |
| Invalid cup/owner/resource/hold cross-reference | Domain validator rejects at import, command and save boundaries |
| Restore and fork with active financial/item states | Correct local continuity; original-world actions invalid in fork |
| Bread debt, library contribution/refund, manuscript alongside coffee | Exact previous ownership/payments retained; no aliasing with coffee |
| Long history, file-size/quota failure, two tabs | No silent history truncation, destructive replacement or duplicate outcome |

## What this review establishes

The shift-funded candidate is a defensible plan once its accounting and
control rules are made canonical and independently exercised. It preserves
existing wages while making sales useful to future payroll. It cannot promise
daily solvency under arbitrary cancellation, hoarding, refusal or indefinitely
suspended commitments. Price, demand, timing and willingness still determine
whether it is attractive and repeatable. This report supplies specific source
constraints and implementation tests; it does not certify an unbuilt runtime,
human enjoyment, production deployment or external asset integration.

## Independent follow-up: shift model review

Reviewed `shift-model.mjs` and its generated report after the manual-pause
alignment (22-scenario version). No falsely favorable funding comparison was
found: one versus two workers receives identical purchases and equipment,
while the second full wage is charged. Revenue is released only at ready;
refund and wage holds remain independent; quiet staffing costs real money;
customer hoarding/refusal is allowed to stop circulation. The cooperative
schedule is explicitly scripted, and its raw initial spending is distinguished
from the bounded NPC-budget experiment with a real paid bootstrap shift.

The added pause/reassignment test closes the main identified model gap: Sub
performs 8 brewing minutes, pauses and relinquishes assignment; Northern
performs the remaining 12 plus 10 placement minutes; exactly one cup exists.
Sub resumes attendance without reclaiming completed work and retains the
5-coin reservation for the unfinished shift. General JSON round-trip and
seeded replay checks are useful arithmetic-state evidence; they still do not
prove browser durability, actual movement or manual-input authority.

Keep the model/UI boundary explicit. The model deliberately accepts some
refundable preorders before a funded shift to attack escrow solvency. The
canonical checkout should require an actual eligible funded other worker.
Late-order recovery is tested without establishing that the UI disclosed an
overnight wait; that disclosure remains required. New-shift admission with a
full ready counter likewise needs the canonical guard. These are stronger
implementation policies, not behavior established by the permissive model.

One small reporting correction was sent to the model owner: the unfunded
bootstrap case changes café opening cash from 22 to 5 and therefore conserves
its own 73-coin fixture, alongside the ordinary 90 and larger full-purse test
fixtures. It does not mint or lose money; descriptions of fixture scope should
name all explicit exceptions. No production-readiness claim follows from the
large number of repeated invariant audits.
