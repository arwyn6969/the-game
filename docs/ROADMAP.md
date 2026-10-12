# THE GAME: roadmap for the next playable week

Updated 12 October 2026. This is the current planning entry point. The dated reviews are historical evidence; proposed features below are not shipped features.

**Product promise: “I come back because of what I did yesterday.”** Build a small community where chosen work produces a useful result, payment is explainable, and people remember the player's actual contribution. Keep the existing five residents and the player. The original Kevin World think-tank vision becomes playable through their different contributions to a shared problem; the proposed larger cast comes later.

## Read and build

1. [Product strategy and first week](design/consequential-first-week.md): the intended experience, choices, bread direction and playtest gates.
2. [Value, investment and fair contribution](design/economy-and-fair-contribution.md): economic principles, the eight-coin example and ownership.
3. [Implementation plan](implementation/community-project.md): ordered packets, state contracts, migration and acceptance tests.
4. [Sol 6.1 brief](prompts/SOL-6.1.md): ready-to-use assignment for the first packet, with instructions for subsequent packets.
5. [Release record](RELEASE.md): what was actually published, checked and left unverified.

## Verified starting point

The trust-repair game was published to https://thegame.grok.me on 12 October 2026. Runtime source is `4e7786c30431e6701c8477d6ddb0b5ffa8ba8ca1`; `900015b2a3bba0a0826ea6d814f72af2f47dc7f0` adds its release record. This planning branch includes that main revision. Future implementation must fetch and report its actual base; these SHAs identify the reviewed baseline, not a command to discard newer work.

The released tree passed 317 script/app/auth tests, 64 town tests, typecheck, lint with one inherited warning, diagnostics and a production build. Hosted checks confirmed the new bundles, explicit shift choices, desktop/phone movement and saved progress after reload. Hosted import/recovery was not reverified because Chrome file-upload access was unavailable. See the release record for the remaining limits.

| Capability         | Current state                                                                           | Next gap                                                                               |
| ------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Town and residents | Five residents, places, routines, movement, time controls and replay                    | Make residents' different knowledge useful in an activity                              |
| Talk and memory    | Online dialogue, offline fallback, notices, stored exchanges and retrieval              | Make public consequences understandable; keep private knowledge private                |
| Player consent     | Explicit Choices for bread, eating, payment and shifts; stale/repeated actions rejected | Reuse this authority boundary for funded tasks                                         |
| Work               | Cafe shift 16:00–19:00; full attendance can earn 5 from its till                        | Useful output, reserved pay, employer-specific progress and durable unpaid obligations |
| Bread              | Receive one loaf with a tab of 2; eat it; repay Baba separately                         | Eating has no health, energy or work benefit; sharing is unbuilt                       |
| Economy            | Personal purses, business tills, debts and wage transfers                               | Unexplained nightly funding, till caps and incomplete accounts; no project ledger      |
| Persistence        | Browser saves, v1 import/export, recovery and save warnings                             | Account-based cross-device saves and conflict handling                                 |
| Community project  | Design only                                                                             | Funded library index, observable use, corrections and attribution                      |

## Current design assessment

**Overall: 5/10 as a game today.** This is a qualitative assessment from the code, release evidence and independent Astra review, not measured retention. The concept has a strong identity, but too few actions make a useful difference tomorrow. Passing tests establish correctness within their coverage; they do not establish enjoyment.

| Area                 | Design score | Reason                                                                            |
| -------------------- | ------------ | --------------------------------------------------------------------------------- |
| Vision and identity  | 8/10         | A persistent community with distinct expertise has a clear direction              |
| First session        | 5/10         | Work and bread can be chosen; interesting decisions and useful rewards are scarce |
| Reason to return     | 3/10         | State persists, but few consequences change the next visit                        |
| Economy and fairness | 3/10         | Consent works; production, investment and complete accounting remain weak         |
| Trust and usability  | 7/10         | Save and interaction repairs are released; AI waits and unsupported prose remain  |

## Three priorities

1. **One useful, fairly funded contribution.** Build a three-record library index with an identified budget, reserved task payments, different resident expertise and an actual lookup that can succeed or fail. Show money spent, work done and benefit delivered separately.
2. **A different tomorrow.** Carry the result through reload and game-day changes. A specific mistake produces a paid correction opportunity; a working index changes a visible library interaction. Acknowledge the player's real contribution, refusal or withdrawal without inventing feelings or promises.
3. **An understandable first session.** Within a target 10–15 minutes, let a fresh player discover a need, read terms, choose an action and see a result. Keep controls responsive and offer a brief journal of agreements and outcomes.

## Delivery order

These are bounded implementation packets, not parallel permission to edit the same files. The implementation plan owns detailed contracts and stopping points.

| Packet | Scope                                                          | Exit condition                                                                                                                     | Status                               |
| ------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| S0     | Trust repairs and identified publication                       | Explicit choices, recovery, reply visibility and verified live source                                                              | Released; preserve regressions       |
| S1     | Accounts, reservations and migration                           | Account commands reconcile; funded-work/migration tests pass; all current money paths have an activation adapter plan              | Next                                 |
| S2     | Three-record library project                                   | A chosen paid contribution produces a working or visibly provisional index through ordinary controls, without a key                | Planned; depends on S1               |
| S3     | Tomorrow, week-one consequences and responsiveness             | Outcomes, attribution and bounded corrections persist; public knowledge has a source; delayed background AI does not block walking | Planned; depends on S2               |
| S4     | Purposeful bread and one optional shared meal                  | Inventory use is discoverable; voluntary sharing produces a specific social encounter and remembered outcome                       | Planned; after the project is useful |
| S5     | Observe players and release the next slice                     | Journey and save checks pass; playtest evidence supports the loop; separately authorised hosted publication is verified            | Planned                              |
| Later  | Cross-device saves, richer dialogue and additional specialists | Each addition solves an observed problem; account isolation/conflicts and provider budgets are tested                              | Deferred                             |

S1 must prevent new project spending from consuming existing payroll commitments. It must also resolve legacy wage progress without inventing lost earnings or discarding recorded work. There is no blanket approval here for an expanded banking, trading or generic job system.

## First-session and first-week proof

Day one: discover the library problem, inspect its funded offer, choose or refuse one bounded task, see the resulting lookup, and inspect the receipt. The player can leave with a concrete reason to revisit. Day two: show an actual use or an identified error, remember the player's part and offer any correction with its own funded terms. During the first game week: preserve the common result, record use and credit, and let the player choose further involvement. Progress uses game time; absence from the app creates no punishment or unchosen obligations.

Run five uncoached 10–15 minute sessions across desktop and phone, then reopen each saved town on the next game day. Diagnostic targets: four can explain their action's visible consequence; four recognise it after reopening; three voluntarily choose a further visit. Record confusion and quotes. These targets do not establish population retention. If people understand the result but do not care, revise the problem before expanding the cast or map.

## Coordination and open branches

Checked on 12 October 2026; recheck before implementation:

- [PR #5](https://github.com/arwyn6969/the-game/pull/5) contains this planning pack and the completed historical Astra review. Plans are not runtime changes.
- [PR #11](https://github.com/arwyn6969/the-game/pull/11) is an unmerged visual redesign at `971c52ab4a0623a4a6453d1125bbb075e2587fef`. It touches TownApp, render, styles and root assets. Do not overwrite it with an older whole-project export or merge it implicitly into a gameplay packet. Start engine work independently; establish a stable UI baseline before integration.
- [PR #9](https://github.com/arwyn6969/the-game/pull/9) is a contributor handoff draft. Reconcile its README edits when integrating documentation.
- [PR #6](https://github.com/arwyn6969/the-game/pull/6) is an optional technology-memory preference and original Kevin World notes. It is not required for the library's deterministic expertise roles and has not been published.

Use one checkout/branch per active implementation lane. Sol owns simulation, accounts, save contracts and tests. UI integration has an explicitly named owner once the visual baseline is agreed; the original Sol/Grok lane split is not a reason to leave a requested integration unfinished. Read [coordination guidance](COLLABORATION.md) and preserve the host, provider, auth and PWA contracts.

## Decision boundaries

Approved planning direction: a funded common library index, fair task payment, persistent consequences, then optional useful bread interactions. Starting totals, payment amounts and player-test thresholds below are prototype defaults to test, not universal economic rules. The default eight-coin project budget is deliberately small. A changed budget or task scope must retain the accounting and fairness invariants and be explained in the implementation handoff.

No new residents, expanded map, multiplayer, token trading, bank, provider migration, compulsory hunger system or cross-device architecture in S1–S3. User-facing prompts must state what is available now. Historical [Astra direction](reviews/2026-10-11-astra-direction.md) and [evidence](reviews/2026-10-11-astra-evidence.md) remain dated records; this roadmap and the current release record resolve their superseded status statements.
