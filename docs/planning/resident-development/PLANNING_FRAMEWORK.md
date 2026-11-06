# THE GAME resident development framework

**Build dependable residents whose history survives, then expand their abilities through measured steps.** Start with reliable actions and sustainable work. Prepare identity, event, knowledge and resource contracts before moving the town to a shared server. Add memory, learning and useful tools in bounded increments.

Version 2 · Planning dated 29 October 2026; execution refreshed 6 November 2026 · Development framework for Arwyn and the implementation team, with 18 workstreams, 54 implementation packets and the F00 baseline packet. Scores are planning judgements, not measured product quality or delivery estimates. Planning does not change existing implementation ownership or release permissions.

Repository copy prepared 6 November 2026 from the workspace planning framework. Repository links and the current kickoff brief are portable. Historical checkout names, raw workspace references and older continuation snippets remain dated examples of their original context; they are not directories or assignments a new clone must reproduce. Use the current repository status and handoff for active work.

**Current coordination — 6 November 2026:** Use the [repository current status](../../CURRENT_STATUS.md) for active owners, exact source revisions, deployment and remaining acceptance, and the [server developer handoff](../../handoffs/server-developer-2026-11-06.md) for pickup. The [living Page](https://chatgpt.com/space/page_fc96fe02e3308191b9e5df9e3bbade81) has now been reconciled with the current queue, cast and server clock/freeze requirements. Dated snapshots and historical tables preserve evidence rather than dispatching new work.

# Current work and server kickoff

Use **GPT-6.1 Sol** as the implementation assistant. Selecting the builder does not change any resident's runtime model or provider. Keep the broad plan here, and give each coding session one bounded outcome with the relevant evidence and constraints.

**Current direction — 6 November 2026:** The existing character-release owner is finishing [PR #72](https://github.com/arwyn6969/the-game/pull/72), which already combines nine residents, F1 accompaniment, F2 voluntary teaching/practice, growth and witnessed learning history. Main is `c49facc52136`; PR head was `8b89537322b9` and [Verify 42245485263](https://github.com/arwyn6969/the-game/actions/runs/42245485263) was in progress at the 6 November review. Local integration is qualified at code `556d732` with final receipt `4681631`. Finish the current release gates and a useful human session without rebuilding those features. The next server developer can prepare A03/A04/A09 contracts and one private A05 slice in a separate checkout. Publishing the web app leaves simulation browser-local.

| Immediate queue | Purpose | Completion evidence |
| --- | --- | --- |
| Release and useful play | Close the existing combined candidate with its owner; retain open #64–66 acceptance. | Passing required CI on the actual proposed head, review resolution, named migration/deployment receipts and useful live/human play. |
| F00 Server kickoff | Record the server developer, source base, dependencies, environment and first scope. | Owner, branch/base/head, clock ratio, storage/scheduler, recovery and operating limits recorded. |
| A03.1 A04.1 A09.1 Contracts | Set compatible identity, knowledge and compute boundaries for one reversible activity. | Decision records, preservation mapping and explicit read/write permissions. |
| A05.1–A05.3 Private server slice | Establish durable authority before migrating the whole town. | Two clients converge, both close, duplicate/stale work is safe, restart and coherent restore pass. |
| Later unpaid away trial | Prove revocable delegation and a useful return journal. | Immediate human reclaim, measured useful work and operating cost; funding follows its own gates. |

**Historical execution — 2 November consolidation:** #61, #62 and #63 are merged. [PR #67](https://github.com/arwyn6969/the-game/pull/67) combines the locally implemented A02 café and personal-model controls with that stack, with one current status index and retained source history. PR #67 merged as `c183e32` after Verify 41456836140 passed every step at `722a66c`; the merge tree is identical. The consolidation finished with `product/` clean on main, zero open PRs and only main remaining remotely. The deployment receipt is now in documentation-only PR #68, queued for automatic merge after required CI; see `../../CURRENT_STATUS.md` for the checkout handoff. The café is now implemented, with explicit mixed-play/control/human gaps; it is no longer an unassigned design packet. Use `../../CURRENT_STATUS.md` for exact current source/deployment state. Next acceptance work is [#64](https://github.com/arwyn6969/the-game/issues/64), [#65](https://github.com/arwyn6969/the-game/issues/65), and [#66](https://github.com/arwyn6969/the-game/issues/66). The consolidated runtime `c183e32d3dc4` was published on 2 November at the user's request; public asset, routing and isolated desktop/mobile control/save checks pass. [Release receipt](../../review/live-release-2026-11-02/README.md). The user will test the live game. Grok remains paused; no live inference, migration, budget or secret changes occurred. The queue and starting snapshots below preserve their original planning dates and do not restart completed A01 or A02 implementation.

| Historical opening queue | Purpose | Completion evidence |
| --- | --- | --- |
| F00 Baseline and ownership | Establish the actual source, deployment, active owners and available authority. | A dated source/deployment comparison and a recorded checkout/base/head for the next packet. |
| A01.1 Failure replay | Capture the known action/completion failures without spending inference allowance. | Reproducible synthetic cases with explicit expected state and account invariants. |
| A01.2 Reliable activity | Make one activity complete or stop honestly. | Behavioural regression evidence, reload proof and a reviewable bounded diff. |
| A02.1 Economy trace | Explain the useful work loop and its funding limits. | Reconciled seven-day synthetic traces and alternatives with explicit coin sources. |
| A03.1 A04.1 A09.1 Contracts | Prepare identity, knowledge and resource boundaries before shared persistence. | Compatible contracts and decision records using one sample activity. |

The queue is a recommendation, not an assignment to an existing chat. New work must respect the current named owner. A design packet may proceed independently of a blocked implementation packet when it does not edit the same owned files.

## Historical starting snapshot — 29 October 2026

On 29 October 2026, GitHub reports [PR 61](https://github.com/arwyn6969/the-game/pull/61) open and ready for review at `cd44d165002ddd75b6c92e5ce0efb9ac4fecd568`, and [PR 62](https://github.com/arwyn6969/the-game/pull/62) open as a draft at `44745f42719b66230e6ee99d248c8bbe79c2359c`, based on PR 61. Their base main is `a26714e03192a17acaa963d7d2681e74a1ac425b`. F00 rechecked both exact heads: [PR 61 Verify 40506547367](https://github.com/arwyn6969/the-game/actions/runs/40506547367) and [PR 62 Verify 40865099031](https://github.com/arwyn6969/the-game/actions/runs/40865099031) succeeded. Four freshly fetched public assets match published runtime `01470e291065`; Worker identity/settings remain inherited from the 27 October receipt. PR 59 is a separate unmerged provider-choice candidate. A01.1 has no dependency on these PRs. Current allowance and hosted acceptance were not retested.

The local `product/` checkout reports 97 commits behind its recorded `origin/main` and lacks `docs/CURRENT_STATUS.md`. The root `START_HERE.md` points to newer status in `town-work-polish/`. A folder named “primary” is therefore not sufficient evidence that its contents are current. Refresh references and inspect worktrees without resetting or overwriting preserved changes.

The root status records runtime `01470e291065` as the latest published game, an unattended social acceptance failure, a shared 48-call rolling allowance under a provider free limit of 50, and exhausted cafe funding in the tested day-three/day-four scenarios. Treat quota consumption, remaining headroom and release status as time-sensitive. Grok remains paused; mobile progression remains on hold under the recorded sequence.

## What success looks like

The first useful release is a town with one understandable, repeatable activity that handles AI failure honestly and preserves valid history and accounts. The next foundation is one shared activity that survives closed browsers and a restart. Lifetime memory, tested learning and personal tools then build on those proven behaviours.

The long-term target is continuity of identity, history and commitments across software and model changes. Always-on inference, preserved access to a retired provider, or subjective consciousness are not guarantees of this framework. A resident can be dormant while its state remains safely recoverable.

# How to read the ratings

| Score | Importance to the long term architecture | Usefulness to the player and town | Difficulty of the minimum useful version |
| --- | --- | --- | --- |
| 1 | Optional experiment | Indirect or speculative value | Small local change |
| 2 | Helpful but not enabling | Occasional benefit | Bounded change with few dependencies |
| 3 | Valuable supporting system | Clear benefit for some activities | Several modules and meaningful integration |
| 4 | Major capability or dependency | Frequent visible benefit | Cross-system design, migration or substantial testing |
| 5 | Essential foundation | Central to a trustworthy, enjoyable town | Authority, economy, security or recovery across many boundaries |

Importance asks what the long-term game depends on. Usefulness asks what people will experience when the minimum version works, including avoided loss or unfairness. Difficulty includes engineering, testing and operating risk. It is not a week estimate. A simple-looking policy change can still require careful evaluation.

Priority follows current failures, prerequisites, player benefit and uncertainty. Do not divide usefulness by difficulty: that would wrongly push foundational work behind small optional features. Scores change when scope or evidence changes. Current maturity is tracked separately.

# Priority map

The interactive priority map is embedded in [the living framework](https://chatgpt.com/space/page_fc96fe02e3308191b9e5df9e3bbade81); the complete ratings register is below. The phases indicate readiness and order, not dates. A03, A04 and A09 contracts can be designed now while A01 and A02 improve the current town. A13 does not require arbitrary code execution. A16 is a separate narrative choice, not a prerequisite for continuity.

# Ratings register

| ID | Area | Importance | Usefulness | Difficulty | Priority |
| --- | --- | ---: | ---: | ---: | --- |
| A01 | Reliable actions and conversations | 5 | 5 | 3 | Now protect the current game |
| A02 | Sustainable work and a useful town loop | 5 | 5 | 4 | Now protect the current game |
| A03 | Canonical identity and continuity | 5 | 4 | 4 | Next establish shared foundations |
| A04 | Truth records and private knowledge | 5 | 5 | 4 | Next establish shared foundations |
| A05 | Persistent world and recovery | 5 | 5 | 5 | Next establish shared foundations |
| A06 | Lifetime memory and retention | 5 | 5 | 4 | Then preserve and deepen residents |
| A07 | Relevant and temporal recall | 4 | 5 | 3 | Then preserve and deepen residents |
| A08 | Individual decisions and character development | 4 | 5 | 4 | Then preserve and deepen residents |
| A09 | Fair compute and model replacement | 5 | 4 | 4 | Next establish shared foundations |
| A10 | Tested skills and learning | 4 | 5 | 4 | Then add useful capabilities |
| A11 | Resident tools and sandboxed software | 4 | 4 | 4 | Then add useful capabilities |
| A12 | Construction and usable places | 4 | 5 | 5 | Then add useful capabilities |
| A13 | Internet research portal | 4 | 4 | 3 | Then add useful capabilities |
| A14 | Resident and project sponsorship | 3 | 3 | 4 | Later add governed expansion |
| A15 | Proposals to improve the shared game | 3 | 4 | 5 | Later add governed expansion |
| A16 | Evidence based self understanding | 2 | 4 | 2 | Later add governed expansion |
| A17 | Donated computing capacity | 1 | 2 | 5 | Conditional experiments |
| A18 | Resident specific model training | 1 | 2 | 5 | Conditional experiments |

# Original three-work-packet sequence

This is the original dependency sequence. Resolve the next uncompleted packet and its owner through the [repository current status](../../CURRENT_STATUS.md), rather than treating these descriptions as a new dispatch.

**Packet 1 — Make one current activity dependable.** Begin with A01's documented invalid-action, invalid-completion and exhaustion cases. Use saved or synthetic replay first. The deliverable is one interaction that finishes or stops honestly, retains the receipt and resumes correctly. Preserve the current zero-spend/testing restrictions until a separate real-provider run is authorised.

**Packet 2 — Make the existing week worth continuing.** For A02, trace funding and activity across a week, choose one repeatable economic loop, and compare it in simulation. A design review can proceed independently of Packet 1, but code changes should remain separately reviewable and integrated deliberately. Avoid an unexplained subsidy or increasing AI allowance to hide a game-design problem.

**Packet 3 — Reserve the contracts and prove one persistent slice.** Write A03, A04 and A09 decisions first, then implement A05 for one resident, one object and one activity with fake inference. Demonstrate two clients, closed browsers, duplicate delivery, restart and restore. Only then migrate the complete town.

The first end-to-end continuity demonstration is a resident encountering a real failure, retaining its evidence, improving a tested procedure, sharing the result and continuing after restart and a model replacement.

# Workstream breakdowns

Each area below specifies the minimum useful outcome, how to proceed, what must remain true, the acceptance evidence and the condition for scaling. Baseline descriptions refer to the 29 October source review and workspace status. Confidence is confidence in the recommendation and scope, not a probability of success.

## A01 Reliable actions and conversations

**Priority:** Now protect the current game. **Ratings:** importance 5/5, usefulness 5/5, difficulty 3/5. **Confidence:** High. **Current maturity:** Partial; hosted acceptance remains open.

The latest workspace record reports unavailable-action and invalid-completion responses in a hosted meeting. Source tests and a hosted trial have different evidence.

**Player outcome:** Residents complete understandable interactions, stop honestly when they cannot continue, and preserve the real outcome.

**Why this position:** New capabilities amplify unreliable decisions. This is the quickest way to improve the existing experience and reduce wasted calls.

**Proceed in this order:**

1. Turn the documented failure cases into fixed replay scenarios: unavailable action, empty completion, repeated pass, timeout, and exhausted allowance.

2. Have the engine offer legal actions and validate the selected action again at commit; a failed result must not fabricate dialogue or success.

3. Complete one small end-to-end activity and show a factual outcome or recoverable stop.

**Protect:** Keep identity, coins, knowledge audiences and prior charges intact. Never manufacture allowance or silently substitute invented actions.

**Acceptance:** The same activity finishes or stops coherently under every failure case, survives reload, and passes the separately authorised hosted acceptance.

**Scale when ready:** Measure useful committed actions per call, invalid proposals and repeated no-ops. Reuse the protocol for every later tool.

**Cost drivers:** Inference retries, debugging and integration tests.

**Depends on:** No new workstream prerequisite; existing project constraints still apply.

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A01.1 Replay the real failure classes | Synthetic fixtures for an unavailable action, malformed or empty completion, repeated pass, timeout, cap exhaustion and cancellation. Retain source evidence without copying private dialogue. | Each case demonstrates the current behaviour and the required outcome; balances, speech history and charged attempts are asserted. |
| A01.2 Validate decisions and end coherently | A narrow fix to the legal-action, completion and termination path, with a visible factual result or recoverable stop. | Invalid or stale proposals cause no world effect; a retry cannot duplicate speech or payment; the shared scene ends coherently. |
| A01.3 Qualify the complete activity | Run the local/browser suite, then prepare a bounded hosted acceptance packet with exact revision and available allowance. | Local proof is separate from hosted proof; a live trial runs only within existing authorization, headroom and the zero-spend constraint. |

## A02 Sustainable work and a useful town loop

**Priority:** Now protect the current game. **Ratings:** importance 5/5, usefulness 5/5, difficulty 4/5. **Confidence:** High. **Current maturity:** Playable foundations; funding exhaustion reproduced.

The workspace records cafe funding exhaustion on Day 3 with library activity or Day 4 without it in the tested scenarios.

**Player outcome:** Players and residents can keep finding worthwhile work and see where payment comes from.

**Why this position:** A persistent server would otherwise preserve a town whose useful activities run out. This is a gameplay design problem as well as accounting.

**Proceed in this order:**

1. Trace sources and sinks of town coins, business revenue, available jobs and obligations across a representative week.

2. Choose and simulate one explicit repeatable funding cycle, such as paid demand supporting business work; compare alternatives before changing rules.

3. Add one repeatable activity whose pay, inputs, result and usefulness are visible. Show underfunding honestly.

**Protect:** Preserve earned wages, debts and conservation rules. Any new authorised source of coins must be an explicit rule, not an AI balance edit.

**Acceptance:** A week-long simulation conserves accounts, pays valid obligations, and offers understandable repeatable activity; players choose to return.

**Scale when ready:** Track opportunity availability, unpaid obligations and concentration of wealth. Expand the loop only after behaviour is measured.

**Cost drivers:** Economy balancing, simulation runs, player testing and additional world events.

**Depends on:** No new workstream prerequisite; existing project constraints still apply.

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A02.1 Explain the town economy | Trace a synthetic seven-day week, including business receipts, wage reservations, debts, player purchases and idle periods. | Every coin movement has a lawful source and destination; the reproduced funding exhaustion is explained. |
| A02.2 Build one repeatable useful loop | Choose one explicit demand-and-payment cycle, simulate alternatives and implement the smallest useful activity. | Valid wages remain payable, duplicate actions do not pay twice, and the next opportunity has a visible funding basis. |
| A02.3 Check behaviour and player value | Replay normal, low-demand, refusal and extreme-hoarding scenarios, followed by an authorized human trial. | Accounts reconcile across save/reload; people understand the choices and have a reason to return. Report observed behaviour, not invented enjoyment scores. |

## A03 Canonical identity and continuity

**Priority:** Next establish shared foundations. **Ratings:** importance 5/5, usefulness 4/5, difficulty 4/5. **Confidence:** High. **Current maturity:** Portable identity exists; server authority is planned.

Local identities and explicit forks exist; a copied local ID does not establish canonical server ownership.

**Player outcome:** The same resident survives upgrades, moves and recovery without duplicate ownership or an unexplained reset.

**Why this position:** Identity errors become expensive once histories, property and sponsors attach to residents.

**Proceed in this order:**

1. Write the identity contract now: restart, restore, model replacement, migration and fork each have explicit semantics.

2. Reserve resident/world IDs, lineage, an authority epoch and ownership registration; issue permissions from the server.

3. Prove an export/import round trip and a migration that disables the old writer before activating the new one.

**Protect:** An old save cannot rewind a live town or duplicate property, funds or permissions. A playable fork receives new canonical identities.

**Acceptance:** History and commitments survive transfer, two copies cannot both act as the same resident, and a fork has traceable ancestry.

**Scale when ready:** Keep identity independent of model provider, host and database row layout. Add versioned export manifests.

**Cost drivers:** Migration work, backup storage and recovery drills.

**Depends on:** No new workstream prerequisite; existing project constraints still apply.

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A03.1 Define identity and continuity | A decision record for stable resident/world IDs, ownership, incarnation, fork lineage and versioned state. | Model/provider labels never serve as identity; the original seven residents, additive Socrates and Estée arrivals, and the player have an explicit preservation mapping. |
| A03.2 Implement additive identity migration | Importer/exporter changes in an isolated environment, retaining old-save compatibility and explicit lineage. | Repeated import is idempotent; no renamed, merged or duplicated person; names, relationships and commitments survive. |
| A03.3 Prove replacement and recovery | Restore a backup and swap a fake inference adapter while comparing identity manifests. | Identity and history remain stable; intentionally created forks are distinguishable and cannot claim the same authority. |

## A04 Truth records and private knowledge

**Priority:** Next establish shared foundations. **Ratings:** importance 5/5, usefulness 5/5, difficulty 4/5. **Confidence:** High. **Current maturity:** Events, statements and beliefs partly distinguished.

The candidate distinguishes event, statement and reflection sources; newer decisions use actually received speech.

**Player outcome:** Residents remember what happened, know only what they encountered, and can correct mistaken beliefs.

**Why this position:** Every later subsystem depends on trustworthy evidence. A believable false memory should not become an authoritative transaction.

**Proceed in this order:**

1. Define world events, knowledge receipts and belief revisions with source references, game time and real time.

2. Record an event and its actual audiences together; use structured current facts for money and commitments.

3. Enforce knowledge eligibility across retrieval, summaries, tools, logs and exports; test corrections and repeated rumours.

**Protect:** Speech proves that words were spoken, not that their claims are true. Publicly available information is not automatically known.

**Acceptance:** Private canaries never reach unauthorised residents in the test suite; a correction preserves the original claim and its provenance.

**Scale when ready:** Store shared source material once with explicit delivery/access records. Derived summaries inherit source restrictions.

**Cost drivers:** Event storage, permission checks, source tracing and privacy tests.

**Depends on:** A03 Identity and continuity

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A04.1 Define events and knowledge rights | Contracts for committed world events, audience, observation/delivery receipts, beliefs, corrections and provenance. | A witnessed event, a reported claim and a private belief are distinguishable; read permissions have explicit tests. |
| A04.2 Record one activity consistently | Record the activity outcome and eligible knowledge delivery alongside committed effects. | A crash cannot leave payment without its event or give knowledge to an ineligible resident. |
| A04.3 Test privacy and correction | Adversarial fixtures for absent witnesses, opt-outs, rumours, corrections and delayed delivery. | No forbidden fact appears in retrieval or default UI; conflicting claims remain attributable rather than silently overwritten. |

## A05 Persistent world and recovery

**Priority:** Next establish shared foundations. **Ratings:** importance 5/5, usefulness 5/5, difficulty 5/5. **Confidence:** High. **Current maturity:** Planned; town simulation remains browser-local.

Server inference accounting is implemented separately from the browser-local town simulation.

**Player outcome:** The town continues when browsers close, and returning players see one consistent history.

**Server clock decision — 5 November 2026, Arwyn:** Once the server world starts, its clock stays running except during the developer freeze defined below. Remove the time-manipulation timeline and all world-time controls from ordinary-player server play: Pause/Resume, selectable 1×/4× speeds and Hour/skip-forward. Remove their keyboard shortcuts and ordinary-player command paths as well; hiding the buttons alone is insufficient. Every player observes the same server-owned time, and opening menus, reading, waiting for AI, disconnecting or closing every browser must not pause or change it. This decision supersedes the browser-local pause/speed requirements for the server milestone. The shared clock's game-time-to-real-time ratio is not decided by this note.

**Developer exception — 5 November 2026, Arwyn:** An authorized developer can freeze the entire server world at any time and leave it frozen for as long as they choose, until they explicitly unpause it. The freeze stops both the clock and all game action for every client: player and resident movement, simulation, scheduled activities and application of queued commands or AI results. It must be enforced by the server and persist across client disconnection and server restart; no timer, reconnect or background task may automatically unpause it. Unpausing resumes from the frozen world time without replaying the frozen interval as catch-up activity. Ordinary players cannot invoke this developer control.

Stopping a shift, following session or AI delegation remains a control over that activity only; it cannot stop the world clock.

**Server clock acceptance:** Outside a developer freeze, two clients show the same advancing time; ordinary-player attempts to pause, accelerate or skip through either client cannot change it. The clock continues while either or both clients are closed and while an AI response is pending. The ordinary-player server UI has no time-manipulation timeline or world-time controls, and reconnecting returns the player to the current authoritative time. A developer freeze stops time and all game action across both clients, including queued work and late AI results; it survives disconnect/restart and remains in effect until explicit developer unpause. Unpause resumes from the frozen point without catch-up for the frozen interval. Verify that an ordinary player cannot freeze or unpause the world.

**Why this position:** This is the biggest enabling change and the highest initial integration risk. Move one complete activity before the whole town.

**Proceed in this order:**

1. Build a synthetic two-client slice with one authority, one resident, one object and one reversible activity.

2. Commit state, event, knowledge delivery and a durable notification record in a short database transaction; keep model calls outside it.

3. Add durable jobs, duplicate rejection, restart reconciliation and old-save migration; expand to the accepted nine-resident cast plus player only after recovery works.

**Protect:** At most one committed effect per accepted command; duplicate accepted commands return the same recorded outcome. Recheck permissions and object revisions when delayed results return. Preserve local export and recovery.

**Acceptance:** Two clients agree; the world advances with both closed; crashes at each boundary and a backup restore preserve commitments and accounts.

**Scale when ready:** Start with a town coordinator and Postgres authority. Split worlds or workers when measured latency/backlog requires it, not per resident by default.

**Cost drivers:** Database activity, scheduled work, client updates, backups and operational support.

**Depends on:** A03 Identity and continuity; A04 Events and knowledge; A09 Compute and model changes

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A05.1 Create a small shared authority | A private synthetic slice with one town, resident, object and reversible activity; browser clients send commands. | Two clients converge on one committed result, with authorization and revision checks at the server. |
| A05.2 Add durable execution and restart | Durable jobs, outbox delivery, retry limits, idempotency keys and reconciliation, with inference outside database transactions. | Closed browsers do not own the clock; duplicate jobs, stale responses and restarts cannot repeat committed effects. |
| A05.3 Rehearse migration and recovery | Restore backups, migrate copied synthetic saves and test mixed client versions before adding residents. | The restore drill preserves accepted commitments and ledgers; rollout can stop safely, and offline behaviour is explicitly defined. |

## A06 Lifetime memory and retention

**Priority:** Then preserve and deepen residents. **Ratings:** importance 5/5, usefulness 5/5, difficulty 4/5. **Confidence:** High. **Current maturity:** Bounded memory exists; lifetime archive is missing.

Older ordinary memories can be deleted by bounded archives while protected reflections accumulate.

**Player outcome:** Experiences remain recoverable over months and years, even when a resident does not recall them immediately.

**Why this position:** Durability comes before smarter recall. A vector index cannot recover evidence that was already discarded.

**Proceed in this order:**

1. Separate the durable evidence archive from the small active memory packet; import surviving records with honest provenance.

2. Add incremental episode/project summaries with source links and explicit retention classes.

3. Implement export, deletion propagation, backup restoration and correction handling before increasing retention promises.

**Protect:** Do not invent lost history. Summaries and reflections cannot replace the only source record. Restore must reapply deletion decisions.

**Acceptance:** A synthetic year survives restart/export/import; source-linked summaries remain accurate; deleted data does not reappear after rebuild.

**Scale when ready:** Archive meaningful episodes rather than movement frames. Consolidate only new material with a saved cursor.

**Cost drivers:** Records, attachments, backups, derived indexes and consolidation tokens.

**Depends on:** A04 Events and knowledge; A05 Persistent world

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A06.1 Define a portable memory archive | A memory manifest covering source events, episodes, beliefs, skills, permissions, versions, checksums and retention rules. | An export accounts for every retained record; derived summaries and indexes are identifiable and rebuildable. |
| A06.2 Implement retention and retrieval boundaries | Store durable source material, bound working context, and build summaries with references to sources. | Old memories remain retrievable without placing the lifetime archive in every prompt; deletion/correction rules propagate to derivatives. |
| A06.3 Restore and age the archive | Synthetic multi-year histories, export/import and reindexing drills at increasing volumes. | Sources and permissions survive restore; missing/corrupt records are reported; operation and storage costs are measured. |

## A07 Relevant and temporal recall

**Priority:** Then preserve and deepen residents. **Ratings:** importance 4/5, usefulness 5/5, difficulty 3/5. **Confidence:** Medium. **Current maturity:** Keyword and recency retrieval exists.

Current prompt retrieval is bounded and keyword based, with importance and resident-interest signals.

**Player outcome:** Residents recall the relevant old event instead of repeating a recent but unrelated memory.

**Why this position:** This delivers visible value once evidence survives; the best retrieval mix must be measured on town histories.

**Proceed in this order:**

1. Build dated recall questions covering names, paraphrases, obligations, corrections, uncertainty and private knowledge.

2. Start with structured fact/obligation queries and Postgres full-text retrieval; add semantic retrieval only where it improves held-out results.

3. Combine evidence under a context budget and keep citations for debugging. Compare exact filtered vector search before approximate indexes.

**Protect:** Permissions filter every retrieval path. An obligation must not depend on winning semantic similarity ranking.

**Acceptance:** Recall and grounded answers improve at a fixed token budget without privacy regression; retrieval latency and cost remain bounded.

**Scale when ready:** Version embedding models and rebuild derived indexes alongside the old version. Add a graph service only for demonstrated query needs.

**Cost drivers:** Embedding generation, search CPU, index storage and context tokens.

**Depends on:** A06 Durable memory

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A07.1 Build recall evaluation cases | A small labelled set spanning exact facts, changing facts, chronology, private knowledge and unanswerable questions. | Expected answers cite source records; private and unanswerable cases have explicit refusal or uncertainty expectations. |
| A07.2 Improve the simplest retrieval baseline | Compare filtered exact/full-text retrieval with a bounded hybrid candidate; retain a hard context budget. | Report recall quality, abstention, latency and cost on the same cases; permission filtering occurs before disclosure. |
| A07.3 Promote only measured gains | Add ranking, temporal filters or embeddings only where the comparison shows benefit; document failure cases. | No privacy regression or unsupported confidence; a graph service remains deferred unless simple retrieval leaves a demonstrated gap. |

## A08 Individual decisions and character development

**Priority:** Then preserve and deepen residents. **Ratings:** importance 4/5, usefulness 5/5, difficulty 4/5. **Confidence:** Medium. **Current maturity:** Individual action paths exist; joint dialogue remains.

Newer paths decide for one resident; older conversations can be generated jointly. Weekly self-descriptions already evolve.

**Player outcome:** Residents disagree, decline, change their minds and develop distinctive habits through real experience.

**Why this position:** More dialogue is not more agency. Consent, commitments and private knowledge need individual decision boundaries.

**Proceed in this order:**

1. Use separate resident decisions for meaningful conversation and agreements, each with its own evidence and offered actions.

2. Keep authored identity separate from evolving preferences and self-beliefs; record the evidence behind material changes.

3. Permit no-op and no-new-reflection outcomes. Compare personality continuity and consent accuracy against joint generation.

**Protect:** One resident cannot accept for another or rewrite another's motives. Repetition and routine reflection must not manufacture character change.

**Acceptance:** Distinct personalities survive longer histories and model swaps; disagreement stays legal and no private context crosses boundaries.

**Scale when ready:** Batch isolated requests if useful; keep their contexts separate. Use deterministic routines between meaningful decisions.

**Cost drivers:** Dialogue calls, context construction and human character review.

**Depends on:** A01 Reliable actions; A04 Events and knowledge; A09 Compute and model changes

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A08.1 Specify individual decision rules | Versioned needs, preferences, relationships, commitments and refusal policies, grounded in observed events. | A resident may decline, defer or revise a plan; choice is not forced by a sponsor or by a completion metric. |
| A08.2 Connect plans to consequences | One short plan with interruption, replanning and an honest explanation of the actual result. | The plan uses only available knowledge and resources; disagreement and failed attempts do not fabricate success. |
| A08.3 Evaluate stable character and change | Repeated comparable scenarios, changed circumstances, provider replacement and human review. | Character remains recognisable while adapting to evidence; prose claims about development are distinguished from changed behaviour. |

## A09 Fair compute and model replacement

**Priority:** Next establish shared foundations. **Ratings:** importance 5/5, usefulness 4/5, difficulty 4/5. **Confidence:** High. **Current maturity:** Shared inference reservations exist.

The shared ledger reserves calls, cost and concurrency; a resident/project resource policy is still missing.

**Player outcome:** Every resident retains a baseline of activity, costs stay bounded, and provider changes do not erase continuity.

**Why this position:** Continuous operation needs admission limits and failure behaviour before it needs more compute.

**Proceed in this order:**

1. Extend accounting concepts to beneficiary resident, project, job and funding source; keep current conservative reservations.

2. Use event-driven jobs, fair priorities, deadlines and a no-progress guard. Reserve capacity for interaction and a baseline for every resident.

3. Qualify versioned model profiles against the same scenarios; test outages, retirement, cancellation and conservative settlement.

**Protect:** More compute grants no extra gameplay rights. Exhaustion preserves history, obligations and unused service entitlements.

**Acceptance:** Budget failures produce honest pauses without overspend or starvation; a qualified replacement preserves validity and character continuity.

**Scale when ready:** Measure useful actions, queue delay, context growth and cost per active resident. Expand capacity only against observed demand.

**Cost drivers:** Inference, retries, queues, accounting, evaluation and provider overhead.

**Depends on:** No new workstream prerequisite; existing project constraints still apply.

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A09.1 Define fair budgets and provider contracts | Accounting boundaries, pause/dormancy semantics, baseline entitlement, adapter contract and model qualification cases. | Game coins, provider charges and access entitlements are distinct; budget exhaustion never deletes identity or history. |
| A09.2 Implement reservation and reconciliation | Reserve authorized capacity, settle each provider attempt once and reconcile uncertain timeouts before permitting retries. | No fabricated allowance, double charge or unapproved paid fallback; cancellation cannot erase a real charge. |
| A09.3 Qualify outages and model changes | Simulate provider retirement, reduced capacity, degraded output and recovery using fake adapters first. | History and obligations remain intact; resume is explicit and coherent; a replacement model passes the same behaviour contract. |

## A10 Tested skills and learning

**Priority:** Then add useful capabilities. **Ratings:** importance 4/5, usefulness 5/5, difficulty 4/5. **Confidence:** Medium. **Current maturity:** Bounded voluntary teaching and practice exist; general skill qualification remains open.

Memory and reflections evolve, but this does not independently establish increased competence.

**Player outcome:** Residents become better at a task and can explain the experience that improved their method.

**Why this position:** Reusable, tested procedures are easier to inspect and migrate than personal model training.

**Proceed in this order:**

1. Choose one bounded skill, such as arranging a reading without conflicting bookings.

2. Store a procedure with prerequisites, version, permitted actions and a baseline performance record; revise it after real failures.

3. Promote it only after unseen tests at matched compute; preserve the previous version and record actual uses.

**Protect:** Self-praise is not a pass. Tests must be independent of the candidate procedure and include refusal, stale state and failure.

**Acceptance:** The learned procedure improves held-out success or efficiency without increasing invalid actions or privacy failures.

**Scale when ready:** Compose qualified procedures through stable APIs; invalidate or requalify them when those APIs change.

**Cost drivers:** Practice runs, held-out evaluations, storage and maintenance.

**Depends on:** A06 Durable memory; A08 Individual agency; A09 Compute and model changes

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A10.1 Define what counts as a learned skill | A versioned skill record with prerequisites, procedure, permitted tools, test cases, limitations and evidence. | A resident saying it learned something is not sufficient; the learned procedure has a reproducible task. |
| A10.2 Learn one bounded procedure | Record failure, propose a revision and test it in isolation before adding it to the skill library. | The revision improves the named task, stays within granted capabilities and can be rolled back. |
| A10.3 Prove reuse and transfer | Test a new instance, a changed condition and optional sharing with another resident. | Performance transfers beyond the original example; teaching does not disclose private source memories. |

## A11 Resident tools and sandboxed software

**Priority:** Then add useful capabilities. **Ratings:** importance 4/5, usefulness 4/5, difficulty 4/5. **Confidence:** Medium. **Current maturity:** Planned with isolation and quota requirements.

The construction/apps plan already requires scoped APIs, external execution, stop and rollback.

**Player outcome:** Residents make useful calculators, planners and other tools they can maintain.

**Why this position:** This is a practical expansion of tested skills, provided software cannot become a second world authority.

**Proceed in this order:**

1. Start with finite JavaScript jobs using explicit JSON input/output and synthetic data.

2. Add a versioned workspace, trusted test harness and scoped world API; deny network and secrets by default.

3. Allow autonomous edits and private deployments within unchanged permissions, with quotas, cancellation, receipts and rollback.

**Protect:** Generated code cannot write canonical state directly. Separate app interfaces from the game's authenticated origin.

**Acceptance:** One resident builds a useful app that another can use; quota, escape, cancellation and rollback tests pass.

**Scale when ready:** Keep a replaceable executor. Add shell tools, dependencies or long-running services only after a concrete need and qualification.

**Cost drivers:** CPU, memory, wall time, artifacts, dependency maintenance and code-generation calls.

**Depends on:** A05 Persistent world; A09 Compute and model changes; A10 Tested learning

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A11.1 Define tool capabilities and execution limits | Typed inputs/outputs, permissions, CPU/time/storage limits, cancellation and artifact ownership. | No implicit network, filesystem, credential or shared-world write access; tool output remains untrusted evidence. |
| A11.2 Run one private useful tool | A bounded recipe or sandboxed program with no network by default, producing an inspectable artifact. | Timeout, malformed output and denied access are handled without affecting the world or other residents. |
| A11.3 Qualify execution and promotion | Adversarial permission tests, version pinning, revocation and approval of a narrowly expanded capability when justified. | A reusable tool has an owner, manifest, evidence and removal path; arbitrary shared-code execution remains unavailable. |

## A12 Construction and usable places

**Priority:** Then add useful capabilities. **Ratings:** importance 4/5, usefulness 5/5, difficulty 5/5. **Confidence:** Medium. **Current maturity:** Planned; no construction registry in the reviewed baseline.

Agent-created-world notes cover parcels, rights, construction, resources, access and cancellation.

**Player outcome:** A resident changes the town through a project with a visible purpose and usable result.

**Why this position:** Construction is compelling but affects navigation, ownership, economy and saves simultaneously.

**Proceed in this order:**

1. Start with an allocated plot and one approved workshop template; defer a land market.

2. Represent materials, funded work, milestones and access rights explicitly; validate paths and resources at each stage.

3. Finish a building with one actual supported activity, then test use by a second resident and restart mid-construction.

**Protect:** Protect public routes, earned pay and existing ownership. Cancellation returns only unspent resources; descriptions cannot create completed structures.

**Acceptance:** A funded workshop is completed exactly once, remains reachable and usable, and survives interruption without lost claims.

**Scale when ready:** Add templates and mutable navigation through versioned interfaces before arbitrary layouts or parcel trading.

**Cost drivers:** World-state updates, pathfinding, content work, testing and continuing maintenance.

**Depends on:** A02 Sustainable work; A04 Events and knowledge; A05 Persistent world; A09 Compute and model changes

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A12.1 Specify construction as a game transaction | Plans, plots, permissions, materials, labour, reserved costs, accessibility and ownership of one small object. | The plan explains who can use and maintain the result and cannot create resources by narration. |
| A12.2 Build one functional object | An existing engine component assembled under validated rules, with a reversible preview and committed result. | Concurrent claims, insufficient resources and cancellation preserve accounts; the object performs one useful action. |
| A12.3 Test lifecycle and town access | Save/reload, maintenance, removal, pathfinding and conflicts, with player and accessibility checks. | No blocked essential route, inaccessible control or orphaned obligation; expand to buildings only after this lifecycle works. |

## A13 Internet research portal

**Priority:** Then add useful capabilities. **Ratings:** importance 4/5, usefulness 4/5, difficulty 3/5. **Confidence:** Medium. **Current maturity:** Internal source-card precedent; external portal unbuilt.

The existing library activity offers a useful design precedent but does not provide general internet access.

**Player outcome:** Residents bring useful, attributable information into their own projects and share it with others.

**Why this position:** A bounded reading service can provide value before arbitrary code execution or general browser autonomy.

**Proceed in this order:**

1. Build a library research desk over selected public sources with a question, budget and deadline.

2. Save source dates, hashes and excerpts; distinguish source claims from verified town facts and the resident's interpretation.

3. Add bounded search only after source reading works; introduce external integrations and publishing through separate grants.

**Protect:** External content cannot change instructions, permissions or budgets. Minimise outbound queries and mediate credentials.

**Acceptance:** A useful cited note reaches only actual readers; hostile text, stale sources, outages and cancellation are handled correctly.

**Scale when ready:** Cache permitted public material, use supported APIs first, and add browser rendering only where required.

**Cost drivers:** Fetch/search/browser requests, reading tokens, snapshots and freshness checks.

**Depends on:** A04 Events and knowledge; A06 Durable memory; A09 Compute and model changes

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A13.1 Create a bounded reading contract | Curated sources, query/size/time limits, fetch provenance, audience and an offline failure path. | External text cannot grant permissions or issue engine commands; credentials and private memories are absent from requests. |
| A13.2 Deliver one cited research answer | Read a supported source through a controlled service, retain an allowed snapshot or reference, and answer with attribution. | Unsupported claims are marked; unavailable sources produce an honest result; relevance and freshness are testable. |
| A13.3 Expand to search or APIs selectively | Evaluate a small supported search/API addition against the curated baseline and the same injection tests. | No automatic posting, purchasing or account changes; broader write powers are a distinct authorized scope. |

## A14 Resident and project sponsorship

**Priority:** Later add governed expansion. **Ratings:** importance 3/5, usefulness 3/5, difficulty 4/5. **Confidence:** Medium. **Current maturity:** Not implemented; distinct from away-avatar service time.

Paid away-avatar service is planned, but it is not a sponsorship ledger or resident funding policy.

**Player outcome:** People can support useful activity without the resident losing continuity when funding ends.

**Why this position:** Funding becomes understandable after actual costs and useful outcomes are measurable.

**Proceed in this order:**

1. Simulate sponsor balances and allocation rules first, including exhaustion and cancellation.

2. Offer capped operator-managed support for a resident or project, with public attribution and private usage accounting.

3. Activate actual payments only after settlement, unused-fund treatment, baseline service and refusal behaviour are qualified.

**Protect:** Sponsorship buys no obedience, private memory, ownership or rule exemption. Keep coins, external assets, service time, sponsor funds and costs separate.

**Acceptance:** A sponsor can depart mid-project without lost history, double charging or false promises; every allocation reconciles.

**Scale when ready:** Cap popularity-based advantages and fund a common baseline. Add user-provided API keys only through a qualified credential broker.

**Cost drivers:** Billing operations, reconciliation, infrastructure, refunds and support.

**Depends on:** A05 Persistent world; A06 Durable memory; A09 Compute and model changes

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A14.1 Specify sponsorship rights and ledgers | A policy for contributions, allocations, entitlements, expiry, refunds where applicable and baseline fairness. | Contribution grants neither obedience, private-memory access nor extra authority over shared game rules. |
| A14.2 Simulate allocations without real money | Synthetic sponsors fund bounded research or compute allocations through a separate ledger. | Competing sponsors, withdrawal and exhausted funds reconcile while preserving baseline continuity and valid obligations. |
| A14.3 Qualify a limited real integration | Only after the product decision, provider terms, accounting and consent are settled, prepare a reviewed integration. | Public funding remains disabled until specifically authorized; operational cost, receipts and revocation are observable. |

## A15 Proposals to improve the shared game

**Priority:** Later add governed expansion. **Ratings:** importance 3/5, usefulness 4/5, difficulty 5/5. **Confidence:** Medium. **Current maturity:** Architecture direction; full workflow unbuilt.

Sandboxed apps are planned; shared-code proposal, review and release records need explicit design.

**Player outcome:** A resident's actual frustrations can lead to visible improvements in the game.

**Why this position:** Capturing limitations is cheap now; automatically generating and releasing shared code has a much larger impact.

**Proceed in this order:**

1. Record limitation evidence and structured proposals early; deduplicate and prioritise by player benefit.

2. Later add a narrow GitHub broker for issues and patches, with isolated tests and no production secrets.

3. Require reviewed releases for shared code/rules; return verified release, rejection and rollback outcomes to the resident.

**Protect:** Resident attribution does not grant repository administration. Preserve old saves and commitments; software rollback does not erase external history.

**Acceptance:** One proposal moves from a real failure through review to a compatible release or honest rejection, with a resident receipt.

**Scale when ready:** Limit proposal and CI volume; use stable world APIs so most resident tools do not require changing shared code.

**Cost drivers:** Coding inference, isolated CI, human review and ongoing support.

**Depends on:** A05 Persistent world; A11 Personal software

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A15.1 Create a shared-change proposal contract | Issue description, affected rules, evidence, duplicates, intended benefit, compatibility and acceptance cases. | Residents can suggest changes without acquiring deployment credentials or approval authority. |
| A15.2 Produce an isolated candidate change | A bounded patch on a synthetic/test branch with sandboxed checks and a readable diff. | No direct production edit; changes preserve contracts, pass relevant tests and include migration/rollback where needed. |
| A15.3 Trial a human-reviewed release path | Review, exact-revision CI, authorized publication, runtime verification and an in-world result receipt. | A proposal cannot approve itself; the receipt distinguishes proposed, implemented, released and rejected outcomes. |

## A16 Evidence based self understanding

**Priority:** Later add governed expansion. **Ratings:** importance 2/5, usefulness 4/5, difficulty 2/5. **Confidence:** Low. **Current maturity:** Current instruction blocks machinery discussion.

The current system instruction prevents discussion of models, prompts and underlying machinery.

**Player outcome:** Residents can develop distinctive interpretations of their environment through real observations.

**Why this position:** Potentially interesting narrative, but not a prerequisite for persistence. Small code changes still need careful character evaluation.

**Proceed in this order:**

1. Decide whether operational discovery belongs in the game's tone.

2. Replace blanket concealment with evidence-grounded discussion and a catalogue of actually available capabilities.

3. Trial a few genuine events such as a failed action, recovery or released capability; let residents disagree or remain uninterested.

**Protect:** Do not script claims of abilities that do not exist or treat a character's self-report as evidence of consciousness. Keep secrets private.

**Acceptance:** The narrative follows verified events, preserves distinct voices and does not mislead players about technical abilities.

**Scale when ready:** Add new evidence to the same belief system rather than special revelation scripts. Revisit only when player response supports it.

**Cost drivers:** Prompt policy maintenance and character/player evaluation.

**Depends on:** A04 Events and knowledge; A06 Durable memory; A08 Individual agency

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A16.1 Define discoverable facts and uncertainty | A product decision describing what residents can verify about their memory, tools, limits and world. | Operational facts are separated from beliefs about identity or consciousness; no claim of verified subjective experience. |
| A16.2 Add one evidence-based discovery | A resident encounters an observable limit or archived event and can form, test and revise a belief. | The discovery follows access rules, permits disagreement and does not reveal system prompts or secrets. |
| A16.3 Review narrative consequences | Check tone, player understanding, contradictory evidence and sponsor pressure with human review. | Keep it only if it improves the experience without misleading users about capabilities or evidence. |

## A17 Donated computing capacity

**Priority:** Conditional experiments. **Ratings:** importance 1/5, usefulness 2/5, difficulty 5/5. **Confidence:** Low. **Current maturity:** Experimental; no current dependency.

There is no donor-worker qualification or verification system in the reviewed baseline.

**Player outcome:** Could expand capacity if useful work remains cheaper after coordination and validation.

**Why this position:** Untrusted machines create privacy and correctness problems; low token price alone does not make a distributed service worthwhile.

**Proceed in this order:**

1. Measure a real capacity bottleneck before starting this work.

2. Pilot one public or synthetic job whose output the operator can independently verify; qualify workers and use expiring leases.

3. Credit accepted work only; test fabricated results, repeated results, disconnects and cancellation.

**Protect:** No private resident prompts, credentials or production authority on untrusted workers. Claimed GPU usage is not proof of work.

**Acceptance:** Net cost or capacity improves after validation and operations, with no private-data dependency.

**Scale when ready:** Expand only independently checkable jobs; private inference needs a separately qualified trust model.

**Cost drivers:** Qualification, redundancy, transfers, verification and operational complexity.

**Depends on:** A09 Compute and model changes; A11 Personal software

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A17.1 Establish whether donated capacity is needed | Compare the measured bottleneck with managed capacity, caching, smaller jobs and lower activity. | Proceed only with a documented cost or availability advantage; otherwise retain the decision to defer. |
| A17.2 Prototype an untrusted worker boundary | Synthetic public/non-sensitive jobs with signed leases, output validation, revocation and no world credentials. | A hostile, offline or incorrect worker cannot corrupt canonical state or obtain private memory. |
| A17.3 Measure a small opt-in pilot | Benchmark verification overhead, reliability, operator effort and withdrawal on an explicitly authorized pilot. | The net gain remains after verification and management cost; donor departure never threatens resident continuity. |

## A18 Resident specific model training

**Priority:** Conditional experiments. **Ratings:** importance 1/5, usefulness 2/5, difficulty 5/5. **Confidence:** Low. **Current maturity:** Experimental; not required for continuity.

Residents share inference infrastructure; their individual state is supplied through context rather than separate trained weights.

**Player outcome:** May improve a narrow, repeated behaviour if memory, tools and model selection are insufficient.

**Why this position:** Weights are harder to inspect, correct, migrate and delete information from than explicit records and procedures.

**Proceed in this order:**

1. Identify a repeated, measurable failure that survives improvements to evidence, prompts, tools and model choice.

2. Prepare a consented dataset with held-out cases and a privacy review; compare training against simpler fixes at matched cost.

3. Keep the trained artifact optional and versioned; qualify regressions and deletion limitations before any deployment.

**Protect:** Do not use weights as the only store of identity or history. Training must not absorb unauthorised player material.

**Acceptance:** A controlled comparison shows durable benefit large enough to justify training, maintenance and regression costs.

**Scale when ready:** Prefer shared general improvements or small task-specific adaptations before seven independently maintained models.

**Cost drivers:** Dataset curation, training, evaluations, artifact storage and maintenance.

**Depends on:** A06 Durable memory; A09 Compute and model changes; A10 Tested learning

### Implementation packets

| Packet | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A18.1 Demonstrate a training-shaped failure | Compare the existing model with better memory, procedures, tools and retrieval on a held-out task set. | Training remains deferred unless simpler options leave a repeatable, important gap and suitable authorized data exists. |
| A18.2 Run a bounded training experiment | An isolated, reversible experiment with documented data rights, deletion handling, budget and model licence. | Training material excludes unauthorized private records; held-out gains are measured without replacing the production resident. |
| A18.3 Evaluate portability and regression | Compare cost, quality, character, privacy and recovery against the untrained baseline. | Adopt only a measured net benefit; canonical identity, memory and skills remain portable if the trained model disappears. |

# Rules for changing the game safely

1. Keep one authority for world effects. A model or resident tool proposes an action; the server validates current permissions, state and resources before committing it once.

2. Preserve old towns. Prefer additive records and explicit migrations. Test migration and recovery on synthetic or authorised copies; never repair a failure by erasing history or balances.

3. Release small complete activities behind flags or limited cohorts. Add records first, populate and verify them, switch the reader/writer, and retain a rollback path before retiring the old format. Avoid two independent authoritative writers.

4. Version every contract that can change behaviour: events, saves, world APIs, prompts, execution profiles, retrieval indexes and skills. Record compatibility and requalification requirements.

5. Put inference and sandbox execution outside world transactions. Delayed work returns a proposal checked against fresh revisions. Use unique command IDs and recoverable jobs.

6. Reserve resources before external work. Stop when accounting is unavailable. Preserve history when allowances end; do not grant more world rights because a resident has more compute.

7. Treat derived data as rebuildable. Source evidence and commitments survive embedding changes, summary changes and provider retirement.

8. Define a rollback before expansion. Reverting code cannot erase completed payments or external messages; reconcile those through receipts and explicit corrective actions.

9. Qualify each candidate with relevant invariant tests, a player-visible journey and restart/recovery cases. New capabilities add their own privacy, isolation or accounting tests; do not repeat unrelated suites without a reason.

10. Split services only after measuring a bottleneck. Begin with existing hosting and Postgres. Separate vector/graph services, per-resident processes and model training are conditional responses to demonstrated needs.

# How we keep this plan current

Keep this Page as the planning register. Repository status and release receipts remain the authority for what is implemented or deployed. Do not treat a high score or a completed code patch as release acceptance.

Use these states for a work packet: proposed → scoped → building → locally verified → hosted trial → accepted, with paused or blocked when appropriate. Some packets are documentation or experiments and stop at their stated acceptance stage. Record source implementation and hosted deployment separately.

At the end of a milestone, after a failed acceptance, after a model/API change, or when Arwyn changes the product direction: update the relevant maturity, evidence and next action; reconsider the three ratings and phase only if the evidence warrants it; update the map from the same ratings; append a short dated decision entry. Keep old decisions as history rather than silently changing their meaning. Updates are made during review, not by an unrequested background schedule.

Every active packet needs an owner agreed at kickoff, a branch/PR or document link, baseline and target revision, explicit scope, measurable acceptance, rollback, and the next unanswered question. The next explicitly started Sol session scopes F00 and selects one ready packet; other future implementation packets remain unassigned until kickoff.

| Packet field | Record |
| --- | --- |
| Workstream and outcome | Stable ID and one player-visible improvement |
| Scope and dependencies | Minimum version, excluded expansion, prerequisite receipts |
| Owner and source | Named owner when agreed, checkout, branch/PR, baseline/head |
| State | Proposed, scoped, building, locally verified, hosted trial, accepted, paused or blocked |
| Evidence | Actual check result, date, artifact and remaining gap |
| Risk and rollback | Save/authority/economy/privacy impact and restoration procedure |
| Operating measure | Useful actions, latency, resource use or storage growth |
| Next action | One concrete task that advances the acceptance evidence |

# Product choices that affect the order

| Choice | Recommended starting policy | Revisit when |
| --- | --- | --- |
| Continuity and retention | Preserve meaningful resident history; define player-data retention explicitly. | Before shared-world admission and before stronger retention promises. |
| Baseline activity | Give all residents a baseline; pause optional work honestly when resources fall. | When measured costs and town activity are available. |
| Sponsorship influence | Fund eligible activity without buying obedience, private access or extra rights. | Before accepting money. |
| World and code changes | Permit bounded tools/construction under existing rules; review shared-code/rule releases. | Before each new capability expands its impact. |
| Operational self-understanding | Allow evidence-grounded discovery if it fits the tone; no scripted claims of unsupported abilities. | After reliable event and character foundations are available. |

# Evidence and relationship to the research

The 29 October workspace entry point identifies town-work-polish commit 44745f42719b66230e6ee99d248c8bbe79c2359c as the inspected candidate and records the current hosted acceptance and funding problems. Source inspection and recorded deployment evidence are distinct. The ratings above are recommendations derived from that baseline, not benchmark scores.

Source references: [current project status](https://github.com/arwyn6969/the-game/blob/44745f42719b66230e6ee99d248c8bbe79c2359c/docs/CURRENT_STATUS.md), [memory implementation](https://github.com/arwyn6969/the-game/blob/44745f42719b66230e6ee99d248c8bbe79c2359c/src/game/memory.ts), [identity and forks](https://github.com/arwyn6969/the-game/blob/44745f42719b66230e6ee99d248c8bbe79c2359c/src/game/identity.ts), [inference accounting](https://github.com/arwyn6969/the-game/blob/44745f42719b66230e6ee99d248c8bbe79c2359c/src/lib/mind-budget/README.md), [agent-created-world plan](https://github.com/arwyn6969/the-game/blob/44745f42719b66230e6ee99d248c8bbe79c2359c/docs/implementation/agent-created-world.md), and [away-avatar plan](https://github.com/arwyn6969/the-game/blob/44745f42719b66230e6ee99d248c8bbe79c2359c/docs/implementation/offline-avatar-control.md).

The previous research supplies the detailed architecture and source comparison. In particular, [Generative Agents, 2023](https://arxiv.org/abs/2304.03442) supports memory/planning as a basis for believable behaviour, [LongMemEval, ICLR 2025](https://arxiv.org/abs/2410.10813) motivates temporal/correction/abstention tests, and [Voyager, 2023](https://arxiv.org/abs/2305.16291) supplies a precedent for reusable executable skills without resident-specific weight training. These results inform experiments; they do not qualify THE GAME's implementation.

| Original research area | Workstreams |
| --- | --- |
| Persistent identity | A03, A04, A05, A08 |
| Memory over years | A04, A06, A07 |
| Learning and improvement | A08, A10, A11, A18 |
| Changing compute | A01, A05, A09 |
| Sponsorship and donated capacity | A09, A14, A17 |
| Tools and changing the game | A10, A11, A12, A15 |
| Internet portal | A13 |
| Discovery and narrative | A16 |
| Existing game blockers | A01, A02 |
| Acceptance, recovery and documentation | All workstreams plus the shared update rules |

# Decision history

| Date | Decision | Reason |
| --- | --- | --- |
| 29 October 2026 | Establish this first priority register with 18 workstreams. | Convert research into small, dependency-led actions and observable acceptance. |
| 29 October 2026 | Address action reliability and sustainable work before broad expansion; design core contracts now. | Current failure evidence and the risk of preserving a town with unreliable or exhausted activities. |
| 29 October 2026 | Treat donated hardware and personal model training as conditional experiments. | No demonstrated need that outweighs their verification, privacy and maintenance cost. |
| 29 October 2026 | Expand to version 2 with F00, 54 work packets, milestone gates, operating records and a Sol handover. | Make the research executable across sessions while preserving current ownership, source history and release boundaries. |

# Delivery framework for GPT-6.1 Sol

## F00 Reconcile the baseline before coding

F00 is the first execution packet. From the repository root, read `README.md`, `AGENTS.md`, `docs/CURRENT_STATUS.md`, branch lifecycle and collaboration instructions. If the current-status file is missing, inspect the current remote source and the current handoff; do not substitute an old delivery tracker.

Inspect the selected repository's remote, branch, HEAD, working tree and existing worktrees. Refresh remote refs when needed without merging into another owner's checkout. Verify relevant PR state, explicit stacks, current checks and named write ownership. Inspect existing deployment receipts; a fresh runtime check is a separate piece of evidence. Preserve uncommitted work, private files and historical branches.

Produce one short baseline receipt recording the date, source checkout, base/head, active owner, dependency PRs, last verified deployment and its evidence date, known failures, spending/live-call constraints, and the next ready packet. Mark facts as observed now, inherited from a dated receipt, or still unverified. Choose a suitable existing task checkout or an isolated `codex/` branch from current main. An explicit stack is appropriate only if the selected packet actually requires the dependency.

**F00 is complete when the next change has an unambiguous base, scope and owner, with no mistaken claim that a local candidate is deployed.** If another chat already owns the same work, do independent diagnosis/design and report the conflict; do not message or wake that chat without user authorization.

## Milestones and exit evidence

| Milestone | Included work | Evidence required to move on |
| --- | --- | --- |
| M0 Current baseline | F00 | Source, deployment, ownership and authorization are recorded separately. |
| M1 Dependable useful town | A01 and A02 minimum versions | One activity completes or stops honestly; a synthetic week reconciles funding and obligations; local regressions pass. Hosted and human acceptance remain explicitly tracked. |
| M2 Shared durable foundation | A03 A04 A09 contracts and A05 slice | Two clients agree; closed browsers do not stop authority; duplicate and delayed jobs are safe; backup/restore and migration drills pass. |
| M3 Residents with durable history | A06 A07 A08 minimum versions | Residents recall permitted past events, acknowledge uncertainty, retain character and commitments, and survive a qualified model change. |
| M4 Useful new abilities | Select one of A10 A11 A12 A13 at a time | One learned procedure, useful tool, functional object or cited research task works end to end, including failure and revocation. |
| M5 Governed expansion | A14 A15 and optional A16 | Resource allocation is fair, shared changes have human review, and narrative claims match the evidence available to residents. |
| Conditional experiments | A17 A18 | A measured gap justifies the experiment; the gain survives cost, privacy, portability and maintenance comparisons. |

Milestones are evidence boundaries, not calendar promises. Design can overlap where interfaces are independent. M4 capabilities need not all ship together; the smallest useful one should prove the next extension path. A17 and A18 may remain deferred indefinitely without making the main game incomplete.

## How a Sol session should run

1. **Orient.** Read the current status, the selected workstream and its packet, the last handoff and only the relevant source. Use this chat for missing rationale, not as a replacement for current repository evidence.
2. **Define the packet.** State the player outcome, code/data boundaries, prerequisites, preserved invariants, decisive tests, cost limits and rollback. Record the packet as scoped before implementation.
3. **Reproduce or measure.** Establish the failing behaviour or baseline with a synthetic or authorized fixture. Do not rerun a large historical test programme without a reason.
4. **Implement the smallest complete path.** Prefer existing seams and additive changes. Keep broad refactors, new infrastructure and unrelated polish out of the packet.
5. **Verify the risks.** Run repository-required checks and the targeted failure/recovery tests. Inspect the resulting behaviour and diff. Every failed check is fixed, scoped as inherited with evidence, or recorded as a blocker.
6. **Prepare delivery.** Leave a coherent diff, handoff and any authorized draft PR. CI, merge, runtime publication and player acceptance each retain their own evidence and permissions.
7. **Update continuity.** Update the packet, current-status record and this framework's live register with results, unresolved issues and the exact next action. End with a resume prompt.

Keep one implementation packet active per checkout. GPT-6.1 Sol is the preferred builder; the user's current model selection and supported settings govern execution. Start with the configured reasoning setting and increase effort for unresolved architecture, migrations or concurrency problems when useful. Keep the handover short and place detailed requirements in the packet, following the official guidance to state instructions once and specify outcome, boundaries and evidence. [Models](https://learn.chatgpt.com/docs/models) · [Prompting guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)

## Packet record to fill before implementation

| Field | Required content |
| --- | --- |
| Identity | Packet ID, workstream, date, named owner and state. |
| Outcome | One observable improvement, including a before/after example. |
| Baseline | Repository, checkout, branch, base/head, PR dependencies and relevant deployed revision. |
| Scope | Files/services/data allowed to change and the deliberate boundary of the packet. |
| Preconditions | Accepted prerequisite evidence; unresolved product decisions; current authorization for external actions. |
| Design | Smallest coherent change, interface/version effects and rejected alternatives that matter. |
| Invariants | Identity, histories, accounts, knowledge permissions, offline compatibility and other packet-specific promises. |
| Evidence | Targeted cases, required repository checks, expected results and evidence location. |
| Costs | Model calls, data retention, job volume and operational costs affected; zero live calls where applicable. |
| Recovery | Rollback trigger, disable path, data compatibility, recovery steps and limits. |
| Delivery | Actual implementation/CI/merge/deployment/acceptance states, each with its own revision or receipt. |
| Continuation | Remaining work, blocker owner, next concrete action and a copyable resume prompt. |

This is an execution template, not a request to fill every field with speculative precision. Use “not applicable” with a short reason where needed. A packet that requires several independent migrations or unrelated outcomes should be split before coding.

# Proposed system contracts

The following boundaries turn the research into an implementation direction. Confirm them against existing code in the relevant contract packet before naming new services or replacing working infrastructure.

| Boundary | Owner of truth | Required contract |
| --- | --- | --- |
| Resident identity | Canonical resident registry | Stable ID, lineage, ownership, versions and export manifest independent of model/provider. |
| World command | Authoritative game engine | Actor, command ID, expected revision, validated intent and a committed or rejected result. |
| World history | Append-only event record with explicit corrections | Event ID, world sequence, event time, source, audience and schema version. |
| Resident knowledge | Authorized observation and delivery records | Who learned what, when, through which event/source, with belief and correction status. |
| Memory | Durable archive with derived summaries/indexes | Source links, audience, retention rules, version, checksum and rebuild path. |
| Inference job | Durable scheduler and accounting boundary | Authorized budget, attempt ID, deadline, cancellation state, proposal and reconciled charge. |
| Tool or learned skill | Versioned capability registry | Inputs/outputs, permission grant, execution limits, provenance, evidence and revocation. |
| Release | Repository review and deployment process | Exact source revision, tests, approved publication, runtime receipt and rollback. |

Start shared persistence with one authoritative database-backed world and a coordinator for ordering work. A coordinator or queue may manage execution, but must not become a second independent owner of balances or resident state. Model calls and external tools run outside short state transactions. Revalidate returned proposals against current permissions, revisions and budgets before committing.

A retry may repeat delivery, but must not repeat an accepted effect. External provider billing can remain uncertain after a timeout; record and reconcile that uncertainty instead of pretending a database transaction controls it. Notifications and memory indexing are retriable derived work. Readers can rebuild them from canonical records.

Separate world facts, individual beliefs and player-visible knowledge. A shared database is not permission for every resident to know every record. Audience filtering must apply to retrieval, exports, summaries, tools and normal UI. Developer inspection remains explicit and separate.

## Migration and rollout sequence

1. Define the new contract and compatibility behaviour; export or back up the affected data before a destructive boundary.
2. Add new fields and readers while keeping old saves and clients supported where required.
3. Backfill copied/synthetic data and compare counts, IDs, account totals, knowledge audiences and checksums.
4. Run the new path in a non-mutating comparison mode when practical. Never charge a second real provider request merely to compare implementations.
5. Cut over one synthetic town or the smallest authorized cohort behind a reversible control.
6. Verify runtime identity, state changes, recovery and cost observations. Retain the previous compatible code and restore instructions.
7. Retire old paths only after their compatibility window and recovery needs are satisfied.

Disabling a feature is not automatically a data rollback. If a new version has already committed valid obligations or external effects, recovery must preserve or reconcile them. Avoid irreversible schema deletion in an initial feature packet.

# Verification and operating evidence

## Acceptance cases that protect the game

| Area | Minimum meaningful checks when affected |
| --- | --- |
| Identity and saves | Version-1 import, current save round-trip, duplicate import, corruption report, names/relationships/commitments retained. |
| Money and obligations | Conservation, correct creditor, wage reservations, insufficient funds, duplicate claim, partial failure and reload. |
| Actions and dialogue | Legal choices, malformed completion, no-op/pass loops, cancellation, late response, exhaustion and truthful termination. |
| Knowledge and memory | Absent witness, private source, opt-out, correction, conflicting claims, chronology and abstention. |
| Shared authority | Two concurrent clients, stale revision, duplicate command, delayed job, process restart and temporary disconnection. |
| Recovery | Backups restore to a stated point; accepted effects and external charges are reconciled; old client/save behaviour is defined. |
| Capabilities | Denied permission, revoked grant, timeout, oversized output, malicious source content and unavailable dependency. |
| Player experience | Visible outcome, keyboard/touch controls, pause, movement, reload, import/export and readable funding/AI state. |

Start with synthetic data and deterministic adapters. For A01, the named failure classes are concrete initial fixtures. For A07, begin with a small labelled set spanning facts, chronology, correction, privacy and unanswerable cases; grow it from actual failures. A test is valuable when it can catch an incorrect behaviour or violated invariant, not because it repeats the implementation.

Use Node 24 and the committed lockfile. Follow the chosen checkout's required typecheck, lint, town tests and other regression checks. A local build must not receive production database credentials; the repository warns that build can invoke migrations. UI changes require the repository's desktop and phone journeys and applicable interface/accessibility checks. Automated accessibility results do not substitute for assistive-technology use or physical-device acceptance.

Live-provider tests require current headroom and existing user authorization. A synthetic pass does not prove live-provider reliability. Human acceptance requires actual participants and recorded observations; retain the existing five-session requirement where applicable rather than filling it with agent simulations.

## Measurements and thresholds

| Measure | Decision it informs |
| --- | --- |
| Useful committed actions per attempted call | Whether decision quality and failure handling improved. |
| Invalid proposals, repeated no-ops and incoherent stops | Whether the activity is ready for a wider trial. |
| Duplicate effects, missing events and account discrepancies | Correctness gate; any occurrence blocks expansion until explained and fixed. |
| Unauthorized knowledge disclosures | Privacy gate; any occurrence blocks expansion. |
| Retrieval correctness, temporal errors and abstention | Whether new retrieval adds value over the same baseline cases. |
| Job latency, backlog, oldest job and cancellations | When scheduler capacity or batching needs change. |
| Storage growth and archive/index size per active day | Retention and indexing decisions. |
| Provider calls and money per completed activity | Whether an activity is affordable and fair. |
| Restore duration and accepted-state recovery point | Whether the recovery objective is operationally credible. |
| Player understanding, voluntary return and unresolved frustration | Whether an activity is useful and enjoyable. |

Record numerator, denominator, workload, revision and sample size. Unknown is not zero. Set performance targets after measuring the baseline and identifying user needs; do not invent a universal latency or availability promise. Correctness and privacy invariants are strict even when quality targets are experimental. Preserve failed attempts in the denominator.

## Scale only at measured pressure points

Begin with the accepted nine residents and player, preserving original identities and additive arrivals, one town and bounded schedules. Simulate larger histories, more queued jobs and multiple worlds before committing to new infrastructure. Compare representative small, tenfold and hundredfold synthetic workloads where feasible, documenting what the simulation omits.

Bound retrieval size, tool runtime, job retries, background activity and storage growth independently. Cache and rebuild derived material, batch non-urgent work, and prefer dormancy to uncontrolled cost. Partition authority by world when measured contention or recovery requirements demand it. Avoid one database, queue or service per resident without evidence.

Keep resident exports independent of the chosen retrieval vendor, model and execution provider. Every new dependency needs an explicit owner, upgrade boundary, failure mode and replacement path. Larger prompts, extra model calls and more services count as costs; they are not evidence of better residents.

# Decisions and risks to revisit

## Product decision register

These are proposed defaults until an applicable user decision or existing game rule settles them. Sol can develop a recommendation and reversible local experiment without presenting the default as approved policy.

| Decision | Proposed default | Resolve before |
| --- | --- | --- |
| D01 Identity and forks | Identity survives model replacement; deliberate forks receive explicit lineage and separate authority. | A03.2 |
| D02 Continuity during scarcity | Preserve state and valid obligations; allow honest dormancy or reduced activity. | A09.2 |
| D03 Retention and removal | Keep portable history with explicit correction, access and deletion/retention policy. | A06.2 |
| D04 Sponsorship | Extra bounded resources, with baseline fairness and no private-memory or obedience rights. | A14.2 |
| D05 Shared code and world rules | Residents propose; reviewed code and authorized release control shared effects. | A15.2 |
| D06 Self understanding | Evidence-based operational discovery; beliefs remain distinct from verified consciousness. | A16.2 |
| D07 Sustainable economy | Fund repeatable work through an explicit lawful source tied to useful demand. | A02.2 |
| D08 Recovery expectations | Define tolerable data loss and downtime from product needs, then prove the restore path. | A05.3 |

Record date, alternatives, rationale, affected contracts and trigger for reconsideration. Ask Arwyn only for a material unresolved product or authority decision that cannot be settled from current instructions. Continue unaffected work while a decision is pending.

## Initial risk register

| Risk | Early signal | Response |
| --- | --- | --- |
| Work begins from stale source or overlaps an owner | Missing current-status file, unexpected diff, unresolved stack. | Complete F00, isolate the change and reconcile ownership before writes. |
| Failed AI loops consume the allowance | Repeated unchanged decisions or invalid completions. | Fix A01 first; cap work, preserve accounting and stop coherently. |
| The town has no sustainable useful activity | Valid businesses exhaust funds and opportunities disappear. | Trace A02 before adding persistent background activity. |
| Multiple authorities disagree | Duplicate payments, divergent clients or orphaned events. | One commit authority, revision checks, idempotency and fault-injection tests. |
| Memory exposes private information or invents facts | Unauthorized sources or unsupported summaries appear in answers. | Source provenance, audience enforcement, correction tests and abstention. |
| New capability expands cost or access silently | Unbounded jobs, retries, network access or inherited credentials. | Explicit budgets, narrow capability grants, revocation and observable usage. |
| Rollback erases valid new commitments | Older code cannot read current state; restore loses accepted effects. | Expand/verify/cutover migrations and rehearsed reconciliation. |
| Progress is overstated | A merged PR is described as deployed, or synthetic tests as player acceptance. | Separate evidence stages and revisions in every receipt. |

Each active risk receives an owner and next review condition when its packet begins. The current release still needs passing required CI on its proposed head, preview reload/accounting closure, the named production migration and publication verification. Hosted usefulness, physical-device/accessibility coverage and human acceptance retain their limits. A05 also needs authenticated filtered views, transactional durable storage, a scheduler and proved backup/restore; the local authority/adapter experiments do not establish production persistence.

# Live registers and continuing sessions

## Current execution register

The [repository current status](../../CURRENT_STATUS.md) owns source/deployment changes and active ownership. The current queue is below; the historical register that follows remains evidence only.

| Packet or group | Current state | Owner | Evidence or next action |
| --- | --- | --- | --- |
| Published baseline | Main `c49facc52136`; latest retained publication receipt records that runtime | Existing release owner | [Public game](https://www.arwyn.party/thegame/); a retained receipt is distinct from a fresh production audit. |
| Combined release | PR #72 open at observed head `8b89537322b9`; current Verify in progress | Improve and expand characters | [PR #72](https://github.com/arwyn6969/the-game/pull/72) and [Verify](https://github.com/arwyn6969/the-game/actions/runs/42245485263). Finish CI, preview reload/accounting, reviews, named migration and publication checks. |
| Combined local qualification | Complete locally at `4681631`, qualified code `556d732` | Prepare combined integration candidate | 1,293 script + 55 typed tests; town/authority subsets and desktop/phone synthetic journeys pass. All 45 runtime/migration files match the observed release candidate. Live teaching and human acceptance remain separate. |
| A01 and A02 implementation | Reliability and bounded café source integrated and published in earlier releases | Existing release and acceptance owners | Do not restart old implementation assignments. [#64](https://github.com/arwyn6969/the-game/issues/64), [#65](https://github.com/arwyn6969/the-game/issues/65) and [#66](https://github.com/arwyn6969/the-game/issues/66) retain their remaining acceptance. |
| F1 F2 and growth/history | Combined source complete; release acceptance pending | Original implementation owners; release owner integrates | Preserve accompaniment, voluntary teaching/refusal, genuine failed practice, witnessed history, privacy and manual takeover. |
| A03.1 A04.1 A09.1 | Ready to scope together | Server developer to be recorded at kickoff | One sample activity; decide identity/lineage, events/audiences, reservation/reconciliation and resource policy. |
| A05 | Local experiments only; no production shared authority | Server developer to be recorded at kickoff | Private one-resident slice, authenticated filtered clients, transactional storage, scheduler, freeze and recovery evidence. |
| Away service and funding | Later, separate qualification | Unassigned | Prove unpaid delegation and return journal, then payment recovery and service/provider qualification. |
| Other packets | Proposed or conditional | Unassigned | Scope after prerequisites; no new dates, spending or assignments implied. |

### Historical register — 1 November 2026

| Packet or group | Current state | Owner | Evidence or next action |
| --- | --- | --- | --- |
| Planning framework | Prepared | Current planning chat | Version 2 extends the priority register with packet definitions, gates and handover. |
| F00 | Refreshed for A01.3, 1 November | Sol / `01a19673-df39-7451-bc65-17ca2eaf8459` | Main remains `a26714e`; isolated `a01-replay/`, branch `codex/a01-qualify`. Explicit #61 `cd44d16` → #62 `44745f4` + A01.2 `e115b57` integration; original branches preserved. Only status histories conflicted. Fresh public read returned 403; inherited asset evidence remains 29 October. |
| A01.1 | Locally verified; replay packet complete | GPT-6.1 Sol / `01a18874-463c-7be1-80a3-ed7eefdace15` | Test revision `922dbcedf7151e9a6a6a351804a4d142b347b4cf`; ten synthetic cases preserve all eight identities, prior payment/debt/memories, speech/audiences and both SQL ledgers through reload. 1,101 script + 55 typed / 428 town tests, typecheck/lint, diagnostics and credential-free build pass. Zero live calls/spend. Review matrix, checks and handoff are in `a01-replay/docs/`; no new PR/CI or hosted proof. |
| A01.2 and A01.3 | Locally verified; draft #63 open; Verify passed | Sol / `01a19673-df39-7451-bc65-17ca2eaf8459` | User explicitly approved branch upload and draft creation. [PR #63](https://github.com/arwyn6969/the-game/pull/63), stacked on #62, head `46bbe82`; [Verify 41301704259](https://github.com/arwyn6969/the-game/actions/runs/41301704259) passed every step at the current head. Code `38d7442` and recorded local gates remain unchanged. Main/production and separate hosted/human gates are unchanged. Handoff: `a01-replay/docs/handoffs/a01-activity-sol-2026-11-01.md`. |
| A02.1 | Separate session observed active during F00 | Astra / `Specify repeatable economy loop` | Own checkout `a02-economy/`, branch `codex/a02-loop`; output not reviewed by this packet. Seven-day trace, small demand/payment alternatives and a bounded specification. Preserve separate runtime and shared-record write boundaries. |
| A03.1 A04.1 A09.1 | Design candidates | Unassigned | Use one sample activity to resolve compatible contracts. |
| Other packets | Proposed | Unassigned | Scope when prerequisites and product choices make them ready. |
| A17 and A18 | Conditional | Unassigned | Demonstrate a need before implementation or spending. |

This historical register reports its dated planning state, not current assignments or a claim that no later implementation exists. F00 reconciles packet definitions with already-completed work. Preserve prior evidence rather than restarting a solved feature.

## States and evidence receipts

Use Proposed → Scoped → Building → Locally verified → Hosted trial → Accepted for an implementation that needs all those stages. Keep Paused, Blocked and Deferred explicit. A document or experiment can finish with its own stated acceptance; it need not acquire a hosted stage. A rolled-back release remains recorded and reopens affected acceptance.

For each meaningful check or delivery, record: packet ID; date; actor; checkout and exact revision; environment; input/fixture; command or user journey; expected and observed outcome; cost/calls; failure or limitations; and evidence path. Link CI runs, PRs and deployment receipts directly. Keep raw private saves, tokens, private dialogue and credentials out of this Page and committed artifacts.

An accepted packet needs its observable outcome, all applicable invariants, passing required checks, documented recovery, resolved or explicitly accepted limitations and an updated handoff. A PR being open, green or merged satisfies only the matching delivery stage.

## Update routine

At the start of a session, reconcile the current register with source and deployment evidence. At the end, update only the affected packet, decision/risk entries and current-status record. When a milestone, failure, cost change, model replacement or product decision changes the outlook, review the affected importance, usefulness, difficulty and dependency scores.

Use the ratings register as the planning source for scores. Update the map from the same values, record its review date, and verify all 18 IDs, scores and phases match. The map is a view of the plan; selection is not approval or task dispatch. Keep a dated decision history so a future session can explain why an area moved.

Repository current status is authoritative for implementation ownership and delivery evidence. This Page is authoritative for the proposed priorities and framework. If they conflict, identify the discrepancy, verify the underlying revision/receipt, then update both affected records; do not silently let a copied planning snapshot override live evidence.

No periodic automation or autonomous background implementation is created by this framework. Updates happen during authorized work and review.

## End of session handoff template

```text
Packet:
Outcome and current stage:
Checkout / branch / base / head:
PR and dependency status:
Changes made:
Checks run and results:
Evidence paths:
Current deployment and how it was verified:
Preserved invariants and recovery:
Known issues or pending decisions:
Authority and spending limits still in force:
Next action, including the first file or case to inspect:
Resume prompt:
```

Keep the handoff small enough to read at the start of the next session. Link the detailed evidence instead of pasting logs. Refresh it after a meaningful change, before switching packets, and before ending a session.

# Handover prompt for a new session

Historical continuation brief: retain it for its original scope and constraints. It is superseded as a work selector by the [repository current status](../../CURRENT_STATUS.md); reconcile completed packets and current owners before adapting it.

For current server work, use the [server developer handoff](../../handoffs/server-developer-2026-11-06.md) and this bounded kickoff brief. The developer and source ownership must be recorded when work begins.

```text
Prepare THE GAME server foundation in an isolated checkout.

Work from the root of your own repository checkout. Read README.md, docs/handoffs/server-developer-2026-11-06.md, applicable AGENTS.md and docs/CURRENT_STATUS.md, and this framework's A03/A04/A05/A09 sections.

First record F00: named owner, current origin/main, actual release PR state, checkout/branch/base/head, target environment and allowed files. Respect the active character-release owner. The combined features already exist; do not repeat F1/F2, growth, history or cast integration. If your slice depends on unmerged PR #72, record that dependency explicitly.

Deliver compatible A03/A04/A09 contracts for one reversible activity, then a private A05 proof with one world, one resident and one object, using synthetic inference. Preserve all existing identities and the accepted nine-resident cast plus player; older saves gain newcomers additively without resetting history, audiences, balances or obligations.

Acceptance: two authenticated clients receive filtered views and converge on one committed outcome; closing both does not stop authority; duplicate commands have one effect; stale/revoked results reject; restart and coherent restore retain commitments and accounts. Keep inference outside state transactions. Resolve navigation runtime state and slow-result starvation before expanding the adapter.

The server owns time. Ordinary players cannot pause, accelerate or skip it, including shortcuts and command paths. Authorized developer freeze stops time and every game action, survives restart/disconnection, and ends only on explicit unfreeze without catch-up. Record the game-time/real-time ratio at kickoff.

Use Node 24 and the lockfile. Run relevant synthetic checks in an environment without live credentials. Record storage/scheduler, retention, recovery targets, operator and capacity/budget limits. Source work does not itself authorize production migrations, publication, spending, live inference, provider changes or external messages.

Deliver a reviewable branch/PR, precise checks and limitations, rollback/recovery instructions and the next bounded acceptance action.
```

The older continuation prompt below preserves the original A01 scope and must not restart completed work.

```codex-prompt
Continue THE GAME using GPT-6.1 Sol. Treat this as a bounded implementation session within the development framework, beginning with F00 and then one ready A01 packet.

Read the living framework:
https://chatgpt.com/space/page_fc96fe02e3308191b9e5df9e3bbade81
Page ID: page_fc96fe02e3308191b9e5df9e3bbade81

For the original research, reasoning and user constraints, you may read the previous Codex chat with read_thread:
01a187bf-a3ad-75a2-817f-66cece710d59
Do not assume that chat is already in your context, or message/wake it. If it is unavailable, use the framework and repository evidence.

Workspace: <repository-root> (the original prompt used the local coordination workspace)
Local framework fallback: docs/planning/resident-development/PLANNING_FRAMEWORK.md

First complete F00:
- Read START_HERE.md and follow its current checkout/status pointers. Read applicable AGENTS.md, CURRENT_STATUS, branch and collaboration rules.
- Verify current source, working-tree changes, active ownership, PR dependencies and deployment evidence separately. The 29 October snapshot had a stale product/ checkout, open PR #61, and draft PR #62 stacked on #61. Recheck; do not assume these facts remain current.
- Choose an appropriate isolated checkout and short codex/ branch without overwriting anyone's work. Record owner, scope, base/head and the next acceptance evidence.

Then complete A01.1: reproduce the known action/completion failure classes with synthetic fixtures and fake inference. Cover unavailable actions, malformed or empty completions, repeated passes, timeout, exhausted allowance and cancellation. Prove that balances, identities, knowledge audiences, history and charged attempts are preserved.
If current evidence proves A01.1 complete, take the next ready, unowned A01 packet. Respect any active owner; do not take over or wake Grok.

Make the smallest coherent local change and run relevant repository-required checks. Continue through diagnosis, implementation, verification and a reviewable handoff; do not stop after offering a plan. Routine reversible decisions do not need repeated confirmation. Ask only when a material unresolved product choice, ownership conflict or action outside authorization prevents progress.

Preserve the seven residents and player, existing towns, version-1 imports, current saves, debts, memories, offline behaviour, authentication and provider/hosting contracts. Model output proposes actions; the engine validates and commits them. Do not reset ledgers, identities or timestamps, invent dialogue, manufacture allowance, or change the game's runtime model merely because Sol is the builder.

Use Node 24. Local builds must have no production database credentials; build may invoke migrations. Start with zero live provider calls. This prompt does not authorize production migrations, merging, deployment, spending, public funding, outgoing transfers, external messages or waking paused agents. Complete all unaffected local work.

Update the selected packet, current-status record, a uniquely named handoff and the Page where access permits. Distinguish local verification, CI, merge, deployment and human acceptance. End with the outcome, exact checkout/branch/revision, checks and evidence, remaining risks, and the next concrete action with a fresh resume prompt. Do not attempt all 18 workstreams in one session.
```
