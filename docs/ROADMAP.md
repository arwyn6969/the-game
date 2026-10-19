# THE GAME: current delivery and next gates

Updated 15 October 2026. The current game backlog is implemented in the quality candidate, integrating main through `4a39cdf`. A source candidate and its checks do not establish hosted publication or player enjoyment. The [delivery notes](implementation/game-quality-delivery.md) explain the resulting behavior; the dated [quality review](reviews/2026-10-13-game-quality.md) records the problems that prompted it.

**Product promise: “I come back because of what I did yesterday.”** The seven residents and the player can now contribute to a small common project, inspect its funding, test whether it helped, and encounter its consequences on later game days. The player remains a resident with voluntary choices.

## Current scope

| Area                 | Implemented in the candidate                                                                                                                      | Evidence still needed                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Useful activity      | Northern's first reading; observed locations carry into a reviewable draft; paid preparation; independent lookup; park or library gathering       | Five uncoached players must understand the result and want to revisit                  |
| A different tomorrow | Attributed outcomes, next-day use, later delivery evidence, separately paid correction and closure                                                | Human recognition of the consequence after reopening                                   |
| Economy              | Reconciled eight-actor accounts; immutable transfers and holds; payroll protected before grants; durable work; no nightly money creation/caps     | Broader economic sustainability is outside this bounded demonstration                  |
| Bread                | Inventory eating and one shared meal; optional cash bread/tea trays for the reading, paid into actual business tills                              | Human assessment of whether the encounters add interest                                |
| Access               | Permanent Help, Journal, Inventory, Library and destination navigation; keyboard, touch and single-step controls                                  | Physical-phone keyboard and screen-reader checks                                       |
| Dialogue and memory  | Partner-first relationship context, authored local replies, sourced consequences, bounded complete-record archives, preserved character social UI | Live provider quality and capacity; protected history can still grow                   |
| Responsiveness       | Ambient waits allow time and movement; foreground bounded wait and immediate local reply; stale results rejected                                  | Physical-device performance under real network conditions                              |
| Persistence          | Version-1 migration, validated version-2 financial extension, explicit import backup, guarded multi-tab saves and raw recovery                    | Account synchronization remains deferred                                               |
| AI operation         | Existing verified auth plus shared global/per-user reservations for both provider modes; local-only preference                                    | Operator applies migration and conservative tariffs, then verifies deployed accounting |

Fresh eight-actor towns start with 90 coins. Imported towns retain their valid total, balances, debts and identities. The library receives eight existing coins after payroll protection: six for three bounded tasks and two for a correction. Completed agreed work is paid even when its result fails. Contribution credit grants no ownership. Closing settles earned obligations and returns all unspent money equally to the two funders.

## Delivery packets

| Packet                                                | Status                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| S0: trustworthy choices, recovery and visible replies | Preserved with current main regressions                                                               |
| S1: accounts, reservations and migration              | Implemented and integrated with eight actors and version-2 saves                                      |
| S2: funded three-record library                       | Implemented with ordinary controls and offline operation                                              |
| S3: later consequences and responsive AI waits        | Implemented with persistent outcomes, attribution and correction                                      |
| S4: inventory and optional shared meal                | Implemented with explicit participant and single-consumption rules                                    |
| S5: evaluate and publish                              | Automated candidate checks recorded in the implementation receipt; human and hosted gates remain open |

The S1 source in PR #16 was an inactive six-actor foundation. This candidate reconciles and activates its accounting with the matching UI; its historical 77-coin fixtures do not define a fresh current town. Experimental version-1 ledger files stay recoverable on their source branch. Do not merge the old foundation independently over this integration.

## Next actions

1. Review the candidate diff and fresh verification receipt. Keep the current cast, art, character cards, per-resident drafts, auth, PWA and provider/hosting contracts.
2. Run the [five-person playtest](implementation/game-quality-playtest.md): uncoached 10–15 minute sessions across desktop and phone, then reopen the next game day. Targets are four of five explaining their consequence, four recognizing it later and three voluntarily choosing a further visit. Record actual confusion and quotes; do not infer retention from automation.
3. Perform physical-phone keyboard and screen-reader checks. Resolve any lost payment, unintended obligation, inaccessible essential action or private disclosure before release.
4. Configure and verify the shared AI-budget migration and conservative tariffs in the intended environment. Check failed accounting falls back locally. No production keys, migrations or paid calls were used for the candidate's local validation.
5. Obtain separate hosted-release authorization, publish the reviewed source, and verify its Help build ID, assets, ordinary controls, recovery and save round trip on the host. A GitHub merge alone is not that evidence.

If players understand the outcome but do not care, improve its stakes before adding more residents or map area. The original qualitative 5/10 review is historical; no new enjoyment score is claimed merely because code and tests were added.

## Deferred by scope

Cross-device saves and a continuously running shared town remain outside the current quality delivery. The user has now approved the [stamp identity and wallet tooling sequence](implementation/stamp-identity-tooling.md), starting from `codex/game-quality-review` at `80ee299`: permanent identities → verified stamp selection/optional heads → agent receiving wallets → owner-approved outgoing proposals/transfers → tested trading → shared multiplayer/PvP. Packet 1 is implemented for review as an additive Town v2 identity registry with restore/fork imports; its [verification receipt](implementation/stamp-identity-tooling.md#implementation-receipt) records 559 passing tests and desktop/phone built-browser checks. This does not yet provide a dynamic roster, merged worlds, wallet authority or blockchain transfers.

Map expansion, extra residents, a broad job market, banking, token voting, procedural projects, provider migration and compulsory hunger remain outside the quality delivery. Existing towns, valid financial records and portable backups must survive the identity work. No paid services, mainnet transactions or publication are part of the tooling authorization.

## Reference contracts and history

- [First-week experience](design/consequential-first-week.md), [economic rules](design/economy-and-fair-contribution.md) and [implementation contracts](implementation/community-project.md) describe the bounded loop.
- [Stamp identity and wallet tooling](implementation/stamp-identity-tooling.md) records the approved order, first-packet acceptance checks, wallet compatibility gate and unresolved stamp/persona transfer rules.
- [Consolidation](CONSOLIDATION.md) and [earlier release evidence](RELEASE.md) retain their dated source/publication receipts.
- [Collaboration guidance](COLLABORATION.md) defines ownership and reviewable feature-branch delivery. The original Sol/Grok split is not a reason to leave requested integration unfinished.
