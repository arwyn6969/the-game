# Funded café shifts: comparative synthetic study

This model tests a proposed connection between actual coffee sales and existing-style **5-coin / 180-eligible-minute funded shifts**. It does not execute the game engine or establish production readiness, spontaneous demand, comprehension or enjoyment. Source balances are asserted against town.ts at a26714e. Ordinary scenarios open at 90 coins. The unfunded-bootstrap fixture replaces the café's 22 coins with 5 and opens at 73; the worker-full fixture replaces Sub's 5 coins with 999, and the refund-full fixture replaces the player's 4 coins with 998, each opening at 1,084. Every fixture conserves its own initially audited total; these are separate test inputs, not in-game transfers or issuance. Node v24.22.1.

## Funding rule

Reserve the complete 5-coin shift wage from unrestricted café cash before acceptance. Preserve the existing café 5-coin and grocery 4-coin payroll holds. Each new 2-coin coffee payment enters the café with a matching full refund hold, so **prepayment changes unrestricted café cash by zero**. Create the unique buyer-owned ready cup and release its 2-coin refund hold together. That receipt then becomes available for future payroll. There is **no per-cup worker payment** in this candidate. Staff earn their protected wage from eligible attendance even on a quiet day; no later cancellation or lack of drinking reverses it.

This candidate permits full customer cancellation until ready, even after partial work, because its staff compensation is protected independently. Cancellation releases station/inventory resources and either transfers the refund once or retains a named refund-pending hold if the buyer's purse is full. After ready, the cup persists until collection; no refund/expiry is silently invented. Completion and customer collection are separate events.

## One and two workers, identical six orders

Four declared buyers arrive at minute 0; two at minute 40. Brewing occupies one brewer for 20 minutes; placement occupies its worker for 10 more while freeing the brewer. Two pickup slots are reserved from assignment until collection. Immediate collection, perfect attendance and instantaneous travel are explicit simplifying assumptions. Minutes are elapsed eligible intervals from the service-window start; 180 is the end of its last interval, not a claim that the existing 19:00 attendance API accepts a new minute. Work ends at 180; no hidden overtime.

| Funded workers | Ready minutes | Mean wait | Sales | Wages at 180 | Ending café | Unrestricted café |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 30, 60, 90, 120, 150, 180 | 91.7 | 12 | 5 | 29 | 24 |
| 2 | 30, 50, 70, 90, 110, 130 | 66.7 | 12 | 10 | 24 | 19 |

Two workers complete the same six orders 50 minutes sooner, but sales remain 12 and payroll rises from 5 to 10. Faster service alone does not create enough extra customers to pay for staffing. The previous 2-price/2-fee piecework model pays 12 total and retains 0; one shift retains 7 and two shifts retain 2 before any unmodeled costs. Neither figure is a free surplus: different work commitments and guaranteed quiet-time pay are being compared. The prior machine-bound variant remains evidence that another worker can add no throughput at all.

At this demand level, one shift already completes all six orders by 180. The second shift is therefore a wait-time purchase, not a measured revenue improvement. An additional staff offer needs a complete independent wage reservation and an explicit service decision; it must not trigger automatically from gross till balance or queue length alone.

## Seven-day traces

Every row retains all ten accounts and every hold in the JSON. The 9 coins reserved for legacy payroll remain protected rather than being paid by unrelated attendance invented in this experiment. Financial conservation does not demonstrate that inherited payroll should remain unsettled in the real game.

### Cooperative 2,2,3,3 purchase schedule

| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |
| --- | ---: | ---: | --- | --- |
| 1 | 1 | 2 | 21 / 16 | 9 / 1 / 2 |
| 2 | 1 | 2 | 20 / 15 | 5 / 6 / 2 |
| 3 | 1 | 3 | 21 / 16 | 10 / 0 / 2 |
| 4 | 1 | 3 | 22 / 17 | 4 / 5 / 2 |
| 5 | 1 | 2 | 21 / 16 | 9 / 1 / 2 |
| 6 | 1 | 2 | 20 / 15 | 5 / 6 / 2 |
| 7 | 1 | 3 | 21 / 16 | 10 / 0 / 2 |

### NPC initial 2 plus actual wages; one quiet Sub bootstrap shift

| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |
| --- | ---: | ---: | --- | --- |
| 1 | 1 | 0 | 17 / 12 | 4 / 10 / 2 |
| 2 | 1 | 2 | 16 / 11 | 9 / 6 / 2 |
| 3 | 1 | 2 | 15 / 10 | 5 / 11 / 2 |
| 4 | 1 | 3 | 16 / 11 | 10 / 5 / 2 |
| 5 | 1 | 3 | 17 / 12 | 4 / 10 / 2 |
| 6 | 1 | 2 | 16 / 11 | 9 / 6 / 2 |
| 7 | 1 | 2 | 15 / 10 | 5 / 11 / 2 |

### No customers; willing player

| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |
| --- | ---: | ---: | --- | --- |
| 1 | 1 | 0 | 17 / 12 | 9 / 5 / 2 |
| 2 | 1 | 0 | 12 / 7 | 14 / 5 / 2 |
| 3 | 1 | 0 | 7 / 2 | 19 / 5 / 2 |
| 4 | 0 | 0 | 7 / 2 | 19 / 5 / 2 |
| 5 | 0 | 0 | 7 / 2 | 19 / 5 / 2 |
| 6 | 0 | 0 | 7 / 2 | 19 / 5 / 2 |
| 7 | 0 | 0 | 7 / 2 | 19 / 5 / 2 |

### One daily attempted coffee; player saves wages

| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |
| --- | ---: | ---: | --- | --- |
| 1 | 1 | 1 | 19 / 14 | 9 / 3 / 2 |
| 2 | 1 | 1 | 16 / 11 | 14 / 1 / 2 |
| 3 | 1 | 0 | 11 / 6 | 19 / 1 / 2 |
| 4 | 1 | 0 | 6 / 1 | 24 / 1 / 2 |
| 5 | 0 | 0 | 6 / 1 | 24 / 1 / 2 |
| 6 | 0 | 0 | 6 / 1 | 24 / 1 / 2 |
| 7 | 0 | 0 | 6 / 1 | 24 / 1 / 2 |

### No willing staff

| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |
| --- | ---: | ---: | --- | --- |
| 1 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |
| 2 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |
| 3 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |
| 4 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |
| 5 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |
| 6 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |
| 7 | 0 | 0 | 22 / 17 | 4 / 5 / 2 |

### Four attempted purchases daily; player never spends

| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |
| --- | ---: | ---: | --- | --- |
| 1 | 1 | 4 | 25 / 20 | 9 / 5 / 2 |
| 2 | 1 | 4 | 28 / 23 | 14 / 5 / 2 |
| 3 | 1 | 4 | 31 / 26 | 19 / 5 / 2 |
| 4 | 1 | 3 | 32 / 27 | 24 / 5 / 2 |
| 5 | 1 | 1 | 29 / 24 | 29 / 5 / 2 |
| 6 | 1 | 0 | 24 / 19 | 34 / 5 / 2 |
| 7 | 1 | 0 | 19 / 14 | 39 / 5 / 2 |


The cooperative schedule alternates player/Sub as the worker; the other voluntarily buys 2, 2, 3 and 3 cups over four days, one at a time with collection and consumption between. Four-day receipts of 20 equal wages of 20, restoring **every opening account** after each complete cycle. The 28-day test repeats seven cycles without issuance. Sub's initial 4-coin purchase exceeds the earlier authored NPC initial 2-coin spending ceiling, so this raw schedule is **explicit financial/preference input, not a shipping NPC policy**. A separate seven-day test enforces an initial 2-coin ceiling plus actually settled café wages: a real fully funded quiet Sub shift first costs the café 5 and pays Sub 5, after which the declared circulation sequence passes without new money. The bootstrap is an explicit business decision with a cost, not free initialization or a nightly subsidy. A negative test proves an NPC with remaining cash but exhausted discretion cannot buy again.

These schedules prove conditional circulation is possible; they do not prove that people want these purchases, that NPCs will choose them, or that any finite-money system sustains work under arbitrary refusal/hoarding. Purchases, collection and drinking are disclosed scripted choices. The raw seven-day cycle ends one day short of its next balanced reset.

The quiet and low-demand cases deliberately stop opening new shifts when unrestricted cash cannot reserve 5. Previously accepted wages remain honored. The concentrated-wages case exposes rejected customer purchases as their money runs out. Staff refusal creates no orders, wage obligations or fake work.

## Work, interruption and obligations

The model credits at most 180 eligible minutes under each shift and pays only that agreement. A late order can finish brewing partly before the daily window ends. The worker then stops without free overtime; order progress, contribution records and physical resource reservations remain. A later consenting funded worker can resume, and both workers retain their own wage terms. Resumable brewing occupies the existing brewer; the model does not assume an invisible extra storage/preparation station. Pausing a shift immediately stops its eligible attendance and relinquishes its order assignment, while preserving the order's resource/progress/money state. Another funded consenting worker can claim that same in-progress order. The two-worker pause/reassignment test records 8 brewing minutes from Sub, then 12 brewing plus 10 placement minutes from Northern, with one cup and independently preserved shift wages. Cancellation can free a blocked station before ready. Production still needs actual input/authority guards so a stale old control callback cannot continue the relinquished assignment.

Worker purse overflow leaves an earned 5-coin payable held even after the cup is collected/drunk. Refund recipient overflow leaves a separate 2-coin liability until settlement. Larger full-purse fixtures are labeled test inputs, never additions to the 90-coin experiment. Ordinary transfers used to free capacity move existing fixture money and are explicit test decisions, not proposed automatic spending.

## Executed checks and limits

**22 scenario tests; 39053 invariant audits; 1213 command attempts pass.** Tests cover exact account reconciliation, legacy holds, refusal/hoarding, quiet shifts, customer escrow, no per-cup/shift double pay, ready-only revenue release, cancellation after partial work, late-shift handoff, pause/reload, repeated tick, duplicate/conflicting/stale/wrong-owner actions, one-time collection/consumption, absent buyers, full worker/refund purses and global pause. Twelve seeded mixed schedules independently rerun with a mid-window JSON reload and produce identical complete final state. Rejected/replayed commands assert unchanged model state.

Action authority in this model is a fixture boundary, not proof of engine authorization. To test the funding invariant, model checkout allows a refundable preorder on declared worker willingness before a funded shift exists; a production UI can and should use a stricter availability gate rather than charge for unavailable service. Late acceptance is similarly exercised to prove recovery, not to recommend promising a 30-minute completion with 10 minutes left. Actual physical occupancy, travel, user input arbitration, NPC consent/purchase-budget policy beyond the explicit bounded-budget scenario, saved raw-data validators, v1 imports/forks, existing ledger integration, browser durability and accessible controls remain implementation acceptance. The model does not include ingredient/equipment costs, labor market expansion, real payments, external assets, claim bridges or wallets. The prior 20/10 timing is tuning, not measured café work. No test establishes enjoyment or retention.

Recommendation: the shift-funded candidate better matches a human accepting Kevin's familiar shift, provided ordinary routine service is an explicit bounded control permission and existing shift wages are never retroactively conditioned on cups. Keep the tested piecework alternative as a comparison; do not run both payment rules on the same labor. Gate new shifts on protected unrestricted cash and concrete intended availability. Honest idle/unfunded days remain possible.

## Reproduce

Run Node 24 from a02-economy: `node docs/implementation/a02-readiness-2026-11-01-evidence/shift-model.mjs`. This regenerates [JSON evidence](shift-model-results.json) and this report. No runtime source, live service, credential or actual town is used.
