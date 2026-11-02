# Coffee service: synthetic staffing experiment

Independent reference model, **not game implementation or UI proof**. Source-bound opening identity balances match town.ts at a26714e03192a17acaa963d7d2681e74a1ac425b. Node v24.22.1.

## Parameters and demand

Price and per-order wage are both **2 town coins**. The café receives the sale and reserves its entire price until preparation and labelled counter placement finish. This is a proposed new piecework agreement, separate from existing 5-coin café shifts. A cup is buyer-owned at readiness, held at the counter, explicitly collected, then optionally consumed once. Buying coffee therefore funds actual work; consuming it is not a condition of earned pay.

Four scripted buyers arrive at minute 0 (Kevin, Arwyn, Baba, player); Data and Amelia arrive at minute 40. They each buy once. Same six customers, same 12 coins of sales, same brewer, same two shelf slots in each comparison. Immediate pickup is a declared simplifying assumption. One worker remains assigned through 20 game minutes of brewing and 10 of placement. Acceptance needs a free brewer and shelf slot. The machine is free during placement, allowing two workers to overlap stages. Purchase admission needs declared staff and a pickup shelf that is not already full of ready cups; declaration is not binding agreement to each order. Oldest eligible orders are served first and worker tie priority rotates after completion; nobody fulfils their own order. Checkout reserves a future inventory slot against the four-carried-cup ceiling, releasing that reservation on collection or refund. These timings are illustrative, not observed.

| Case | Completed | Ready minutes | Mean wait, minutes | Ending Sub / Northern |
|---|---:|---|---:|---|
| One worker, one brewer | 6 | 30, 60, 90, 120, 150, 180 | 91.7 | 17 / 2 |
| Two workers, same one brewer | 6 | 30, 50, 70, 90, 110, 130 | 66.7 | 11 / 8 |
| Machine-bound one worker | 6 | 20, 40, 60, 80, 100, 120 | 56.7 | 17 / 2 |
| Machine-bound two workers | 6 | 20, 40, 60, 80, 100, 120 | 56.7 | 11 / 8 |

The second worker finishes the fixed six orders 50 minutes sooner (180 → 130) and lowers mean wait by 25 minutes (91.7 → 66.7). It creates no extra demand or sales: both variants pay 12 coins in wages. In the deliberately machine-bound variant (placement time zero), both worker counts finish at minute 120: additional labor has no effect when the single brewer is the entire bottleneck. Rotating selection shares the machine-bound work between the two workers without improving its throughput. Route congestion, slower collection or different stage timings can erase the modeled gain.

Final ordinary customer balances are Kevin 9, Arwyn 6, Baba 7, player 2, Data 4, Amelia 5. Café ends 22, grocery 16; total stays 90. With one worker Sub earns 12 and ends 17, Northern stays 2. With two workers each earns 6; Sub ends 11 and Northern 8. Original café 5 and grocery 4 payroll reservations remain intact throughout. The new per-order reservations all settle. The café retains zero margin: this model supports per-order labor only, not unmodeled operating costs or idle payroll.

## Refusal, absence and conservation

- No customers: two willing workers earn nothing; all opening accounts remain unchanged.
- Both workers declare availability but then decline actual offers: all six orders remain cancellable; café holds 34 coins including 12 of new wage/refund obligations plus its existing 5 reservation. No work is invented.
- One order and two willing workers: one completion, one wage; willingness alone does not fund the second person.
- Buyers absent: two cups become ready and their workers are paid. Both pickup slots then remain occupied, so the other four orders wait. Café 30 includes 8 reserved for those orders and the existing 5 payroll hold; Sub 7, Northern 4. A buyer can collect later to free capacity. There is no auto-drink, expiry, theft or unpaid wage reversal.
- Paused in-progress work retains its progress and reservation across JSON reload. A paused brewer also occupies the brewer in this deliberately simple policy; abandonment of incomplete work explicitly releases it and refunds the whole sale, with no partial wage. A production design may instead add a validated pause/release policy.

## Tests and boundaries

18 scenario tests pass; 5820 invariant audits across 2907 command attempts. Every rejected or replayed command asserts exact unchanged state. Every accepted mutation audits 90 total coins, identity accounts, reconciliation against unique journal entries, preserved legacy reservations, funding, bounded queue/shelf/brewer/worker use, one cup per completed order and exactly one wage/consumption.

- Before-acceptance cancellation refunds exactly; replay cannot repeat refund.
- Customer cannot unilaterally refund accepted work; incomplete voluntary abandonment refunds fully.
- Ready placement pays once and creates one cup; completed wage cannot be abandoned/refunded.
- Wrong-buyer, stale collection and changed command payload reject atomically.
- Collection and consumption are distinct, repeat-safe and never alter earned wages.
- Paused preparation survives reload and advances only with resumed worker.
- Brewing alone is not completed paid service; incomplete counter placement survives reload.
- Worker holds brewer while paused; explicit incomplete abandonment releases it.
- One active uncollected order per buyer, bounded queue and duplicate purchase.
- Model proposals cannot purchase and workers cannot double-book existing work.
- Admission requires declared staff and declines new sales when both pickup slots are full.
- Retained cups permit repeat demand but never bypass an empty customer purse.
- Four carried cups stop checkout; drinking frees capacity and a paid order reserves the next slot.
- Oldest eligible order wins and a worker cannot fulfil their own purchase.
- Reload preserves queued, assigned, ready, retained and consumed item states.
- Worker tie priority rotates after completion without changing machine-bound throughput.
- Low/no demand and refusal create no wages or implicit customers.
- Absent buyers fill shelf; paid staff keep wages while future work waits.

Model acceptance cases do not replace engine tests. Recipient-purse overflow and retained earned-payable handling are not modeled: the conserved 90-coin fixture cannot fill the engine purse cap of 999. Production must retain a completed wage obligation if its recipient cannot accept settlement. The internal waiting-brewer state is an accepted exclusive brewer lease awaiting engine start; it maps to the specification's brewing phase including approach, not a second worker queued behind an occupied brewer. Approach is immediate in this model. The placement helper hardwires engine authority; it does not prove caller authentication or rejection of forged service output in production. Production must also verify physical presence and reachable counter geometry, interruption/speed/offline scheduling, authored voluntary decisions, signed action/revision authority, v1/v2 save compatibility, existing payroll and debts, accessibility and human comprehension/enjoyment. This packet does not validate external settlement, token export, NFT minting or replay prevention across separate copied saves.

## Reproduce

Run from the isolated checkout with Node 24:

```sh
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node docs/implementation/a02-coffee-service-2026-11-01-evidence/service-model.mjs
```

The script regenerates service-model-results.json and this report. The JSON retains every order, cup, money journal entry and service event (with account/hold/inventory-reservation snapshots) for the comparative and refusal/absence cases. There are no runtime imports, network calls, real towns or credentials.
