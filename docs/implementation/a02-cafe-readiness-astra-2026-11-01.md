# A02 implementation readiness: funded café shifts and actual coffee

1 November 2026 · Canonical recommendation after the comprehensive design audit

**Implementation update, 2 November:** this contract is now implemented in the
isolated A02 checkout. Read the [implementation review](../review/a02-cafe-2026-11-02/README.md)
for actual coverage and remaining acceptance gates. Statements below about
unbuilt source describe the original audit date; they are not current test
results or a claim of production readiness.

## Verdict and scope

**Proceed with a bounded local implementation of this revised design. Do not
implement the earlier per-cup wage proposal alongside Kevin's shifts.** The
business and human experience now agree: customers buy ordinary coffee; the
café uses completed sales to support funded staff; a human accepts work once
and their character performs the routine service. Customers collect their own
cup and may keep or drink it. The visible work is the playful proof-of-work
analogy; it is not a blockchain consensus mechanism or a reward for waiting.

This document is the single current implementation brief. It supersedes the
payment, cancellation, worker-control and readiness recommendations in
[the previous coffee specification](a02-coffee-service-astra-2026-11-01.md).
Earlier models and traces remain valid within their named assumptions. This
audit found real omissions, rather than establishing that nothing was missing.
It closes them as explicit contracts and acceptance gates. It cannot prove an
unbuilt integration correct, exclude every possible defect, or establish fun.

The recommendation is **ready to build and test locally**, not qualified for
production, real payments, new visitors, wallets or minting. Product defaults
below are proposed for adoption; no runtime, save schema, deployment, shared
status/framework or other owner's checkout was changed. Sol retains runtime
and integration ownership; the UI owner must receive the matching control
contract. This record does not dispatch or wake either owner.

## Decisions fixed for the first implementation

| Decision | Selected rule | Reason / limit |
| --- | --- | --- |
| Human wage | Existing 5 coins for 180 eligible game minutes | Familiar funded shift; no per-cup wage; old accrued rights unchanged |
| Price | 2 existing town coins per coffee | Prototype parameter, no new currency or opening money |
| Customer money | Full 2 held until ready; then release that hold | Refundable orders cannot also fund wages |
| Cancellation | Full refund before ready, including partial work | Staff are paid independently; business bears preparation risk |
| Receiving | Named counter pickup | Ready, collected and drunk are separate facts |
| Controls | Explicit bounded automatic service; immediate manual override | No repeated clicks or paid inference per cup |
| Capacity | One brewer, two pickup slots, at most two concurrent service staff | Extra labor is useful only when equipment/space/demand permit |
| Work duration | 20 brewing + 10 placement game minutes, plus actual travel/waits | Tuning hypothesis, not an observed or guaranteed wait |
| Inventory/tickets | Four carried cups plus future cup entitlements; one unresolved ticket per buyer; six unresolved tickets total | Ready cups count once via entitlement; refunds pending count as tickets but not cup entitlements |
| Staff roster | Player, Sub, Northern for newly offered service shifts | No general job market/new residents; Kevin remains issuer; existing Kevin work is preserved, not assumed free service capacity |
| Ready cup expiry | None; no automatic drinking, disposal or refund | Two uncollected cups can stop service; expose this honestly |
| Payment/asset integration | None in this slice | Ordinary cups and receipts first; external campaigns/stamps require their own authority and settlement contract |

These terms deliberately change the earlier 2-price/2-fee experiment. A cup
does not itself earn this worker 2 coins. Use **“Coffee sales support café
wages”**, not “your 2 coins pay this worker.” A sale may fund a later shift;
several workers may contribute to a cup. Ingredient purchases, equipment costs,
fixed overhead, spoilage and idle costs beyond agreed wages are not modeled.
Adding any of them requires an explicit funded rule and renewed price analysis.

## What the human actually does

**Working:** approach Kevin and review **Accept café shift — 5 coins**. The
full wage must be reserved first. Show 180 eligible game minutes, normally
16:00–19:00, quiet-period pay, and resumable partial progress. Offer **Accept
and start serving** with an explicit explanation that it permits the character
to move and handle café orders automatically for this agreement's allowed
window. An already-accepted shift can separately choose **Start serving**;
attaching the routine does not rewrite its wage terms.
If accepted before its scheduled window, reserve the job and show its start
time; **Start serving** becomes available in that window. Do not take control
unexpectedly hours after an early acceptance. Late acceptance may require
remaining eligible minutes on a later day; disclose that before confirmation.

The character walks to the actual station, brews, places the named cup and
takes the next eligible ticket while its bounded permission is active. There
is no clicking for each cup, holding a key, timing challenge or required model
call. Show one persistent status: **On shift · 45/180 minutes · brewing Arwyn's
coffee · 5 coins reserved**. Distinguish **waiting for orders**, **brewer busy**,
**counter full**, **paused**, **wage earned** and **wage paid**. A quiet or blocked
funded shift still earns its agreed attendance wage.

The human can inspect the café, read and use compatible conversations. Work
advances only when game time advances: a foreground AI reply currently freezes
the clock. Do not promise progress during every conversation. Existing 1× time
is nominally one game minute per real second, making a full uninterrupted shift
about three real minutes; 4× is nominally about 45 seconds. These are source
ratios, not browser benchmarks or contractual real-time guarantees.

**Pause shift now** immediately suspends the worker's own agreement and revokes
automatic control; partial attendance and the full wage hold remain. Genuine
manual movement input does the same before displacement, even if the requested
tile is blocked. Typing or moving focus inside a form must not count as movement.
Ordinary manually controlled shifts outside this optional routine retain their
existing behavior. Stop controls remain local and usable during a pending AI
request; no model permission or visit back to Kevin is required to stop.

**Finish this coffee, then pause** prevents a new assignment and suspends after
ready placement, not after the customer eventually arrives. If there is no
current cup, suspend immediately. If 19:00 or the agreement's remaining eligible
minutes runs out first, stop then; do not demand unpaid overtime. Finishing a
cup at 30 minutes does not earn a fractional 5-coin wage. Resume continues the
same agreement and preserved minutes, subject to its allowed hours and current
consent. The next shift always needs separate funding and acceptance.

**Buying:** at the pickup stand, review **Coffee — 2 coins**, queue and staff
availability. Pay explicitly; receive a ticket, not a cup. The full price is
refundable until ready. The customer may leave, return and choose **Collect my
coffee** at the pickup stand. Collection transfers custody of the exact named
cup; **Drink** later consumes it once. Keeping it is allowed. Customer absence
does not erase the cup, create a refund, reverse staff attendance or imply
drinking. Counter labels and a short authored callout can make pickup personal.

## Exact funding and offer rules

Let café cash be `B`, and all its existing money holds be `H`. Available money
is `B − sum(H)`, never gross cash. Initialize/audit/protect prior payroll first;
unresolved or underfunded earlier café claims block new discretionary promises.
Do not count a legacy hold twice when showing totals.

| Transition | Cash | Holds / entitlement |
| --- | --- | --- |
| Accept a shift | No transfer | Reserve 5 unrestricted café coins for that worker |
| Buy coffee | Buyer −2; café +2 | Add separate 2-coin order refund hold and future inventory slot |
| Prepare | No transfer | Keep both shift and order holds; accrue only validated work/attendance |
| Cup ready | No transfer | Create one buyer-owned cup; release only its 2-coin order hold |
| Collect/drink | No transfer | Move/consume the cup; free corresponding capacity |
| Cancel before ready | Café −2; original buyer +2 if payable | Consume order hold; no wage adjustment; otherwise retain refund-pending hold |
| Complete 180 eligible minutes | Café −5; worker +5 if payable | Consume shift hold; otherwise retain funded earned payable |

For this activity, `B_end = B_start + 2×purchases − 2×settled refunds −
5×settled shifts`. Ready is a release of already-received money, **not another
sale or cash credit**. Every outstanding shift or pre-ready/refund-pending
order has its own complete hold. Preserve the town's audited opening total;
90 applies to the fresh fixture, not every valid imported town.

Three prepaid but unprepared coffees provide **zero additional available
money**. They cannot bootstrap a 5-coin shift in an otherwise unfunded café
while promising full refunds. Legitimate initial café funds can start service;
completed sales can help fund later shifts. If that capital is exhausted,
show **No funded shift available**. No nightly top-up, unpaid Kevin, new account
grant, automatic loan or hidden use of somebody else's wages fills the gap.

Future first-worker offers require an explicit business offer, a consenting
eligible worker, a free service-staff slot, a usable/open service window and
the complete available wage. Demand is not guaranteed: an explicitly funded
quiet opening shift is allowed, with its real cost shown in tests. Do not
automatically hire someone every morning. The player is never enrolled by
walking into the café or talking about work.

An additional service-worker offer also requires actual queued/unready orders
for another eligible worker, usable capacity, and the full additional wage.
The pilot's deterministic employer rule may offer a second worker when at
least two such tickets wait and the counter is not already full of ready cups.
That is an explicit service-quality policy, not proof of profitable hiring.
No extra shift opens while two ready cups permanently block preparation. Any
already-promised shift still pays under its terms. Preserve the existing
one-fulfilled-player-shift/day offer behavior and unresolved-agreement checks.

Checkout requires a currently eligible funded consenting service worker other
than the buyer, a usable service window, purse affordability, queue room and
reserved future inventory capacity. No self-fulfilment in the pilot. A declared
interest in working is not funded capacity. After admission a worker can pause
or refuse further routine work; the buyer retains the full pre-ready refund.
Close new checkout at 19:00. Show that a late order may wait for a later funded
session, with an explicit **Order for later pickup** acceptance if it cannot
reasonably finish this window. Estimates include queue/work remaining and
known blockage, and must not claim guaranteed arrival or use browser wall time.
Checkout terms also disclose the bounded pilot's closure policy: an unready
order that cannot be served within existing funded commitments is fully
refunded when service closes; a ready cup remains the buyer's property.

## Demand, circulation and limits

All existing actors can use validated buyer actions; no new identity/purse is
introduced. The player personally decides every purchase. For initial authored
NPC participation, Sub and Northern alone receive a new optional café-visit
purchase opportunity. Each may spend at most its remaining discretionary
permission: initial 2 from its existing money, plus **actually settled café
wages**, minus net coffee spending. A refund restores only the refunded
spending. Also require actual unencumbered purse funds after known personal
liabilities. This creates no money, daily allowance, compulsory shopping or
automatic drinking. Later wages are opportunities to spend, not orders to do so.

NPC shift willingness, routine consent and customer decisions are separate
authored decisions. Do not rewrite personalities, private memories, meetings,
library appointments or other accepted work to generate favorable figures.
Human and NPC orders obey the same price/custody rules. A current NPC purchase
can include an explicit bounded intention to return and collect; intention
alone never records collection, and drinking needs its own decision.

The 2/2 per-order alternative tightly links one purchase to one wage and
preserves café capital, but leaves no receipt for Kevin's existing shift pool.
The selected 2/5 shift arrangement guarantees quiet-time pay and can accumulate
surplus or lose capital. It is conditionally repeatable, not a promise of work
under hoarding, cancelled orders, unavailable staff or indefinitely suspended
agreements. The product reason to buy another cup remains a human-test
hypothesis: an amusing café encounter and a persistent personal item/history.
Do not add forced hunger or financial rewards merely to make demand exist.

## State, custody and incomplete work

Use a versioned optional `Town.coffee` extension with local monotonic order/cup
IDs, exact rules version, frozen buyer/price, payment/hold references, phase,
revision, progress, provenance, resources and action receipts. Use existing
actor IDs and current identity-registry scoped action envelopes. Cup owner is
assigned at ready; custody is café counter until collection, then that owner.
Consumed cups become non-usable tombstones with history, never minted again.
Existing work agreements/payables remain the source of truth for wages.

Orders follow `queued → brewing → placing → ready → collected → consumed`.
Any pre-ready state can instead become `refund-pending → refunded`. A pause
does not require another order phase: it clears the worker assignment while
retaining phase/progress/resource reservations. A wage can be active, suspended,
earned-unsettled or settled independently of cup state. Do not couple collection
or consumption to deleting an earned wage or refund liability.

Acceptance of a new preparation leases the single brewer and one of the two
logical pickup slots. Brewing releases the brewer only when the phase actually
finishes; placing keeps its pickup slot and occupies its worker. The pickup
slot is freed only by collection or pre-ready cancellation. Keep the occupied
brewer while a partial brew is unassigned: no invisible extra storage exists.

At manual interruption, explicit pause, exhausted eligible minutes or window
end, relinquish the assignment, revoke its old controller and preserve the
work. Another currently funded consenting worker can claim that exact
unfinished order under a new assignment revision. Prefer the oldest eligible
unfinished ticket, including retained work, then rotate ties between available
workers. Preserve contribution segments naming worker, shift, phase and exact
game intervals. The successor does not inherit the original worker's wage,
and the original worker cannot later finish the reassigned cup from a stale
callback. Resuming the old shift does not take the cup back automatically.

The buyer may cancel that partial order for the full price until ready. This
discards its incomplete product and frees its resources; all workers retain
their own earned/accrued attendance. Cancellation and ready race on the same
order revision: exactly one wins. Ready must create the cup, record provenance,
finish its phase and release the matching order hold **atomically**. Cancellation
must remove the assignment/resources and create/settle the buyer's refund
atomically. There is never both a refunded order and a usable cup.

Full worker or refund-recipient purse: preserve the named funded payable and
retry settlement when capacity exists. Pending refunds have no usable cup or
station lease but still count against the ticket limits. There is no compulsory
spending to clear a full purse. The original buyer remains the sole refund
recipient for buyer cancellation, trusted service closure and retry settlement.

Ready cups never expire silently. Two absent customers can block the café even
with money and willing staff. Display **Pickup counter full** with the actual
named cups; owners can collect when available, and unready customers can cancel.
Four kept cups can block that actor's checkout. No forced drink, theft, staff
disposal, gifting, resale or extra storage is included. This limitation must
be observed in the bounded pilot; general unattended longevity is not qualified.

## Geometry, routine control and one clock

Reuse the inspected café fixtures: brewer `(5,19)` with worker stand `(5,18)`;
pickup counter `(6,19)` with placement stand `(6,18)` and customer stand `(7,19)`.
Two cup slots are items on one counter, not two people on a tile. The static
probe proves these floor positions are reachable; it does not prove live
collision handling. Check exact walkability, café zone, fixture adjacency and
occupancy. `findPath` can normalize furniture targets and permits an occupied
goal: a returned path alone is insufficient.

The first pilot uses ordered tickets, not a claimed fully choreographed queue.
Only one customer occupies the pickup stand. NPCs yield it after **buying as
well as collecting**, choosing a reachable free café floor tile outside the
service stands and door. Pickup approach considers ready, consenting customers
in ticket order; an older unready order must not block another ready cup.
Release approach reservations on cancellation, departure or unreachable route
and recompute from current positions. A human may remain there; other actors wait
truthfully rather than pushing/teleporting the player. Test reachable waiting
positions and routes around occupied stands before claiming capacity results.

Current manual player walking runs on animation frames, can occur while paused,
and is separate from NPC movement. Add an authorized player-service movement
path driven by core game ticks and reconciled with the existing movement
arbiter; simply adding a goal to `moveResidents` does not move the player.
Preserve ordinary manual controls. Each actor gets one declared movement budget
per interval; no competing manual route and coffee route, no second extra NPC
movement pass, no walking and brewing simultaneously. Prior accepted
commitments take priority; reject conflicting routine starts rather than
silently cancelling an appointment or another work agreement.

For each interval `[t,t+1)`, where `t = day×1440 + minute`:

1. Apply pending local stop/override, validate identity/control state and
   initialize/audit/protect existing payroll. Snapshot eligible shift, phase,
   position and resource ownership at interval start.
2. Advance coffee work only from that snapshot, **before the current payroll
   call**, so a valid final service minute is not rejected after the agreement
   becomes completed. Record the exact interval once per order/contribution.
   Complete ready atomically if appropriate. Ordinary lack of orders/capacity
   does not prevent eligible attendance; corrupt state requires recovery.
3. Run the existing payroll attendance logic with its unchanged timestamps and
   eligibility. A finish-current request that completed its cup in step 2 must
   defer agreement suspension until **after** this interval's attendance is
   credited; otherwise the final valid minute is lost. Its no-new-assignment
   flag applies immediately. Manual Pause arriving before the interval remains
   immediate. Reacquire every coffee/work record by ID after financial commits;
   those commands replace parts of the Town object and can detach old references.
4. Advance clock and existing movement; integrate the service movement budget
   once, under collision/commitment arbitration. Arriving now cannot be credited
   as brewing during the prior interval. At 19:00 or agreement completion stop
   further service and relinquish unfinished assignments without extra work.
5. Persist boundaries and render their results. Replaying after a service commit
   but before payroll/clock advancement must not repeat that service interval.
   Current action IDs/receipts also prevent duplicate payroll.

Existing 1×, 4×, direct core stepping and explicit **+Hour** must reach equivalent
states at matching game times under the same decisions. +Hour explicitly
advances game ticks even when the normal clock was paused; its existing
dialogue/job interruptions may make it stop before a complete hour. Do not
implement coffee only in the animation loop or bulk-credit elapsed time.
Global clock pause means no automatically generated ticks; explicit +Hour can
still advance a valid routine through its core ticks. **Pause shift now** is a
separate agreement suspension and blocks that worker's service/attendance even
on +Hour. Paused manual walking remains available and cancels the routine first.

Persist the routine's worker/agreement, control terms/version, state, stop-after-
current flag, assigned order/revision, last interval and interruption reason.
Use one agreement's remaining allowed window, not an unlimited “keep working”
grant. Derive routes from live state, not saved callbacks. On hide/pagehide with
an active human service routine, pause town time and suspend that routine/shift,
save its state, and require explicit Resume. On reload/import/replay entry and
exit, preserve work/obligations but keep automatic player control paused until
explicit Resume. Never promise background/closed-tab or wall-clock catch-up.
NPC resumption requires its own bounded deterministic consent check.

## Authority, saves and bounded history

Customer Buy/Cancel/Collect/Drink and worker Start/Pause/Resume require exact
current actor/world authority, terms, revision, location where relevant and
capacity. A routine grant authorizes validated work for its agreement, not
buying items, changing price, hiring another shift or spending arbitrary funds.
Add narrow café-source authority for the exact sale hold, ready release and
original-buyer refund. Never relabel player input `simulation` to bypass guards.
Model output is a proposal; status text and animation cannot complete service.

Validate current-world incoming envelopes **before** idempotent replay. Within
that scope, the same command ID and payload returns its existing result;
conflicting reuse or a new stale command rejects unchanged. Use canonical local
IDs in stored economic receipts so an explicit local fork can retain its story
without rewriting append-only history. Restore keeps its world; fork creates
new identities. Stale original-world actions cannot execute in the fork.

Cross-check every order against sale/hold/release/refund; every cup against its
single ready order; all contributions against valid work intervals; assignments
and leases against active control/resource state; and inventory/ticket totals.
Missing coffee state is valid for an old save **only if no coffee ledger effects
require it**. Deleting the extension while retaining its money records must
reject with original bytes preserved, not recreate an empty inventory.
Unsupported versions, duplicate IDs, orphan holds and impossible phases stop
normalization. Wire these checks into raw import, financial auditing, command
commit, serialization/export and save diagnostics. Preserve all eight identities,
memories, personal debt creditors, bread/manuscript behavior and library funds.

On any save failure, stop automated work and new coffee/shift commitments;
retain the complete unsaved state and original recovery data. Do not announce
durable success until persistence succeeds, or selectively undo money while
keeping cups/attendance. Retrying reads the existing committed outcome. Two-tab
conflicts retain existing recovery/locking behavior. Feature-off stops new
admissions but retains compatible reading, refunds, wage settlement, collection
and explicit work completion needed to drain existing obligations. Never roll
back to a build that silently strips the new extension from a town.

History growth is a release gate. Existing attendance already appends receipts;
do not add a financial command or stored quote for every coffee tick/render.
Use bounded fields and compact contiguous contribution ranges with exact
interval deduplication. Never trim liability or idempotency records to make a
save fit. The source caps import/export at 8 MiB; browser storage can fail
earlier, and depends on the origin and environment. The actual probes below
show why this matters.

Scope the first pilot to **seven game days, at most 50 new orders and 14 new
shift agreements**, with at most two active service staff. These are trial
limits, not permanent economy rules. After seven days, stop new commitments;
keep existing orders, partial shifts, refunds and payables drainable afterward.
When the pilot closes with no usable funded service remaining for an unready
order, a trusted, idempotent service-closure transition refunds its original
buyer from its original hold, revokes assignments and releases resources. A
full recipient purse leaves the refund pending. Never reverse a ready cup,
release a worker's wage hold or invent a new shift to make closure look clean.
Add a conservative **3 MiB serialized-town new-admission stop**, while preserving
recovery/settlement; this is a safety trigger, not a storage guarantee. Repeated
Pause/Resume/requote can append records without new orders or time advancing:
apply the byte-budget check to every new persisted control/economic record,
not just Buy. Identical retries and rejected/no-op actions must not append
another durable record. At capacity, local Stop must still revoke automation
and pause the clock immediately even if a financial suspension cannot be
persisted; show pending unsaved state and require recovery before Resume.
Reload never reactivates player control.

Before pilot acceptance, measure bounded-field record sizes and reserve headroom
for a finite, uninterrupted completion/cancellation/settlement path for all
accepted obligations. Include attendance, control, handover and financial
receipts; prove that path can export below 8 MiB from the admission threshold.
This is **not** a bound under unlimited further toggling or arbitrary unrelated
game actions. Complete draining also depends on voluntary work/collection and
recipient capacity: an indefinitely paused shift or full-purse claim remains
a stable funded obligation, not a forced payout or silently released hold.
Retry settlement when relevant eligibility changes, not with a fresh receipt
every tick. Stress repeated controls as well as orders, reject new nonessential
recorded operations when the reserved drain margin would be consumed, and test
actual quota failure separately. If the bound fails, lower admission limits
before the pilot—never delete histories or change wages. Thirty-day integration
stress must demonstrate the admission stop and recovery, not promise unlimited
operation. Archival/checkpoint design is a later scoped prerequisite for
unbounded repeatability.

## Audit evidence and alternatives

- [Product/control review](a02-readiness-2026-11-01-evidence/product-audit.md):
  automatic movement, control revocation, foreground conversation, +Hour,
  shift-end handover, save failure, accessibility, perception and demand.
- [Integrity review](a02-readiness-2026-11-01-evidence/integrity-audit.md):
  independent liabilities, legacy priority, exact ticks, detached references,
  missing-state validation, local identity/fork scope and history size.
- [New shift model](a02-readiness-2026-11-01-evidence/shift-model.md): 22
  scenarios, 12 seeded mixed-action/reload schedules, explicit seven-day traces,
  and repeated conditional circulation. These are independent synthetic tests,
  not production coffee tests.
- [Existing engine regressions](a02-readiness-2026-11-01-evidence/current-regressions.tap):
  114 pass across economy, commerce, identity, save, player actions and physical
  items. They establish the inspected baseline, not coverage of the new feature.
- [Actual-source probes](a02-readiness-2026-11-01-evidence/source-probes.json):
  three 5-coin shifts paid with no coffee requirement; 540 eligible minutes and
  540 duplicate-minute attempts; daily save/load and 90 coins preserved.
  Generic additive projection references detach after an economy commit while
  actor object identity is retained. This uses synthetic player/date positioning
  and direct payroll calls, not ordinary controls or full continuous schedules.
- Earlier evidence remains linked: [seven actual-engine days](a02-economy-2026-11-01-evidence/current-trace.md),
  [three economic alternatives](a02-economy-2026-11-01-evidence/cycle-model.md),
  [piecework capacity model](a02-coffee-service-2026-11-01-evidence/service-model.md),
  [52 static geometry assertions](a02-coffee-service-2026-11-01-evidence/geometry-probe.md),
  and [interaction precedents](a02-coffee-service-2026-11-01-evidence/interaction-research.md).

The actual-source save grew from 69,049 bytes after the first acceptance to
209,565 after that day's payroll, then 358,329 and 506,865 at the next two daily
ends. Those figures include legacy payroll and other source records; they are
not a universal per-shift cost or a measured 30-day result. No simple linear
extrapolation qualifies long-term saves. The first probe incorrectly changed
the day without running midnight's `paidToday` transition; it was corrected to
exercise actual midnight before the final passing run. That was a harness
mistake, not a game defect.

With the same six 2-coin orders, one modeled funded worker finishes at minute
180, pays 5, and leaves café cash 29; two finish at 130, pay 10, and leave 24.
Both sell 12; the second worker purchases shorter waits here, **not more sales**.
Legacy café 5 and grocery 4 holds remain separate in this model. Zero-margin
piecework would pay all 12, with a different guarantee. Repeating readings is
larger content work and does not by itself fund a 5-coin shift.

A four-day scripted 2/2/3/3 purchase pattern can exactly circulate 20 of sales
and 20 of wages; the 28-day arithmetic repeat conserves every account. Its raw
first Sub purchase exceeds the initial NPC discretion rule, so a separate
seven-day test funds one real quiet Sub shift before exercising that bounded
budget. No/low-demand cases stop future offers; the seven-day hoarding case
depletes customer spending power while still funding all seven attempted shifts.
Accepted wages remain honored. These examples establish possibility and limits,
not spontaneous demand or an observed hoarding-induced offer stop within that week.

External reference checks support only their narrow technical/design points:
browser animation callbacks commonly pause in hidden tabs ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame));
storage quotas/eviction depend on browser/origin and are not a durability
guarantee ([MDN storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria));
the developer's buffet example separates placing food from customer collection
([PlateUp](https://www.plateupgame.com/updates/1-4-0-buffet/)). These references
do not prove our wage policy, user demand or enjoyment.

## Required integrated acceptance matrix

Every row below is a requirement for the new game implementation, not a claim
that the prior baseline/model tests already pass it. Retain failures and exact
receipts; do not repair test fixtures by granting money or deleting history.

| ID | Scenario | Required result |
| --- | --- | --- |
| F01 | First funded shift, no orders | Eligible quiet time earns 5 once; no cup invented |
| F02 | New order while a shift is active | Full 2 held independently of its full 5 wage hold |
| F03 | Till cannot fund 5; multiple preorders | No shift financed from refundable holds; no free worker |
| F04 | Ready release with prior payroll trouble | Old claims protected before new discretionary offers |
| F05 | One/two workers, identical demand | All cash/holds reconciled; wait, throughput and wage cost reported separately |
| F06 | Cancel at 0, 12 and 29 work minutes | Full pre-ready refund; resources released; attendance unchanged |
| F07 | Ready vs cancellation race | One winner; never cup plus refund or double revenue |
| F08 | Worker/refund recipient purse full | Independent payable retained through reload/use; eventual settlement once |
| F09 | No demand, hoarding, refusal, suspended shift | Honest idle/unfunded state; no forced purchases, top-ups or erased holds |
| W01 | Start once | Automatic legal service without repeated human clicks or model calls |
| W02 | Keyboard/touch/destination override | Pause wins before next automatic step; blocked move also pauses; form input does not |
| W03 | Pause/finish-current while AI busy | Local control works; final valid payroll minute precedes finish-current suspension; new assignments stop; no forced wait/overtime |
| W04 | 15:59,16:00,18:59→19:00 and 180th minute | Exact existing attendance timestamps; valid final cup can complete; no out-of-window work |
| W05 | Late/interrupted cup, two-worker handover | Progress/contributors/leases survive; revoked worker cannot finish; each shift paid only on its terms |
| W06 | 1×,4×,+Hour,direct stepping | Equivalent states for matching authoritative intervals/decisions; no double movement/progress |
| W07 | Quiet, brewer blocked, shelf full | Correct separate status; accepted attendance still honored |
| W08 | Library/meeting/manuscript conflicts | Prior commitments preserved; conflicting routine rejected or explicitly paused |
| I01 | Distinct customers/cups | Exact owner, custody and proximity; wrong cup/person cannot collect |
| I02 | Keep/drink through days and reload | One usable item before use; one consumption/tombstone; no wage/refund side effect |
| I03 | Counter and inventory full | Admission stops truthfully; no silent expiry, forced drink, overlap or theft |
| I04 | Occupied/blocked station and waiting customers | NPC clears after Buy/Collect; ready-only pickup ordering; exact targets, real routes, no teleport or player pushing |
| R01 | Retry every financial/custody transition | Same-ID replay; changed payload/new stale revision rejects unchanged |
| R02 | Crash after coffee step before payroll/clock | Same interval not repeated; wage/cup/revenue each correct |
| R03 | Payroll/library commit between coffee reads | No detached-reference progress loss or stale write |
| R04 | Save failure, full quota and two tabs | Stop auto work; preserve live/raw recovery; no false durable receipt |
| R05 | Hide/close/reload/import/replay | No implicit player-control resumption or offline catch-up; explicit Resume |
| R06 | Missing/malformed coffee field with ledger effects | Reject with original bytes retained; no empty-state regeneration |
| R07 | v1/v2 restore and explicit fork | Original balances/debts/identities/memories retained; correct new scope; stale original envelope rejected |
| R08 | Pilot closure, feature-off and rollback | Unready order without funded service refunded once from its hold; ready cups and wage claims retained; blocked claims stable; no destructive downgrade |
| A01 | Forged model ready, actor/price/hold change | Narrow engine guards reject; no generic till access |
| A02 | Late callback after pause/reassignment/restore | Cannot revive old control or change wrong current town |
| A03 | Ready/received/drunk/public-private knowledge | Only evidenced facts reach rightful observers; no private purse/secret leak |
| L01 | Seven-day normal mixed play | Full reconciliation, all identities/debts, save/export/reload, actual movement, staffing and cup states |
| L02 | Thirty-day history/admission and repeated-control stress | Bytes/timing, finite drain-path reserve, rejection before margin consumed; Stop works without another persisted record |
| L03 | Existing regression suite and full integration checks | Relevant tests plus required typecheck/lint/full tests/build with no DB credentials |
| U01 | 390×844 and 1280×800, keyboard/touch | Clear controls/terms/disabled reasons; immediate Stop; focus after one-use actions |
| U02 | Screen reader/reduced motion | Phase-change announcements, text progress, no every-minute chatter or animation-only evidence |
| H01 | Human control/comprehension | Participants can start/stop, understand wage basis and distinguish ready/received/drunk without coaching |
| H02 | Human value/repeat choice | Observe whether café work/pickup is enjoyable and another coffee wanted without rewards; report uncertainty |

## Bounded implementation sequence and sign-off

Proposed code boundaries (interfaces to implement, not existing APIs):

| Boundary | Contract |
| --- | --- |
| New `src/game/coffee-types.ts`, `coffee.ts` | Versioned order/cup/routine types; pure actor-scoped view/actions; validated Buy/Cancel/Collect/Drink/Start/Pause/Resume; interval processing and resource assignment |
| `economy.ts`, `funded-work.ts`, `payroll-runtime.ts` | Narrow coffee hold/release/refund authority; existing shift earning/settlement reused; no second coffee wage; re-read records after commits |
| `sim.ts`, `navigation.ts` | Interval-start progress before existing payroll; post-payroll finish-current suspension; one movement arbitration including authorized player service |
| `types.ts`, `save.ts`, `identity.ts` | Owner-reviewed optional schema and domain cross-validation, safe absent-field rule, restore/fork envelopes, bounded size/recovery behavior |
| `TownApp.tsx`, `ActionCards.tsx`, `PlayerTools.tsx`, `render.ts` | Normal actions, pure views, revocable control, save feedback, cup/ticket projection, inventory/focus and accessible Stop; coordinate with UI owner |

Each action envelope binds current world/character, command ID, action, target
order/cup/agreement and expected relevant revisions plus frozen terms where
money/consent changes. Return a typed success/rejection with stable record and
receipt IDs and replay status. Persistence confirmation is separate from an
in-memory success. Pure views cannot issue stored quotes or consume receipt
IDs. At 4×, test stale quote refresh explicitly: a rejected click must explain
what changed and leave money unchanged; it must not turn into an unbounded
automatic retry or require constant serving clicks. Existing exported APIs and
legacy save behavior stay compatible through the explicit integration pass.

1. **Domain and money:** implement the selected order/hold/cup contract and
   raw validators in an isolated authorized owner branch; preserve the existing
   wage agreement. Add attacks on authority, missing state, races and payables.
   No routine UI can bypass this layer. Prove save-budget headroom and exact
   tick/replay interfaces before expanding to autonomous movement.
2. **One normal encounter:** integrate one human customer's purchase/collection
   and one funded worker's automatic routine using real geometry and existing
   controls. Make Stop, save failure and shift-end handover work before adding
   the second worker. Keep the model fake/offline throughout qualification.
3. **Two staff and repeat visits:** test same-demand staffing, authored opt-in
   choices, the seven-day mixed town, no-demand/hoarding/full-counter cases,
   30-day storage stop, old towns and conflicts. Run repository-required checks
   with Node 24; builds must have DATABASE_URL unset and no production credentials.
4. **Human diagnostic:** three to five people, including someone new to the
   project, work a quiet/busy shift, interrupt/resume, buy/leave/return/collect,
   keep/drink and encounter a full counter. Everyone must stop without help,
   distinguish wage reservation from earning/payment, and identify where their
   cup is. Record enjoyment/repeat choices separately from correctness. If
   pickup feels impersonal, compare direct handoff with unchanged pay/rewards.

Proceed from this audit to implementation with the selected defaults. Treat a
failed financial, control, recovery or accessibility requirement as a blocker
to the local pilot's acceptance. Human enjoyment and long-term voluntary demand
remain evidence to obtain, not requirements an agent can certify in advance.
Only after integrated tests and the diagnostic can we call the bounded café
ready for ordinary play. Publication and real-payment/asset work remain separate.

Proof of Coffee shares this one order/service/collection receipt chain; its
customer completion means actual collection. A future pixel stamp may be an
ordinary visual or clearly separate souvenir. Same-item export would need
authoritative locking, external settlement, fee and duplicate-claim rules;
editable local saves cannot establish those. QR campaigns and buying for
another agent also need recipient consent and payment terms. Preserve that
research, but do not make it a dependency of this implementation.

## Baseline, ownership and reproduction

Checkout `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a02-economy`, branch
`codex/a02-loop`; this audit started at `7105913`. Fresh read-only GitHub checks
on 1 November show main `a26714e03192a17acaa963d7d2681e74a1ac425b` and open draft
[#63](https://github.com/arwyn6969/the-game/pull/63) at
`46bbe821341448b9c68000572c093b9471b4a9af`, stacked on #62. No new source base
or production qualification is implied by that PR. The supplied handover and
START_HERE preserve Sol's A01/shared-record boundaries. Only this lane's
uniquely named documents/evidence are written; no external chat is contacted.

Use Node 24.22.1 to reproduce `shift-model.mjs` and `source-probes.mjs` in the
linked evidence directory. The recorded 114 tests use the six named existing
script suites; [validation receipt](a02-readiness-2026-11-01-evidence/validation.json)
records exact commands, outcomes, reviewed limitations and final checks.
