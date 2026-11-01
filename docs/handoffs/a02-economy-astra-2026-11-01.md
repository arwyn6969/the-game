# A02 economy handoff — Astra design lane, 1 November 2026

**Verdict:** current accounting is conserved, but current demand does not fund
repeatable work. Recommend one optional **2-coin preordered café preparation**
with its entire 2-coin fee reserved for the worker. Keep existing 5-coin shifts,
earned wages, debts and library rules. Honest idle days are part of the design.

The deliverable is the [implementable specification and acceptance cases](../implementation/a02-cafe-loop-astra-2026-11-01.md).
It defines demand, consent, exact state transitions, quote/reservation/payment
timing, interruption/refund terms, useful public consequences, UI, compatibility,
rollback, code boundaries and a five-person diagnostic. **No production behavior
is implemented or authorized by this handoff.**

## Checkout, baseline and ownership

- Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a02-economy`.
- Branch: `codex/a02-loop`; fetched main/source revision:
  `a26714e03192a17acaa963d7d2681e74a1ac425b`.
- Local delivery consists only of this uniquely named handoff, the uniquely
  named specification and its evidence directory. The final chat gives the
  delivery commit; `git log -1 --format=%H` in this checkout resolves it.
- The workspace wrapper is an empty Git repository, while the actual product
  repository is the linked-worktree group. Created this separate checkout with
  `git worktree add -b codex/a02-loop ... origin/main` from `town-work-polish/`.
  No existing checkout was reset, copied over or cleaned.
- Root START_HERE and the handover assign Sol `a01-replay/`, production runtime
  and shared status/framework updates. Those files and the shared Page were
  not edited. Read-only inspection of preserved source was used. No other chat
  or Grokbot was awakened or messaged; internal subtasks reviewed this packet.
- Read the complete supplied handover, START_HERE, applicable AGENTS, current
  handoffs, economic/first-week/community-project designs, branch/collaboration
  records and relevant engine/tests. User's explicit boundary overrides the
  generic instruction to update CURRENT_STATUS: proposed wording is below.

Read-only GitHub checks on 1 November confirm [#61](https://github.com/arwyn6969/the-game/pull/61)
open, ready at `cd44d165002ddd75b6c92e5ce0efb9ac4fecd568`, and
[#62](https://github.com/arwyn6969/the-game/pull/62) open/draft at
`44745f42719b66230e6ee99d248c8bbe79c2359c`, stacked on #61. Exact-head Verify
runs [40506547367](https://github.com/arwyn6969/the-game/actions/runs/40506547367)
and [40865099031](https://github.com/arwyn6969/the-game/actions/runs/40865099031)
are successful. #59 remains a separate open draft, not a dependency.
[Baseline receipt](../implementation/a02-economy-2026-11-01-evidence/baseline.json).
No new deployment/hosted qualification or live-provider state is claimed.

Main and #62 have identical `economy.ts`, `funded-work.ts`, `payroll-runtime.ts`,
`commerce.ts`, `reading-evening.ts`, `sim.ts` and `town.ts`. The inspected
`community.ts` diff adds budget/payment projections; the café `effects.ts`
diff clarifies funding text. Thus the trace uses fresh main accounting rather
than the stale `product/` working tree or another owner's candidate.

## Seven days, reconciled

[Current-rule report](../implementation/a02-economy-2026-11-01-evidence/current-trace.md)
and [full journal](../implementation/a02-economy-2026-11-01-evidence/current-trace.json).
Actual engine progression from Day1 07:00 through Day7 23:59, authored local
fallback, actual action validation; synthetic player positioning excludes
travel/discovery effort. No clock skipping or NPC teleportation. This is
core-only evidence, not normal-controls UI or human play.

| Path                                                             | Player 5-coin shifts paid | First unavailable | Day7 café / grocery / player | Day7 library          |
| ---------------------------------------------------------------- | ------------------------- | ----------------- | ---------------------------- | --------------------- |
| No library                                                       | Days1–3                   | Day4              | 2 / 12 / 19                  | None                  |
| Funded library left unfinished                                   | Days1–2                   | Day3              | 3 / 8 / 14                   | 8 custody, 6 reserved |
| Completed library, both reading trays, personal tab paid, refund | Days1–3                   | Day4              | 1 / 11 / 15                  | 0; 6 paid, 2 refunded |

Every path retains **90 coins**, eight identities, valid accounts and daily
save/import. The full journal includes every account, receipt, hold, release,
payable, debt and rejected attempt; totals alone are not the evidence.
Existing Kevin5 and Baba4 payroll are protected and lawfully paid on Day1,
not replenished every day. The grocery has no new player shift offer. The
completed path sends bread2 to grocery, tea2 to café, personal tab2 to Baba,
and library refunds1 to each till. Consumption does not erase the bread debt.

**221 explicit health-check checkpoints pass.** Supplementary actual-engine
work interrupts after60 eligible minutes, suspends/saves/crosses midnight,
resumes120 and pays exactly5 once. Duplicate acceptance, premature completion,
stale actions and duplicate sales remain in evidence. Reload compares financial
state/identities exactly and memories/projects under documented loader
normalization. Harness mistakes and their corrections are retained, not passed
off as product failures or silently discarded.

The source's dated note can arrive30 minutes after lookup (this trace Day1
07:50), not only Day3. Arwyn's report use appears on Day2. Those consequences
are real bounded content, but neither generates another reading sale or wage.

## Recommendation, alternatives and limits

The [reference-model report](../implementation/a02-economy-2026-11-01-evidence/cycle-model.md)
compares daily2-coin café receipts with5-coin shifts, two repeat-reading sales,
and a new2-price/2-fee service. The first two consume old till cash or leave
intermittent work. Three2-coin sales could cover an old5-coin wage, but require
broader demand and retain a surplus whose circulation needs explanation.

Use only Sub, Northern and the player for the new service. One active order,
one preparation/day maximum, no player autopurchase. Residents may make one
initial2-coin purchase from existing purses; subsequent spending permission
comes from actual earned service fees, not a daily allowance. Existing café
payroll must be clear before taking any prepayment. The complete2 is held
atomically for either the agreed worker or an unearned refund.

Sub→player, player voluntarily→Northern, Northern→Sub circulates the same
coins through a prepared public activity. A ready table/public source card and
next-day outcome distinguish service from mere attendance. Earnings remain if
the customer does not use the result. No affection purchase, hunger gate or
mandatory participation is promised.

**15 independent model scenarios pass**, plus64 deterministic30-day schedules
with466 completed and494 rejected/refused attempts. A stipulated voluntary
ring repeats300 days with unchanged balances. If the player keeps both NPCs'
initial purchases and never spends, they fund only2 player tasks, then stop.
Hoarding cannot be solved by claiming stronger guarantees from bookkeeping.

The model checks debt, library participation/refund, protected and unresolved
payroll, no/low demand, refusal, concentration, interrupted work, actor/stage
validation, stale/duplicate requests, JSON reload, worker abandonment and
payment/refund capacity. It does not test production routing, automatic demand
selection/timing, browser controls, production extension validation, content
quality or enjoyment. The specification explicitly lists those acceptance
cases. Initial Sub/Northern fixture balances were swapped during model
development; corrected to **Sub5/Northern2**, source-bound and regenerated.
Actual-engine traces were never affected.

## Decisions for Arwyn

1. Adopt the separate bounded preparation unit at price2/fee2, with zero retained
   margin and existing abstract tray supplies. This is a new scope, not repricing
   or cancellation of a5/180 agreement. No extra coin source is proposed.
2. Adopt the small authored demand/worker roster, receipt-derived NPC spending
   limits, voluntary participation and visible inactivity. Automatic daily
   player income is deliberately not the objective.
3. Treat the public table activity and tomorrow's card as a hypothesis requiring
   human evaluation. Do not expand the economy if people understand it but do
   not value the result.

No confirmation was needed to finish this authorized local specification.
Implementation, integration/publication, production migrations and any paid
services remain outside this assignment.

## Verification and next implementation handoff

Node24.22.1 at
`/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.
Dependencies installed from committed lockfile via `npm ci --ignore-scripts
--offline`. No database credentials, inference or network calls by experiments.

Reproduce from this checkout with that Node binary:

```sh
node docs/implementation/a02-economy-2026-11-01-evidence/current-trace.mjs
node docs/implementation/a02-economy-2026-11-01-evidence/cycle-model.mjs
node --test scripts/town-economy.test.mjs scripts/town-commerce.test.mjs scripts/town-quality-community.test.mjs scripts/town-quality-save.test.mjs scripts/town-shift-context.test.mjs
```

The existing focused production suite passes **84/84 tests**. The two evidence
scripts pass Node syntax, targeted ESLint and formatting checks. There are no
production changes; a full build, production migration, full browser suite and
live inference were neither necessary for this design packet nor claimed.

After adoption, Sol can implement only this specification on an explicitly
chosen current baseline. Start with the typed optional service state and
transaction/hold/payable validator; add its bounded actions and matching UI
together. Preserve A01's final behavior and #61/#62 controls deliberately.
Run the specified engine/save/interruption and actual-control acceptance cases
before claiming the prototype works; then use the short human protocol.
Do not generalize a market, scheduler, banking system or broad roadmap here.

Suggested shared-framework/status update **for Sol to apply**, not applied here:
“A02.1 local economy analysis is complete: three seven-day engine traces
reconcile90 coins; conditional2-coin customer-funded café preparation is
specified with stress evidence and acceptance cases. Policy adoption and A02
implementation/human value testing remain open. No runtime, shared schema,
merge, deployment or live inference changed.”

## Next session: combine the café contract with Proof of Coffee

Added after Arwyn asked whether to bring the parallel ideas together and to
make a plan for the next session. This is a proposed integration plan, not
adoption of the price or permission to change gameplay now.

Read the chat **Research Proof of Coffee economy**
(`01a196ad-9d79-74d1-a2e3-a1ca28008ade`) and its
[research note](../../../planning/resident-development/PROOF_OF_COFFEE_RESEARCH_2026-11-01.md)
alongside the A02 specification linked above. Both were inspected read-only.
The research note was written while A02 was in progress; its statement that
the economic comparison is still underway is historical. A02's design is now
complete but its proposed policies remain unadopted. No separate visual chart
was found; the inspected material is the chat and its saved research note.

**Recommendation: combine the activity and receipt contract; stage the wider
shared-world work separately.** A02 answers who wants the result, who pays,
what earns a fee and why circulation can stop. Proof of Coffee adds a clear
customer journey and a durable record of actual receipt. Two independent café
payment systems would duplicate authority and create contradictory receipts.
Conversely, making A02 depend on visitor admission, multiplayer and a live bot
interface would postpone the small repeatable activity unnecessarily.

### Scope of the next session

Produce one reconciled, implementation-ready amendment to the existing A02
specification, one customer/worker walkthrough and a single acceptance matrix.
Use this checkout for the design work. Keep the existing specification and
evidence as the baseline; do not rerun a broad economy study or overwrite the
other research chat's note. Runtime implementation remains a bounded Sol task
after the service and policy choices are adopted.

1. **Refresh source and ownership.** Read START_HERE and Sol's current handoff;
   verify the implementation baseline and avoid assuming A01/#61/#62 have
   merged. Preserve `a01-replay/` and Sol's shared-record ownership.
2. **Choose one deliverable.** Decide whether the first customer buys a prepared
   table with a drink, as A02 specifies, or a collected cup, as the visitor
   proposal suggests. Recommended default: keep the funded preparation unit,
   let the customer collect the prepared drink at the same café point, and keep
   the table/public activity as optional use. This proposed amendment must
   specify its completion evidence and collection lifetime; do not silently
   rename tea as coffee or expand the worker's paid scope to delivery.
3. **Join the contracts.** One order ID links the quote, prepayment, hold,
   worker agreement, preparation evidence, wage, customer collection receipt
   and optional use. Preparation earns the agreed fee; receipt proves only
   collection; sitting/consumption needs its own evidence. Keep current
   cancellation protections and settle exactly once. Customer collection
   avoids adding a hidden unpaid delivery task. A ready-but-uncollected order
   retains the worker's wage and never earns a customer completion stamp.
4. **Keep the local prototype bounded.** Existing player/residents, one
   outstanding financial order and at most one preparation/day. A second
   customer sees unavailable capacity and is not charged. An informational
   ticket may show state, but a multi-customer queue is deferred. Decide
   separately whether an uncollected ready drink occupies physical capacity;
   releasing the financial slot must not silently erase an earlier drink.
5. **Specify the handoff and test it on paper/with existing synthetic tools.**
   Walk through normal collection, customer refusal, departure before/after
   worker acceptance and preparation, two simultaneous requests, interruption,
   reload/lost-response retry, full wage/refund purse, stale/forged collection,
   expiry, no demand and hoarding. Preserve money, identities and prior claims.
   End with exact changes to the A02 acceptance matrix and one bounded Sol
   implementation prompt, rather than two competing specifications.

The opening choices are **service scope** and whether to adopt the proposed
**2-coin price / 2-coin worker fee / zero retained margin**. A Proof of Coffee
receipt does not answer either question and adds no new source of coins.
The material-supply abstraction must stay explicit. If those choices remain
open, record them precisely and finish the reconciled contract without partial
runtime changes.

### Shared definitions and later boundary

| Record | Exact meaning | Financial effect |
| --- | --- | --- |
| Order/ticket | Named customer requested the specified service under accepted terms | Only its disclosed prepayment/hold |
| Preparation receipt | Bound worker completed the agreed preparation | Earns the funded fee once, even if customer subsequently leaves |
| Collection receipt / Proof of Coffee | The authorized customer actually received this order | Informational; no customer coin reward or additional worker payment |
| Use/follow-up record | Actual consumption, seating or public activity occurred, or the collection/use window expired | No implied purchase, affection, verification of truth or new wage |

Use world/character/order/action IDs and a rules version from the outset.
A local prototype receipt is evidence under the local engine's rules; it is
not a tamper-resistant shared-server proof or proof of an independent person.
Preserve the authority boundary for a later adapter without building that
adapter merely to show the local café interaction.

After the local activity is useful and dependable, the shared-server packet
can add authoritative time, a real queue, two clients/restart recovery,
operator-level limits, revocable bot control and explicitly admitted visitors.
Its separate acceptance includes human reclaim, stale delegated commands,
related bots, and copied local saves that must not mint shared funds. Visitor
starting funds need their own explicit conserved source/admission policy.
Neither fresh visitor purses nor customer reward stamps may quietly become
the cure for exhausted business funding. Blockchain integration, POA linkage
and real-asset rewards have no requirement in this minimum plan.

The human question remains: **does the customer want this café encounter
without being paid to visit?** Test whether people value the service and choose
another visit; a receipt alone proves neither usefulness nor enjoyment. If
coffee turns into a compulsory chore or an unnecessary gate to work, retain
the useful receipt machinery and change or drop that encounter.

Resume prompt: “Read the A02 handoff's Next session section, its specification
and the Proof of Coffee research note. Reconcile them into one bounded local
café order/collection contract and acceptance matrix. Preserve preparation
wages, optional participation and the existing eight identities. Resolve the
service scope and price policy explicitly. Prepare one implementation handoff
for Sol; keep live queues, visitors, bot credentials and shared-server work in
a later packet. Do not change production or shared planning records in this
design session.”
