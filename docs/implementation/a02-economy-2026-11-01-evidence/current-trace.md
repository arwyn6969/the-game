# A02 current-rule seven-day trace

Source: `a26714e03192a17acaa963d7d2681e74a1ac425b`; Node v24.22.1. Run from repository root:

```sh
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node docs/implementation/a02-economy-2026-11-01-evidence/current-trace.mjs
```

Seven game-calendar days (07:00 Day 1 through 23:59 Day 7); actual current engine advanceTown with authored offlineResult, normal action validation and synthetic player positioning. No clock skipping or NPC teleportation; player travel time is intentionally excluded. A core experiment, not a browser/UI/human playtest. All fresh towns keep their original 90 coins. Balances are never manually adjusted.

221 explicit health checks passed: eight actors, zero economy/library validation errors, 90 coins and no issuance/retirement. Every daily save/export passed readTownFile and preserved financial state and all eight stable identities. Full account balances, all transfers, every hold/release, agreements/payables, debts, refusals and action results are in [current-trace.json](current-trace.json). The JSON contains synthetic financial projections and authored public project events only, not private towns or character seeds.

## no-library

| Day | Player café work | Player cash | Café cash / available | Grocery cash / available | Library custody | Transfers that day |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | 5 paid | 9 | 12 / 12 | 12 / 12 | 0 | till:cafe → agent:kevin: 5; till:grocery → agent:baba: 4; till:cafe → agent:player: 5 |
| 2 | 5 paid | 14 | 7 / 7 | 12 / 12 | 0 | till:cafe → agent:player: 5 |
| 3 | 5 paid | 19 | 2 / 2 | 12 / 12 | 0 | till:cafe → agent:player: 5 |
| 4 | Unavailable | 19 | 2 / 2 | 12 / 12 | 0 | None |
| 5 | Unavailable | 19 | 2 / 2 | 12 / 12 | 0 | None |
| 6 | Unavailable | 19 | 2 / 2 | 12 / 12 | 0 | None |
| 7 | Unavailable | 19 | 2 / 2 | 12 / 12 | 0 | None |

Blocked offer: The cafe cannot reserve the full wage of 5 now.

## library-left-pending

| Day | Player café work | Player cash | Café cash / available | Grocery cash / available | Library custody | Transfers that day |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | 5 paid | 9 | 8 / 8 | 8 / 8 | 8 | till:cafe → project:library-index: 4; till:grocery → project:library-index: 4; till:cafe → agent:kevin: 5; till:grocery → agent:baba: 4; till:cafe → agent:player: 5 |
| 2 | 5 paid | 14 | 3 / 3 | 8 / 8 | 8 | till:cafe → agent:player: 5 |
| 3 | Unavailable | 14 | 3 / 3 | 8 / 8 | 8 | None |
| 4 | Unavailable | 14 | 3 / 3 | 8 / 8 | 8 | None |
| 5 | Unavailable | 14 | 3 / 3 | 8 / 8 | 8 | None |
| 6 | Unavailable | 14 | 3 / 3 | 8 / 8 | 8 | None |
| 7 | Unavailable | 14 | 3 / 3 | 8 / 8 | 8 | None |

Blocked offer: The cafe cannot reserve the full wage of 5 now.

## library-reading-refund

| Day | Player café work | Player cash | Café cash / available | Grocery cash / available | Library custody | Transfers that day |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | 5 paid | 5 | 11 / 11 | 11 / 11 | 0 | till:cafe → project:library-index: 4; till:grocery → project:library-index: 4; project:library-index → agent:player: 2; project:library-index → agent:arwyn: 2; project:library-index → agent:northern: 2; agent:player → till:grocery: 2; agent:player → till:cafe: 2; agent:player → agent:baba: 2; project:library-index → till:cafe: 1; project:library-index → till:grocery: 1; till:cafe → agent:kevin: 5; till:grocery → agent:baba: 4; till:cafe → agent:player: 5 |
| 2 | 5 paid | 10 | 6 / 6 | 11 / 11 | 0 | till:cafe → agent:player: 5 |
| 3 | 5 paid | 15 | 1 / 1 | 11 / 11 | 0 | till:cafe → agent:player: 5 |
| 4 | Unavailable | 15 | 1 / 1 | 11 / 11 | 0 | None |
| 5 | Unavailable | 15 | 1 / 1 | 11 / 11 | 0 | None |
| 6 | Unavailable | 15 | 1 / 1 | 11 / 11 | 0 | None |
| 7 | Unavailable | 15 | 1 / 1 | 11 / 11 | 0 | None |

Blocked offer: The cafe cannot reserve the full wage of 5 now.

## Interpretation and limits

The three paths isolate a circulation gap. Existing wages are fully reserved before acceptance and paid after 180 eligible café minutes. No unearned shifts are paid on idle days. Kevin's existing agreement retains its reservation and pays only when his authored attendance completes; see the journal rather than assuming a nightly wage. New grocery shifts are absent on every day in these fixtures.

The pending-library path deliberately leaves the accepted check unfinished. Its reserved fees and custody survive all seven days; this is a lawful blocked/idle case, not a missing payment. The completed path uses the actual library evidence/report/independent lookup lifecycle, routes Northern and reading guests through advanceTown, purchases one real tea tray and one real bread tray, attends the free reading, consumes a separately accepted loaf, repays its personal debt to Baba and refunds the project's unused 2 coins (1 per till). It retains blocked premature completion, stale action rejection and idempotent duplicate sale evidence.

Library paid checks and public records are useful bounded content. A finished reading does not create another event or another new sale each day. Refunding and purchasing delay exhaustion by circulating already existing coins; neither guarantees continued wages. A personal bread repayment is not grocery turnover. Unavailable work does not imply lost earned wages.

All action kinds exercised have ordinary UI entry points, but this script calls engine functions directly and moves the player to required locations. It excludes travel cost and click/discovery difficulty. advanceTown resolves jobs with authored local fallback; no live or paid inference runs. No claim about browser usability, spontaneous resident demand, retention or enjoyment follows.

## Opening accounts and interrupted-work check

| Account | Opening coins |
| --- | ---: |
| agent:kevin | 11 |
| agent:arwyn | 8 |
| agent:northern | 2 |
| agent:baba | 9 |
| agent:sub | 5 |
| agent:player | 4 |
| agent:data | 6 |
| agent:amelia | 7 |
| till:cafe | 22 |
| till:grocery | 16 |

Activation preserves and reserves Kevin's 5-coin café agreement and Baba's 4-coin grocery agreement. Thus the initial available tills are 17 and 12. Full minute progression pays both existing units on Day 1, not once per day. These are opening commitments, not new player grocery opportunities.

A separate actual-engine interruption case accepts a new café unit, rejects duplicate acceptance without mutation, performs 60 eligible minutes, explicitly suspends it, saves/reloads and passes midnight. The full 5-coin hold and 60 minutes remain. Resuming and completing the other 120 minutes next day pays exactly 5 once; a final roundtrip retains it. This supplemental case is not included in the three seven-day tables. The occupied commitment and held funding are deliberately unavailable during suspension.

Reload checks also compare every actor's names, projects and all memory content after canonicalizing documented loader whitespace/protection rules, optional flags and absent/undefined fields. The completed-library scenario reloads after eating but before repaying, proving the still-owed tab survives consumption and reload.

Harness development failures retained in the JSON: an initial snapshot assumed a non-null lookup on an unfinished project; a second run omitted the explicit `listen` argument for Join the reading. Both were harness mistakes corrected to the source contracts. A later raw-memory equality assertion exposed normal loader defaults (false seed/protected and undefined turns) plus content-based protection and trailing whitespace trimming; the comparison canonicalizes those documented rules while retaining every other field. No engine behavior changed.

Daily project snapshots retain public story events as well as finances. The completed path records Arwyn using the report on Day 2. Current source schedules Baba's note 30 game minutes after the lookup, with Day 3 as another trigger; it is not exclusively a Day 3 unlock. These finite consequences do not replenish commerce or create another paid task automatically.
