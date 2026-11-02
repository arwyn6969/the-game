# A02 proposed-cycle reference experiment — 1 November 2026

This experiment supports a **conditionally repeatable 2-coin café preparation service**. It does not establish that residents will demand it, that a human enjoys it, or that THE GAME implements it. The separate current-rules trace uses the game engine; this file deliberately tests an independent arithmetic/state model so that the proposal's financial assumptions can be examined before implementation.

Files: [executable reference](cycle-model.mjs), [retained results and rejected attempts](cycle-model-results.json). Local base: `a26714e03192a17acaa963d7d2681e74a1ac425b`, branch `codex/a02-loop`. Node `v24.22.1`.

Run from this checkout:

```sh
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node docs/implementation/a02-economy-2026-11-01-evidence/cycle-model.mjs
```

The command uses no game saves, inference, credentials, services or network. It writes only the adjacent results JSON. All 15 scenarios pass. A deterministic 64-pattern × 30-day sweep of the recommended roster completes 466 orders and records 494 rejected/refused attempts; days without attempted demand are idle. Checks cover conservation, journal reconciliation, nonnegative available money, preserved holds, one earned unit per day, duplicate commands, atomic rejection and JSON round trips. These are reference-model assertions, **not production regression tests**. Successful repetitive operations after Day 7 are counted rather than all printed; every failed/replayed scenario attempt is retained. The sweep reports aggregates; its exact schedules are reproducible from the script.

## What is assumed

- Opening accounts are a fixed source-checked fixture: Kevin 11, Arwyn 8, Sub 5, Baba 9, Northern 2, player 4, Data 6, Amelia 7, café 22 and grocery 16: **90 coins**. The script independently reads `town.ts` literal declarations and asserts **each identity's balance**, not merely the total; it does not execute `createTown`. An early draft swapped Sub/Northern, which conservation alone did not detect; this was corrected before final evidence generation. Existing payroll of 5 is protected in the café. The model does not advance the existing work schedule or pay that legacy wage; the independent engine trace covers that behavior.
- A customer voluntarily pays 2 from their own available purse to the café; the same atomic transition reserves all 2. A distinct consenting worker completes one bounded preparation and earns 2. The café retains zero margin. Its existing funds are never the subsidy for this task.
- One active order and one earned preparation per game day are capacity limits, not demand guarantees. No self-order job is allowed. Purchasers, workers and existing NPCs retain their identities.
- The proposed roster is **Sub, Northern and the player**. Other residents remain unchanged. The all-eight ring below is explicitly a mathematical sensitivity, not the proposed production roster.
- Each participating NPC can spend at most `min(2, max(0, 2 + settled preparation wages − net order spending))`, and only when actual available cash after existing owed personal liabilities covers 2. The initial 2 is permission to spend their **existing** money, not a balance credit. Refunded orders restore permission; the day does not reset it. Player purchases always require the player's explicit choice, with no mandatory reinvestment.
- The strictly ordered example evidence markers (`prepare`, `match`, `deliver`) stand for read-order, set-card and prepare-tray interactions. The model records those markers then explicitly calls the completion command; the implementation must commit the last preparation, ready-table and earned payable atomically as specified. They are not proof of real navigation, attendance, authored dialogue, valid production evidence IDs or useful output. The model does not implement the 10:00–16:00 request window, noon demand evaluation, 60-minute fallback/expiry, NPC route feasibility, public content, usage, opt-outs or UI. Those remain production acceptance requirements.
- Material inputs use the existing tray abstraction. No ingredient expenditure is modeled. Zero margin and the bounded service offer are material policy decisions awaiting adoption; a production cost model cannot quietly be added without changing the price/fee equation.

## Seven days of the recommended cycle

Each arrow means **customer purse → café 2; café holds 2; after the agreed preparation, café → worker purse 2**. All customers and workers are stipulated to consent. The player voluntarily buys on Days 2 and 5. These choices cannot be inferred from a model or enforced to keep circulation moving.

| Game day | Purchaser → paid worker | Sub after | Player after | Northern after | Café / active payroll hold | Total cash |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Opening | No order | 5 | 4 | 2 | 22 / 5 | 90 |
| 1 | Sub → player | 3 | 6 | 2 | 22 / 5 | 90 |
| 2 | Player → Northern | 3 | 4 | 4 | 22 / 5 | 90 |
| 3 | Northern → Sub | 5 | 4 | 2 | 22 / 5 | 90 |
| 4 | Sub → player | 3 | 6 | 2 | 22 / 5 | 90 |
| 5 | Player → Northern | 3 | 4 | 4 | 22 / 5 | 90 |
| 6 | Northern → Sub | 5 | 4 | 2 | 22 / 5 | 90 |
| 7 | Sub → player | 3 | 6 | 2 | 22 / 5 | 90 |

Kevin, Arwyn, Baba, Data and Amelia stay at 11, 8, 9, 6 and 7; the grocery stays at 16. A funded but unfinished order temporarily makes café cash 24 with 7 held (5 prior payroll + 2 task), so spendable café funds remain 17. Completion returns it to 22 cash / 5 held / 17 available. The same three-order ring runs for **300 days**, completing 300 paid units, returning all purses to opening values on Day 300 and creating no money. This proves that the proposed transfers *can* circulate; it does not prove demand, scheduling, content variety or enjoyment for 300 days.

## Three small alternatives

For comparison only, the first two rows assume willing purchasers can actually pay each listed 2-coin sale. They do not invent a recurring NPC purchase path in current source. Their common opening café is 22 with 5 of existing payroll protected. The wage attempt occurs after that day's sale; an unaffordable attempt remains blocked. Intermittent receipts can reopen a later opportunity.

| Alternative | Assumed demand over seven days | Wages paid | Blocked wage days | Closing café / protected payroll | Limit |
| --- | --- | ---: | --- | ---: | --- |
| Generic café sale alongside the existing 5-coin shift | One 2-coin sale each day | 6 × 5 | Day 6 | 6 / 5 | Each paid day consumes 3 of prior business cash; later sales can unlock occasional work, not a daily guarantee. |
| Repeat the reading refreshment occasion | One 2-coin tea sale on Days 2 and 5 | 4 × 5 | Days 4, 6, 7 | 6 / 5 | More authored events and purchases still do not close a 5-coin daily wage loop. Current source has only one reading. |
| Separate customer-funded preparation | One consenting order per day, 2 price / 2 fee | 7 × 2 | None under the stated consent schedule | 22 / 5 | Repeatable only while someone chooses to buy and someone chooses to work. Old shift terms remain untouched. |

The first alternative can also be designed honestly as **less frequent 5-coin work**: accumulate at least 5 of available receipts, reserve the wage, then offer a shift. That is solvent, but neither smaller useful output nor daily availability follows from this arithmetic. The chosen service instead links one payment to one delivered result and does not use the old till balance to mask a margin deficit.

## Stress results and intentional inactivity

| Scenario | Executed result | Claim and limitation |
| --- | --- | --- |
| Low demand | Only Day 2 pays 2; Days 1 and 3–7 are idle; cash remains 90. | No jobs or charges appear without demand. |
| Customer/worker refusal | Customer refusal changes nothing; worker refusal leaves the funded offer unaccepted; cancellation refunds the original payer. | Refusal is financially neutral; no relationship/enjoyment model exists here. |
| Player takes all work and hoards, **recommended policy** | Sub and Northern each buy once; player rises from 4 to 8, Sub is 3, Northern is 0. Both NPC discretionary budgets are then 0; Days 3–300 do not refill them. | At most two NPC bootstrap purchases fund the player's retained wages, using existing money. Remaining Sub savings are protected from repetitive purchases. |
| All-eight spending with no discretionary budget, **sensitivity only** | If all seven NPCs buy until their purses are below 2 and only the player works, 22 orders pay; player reaches 48 and NPC purses total 4. The next order fails. | Unbounded NPC shopping postpones the same hoarding stall and is rejected as the production policy. |
| Concentrated holdings, **sensitivity only** | Explicit synthetic transfers move every NPC purse into the player, who refuses to buy; no service occurs although café cash still exists. | Balanced books cannot force demand out of a hoarder. Fixture transfers are not proposed gameplay actions. |
| Existing claims | A café with unresolved prior payroll rejects the new order. Its protected 5-coin hold remains untouched. | New demand does not authorize spending earlier wages. |
| Personal debt | After a player earns 2, their explicit 2-coin bread-tab repayment credits Baba's purse; grocery remains 16. | Service payment does not forgive or garnish debt, or change its creditor. A separate NPC-liability case blocks optional spending when the remaining purse cannot cover an existing 4-coin liability plus the order. |
| Library participation | 4 from each till → library 8; 2 to each of three completed-unit workers → custody 2; 1 refunded to each till. Separate service leaves café 19 / grocery 13 / town 90. | This is an isolated transaction fixture, not a second production library lifecycle. No-library ring keeps 22 / 16. |
| Interrupted accepted work | One preparation step survives six game days and JSON reload with its full 2-coin hold; on Day 7 remaining steps pay once. | Time does not erase work or reallocate its funds. New orders remain unavailable while it is active. |
| Cancellation after acceptance | Customer unilateral cancellation rejects; the bound worker may explicitly abandon an unfinished two-stage unit under the disclosed no-partial-fee terms. The model refunds 2, archives both observations and restores net-spend eligibility. | No customer confiscation of accepted work; worker choice is necessary. Completed or payable work cannot be abandoned/refunded. |
| Duplicate/stale commands | Same payload replays without another transfer; changed payload under the same ID rejects; stale revision and wrong worker reject atomically. | Exact state checks are in this model, not a claim about production integration. |
| Model-originated proposal | Rejected without charge or obligation. | A production authority check remains required. |
| Full recipient purse | In a separately labelled imported-opening fixture (1,085 coins, player already 999), preparation creates a payable and retains the hold; after a legitimate spend frees capacity, settlement pays once. | This is an import/capacity boundary test, not an increase to the 90-coin economy or a way to hide exhaustion. |
| Full refund recipient | The player prepays from 999; a separate lawful fixture transfer fills the purse again. Cancellation commits `refund-due`, retaining the hold and active slot. An attempted refund rejects until a legitimate spend frees capacity, then pays once. | Failed refund never erases liability or exposes its hold to a replacement order. |

The reference model intentionally permits long inactivity. Finite money, optional participation and arbitrary hoarding cannot jointly guarantee that every business offers paid work every day. Acceptance must test **solvency, actual opportunities, comprehension and enjoyment separately**. Only the first category is substantially addressed by this model; source-integrated tests and human play remain necessary.
