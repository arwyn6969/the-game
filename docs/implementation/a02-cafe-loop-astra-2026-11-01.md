# A02: one repeatable café service, funded by an actual order

Design specification · 1 November 2026 · **Proposed; not adopted or implemented**

Owner: the A02 economy chat. Isolated checkout `a02-economy/`, branch
`codex/a02-loop`, source base `a26714e03192a17acaa963d7d2681e74a1ac425b`.
The [handoff](../handoffs/a02-economy-astra-2026-11-01.md) records delivery and checks.
Sol retains A01, production implementation and shared status/framework ownership.

## Decision

Add one **preordered tea-table preparation** at Hobbs: a customer voluntarily
pays **2 existing coins**, all 2 are reserved for the person who prepares that
order. Keep the existing **5 coins for 180 eligible minutes** café agreement and
every accrued claim unchanged. Do not promise either kind of work every day.

Use only Sub, Northern and the player as the initial customers/workers. Kevin
authorizes the café service; the remaining residents keep their identities,
plans and roles, and ordinary public access. This is a small authored service,
not a new job market. No coin source, external customer, loan, tax, nightly
top-up, new opening balance or automatic purchase by the player is introduced.

The service is conditionally repeatable: a paying customer funds its entire
incremental wage. A participant can later spend the wage on another participant's
service. It cannot ensure paid work under refusal, hoarding, unavailable workers
or inherited unresolved payroll. Those are visible idle states, not failures to
be hidden with fresh money.

**Adoption decisions:** the new 2-coin scope/price, zero retained café margin,
authored NPC willingness/budget, and optional save extension need Arwyn's design
decision before implementation. This document proposes them; it changes none of
them. Two coins is comparable to the existing bounded library check and reading
tray, not a claim that all work deserves the same wage.

## Evidence and what it establishes

- [Current seven-day trace and reconciliation](a02-economy-2026-11-01-evidence/current-trace.md),
  [machine-readable journal](a02-economy-2026-11-01-evidence/current-trace.json),
  [reproduction](a02-economy-2026-11-01-evidence/current-trace.mjs).
- [Proposed-cycle reference experiment](a02-economy-2026-11-01-evidence/cycle-model.md),
  [results](a02-economy-2026-11-01-evidence/cycle-model-results.json),
  [executable model](a02-economy-2026-11-01-evidence/cycle-model.mjs).

The current trace executes actual main engine APIs, with explicitly synthetic
player positioning. It is not a normal-controls browser journey. The proposed
cycle is a separate arithmetic/state model, not a production implementation or
evidence that residents will choose its assumed demand. Neither proves enjoyment.
Blocked attempts are retained. Exact validation counts and results are in the
handoff; the acceptance cases below are requirements for implementation, not a
claim they have already passed in the game.

Current rules seed 90 coins: personal purses total 52, café 22, grocery 16.
Kevin's existing 5-coin payroll is protected before new expenditure. A new café
shift needs 5 unreserved coins; midnight creates none. The library takes 4 from
each till, pays actual workers 2 per completed unit, then refunds unspent custody
after liabilities settle. A personal bread tab pays **Baba's purse**, not a till.
The single library reading can sell one tea tray into the café and one bread
tray into the grocery, 2 each; its event cannot be reset to create repeat sales.
Grocery guidance is not a new grocery shift offer.

The bare exhaustion trace is useful but not a universal prediction for every
town: receipts and library refunds can enable one more shift. Its limitation
remains that neither a completed one-time project nor one-time refreshments
establishes ongoing demand.

## Three small alternatives

| Cycle                                                          | Wanted result and payer                                                                                                                  | Funding, limits and refusal                                                                                                                                                                         | Assessment                                                                                                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeat a free reading; sell optional 2-coin tea                | A host buys a tray for a public reading; personal purse receives wages/project fees beforehand                                           | One tray per actual event. No sale when host refuses or lacks cash; library and authored scenes need genuinely new events, not replayed first-reading receipts                                      | Socially plausible, but a 2-coin café receipt does not finance a 5-coin shift. Repeating content and supporting more events is larger than the funding fix. Keep as a later use, not the primary loop |
| Ordinary daily café sales supporting the existing 5-coin shift | Residents buy tea for their visits from their own purses                                                                                 | At least three 2-coin sales cover a 5-coin wage, leaving 1 in till. Repeated purchases drain finite customer purses unless workers/owners spend back. Refusal leaves the existing shift unavailable | Avoids a new wage unit but requires broader demand and produces an accumulating café surplus. Daily NPC shopping is neither free money nor proven demand. Reject as the minimum                       |
| **Preordered 2-coin tea-table task, fee 2**                    | Sub wants a table for comparing a public notice with his draft; Northern wants to rehearse a page; player may commission either activity | One actual order holds its whole fee. Small resident budgets are replenished only by actual earnings; customers and workers can refuse. No retained margin                                          | Smallest closed payment path. Can repeat with mutual spending, serves a visible purpose and permits honest inactivity. Recommended                                                                    |

The third option does not recapitalize the old café wage pool: after completion,
its incremental café cash is zero. A full shift remains funded only when other
genuine unrestricted receipts cover it. We are offering a smaller service under
new terms, not disguising a reduction of an existing wage.

For any period with purchases P, paid preparation units W and refunds R,
the incremental café balance is `2P - 2W - 2R`; every outstanding unit accounts
for the corresponding 2-coin hold. After all orders settle it is zero. With
unchanged total cash and a player who takes all wages and never spends, the
other participants' discretionary funds necessarily run out. No finite policy
can guarantee an affordable wage indefinitely against arbitrary hoarding.

## The result the player can actually use

An order is for **preparing a tea table for one named public activity**, not for
making another resident like the purchaser. The customer chooses one of:

1. **Compare the public notice**: Sub brings an authored public draft. If a
   library revision/notice is public, bind its immutable revision and supported
   claims; otherwise offer rehearsal below. Fresh towns have no guaranteed
   public café notice. The
   table presents both short texts and a structured “keep the uncertainty” or
   “use only the supported line” choice. Neither choice changes historical facts.
2. **Rehearse a page**: Northern or Sub brings a short authored practice passage.
   Initial asset `cafe-practice:northern:v1`: “I came here with a page. I would
   like to finish reading it.” Asset `cafe-practice:sub:v1`: “At Hobbs, a table
   stayed empty until someone made room.” Label both as fictional practice
   text, not witnessed history. Choose “hear it quietly” or “read the opening
   together”; no generated facts are required. These new bounded assets are
   proposed content, not claims about existing source content.

Preparation has three visible actions at the café: read the frozen order, set
out its named public card/passage, prepare the tea tray. These create ordered
evidence IDs. The last action records a **ready table** and earns the complete
fee. It does not require guessing a preferred opinion. No fractional payment;
an unfinished unit is resumable. The player can complete the short sequence
while paused; it is explicitly a bounded preparation unit, not a timed shift.
NPC workers must travel to the café and execute the same validated stages on
successive simulation minutes, with no model call or teleportation.

The customer can join the prepared table when present; the named resident can
decline or fail to arrive. Record “prepared, not used” separately from “used”,
and retain earned pay in both cases. A participant's chosen public line or
reading mode appears on the table card. The next game day, the café displays
the previous service receipt and the actual outcome; involved residents can
refer to that sourced shared event. The player can reopen the public card and
its attribution after reload. A new order can follow that outcome, but never
autocommits a purchase. This is the concrete “because of yesterday” connection.

There is no health/energy effect, compulsory hunger, friendship bonus, secret
reveal or exclusive library access. Ordinary free conversations, readings,
public records and declining remain available. The hypothesis is that prepared
shared time and an attributable follow-up are worth commissioning. If humans
find only repetitive busywork, revise or stop this prototype before expanding it.

Material supply remains abstract exactly as with existing reading trays:
Kevin supplies a bounded tea tray without a simulated ingredient purchase.
That is an explicit prototype assumption, not proof of a physically complete
food economy. Zero margin covers the modeled worker cost only. Adding stock,
rent or ingredient costs requires a new price/funding decision and new tests.

## Demand and participation rules (version 1)

- At most **one outstanding order** townwide and **one prepared table per game
  day**. A paid but unused table counts as prepared. There is no backlog of
  off-screen daily orders and no catch-up purchases on reopening the app.
- New orders may be placed 10:00–16:00 at the café board. A player can explicitly
  order whenever that window and the slot are free. No purchase is implicit in
  viewing, accepting work, joining, dialogue, a future invitation or a model reply.
- At the first simulation minute at/after 12:00 and before 16:00, if no order or
  completion exists that day, consider one authored NPC request. Choose the first
  candidate by most recent settled preparation wage among eligible Sub/Northern;
  absent any wage history, Sub first. Try the other only if the first declines/
  is ineligible. Record one evaluation per day, not a retry every tick.
  Demand is absent if neither is eligible. A player order can still use a free
  slot before 16:00; a cancelled NPC order is not recreated that day.
- NPC willingness is deterministic and disclosed as authored behavior: Sub
  requests the public-notice activity when its public source exists, otherwise
  his practice-page rehearsal; Northern requests his page rehearsal.
  Each must have no conflicting active paid/project/meeting appointment, have
  an affordable budget, and not have explicitly opted out. Store separate
  request/work/attendance willingness flags. The player's “leave this activity
  for now” changes only the player's invitations. Resident opt-outs/opt-ins
  require their own trusted authored decision (or validated future proposal),
  never a player toggle impersonating them. All three flags persist across
  reload, and the corresponding action must recheck its flag.
  Future model output can propose a request/decline but cannot spend or accept.
- Each NPC initially permits **one 2-coin purchase out of their existing purse**.
  Repeated spending capacity is `max(0, 2 + settled preparation wages earned
  - net order payments)`, capped at 2 for a single request. Refunded payments
    do not consume capacity. This is a policy eligibility calculation derived
    from exact receipts, not cash, a second balance or a daily replenishment.
    Also require actual available personal cash minus unresolved ordinary debt
    amounts to be at least 2. Unquantifiable conflicting claims block automatic
    NPC spending. A player may make an explicit affordable purchase despite an
    unreserved personal tab, with the tab shown; holds are never spendable.
- Customer cannot be their own worker. Eligible workers are player, Sub and
  Northern, excluding the customer, work opt-outs and conflicting commitments. The player
  can accept the open order directly. The order shows the named eligible NPC
  fallback; after the player explicitly passes or 60 game minutes elapse, that
  NPC may accept under the same fee/criteria. Choose the least recently paid
  eligible NPC, tie Northern before Sub. No reassignment after acceptance.
  A blocked fallback leaves the order unaccepted; it does not commandeer labor.
- No work is contingent on the worker buying a service later. No reputation,
  lost wage, forced spending or debt follows refusal. A rich customer may
  decline; a poor worker may work without buying. Two NPCs can exchange services
  without the player; the player can also choose not to intervene.
- Purchases require clear existing café payroll: after the normal activation/
  protection pass, `payrollFundingReasons(town, 'till:cafe')` must be empty.
  Refuse the **whole** new order if old payroll is unresolved/underfunded. Do not
  use the customer's refundable prepayment to resolve an unrelated claim.

Example of conditional circulation: Sub pays the player 2 through an order;
the player voluntarily commissions Northern for 2; Northern commissions Sub
for 2. After these three completed orders all three purses return to their
opening amounts. Repeat participation permits repetition. Conversely, if the
player takes both NPCs' initially budgeted orders and spends nothing, neither
NPC has further spending permission until they earn. That branch should stall
or turn to NPC-to-NPC work if a funded customer exists; it should never debit
their other savings automatically.

For the seven-day acceptance schedule, the player explicitly orders at 10:00
on Days 2 and 5, before the 12:00 NPC evaluation, and accepts the other offered
work. Most-recent-earner demand and Northern-first fallback ties admit the
shown ring. Timing, willingness, route and commitment checks still decide each
real opportunity; the arithmetic model stipulates those choices and does not
prove the engine will schedule them successfully.

## State and action contract

Use one optional typed `economy.projects.cafeService` value, schema `version: 1`.
Do not change existing exported function signatures, work-agreement terms or
`Town.version === 2`. Add a dedicated validator and history protection; arbitrary
JSON in `projects` is not sufficient validation.

The extension stores policy version, next order sequence, last demand-evaluation
day, last prepared day, participant opt-outs, and immutable order history. Each
order has stable ID, customer ID, topic and public source revision/content IDs,
price/fee, quote/policy revision, created time, acceptance deadline, worker or
null, status, ordered preparation evidence, prepaid transfer ID, hold ID,
earned/payable/payment/refund IDs and separate usage/follow-up records. Personal
and business money remains solely in existing accounts. No shadow till or cash
field. Receipt-derived spending eligibility may be cached only if validated.

Freeze the actual public source text plus immutable provenance/revision IDs in
the placed order, not only a pointer to the latest notice. New public revisions
invalidate unplaced quotes, but accepted work completes against its retained
snapshot. Private facts cannot enter that snapshot. Prepared-table use closes
at 10:00 on the game day after preparation; finalize its public follow-up then,
before evaluating new orders. Later inspection is read-only and cannot change
an archived “unused” outcome. An invitation or paid preparation never implies
that the customer attended.

Only `paid` and `refunded` are financially terminal and release the outstanding
order slot. `open`, `accepted`, `preparing`, `suspended`, `earned` and
`refund-due` retain it. The usage card has its own ready/used/expired state;
paying does not consume it, and expiry never forfeits earned pay.

Proposed exports in new `src/game/cafe-service.ts`:
`cafeServiceView`, `cafeServiceActions`, `applyCafeServiceAction`,
`advanceCafeService`, `cafeServiceMovementGoals`, `validateCafeService`.
Actions use typed discriminated payloads; external text is never an authority.

| Action / transition                                                                         | Conditions and exact effects                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect                                                                                     | Nonmutating view only: do not call quote creation during rendering or Review; existing quote creation appends to the ledger's quote collection                                                                                                                                                                                                                            |
| Request purchase terms → quote                                                              | Deliberate trusted quote issuance may append a quote, but creates no payment/obligation. Bind world identity, current economy/order revision, actor, source revision, price 2, fee 2, cancellation terms and eligibility. Quote lasts 10 game minutes, expires at 16:00 if sooner. Reuse unchanged pending terms rather than issuing on every render                      |
| Place order → `open`                                                                        | Revalidate current quote, daily/active slot, payer consent, budget, purse capacity and old payroll gate. In **one** `runEconomyCommand`, transfer payer→café 2 and reserve café 2 under the order ID. Record refundable entitlement and prepayment receipt. No intermediate tick may spend it. Acceptance deadline is 60 game minutes after placement, or 17:00 if sooner |
| Accept → `accepted`                                                                         | Worker confirms exact scope; worker differs from customer, is physically at café for player acceptance and has no conflict. Bind worker and terms immutably. The existing 2-coin hold remains; do not reserve another 2. NPC acceptance can precede routed arrival, but earns no progress off-site                                                                        |
| Read order / set public card → `preparing`                                                  | At café, bound worker only, current expected stage/source/order revision. Record immutable observation IDs in order. Interruption retains these observations and hold; repeated stages return the prior result without new evidence                                                                                                                                       |
| Prepare tray → `earned`                                                                     | All prerequisite observations exist; worker at café; source matches frozen card. Create exactly one prepared table and an earned 2-coin payable, set last-prepared day. Prefer settle in the same transaction. If recipient cap 999 prevents payment, commit earned state with hold intact, not a false failure or refund                                                 |
| Settle → `paid`                                                                             | Trusted command pays café→bound worker 2 **from this hold**, and records exact wage receipt. Same-day replay, midnight and reload cannot pay again. A full purse retains `earned`; retry only when capacity is available                                                                                                                                                  |
| Suspend / resume                                                                            | Worker can suspend at any unfinished stage. Preserve evidence and full 2-coin hold. Midnight and real-world absence never cancel accepted work. Resume rechecks presence/commitments; the price and agreed criteria do not change                                                                                                                                         |
| Customer cancels before acceptance; unaccepted deadline expires → `refund-due` / `refunded` | Atomically return 2 from the order hold to the original customer; preserve cancellation/evaluation history. If customer purse is full, keep refund liability and hold, release active slot only after refund settles. No replacement order consumes those funds                                                                                                           |
| After acceptance, customer asks to cancel                                                   | Record request only; cannot unilaterally confiscate progress or release wage funding. Worker may resume, or explicitly agree to abandon the unfinished unit under the original no-partial-fee terms. That worker-authorized cancellation refunds 2 and archives observations. Completed preparation cannot be cancelled/refunded; unused is a separate outcome            |
| Join / choose public line / leave → usage record                                            | Does not charge, pay again, promise affection or alter source truth. Customer and named participant must be present and consenting. If refused/absent, record unused or pending attendance honestly. The financial order can be closed with the table still unused                                                                                                        |
| Next game day → follow-up                                                                   | Add one sourced public outcome/participant acknowledgment, guarded by order ID and due day. Never create a new order, obligation or wage by follow-up. No distant private-memory broadcast                                                                                                                                                                                |

The acceptance timeout and fallback check happen in this order on a tick: attempt
eligible fallback at its deadline; if no worker accepts, refund. No money is
taken for an unfunded “request”. At most one player-order purchase quote may
win; two clients/tabs must revalidate world, revision and active slot.

Every mutation binds an engine-generated ID such as
`cafe-service:<world-id>:<sequence>:<action>:<stage>` and canonical payload. The
same ID/same payload returns the saved receipt before current expiry checks;
same ID/different payload rejects. A new ID for an already completed semantic
stage also cannot pay twice. Stale world/revision/price/source quotes reject
without mutation. Reissuing a quote must not reset NPC budgets or order limits.

The core supports `authority: simulation` as trusted code, not as a proof of
resident consent. The new handler must validate recorded NPC willingness or
explicit player input before calling it. Do not simply expose an arbitrary
simulation transfer to the UI or accept authority fields from a model.

## UI and implementation boundaries for Sol

At the café board and Kevin's structured choices, expose “Tea-table orders”.
Lead with actual status: “Northern ordered a reading table · 2 reserved · prepare
three items”, or “No order today”, or the concrete payroll/route/refusal blocker.
Show purchaser, worker, purpose, fee, criteria, cancellation, held/earned/paid,
and prepared/used separately. An order button says “Pay 2 from my coins”; work
says “Accept preparation · earn 2”. Full-shift terms continue to say 5/180 minutes.
“Review” and “Join” must never accept or purchase. Do not expose unrelated
resident balances, private seeds or model retrieval diagnostics.

The result panel should show yesterday's public card/outcome and actual worker,
with source links inside the town. Public attribution is not ownership. Provide
keyboard/touch access, pause-safe actions, route/wait preview, and meaningful
disabled reasons. NPC walking and a previewed optional time advance use ordinary
simulation. An obstructed route leaves progress pending. Do not displace the
library lookup, a meeting or existing paid attendance.

| Likely code boundary                                                      | Proposed change; preserve existing behavior                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New `src/game/cafe-service.ts`                                            | Typed state, authored two-resident demand, quote/actions, lifecycle, stage evidence, projections and strict validator                                                                                                           |
| `src/game/economy.ts`, `economy-types.ts`                                 | Reuse atomic commands, `transferFunds`, `reserveFunds`, `availableFunds`, receipts/quotes. Add narrow immutable-history/hold/payable protections and validation for this extension. Do not add a general bypass or money source |
| `src/game/funded-work.ts`, `payroll-runtime.ts`                           | Reuse payroll gate; leave existing 5/180 and grocery legacy agreements untouched. New service has its own typed bounded agreement/payable; do not force it through library-specific `check` or café-shift validators            |
| `src/game/sim.ts`, `navigation.ts`                                        | Narrow order advance and movement goal, after existing obligation handling; one active appointment, resume-safe. No general scheduler                                                                                           |
| `src/game/community.ts`, `reading-evening.ts`, `commerce.ts`              | Read public library/result facts for source cards only. Preserve the single first reading, event IDs, existing sales and refunds; no resetting them                                                                             |
| `src/game/local-dialogue.ts`, `effects.ts`, `offline.ts`                  | Add structured discovery/acknowledgment where actual exports live; no prose money effects. Keep model proposals validated by the dedicated handler                                                                              |
| New `src/components/town/CafeService.tsx`, `TownApp.tsx`                  | Small order/result panel and board entry using existing action/quote, busy-state, identity and stale-job protections. Coordinate with stable #61/#62/A01 UI baseline                                                            |
| `src/game/save.ts` (`economyProblem`/`validateTown`)                      | Validate extension before legacy normalization, preserve raw failed import, v1/v2 migration and all eight stable identities                                                                                                     |
| New narrowly named `scripts/town-cafe-service*.test.mjs`, browser journey | Financial/lifecycle integration, public knowledge and actual controls. Sol owns these future production tests                                                                                                                   |

Names above are implementation targets, not files changed by this design packet.
Rebase implementation on current approved source when assigned; do not import
the A01 checkout wholesale. #61/#62 improve the UI but are not arithmetic
dependencies of this proposal.

## Compatibility, disablement and rollback

Absence of the optional extension is valid. First explicit activation adds an
empty service record without cash transfers, rewritten history or new people.
V1 import keeps its existing migration and opening snapshot; no backdated NPC
earnings or missed-day budget is invented. Existing valid v2 saves preserve
memories, debt creditors, loans/claims, hold history and financial totals.

Validate all order cash-flow/hold/receipt links, immutable actors/prices/source,
state transitions and unique daily completions. Unknown version, malformed
receipt or contradictory totals must yield recoverable import failure with raw
save retained, never drop the extension or initialize a new town. Reject a
future-dated payment or a model-created completion even if its prose is plausible.

Ship engine and matching UI together behind one explicit prototype feature
switch. Disabling stops new demand/quotes, while existing accepted work,
settlement, refund and receipt viewing remain operational. A regression rollback
must keep a compatibility reader/settler for saves already containing orders.
Rolling back to an older binary that ignores this extension is unsupported:
retain current saves and a pre-enable backup, never delete a town to downgrade.
No production rollback or migration is authorized by this document.

## Acceptance cases for the eventual implementation

These are black-box requirements. Use actual APIs/save validation in engine
tests and actual controls for browser cases; the reference model is not enough.

| ID / category            | Given → when → expected                                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 Solvency             | Fresh 90-coin town, clear payroll; Sub buys and player prepares → total stays90; Sub−2/player+2; café net0; exactly one purchase, hold, completion and wage; all original holds/claims intact                                                                                                                         |
| S02 Payroll              | Café cash5 held for old wage, otherwise clear → order adds2 and holds2; available remains0; neither claim spends the other hold. Café has underfunded/ambiguous claim → whole new order blocked, no charge or new hold                                                                                                |
| S03 Debt                 | Player owes Baba2 → pay tab then buy/prepare where affordable; Baba personal+2 only, old creditor unchanged. NPC owes enough to exhaust discretionary cash → no automatic purchase, reason recorded                                                                                                                   |
| S04 Library              | Repeat S01 with library pending, complete+refund, failed lookup/correction, declined and absent → exact library custody/fees/refunds retained. New task needs no library completion; it uses safe public fallback content                                                                                             |
| S05 Capacity             | Worker at999 → valid preparation becomes earned with hold2, no lost fee, no false paid receipt; free capacity and settle once. Refund recipient at999 → refund-due holds2 until capacity permits                                                                                                                      |
| S06 Refusal/cancel       | Decline work/customer request → no personal obligation/trust penalty. Cancel unaccepted or expiry → exact2 refund; duplicate refund no effect. Accepted partial work → no unilateral customer refund; explicit worker abandonment archives progress/refunds under shown terms                                         |
| S07 Interruptions        | After stage1 and stage2 pause/close/reload/midnight → progress+hold persist; resume needs remaining stages. Prior shift/meeting blocks routing; no unpaid displacement. Prepared but customer absent → wage stays earned, usage says unused                                                                           |
| S08 Replay/atomicity     | Same command replay before/after reload, changed payload with same ID, new ID for same stage, stale source/revision, wrong actor, imported different world, unaffordable payer, model authority → correct replay/rejection, no partial balance/progress effects. Test thrown failure between purchase and reservation |
| S09 Persistence          | Fresh/v1 fixture/v2 saves without extension initialize once, all eight stable IDs and prior memories/debts unchanged. Every transition exports/imports, audits clean. Corrupt/unknown extension preserves raw recovery; never silent rebuild                                                                          |
| S10 Source/use stability | Update public notice after stage1 → accepted work completes against its frozen public snapshot; old unplaced quote rejects. After next-day10:00 → archived card cannot be joined or retroactively change its unused outcome; money/payables unchanged                                                                 |
| O01 Availability         | Three-order Sub→player→Northern→Sub spending/working ring repeated over7 and300 days → every authorized unit fully funded, unchanged total; no daily fixed wage/top-up. Assert per-person balances, not only town sum                                                                                                 |
| O02 Low demand           | One voluntary order on Days1,4,7 → exactly3 tasks; other days show no order. Zero demand → zero charge/wage. Reopen after absence → no retroactive orders                                                                                                                                                             |
| O03 Hoarding             | Player works for both initially budgeted NPC orders and never buys; NPCs earn no fees → at most2 such purchases, then no resident-funded player work. No savings drained beyond approved budgets; outcomes remain visible                                                                                             |
| O04 Concentration        | Valid synthetic town with all freely spendable cash held by one nonparticipant → no affordable demand; no negative funds/new source. Clear recipient circulation resumes only after a lawful voluntary transfer supported by actual game rules                                                                        |
| O05 Limits               | Competing purchases same day, two workers same order, duplicate day tick, cancel/requote loop → max1 active and1 prepared/day, no erased budget spend/receipts. An accepted carried order can block later days honestly                                                                                               |
| U01 Comprehension        | Desktop1280×800/phone390×844, no key, normal controls: discover/review/accept/prepare/paid/use/reopen next day. Before commitment correctly identify payer, fee, scope and cancellation; show two different wage offers clearly                                                                                       |
| U02 Choice/access        | Keyboard/touch can decline, suspend, resume, inspect debt and payment, leave table, pause, export/import. Joining/reviewing never buys. Distant buttons explain travel. No obligation hidden behind generated dialogue                                                                                                |
| U03 Knowledge            | Only participants/witnesses/readers learn the relevant public event; no hidden biography or private finances in public follow-up; unsupported notice fact remains provisional regardless of selected line                                                                                                             |
| E01 Appeal               | Human diagnostic below distinguishes correct payment, delivered service, chosen return and enjoyment. Do not pass this because simulations or balances pass                                                                                                                                                           |

Implementation checks: Node24 relevant new tests plus existing economy,
commerce, community, interruptions and save suites; full repository required
checks for integrated source. Build only with database credentials absent.
No paid/live inference is necessary for these cases. Actual UI tests at both
sizes, physical-device/assistive-technology checks and human sessions remain
separate evidence from engine assertions.

## Short human diagnostic

Five uncoached 10–15-minute sessions, split desktop/phone, using synthetic fresh
and midweek towns, local authored dialogue. Say: “Find something you want to do
in the café, or choose to leave.” Do not tell them to spend wages back. Include
at least one unfunded/idle order view and allow a genuine refusal.

Before committing, ask what will happen to their coins and what earns payment.
After completion, ask who wanted the result, whether they used it, and what
changed. Reopen on the next game day and ask what they recognize. Offer an
undirected opportunity to continue or stop. Record each explanation, confusion,
choice and short quote; do not turn politeness into an enjoyment score.

Keep four separate results: (1) solvency/errors from receipts, (2) available
opportunities/idle reasons, (3) comprehension—target four of five explaining
funding/terms and recognizing their consequence, (4) appeal—at least three of
five voluntarily choosing a further activity, with reasons. These small-sample
targets are diagnostic, not retention estimates. Any lost pay, unintended
purchase or inaccessible essential action blocks acceptance. If people
understand but do not care about the table or tomorrow's result, revise the
service/content rather than manufacture demand or increase balances.
