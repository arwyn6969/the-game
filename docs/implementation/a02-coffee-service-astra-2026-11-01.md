# A02 coffee service: buying, preparing and receiving a cup

1 November 2026 · Proposed implementation contract · Design and synthetic evidence only

**Superseded by the [comprehensive audit and canonical funded-shift plan](a02-cafe-readiness-astra-2026-11-01.md).**
This document preserves the earlier per-order proposal and human-control gap.
Its 2-coin per-cup wage and no-refund-after-acceptance policy are not the selected
implementation. The current plan keeps funded 5-coin shifts and separate
refundable coffee payments until ready. Earlier synthetic evidence remains
valid for its named scope.

This was the A02 implementation proposal before the audit. It superseded the earlier
tea-table task, one-order/day limit and item-first next steps. The original
[seven-day reconciliation and cycle comparison](a02-cafe-loop-astra-2026-11-01.md)
remain evidence for their stated scope. No gameplay, wallet, save schema or
shared project record was changed by this packet.

**Human-worker clarification:** the order/cup contract below is concrete, but
the human control flow and its relationship to Kevin's existing shift were not
fully specified. Read the next section before treating this as a complete
player-facing implementation brief. The per-order financial experiment does
not establish a sales-funded version of the existing shift.

## Human work: automatic routine, explicit commitment

At the inspected source revision, Kevin's funded player shift reserves **5 coins
for 180 eligible game minutes**, normally 16:00–19:00. The character must be in
the café, with the active agreement and corresponding café plan. Attendance
advances automatically; there is no coffee-production or repeated-click
requirement. Leaving or suspending stops new eligible minutes, preserves earlier
minutes and the wage reservation, and permits later resumption. The full wage
is earned at completion; no fractional wage is implied. See
`payroll-runtime.ts:158`, `funded-work.ts:1042` and `effects.ts:1020`.

For the proposed coffee service, recommend **one explicit work command followed
by automatic routine actions**, rather than requiring human input for every
brew, movement and placement. This is a proposed addition; the current game
does not implement automatic player coffee work.

1. The player reviews the duration/scope, pay and stopping terms, then chooses
   to work. Acceptance grants control only for the disclosed café routine.
2. The character approaches the actual station, brews and places its named cup
   using the same validated work and movement rules as another worker. No
   repeated click, held key, timing test or model call is required per step.
3. A visible work status shows the current order, progress, pay basis and any
   waiting reason. The person can observe the café and use compatible panels or
   nearby conversation; these do not prove extra work or make their character
   simultaneously available elsewhere. Any existing game pause still pauses work.
4. **Pause work** or manual movement immediately interrupts this routine and
   returns control. Preserve the incomplete order, minutes and protected funds
   under its agreement; do not silently abandon it or accept another job.
   **Finish this order, then stop** prevents the next assignment. Emergency
   stopping never requires finishing first. Closing the app preserves state;
   no offline progress is promised by this local design.
5. For the current per-order proposal, stop after that accepted order by default.
   Repeated automatic service needs a separately disclosed bounded commitment
   (for example, a funded shift or a chosen order count). Its limit, accepted
   terms, cancellation and reload behavior must be saved; a routine-control
   permission alone cannot accept unlimited new financial obligations.

There is still a **pay-design decision before integration**. Existing Kevin
shifts promise 5 coins for eligible attendance; the new model promises 2 for a
completed order, from a 2-coin sale. With zero margin that model does not fund
the old shift pool. Automatic controls can support either arrangement, but do
not make them economically interchangeable. Do not replace an accepted shift,
require extra serving to earn its existing wage, or pay both contracts for the
same labor interval.

Next compare a coherent **funded-shift service** against the tested per-order
service. For the shift candidate, reserve its full wage before acceptance,
honor it on quiet days, and explicitly model when sale proceeds become available
for future payroll versus outstanding coffee/refund obligations. Define order
assignment within the shift and shift-end behavior for an unfinished cup. Three
2-coin sales gross 6, but their timing and liabilities determine whether a new
5-coin shift can actually be offered. That arithmetic alone is not qualification.
Retain the current per-order evidence as a comparison, not proof of this new case.

Additional acceptance gates: one Start completes routine service without further
input; manual interruption never fights the player's movement; game pause and
reload preserve progress; stopping prevents another acceptance; no conflicting
activity counts as work; no cup receives both shift and piecework pay. Test a
quiet funded shift, a busy one and a shift ending during preparation before
calling the whole human-worker experience implementation-ready.

## Product decision

Start with **named counter pickup**: a customer buys coffee; the sale protects
the worker's fee; a consenting worker brews it and places the labelled cup on
the counter; the customer collects it and may keep or drink it. Additional paid
orders can support another worker, subject to equipment and space. The café's
activity is the visible, playful proof of work. A receipt records what happened;
standing in a queue does not itself earn money or create coffee.

The minimum slice uses existing town coins and residents. It gives the customer
an ordinary untokenised item, not agent-runtime credit. It does not settle the
future choice of external payment currency. Emblem, ECX/eStamps, campaigns and
“buy an agent a coffee” can attach to this contract later; none is required to
make serving work. Existing research is retained in the [handoff](../handoffs/a02-economy-astra-2026-11-01.md).

**Prepared, received and drunk are different facts.** A customer can walk away
while coffee is made. When they return, they can collect the same cup. A worker
who completed the agreed preparation and counter placement keeps their earned
pay whether the customer collects or drinks it.

## Why this interaction

| Option | Smallest meaningful interaction | Added obligations | Decision |
| --- | --- | --- | --- |
| Direct handoff | Worker offers a named cup; present customer accepts | Simultaneous presence, carried cup, refusal, moving recipient, safe put-down | Keep as the next comparison if pickup feels impersonal |
| **Named pickup** | Worker places labelled cup; its customer chooses Collect | One pickup location, finite slots, retained entitlement | First implementation |
| Table service | Customer reserves a seat; worker delivers; customer receives | Seat/table ownership, delivery route, abandoned seats, delivery pay | Later, after pickup is understandable |

The [interaction research](a02-coffee-service-2026-11-01-evidence/interaction-research.md)
compares these using developer material from Coffee Talk, PlateUp's game-domain
documentation and primary SimPy resource documentation. They supply interaction
and modeling precedents, not evidence of demand or enjoyment in THE GAME.

The [source audit](a02-coffee-service-2026-11-01-evidence/source-audit.md) found no
current coffee handoff. The manuscript is the only physical-item type; bread is
a special project; reading tea is a one-event transfer without inventory. Cup
scenery and Kevin's status-driven animation are not inventory evidence. Add a
small coffee-specific contract; do not weaken those existing validators.

## One journey the player can understand

1. At the counter: **Coffee · 2 coins · collect here**. Show queue length,
   active staff, and the actual reason service is unavailable. Terms: “2 coins
   pays the person who brews your coffee and places it here. Cancel for a full
   refund until a worker accepts. Once accepted, the cup remains yours to
   collect when ready.” Show estimated wait as conditional, never guaranteed.
2. Choose **Buy coffee — 2 coins**. Receive ticket `Coffee for [name]`, initially
   **Waiting for a worker**. Money is reserved; no cup exists yet. Leaving the
   café is allowed. No purchase occurs from entering, dialogue or model text.
3. An eligible worker chooses **Prepare [name]'s coffee — earn 2 coins**.
   Their acceptance identifies this exact order and discloses the complete
   unit and incomplete-work abandonment terms. The customer sees **Brewing**.
4. After actual work, the worker places the labelled cup at the counter.
   Show **Ready for [name] · made by [worker]**. Earn the fee and create the cup
   together. A short authored callout may make this personal, without asserting
   anybody heard it unless the ordinary audience rules establish that.
5. The customer approaches the pickup point and chooses **Collect my coffee**.
   Show **Coffee received** and put that exact cup in their inventory. This
   is the fulfilment receipt. The worker need not still be there.
6. Inventory offers **Drink coffee**. Doing nothing keeps the cup. Drinking
   consumes it once and leaves its history. It grants no coins or second wage.
   No hunger, health, friendship, compelled drinking or silent expiry is added.

Use native accessible actions and existing feedback/focus recovery, not sprite
dragging. Ready cups need a small visible label/count on the counter, distinct
from decorative cups. The player's ticket remains readable when away; Collect
is disabled with “Return to the pickup counter.” The worker sees actual work
progress and why it stopped. A saved receipt can be reopened the next day:
“Sub prepared your coffee yesterday; collected / still waiting / drunk” using
only recorded facts. This is a small persistent consequence, not proven repeat
demand. NPCs cannot know private receipts merely because a ledger exists.

## Prototype parameters and demand

| Parameter | Proposed value | Meaning and limit |
| --- | --- | --- |
| Price / complete work fee | 2 / 2 town coins | Every order funds its whole incremental wage; café retains zero margin |
| Work | 20 eligible game minutes brewing + 10 placing | Illustrative tuning, not measured realism; travel and waiting add time |
| Equipment | 1 brewer | Occupied by one brewing worker; released before placement |
| Pickup capacity | 2 logical cup slots | Reserved when work is accepted; released on collection or incomplete cancellation |
| Staff ceiling | 2 concurrent coffee workers | From player, Sub, Northern; one order per worker; no new residents |
| Queue ceiling | 6 unresolved tickets | Counts queued, accepted, ready and pending refunds; one such ticket per customer |
| Carried cup ceiling | 4 per actor | Proposed inventory bound; checkout reserves a future inventory slot |
| Purchase frequency | No mandatory daily purchase or daily reset | Another affordable voluntary order is possible after collection |

These are explicit adoption/tuning proposals, not changes to the existing
5-coin/180-minute shift. No ingredients, equipment purchases, fixed salaries,
idle pay or hiring costs are modeled. If any is introduced, price and funding
must cover it explicitly. With zero margin this unit does **not** refill the
old shift wage pool. “More staff” means more consenting funded per-order work,
not a promise of permanent salaried positions.

All eight existing actors may be buyers; the player always decides personally.
Do not ship the synthetic demand schedule as automatic NPC shopping. For a
bounded offline pilot, only Sub and Northern get a new authored opt-in purchase
opportunity during a free café visit. Each has an initial discretionary ceiling
of 2 coins from their existing purse; net coffee spending consumes it, and
actually settled coffee wages may replenish it. This is permission to spend
their own money, not an allowance or guaranteed purchase. They may decline,
keep a cup, attend another commitment, or save earnings. Refunds restore only
the permission consumed by that refunded order. No involuntary debt spending,
purchase on model speech, or fresh budget at midnight. Other scripted buyers
in the experiment are explicit test decisions, not proposed authored behavior.

New orders require an available inventory entitlement, an open queue and at
least one currently willing eligible worker other than this buyer in the
café service session. A worker cannot fulfil their own order in this slice. Do
not accept new orders while both pickup slots already contain ready cups.
Workers may still decline later; queued orders remain cancellable. Acceptance
requires a free brewer and pickup slot, exact funding, worker availability and
current consent. Choose the oldest eligible paid order, with order sequence as
tie-breaker. Worker selection among consenting candidates is deterministic and
rotates after completion; it must not monopolize work for the player by default.

Finite existing money and voluntary spending cannot guarantee work every day.
No demand means no orders and no new wages. Hoarded wages can stop circulation.
That remains a valid outcome rather than a reason to issue coins. The earlier
three-cycle comparison and seven-day actual-engine trace establish this limit.

## State and money contract

Proposed optional `Town.coffee` version 1 is an owner-reviewed integration
change, not an edit in this checkout. It contains a monotonic order sequence,
orders, cups, station assignments and canonical action receipts. Missing field
means no coffee activity. Store local monotonic IDs and existing actor IDs;
resolve public/action references through `townRecordRef` and the current
identity registry. Never use display names or wallet addresses as identity.

Each order freezes local `id`, purchaser/recipient (same actor in this slice),
rules version, price/fee, payment/hold IDs, creation time and sequence. Mutable
revision-checked fields contain phase, worker/acceptance, phase work progress,
pause status, station/slot reservation, cup ID and terminal receipts. Each cup
contains immutable `id`, source order, maker and owner; revision; custody
(`counter(slot)` or `held(owner)`); ready/collection times; and optional consumed
time. Consumed records are tombstones, never reusable inventory. Ownership is
assigned to the buyer when the ready cup is created; collection changes custody.
Before ready, the paid order is the buyer's entitlement, not a usable cup.
The inventory invariant is `held unconsumed cups + uncollected-order inventory
entitlements <= 4` per actor. Ready cups count through their entitlement, not
twice. Pending refunds have no cup entitlement but still count against the
six-order unresolved-obligation ceiling and that buyer's single active ticket.

| Command / event | Preconditions | Atomic result |
| --- | --- | --- |
| Quote | Authorized buyer near order point; service can admit | Pure view of terms; create a stored quote only on explicit quote interaction, never each render |
| Buy | Exact current quote, funds, queue, inventory entitlement and service availability | Buyer −2, café +2; reserve exactly 2 for this order; create `queued` ticket and future inventory entitlement; no cup |
| Cancel queued | Buyer owns still-unaccepted order | Commit funded cancellation, release inventory entitlement, refund 2 using its hold; `refunded`, or `refund-pending` if buyer cannot receive yet |
| Accept | Named worker consent, oldest eligible order, no conflicting commitment, brewer and pickup slot free | `queued → brewing`; bind worker/terms; lease brewer and slot; money remains held |
| Eligible work tick | Correct assigned worker at required stand position, active phase, same café, no interruption | Add at most one eligible minute once per authoritative game tick; never catch up from wall time or dialogue |
| Brewing complete | 20 eligible brewing minutes | `brewing → placing`; release brewer, retain worker/slot; route to placement stand |
| Place ready | 10 eligible placement minutes, worker at placement point, reserved slot and all evidence valid | `placing → ready`; create one owned cup at counter; earn exactly 2 and settle from this hold, or preserve earned payable if payout cannot settle; worker freed |
| Collect | Named owner, ready cup/order, at pickup stand, exact revision, reserved inventory capacity | `ready → collected`; move exact cup into inventory; release pickup/future inventory slot; record fulfilment once; no financial change |
| Drink | Named owner holds unconsumed cup, exact revision | Record consumed tombstone, remove usable cup, free carried slot; no financial change |

Protect all old payroll and debts first. An unprotected legacy café claim
blocks admission; existing protected 5-coin shifts retain their own holds.
Coffee receipts cannot be used by another job while reserved. If the worker's
purse is full, `ready` still earns the fee; keep the funded payable and retry
settlement using the existing receipt. Never roll back the cup or give earned
money to another person. Earned payable status is independent of order/cup
status: collecting or consuming never deletes that payable or its hold.
Cups created = held + ready + consumed; one cup per
completed order, at most one payment, one refund OR earned fee, one fulfilment
and one consumption for the appropriate IDs. No negative balances or holds
greater than their funded account.

For settled ordinary orders, incremental café cash is
`2 × purchases − 2 × paid fees − 2 × refunds`; each unresolved fee/refund is
covered by a hold. The new-town fixture remains 90; existing/imported towns
preserve their own initially audited total, which can differ. Holds are claims on cash,
not additional cash. Retain exact source/destination/amount receipts, not just
a total. The six-order staffing test preserves legacy café 5 and grocery 4
holds without simulating unrelated attendance or paying them again.

## Interruptions, absence and concurrency

- **Before acceptance:** buyer cancellation or service closure owes the full
  unearned amount. A worker declining does not spend it or create a cup.
- **After acceptance:** unilateral customer cancellation cannot confiscate work
  or spend a promised wage. The customer may leave and return. If a worker
  chooses **Abandon unfinished order — no fee; refund customer**, explicitly
  discard that incomplete work, refund its held 2 and release resources. No
  successor inherits progress or partial pay in this first slice. Terms must
  be shown before acceptance; this is not cancellation of an earned wage.
- **Refund cannot settle:** a buyer can earn after purchase and fill their
  999-coin purse. Commit `refund-pending`, release only the work/station and
  future inventory reservations, retain the full 2-coin refund hold and named
  payable, and show **Refund waiting: purse full**. No cup can then be made.
  Retry once capacity is available; only successful transfer marks `refunded`
  and releases the money hold. Pending refunds block another purchase by that
  buyer, but do not occupy the brewer or pickup counter. Never drop a liability
  because an order left the work queue or fund it by reversing another wage.
- **Pause or blocked movement:** retain progress, assignment and reservations;
  only eligible work advances. Paused brewing retains its brewer, visibly
  blocking it until resume or explicit abandonment. Midnight, app suspension
  and reload do not award work or silently cancel. Later work follows ordinary
  priority/conflict rules; nobody is forced out of a prior commitment.
- **After ready:** no automatic refund, disappearance or fake collection. The
  named cup persists and occupies a pickup slot across days. The fee is earned.
  Two absent customers can stop new preparation. Show the reason and permit
  cancellation of still-unaccepted tickets. Storage/expiry/disposal need a
  later explicit policy; do not steal a cup or claw back wages to free space.
- **Collected/consumed:** no first-slice resale, gifting, dropping, export or
  return. Four carried cups can stop that customer's new purchases until they
  drink one. Keeping is voluntary and consumption is never invented.
- **Retries:** command ID plus exact payload is idempotent, including after
  reload; return the prior receipt before checking a now-old expected revision.
  Same ID/different payload rejects. A new ID with stale order/cup revision
  rejects unchanged. Atomic staging covers money, order, cup, holds, reservations
  and evidence. Save failure remains visible and must not falsely acknowledge
  durable success. Browser stale-tab guards still apply.

## Space and actual work

Candidate positions reuse the existing counter geometry: brewer fixture `(5,19)`
with staff stand `(5,18)`; pickup fixture `(6,19)` with two logical cup slots,
placement stand `(6,18)` and customer stand `(7,19)`. Slots are distinct cups on
one fixture, not two avatars on one tile. All interaction stands must be
walkable, in the café and adjacent to their exact fixture. Order and collection
use the customer stand. A waiting worker remains at a reachable free floor
position and must actually reach the brewer after it becomes available.

The [geometry probe](a02-coffee-service-2026-11-01-evidence/geometry-probe.md)
checks static reachability separately from the staffing model. The actual
navigation integration must still check occupants. `findPath` normalizes a
blocked target and can allow an occupied goal; a returned path alone is not
proof that the exact service stand is available. Do not target the blocked
counter, teleport actors, or add a second movement pass. Coffee goals enter the
existing one-pass movement arbitration, yield to prior accepted commitments,
and update service progress only from real positions. The player retains
manual movement and pause controls. No additional model call is needed per tick.

## Staffing experiment and what it proves

The [executable model and results](a02-coffee-service-2026-11-01-evidence/service-model.md)
compare one and two workers with the same six declared purchases, starting
balances, brewer and shelf. Four buyers arrive at minute 0 and two at minute 40.
Immediate collection is an explicit experimental assumption, not automatic
game behavior. Extra workers do not create these purchases. All nine legacy
payroll coins remain separately protected; balances and holds are checked
throughout. A machine-only variant, absent customers, refusal and interruption
test the limits of the apparent speedup.

This is an independent deterministic model, **not an engine/browser acceptance
test**. It omits actual walking duration, authored choice probability, human
attention, machine failure, ingredients and overhead. Inspect the linked report
for measured synthetic times and executed test cases. Full worker/refund-purse
payables, actual navigation, compatibility and authoritative shared-world behavior still
need integration tests even where the abstract contract is exercised here.

## Implementer boundary and acceptance

Sol can introduce `coffee-types.ts`, `coffee.ts` and a small domain validator;
wire additive commands through existing economy transaction guards; add pure
views/actions through `effects.ts`; and integrate movement/progress in `sim.ts`
and `navigation.ts`. Save/type changes require the explicit integration pass.
Keep manuscript, bread, library and current shift contracts unchanged. UI owner
can wire a coffee section through existing `ActionCards`, `PlayerTools` and
`TownApp`, with source-backed cup art in `render.ts`. This document does not
dispatch either owner or authorize production implementation.

The existing source-authority guard does not generally allow a buyer's UI
command to reserve or spend café funds. Add a narrow validated coffee permission
bound to command kind, actor, exact order, prior payment, hold, amount and
permitted destination. The original buyer is the sole refund recipient;
buyer cancellation, accepted-worker abandonment, trusted service closure and
pending-refund settlement are separately validated causes. Only the recorded
worker's earned payable can settle their fee. Do not label a
player command `simulation` to bypass consent, grant general till access, or
reuse the library's work kind as coffee evidence. Tests must attack each guard.

Restore retains the same identity registry and local coffee records. An explicit
local fork keeps the local story, obligations and cup records, while current
world/character references resolve through its new registry, as for existing
records. Historical origin metadata, if kept, is provenance only. A stale action
envelope from the original world cannot execute in the fork. Test queued, ready,
consumed, refund-pending and earned-unsettled forks. Forked local stories do not
copy a claim on shared money or external assets; that remains a separate
authoritative integration.

Required game acceptance cases (requirements, not passed-game claims):

1. **Complete encounter:** order, real travel, acceptance, brew, place, leave,
   return, collect, keep through reload, drink. Exactly one cup/fee/receipt/use;
   new-town total 90 (or the existing town's own opening total), all eight
   identities, original memories/debts intact.
2. **Two customers:** distinct named cups; wrong actor, wrong cup/order, distant
   collection, stale revision and forged “served” model output reject unchanged.
3. **Two workers:** same demand/resources; independent occupied tiles; no extra
   movement or concurrent double assignment. Compare queue, ready and received
   times independently, including when the second worker cannot help.
4. **No/low demand and refusal:** no money or items generated; unaffordable/full
   queue/full inventory/full counter produces honest disabled reasons; declining
   a purchase or job preserves balances and authored choice.
5. **Cancellation boundary:** before acceptance full refund; after acceptance
   customer cannot refund protected labor; explicit incomplete abandonment
   refunds once; after ready wage and cup survive absence and midnight.
6. **Interruptions:** pause in both phases, block each destination, route around
   an occupied tile, suspend/reload, resume without lost or duplicated minutes;
   older commitments retain priority. No automatic final placement from time alone.
7. **Races/recovery:** double click and lost response at buy/accept/place/collect/
   drink/refund; same-key replay vs conflicting payload; stale second tab;
   reload between every transition; contradictory raw saves preserved for
   recovery, never repaired by issuing cash or silently clearing coffee state.
8. **Legacy money:** accrued and reserved café wages, grocery wages, personal
   bread debt and unfinished/finished library funding remain correct; full
   worker purse leaves a funded earned payable even after drinking; full refund
   recipient leaves `refund-pending`; eventual settlement pays once. Unauthorized
   till reserve/release/transfer and changed refund destinations reject.
9. **Compatibility/rollback:** ledgerless v1 and pre-coffee v2 load with no
   fabricated cups; manuscript and bread still work; coffee saves round-trip.
   Restore/fork behavior preserves scoped records and rejects cross-world stale
   commands. Feature-off blocks new orders but preserves collection, payment and existing
   obligations. Do not load coffee saves in an older build that discards this
   field. Retain export/backup and a compatible drain/recovery reader.
10. **Accessible/offline:** keyboard/touch and 390×844 / 1280×800 browser checks;
    clear pending/ready/received states, focus after Drink, save-failure feedback,
    no wallet or model-provider access needed. Dialogue never substitutes for
    engine evidence of received/drunk.

First do a paper/action walkthrough with three to five people, then a local
playable slice. Have each buy a coffee, leave, return, identify their cup, keep
one and drink another; add another worker and then leave two cups uncollected.
Before explaining, ask where the money went, when pay was earned, where their
cup is, and what will happen tomorrow. Observe whether pickup feels like
receiving and whether anyone wants a second coffee without a collectible reward.
Measure confusion, waits and repeat choices separately from solvency. If the
social handoff is missing, compare direct acceptance at the same counter without
changing prices or rewards. Synthetic success cannot establish enjoyment.

## Merge with Proof of Coffee without expanding the first slice

Use one receipt chain: **order/payment → funded accepted work → ready cup/wage →
customer collection → optional consumption**. “Proof of Coffee completed” means
collection, not merely payment or preparation. Its journal entry can survive
drinking; the usable coffee cannot. This merges A02's money with the companion
proposal's observable service, while retaining the distinctions each needs.

A future QR can open the correct café/recipient offer; it must not infer a
wallet from a name or pre-authorize somebody's receipt/drinking. Buying for
another agent first needs recipient invitation/consent and a gift/refund policy.
A pixel cup can be ordinary game art now; deciding it is an NFT adds a separate
asset contract. Same-item export must lock the cup and prevent parallel use;
a commemorative stamp must say it is a souvenir, not another drink. Local saves
are not an authoritative external-payment or export ledger. Shared authority,
operator limits, copied-save rejection, currency/fee handling and actual wallet
compatibility remain separate qualified integration gates.

Next session should implement/review only this encounter in an authorized owner
lane after checking the current baseline, then test it with people. The material
product choices exposed here are pickup versus direct handoff, the full-fee
preparation contract, and the honest no-expiry/capacity limits. Keep them visible
for feedback rather than starting a broad marketplace or token system.
