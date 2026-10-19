# THE GAME quality review and improvement priorities

13 October 2026. Reviewed source: `product/`, commit `221ad79` on main before this report. This is the consolidated seven-resident game, with the player as its eighth actor. The published website is a separate build; this review does not establish that it contains the same source.

**Overall assessment: 5/10 as a game, with a substantially stronger technical foundation than playable depth.** The town has a distinctive identity, coherent presentation, carefully handled saves and unusually clear boundaries around player consent. Its central weakness is that conversation and persistence rarely turn into something useful the player can do, see someone benefit from, and recognize tomorrow.

The next major improvement should deliver one complete contribution to town life: discover a need, inspect clear terms, choose whether to help, perform useful work, receive explainable payment, and see the result matter on the next game day. The already-designed library project fits that purpose. Several smaller trust and usability repairs belong alongside it.

## Section quality at a glance

These scores are qualitative judgments from source inspection and local play checks. They are not player ratings, retention measurements or an average of test results. A 4–6 means a working prototype with substantial gaps; 7–8 means a convincing foundation with identifiable weaknesses. None of the current sections has enough user evidence to justify a 9 or 10.

| Section | Score | Assessment |
| --- | ---: | --- |
| Concept and identity | 8/10 | A small town with distinct people and no final level is a clear, appealing premise. |
| Visual presentation | 7/10 | Consistent art and interface; the town needs more readable, useful interaction points. |
| First session | 5/10 | Starting is simple; guidance ends before a satisfying activity is established. |
| Movement and time | 6/10 | Keyboard, touch, pause and replay work; online AI can block the whole town. |
| Residents and writing | 7/10 | Strong roles and voices; most expertise is conversational rather than playable. |
| Conversation and memory | 6/10 | Good recent context and evidence boundaries; older history and specialist relationships have gaps. |
| Useful activities and return motivation | 3/10 | Very few actions produce a durable change that makes the next visit interesting. |
| Work and economy | 3/10 | Consent and attendance work; funding, accounting and unpaid earnings are incomplete. |
| Food and items | 3/10 | Bread can be acquired, eaten and repaid; its practical or social purpose is limited. |
| Journal and feedback | 5/10 | Agreements and receipts exist; access and progress visibility need improvement. |
| Mobile and accessibility | 6/10 | Responsive controls and conversation layouts; nonvisual navigation is incomplete. |
| Saves and recovery | 8/10 | Strong migration and recovery; stale tabs can still overwrite newer progress. |
| AI service and operation | 5/10 | Validated output and fallback; responsiveness, budgets and live quality need work. |
| Engineering and release discipline | 7/10 | Good automated coverage and source provenance; deployment and browser gates need completion. |

## Concept and identity

**Strong points.** The player is a neighbour, rather than an omniscient town manager. Kevin's uncertainty about his identity gives the place an emotional centre. The residents' different expertise provides a good basis for cooperation: research, testing, economics, writing, practical work and local knowledge can all contribute to the same problem. Preserve this scale and tone.

**Weakness.** The promise “make tomorrow different” is ahead of the available actions. A growing log of conversations is not enough to make the town feel changed. The indefinite premise also needs a sequence of small satisfactions; a lack of an ending does not remove the need for progress.

**Improve.** Make the main loop contribution, visible use and remembered consequence. Let choosing not to participate be a valid outcome. Define success by what players understand and want to revisit, rather than the number of residents, model calls or generated memories.

## Visual presentation and atmosphere

**Strong points.** The neon palette, pixel typography, consistent buttons and distinct interiors make the game recognizable. Directional walking, depth ordering, nighttime lighting, distinct resident accessories and reduced-motion behavior show care. Current desktop and phone screenshots are coherent; neither checked viewport had horizontal overflow.

**Weakness.** Much of the environment is scenery. Shelves, tables, the cafe and the library suggest activities that the player cannot yet perform. Small muted labels and decorative interface space also deserve scrutiny on actual phones. The space-traveller language on entry and the intimate community story pull in slightly different directions; decide whether that contrast is intentional.

**Improve.** Make a few objects visibly useful before undertaking another visual redesign: an evidence shelf, a working index and a task/result board. Use clear hover, focus and touch feedback. Test text enlargement, destination labels and contrast on the real devices players use. Ambient sound is optional later polish, with player controls; it is not a substitute for missing activity.

Evidence: [renderer](../../src/game/render.ts), [world art](../../src/components/town/WorldArt.ts), [desktop town](../review/quality-2026-10-13/desktop-town.png), [phone conversation](../review/quality-2026-10-13/mobile-conversation.png).

## First session and guidance

**Strong points.** A short name-entry screen, paused clock and a direction to Hobbs reduce initial pressure. An ordinary keyboard journey reached Kevin in 18 steps, received an appropriate answer to “Who are you?” and accepted the quoted cafe shift. The game can establish its main character quickly.

**Weakness.** A successful first conversation marks the guide complete, even when it is with another resident. “How to play” then disappears. After accepting a shift, the fresh journey had no visible Journal button because no debt existed. Players can therefore reach the first interesting conversation and immediately lose a clear next step.

**Improve.** Keep Help and Journal permanently available. After the first exchange, offer an optional, concrete need in the town. Show where to go, what is being offered and how to decline. The target should be a chosen contribution or informed refusal within 10–15 minutes, with no coaching.

Evidence: [guide completion](../../src/components/town/TownApp.tsx#L418), [temporary help](../../src/components/town/TownApp.tsx#L1235), [fresh journey results](../review/quality-2026-10-13/ordinary-journey.json).

## Movement and time controls

**Strong points.** Keyboard movement, touch movement, pause, time speeds and replay are implemented. The world has legal routes and collision handling; residents move through it rather than simply appearing at destinations. Paused movement lets a player explore at their own pace.

**Weakness.** Every online AI job shares a global pending flag. While a plan, reflection or reply is pending, movement and simulation time stop; deterministic Choices are also blocked. The client timeout is 45 seconds. This is a code-confirmed behavior, although this review used offline play and did not measure a live delay. The status line “on foot, not where that hour planned” refers to a largely hidden timetable and is difficult to interpret.

**Improve.** Separate background jobs from direct conversations. Keep walking, the journal and ordinary controls responsive; validate late results against the current town and context. Offer a clear local reply option for a delayed conversation. Use plain activity text such as walking, arriving or working.

Evidence: [pending job](../../src/components/town/TownApp.tsx#L344), [movement gate](../../src/components/town/TownApp.tsx#L503), [clock gate](../../src/components/town/TownApp.tsx#L553), [activity wording](../../src/components/town/talk.ts#L54).

## Residents and conversation

**Strong points.** The cast has authored roles, public knowledge, voice guidance, specialisms and limitations. Recent turns are attributed and dated. Local dialogue is honestly labelled, and the current interface distinguishes configured AI from an accepted response. Kevin's opening identity answer works well offline.

**Weakness.** Natural questions often reach generic local fallback. In the current browser journey, “What kind of work matters to you?” gave Data an unclear-answer response followed by his general specialism. Offline player replies always use a relationship delta of zero, and routines largely repeat. This makes offline play dependable but socially shallow. Live AI quality remains a separate, unmeasured part of the experience.

A specific context defect affects Data and Amelia: the AI prompt takes the first five relationships in roster order, omitting their relationship with the player. A focused probe confirmed that a meaningful player relationship was absent from Data's packet.

**Improve.** Prioritize the actual conversation partner when selecting relationships. Expand authored answers for each resident's current concerns, work, directions, recent witnessed events and common paraphrases. Offer a few useful starter questions. Let grounded contributions change acknowledgments and opportunities; avoid automatic affection for repetitive greetings.

Evidence: [character profiles](../../src/game/characters.ts), [relationship selection](../../src/game/prompt.ts#L127), [fallback](../../src/game/offline.ts#L689), [offline relationship delta](../../src/game/offline.ts#L754), [Data on phone](../review/quality-2026-10-13/mobile-data-conversation.png).

## Memory and knowledge

**Strong points.** The system distinguishes recorded events, spoken claims and interpretation. Pair-specific history and private/shared context are useful safeguards. Query-aware retrieval, protected identity threads and recent conversation support coherence. Dialogue alone cannot accept a player commitment or transfer their money.

**Weakness.** Long-memory compression concatenates eight old records and keeps only the first 380 characters, then deletes the originals. The replacement loses pair and speaker-turn metadata. A probe with 41 long conversations lost the eighth old record's unique fact. The phrase “folded so it is not lost” therefore overstates preservation. Protected summaries also continue accumulating.

The default timetable creates another small agency problem: being outside Hobbs at noon can record a missed visit as though the player had authored that plan, without accepting an appointment.

**Improve.** Summarize by pair and topic, preserve source references, and retain each important fact or explicitly archive it. Keep authoritative commitments, payments and project outcomes separate from prose recollection. Only record a missed obligation when the player actually accepted it.

Evidence: [truncating fold](../../src/game/memory.ts#L151), [dialogue replacement](../../src/game/memory.ts#L196), [pair recall](../../src/game/conversation.ts#L35), [unchosen noon memory](../../src/game/sim.ts#L173).

## Activities and reasons to return

**Strong points.** The places, residents, schedules, noticeboard and saved state provide much of the infrastructure for a consequential small community. The proposed library project already connects residents' expertise to an understandable practical problem.

**Weakness.** Explicit player actions currently cover bread, eating, repayment and cafe-shift acceptance/cancellation. There is no playable library index, evidence-checking task, productive object interaction or structured next-day project result. New residents broaden conversation more than they broaden what the player can do. Money, history and NPC movement can change while the player still has little influence over useful town outcomes.

**Improve.** Deliver the three-record library project through ordinary controls, offline. Let a player check evidence, submit a contribution and see a lookup succeed or fail using that exact result. Keep payment for agreed work separate from whether the result is useful. Tomorrow, show specific attribution, an actual unresolved issue and a bounded paid correction opportunity when appropriate.

This is the highest-value gameplay work. More residents, a bigger map or more AI-generated chatter should follow evidence that this loop works.

Evidence: [current action vocabulary](../../src/game/effects.ts#L473), [roadmap](../ROADMAP.md), [project plan](../implementation/community-project.md).

## Work and economic fairness

**Strong points.** Work requires an agreed shift and physical attendance. Terms show the required time and conditional payment. Bread and its debt are created together; repayment validates the actual debtor, creditor and funds. Stale and distant action offers are rejected. These are important foundations to retain.

**Weakness.** Cafe work is attendance rather than an interesting task. A full shift is three game hours: roughly three real minutes at 1× while the clock runs normally, before online delays. Wages are not reserved when the player accepts. Other payments can consume available funds. An unpaid shift leaves a prose memory, but authoritative attendance resets at midnight and there is no durable payable.

The economy also adds cafe/grocery funds without a recorded source and imposes destructive midnight caps. Focused synthetic probes reproduced a fresh town's total cash changing **90 to 110**, and tills of 50 each producing a total change **152 to 124** across midnight. These are existing legacy rules, but they do not support understandable accounting or fair funded work.

**Improve.** Reconcile the separate account foundation with the current version-2, eight-actor town. Route all money changes through one authority, preserve valid imported balances, reserve accepted wages and record earned unpaid obligations. Remove unexplained top-ups and destructive caps as part of complete activation with matching terms and UI. Avoid a partial second ledger.

Evidence: [attendance and wages](../../src/game/sim.ts#L108), [midnight rules](../../src/game/sim.ts#L270), [shift offer](../../src/game/effects.ts#L561), [foundation status](../CONSOLIDATION.md#saves-and-the-unfinished-economy).

## Food and items

**Strong points.** Receiving a loaf, eating it and repaying Baba are distinct choices. Eating does not erase the debt. The simulation rejects repeated consumption.

**Weakness.** Bread has little purpose beyond roleplay and a tab. There is no standalone inventory action: eating appears in NPC conversation Choices, while the player journal has no actions. A generic project limit also substitutes for carrying capacity.

**Improve.** Make carrying and eating discoverable from the player's own inventory. After the useful-work loop, add the already-scoped optional shared meal, with identified attendees and a witnessed event. Keep it voluntary. A hunger meter or absence penalty is not necessary to make bread matter.

Evidence: [eat action](../../src/game/effects.ts#L510), [consumption](../../src/game/effects.ts#L695), [journal action exclusion](../../src/components/town/TownApp.tsx#L1665).

## Journal and feedback

**Strong points.** Conversation receipts, open commitments, debts and failed-send feedback make effects more inspectable. The conversation keeps the newest reply visible while respecting someone reading older entries. A failed draft remains available.

**Weakness.** The journal is hard to discover without an open tab; clicking the player sprite is an obscure fallback. It lacks clear current work progress and a compact account of outcomes. Every resident card displays “Pin Kevin”; activating it redirects the panel to Kevin. This is implemented behavior, but an unexpected control on Data's or Amelia's conversation. The developer inspector also competes with ordinary player information.

**Improve.** Add permanent Journal and Inventory access. Show today's work requirement, progress, payment or unpaid claim, carried items and sourced outcomes. Pin the resident being viewed, or put a clearly named Kevin shortcut elsewhere. Move development inspection to an explicit development setting. Keep the normal journal about what the player knows.

Evidence: [conditional journal button](../../src/components/town/TownApp.tsx#L1253), [commitments](../../src/components/town/TownApp.tsx#L1745), [Kevin pin](../../src/components/town/TownApp.tsx#L1332), [pin label](../../src/components/town/TownApp.tsx#L1677).

## Mobile and accessibility

**Strong points.** The 390×844 browser journey passed touch movement, conversation layout, import/export and reload. The heading, close control and composer fit. Keyboard handling, focus styling, labelled nearby conversation buttons, substantial targets and reduced motion provide a useful starting point.

**Weakness.** Responsive appearance is not complete accessibility. The canvas has a general label without a navigable alternative for destinations, obstacles and location. D-pad buttons use pointer handlers, so normal assistive button activation does not provide equivalent movement. A physical phone keyboard, text zoom and VoiceOver were not validated here.

**Improve.** Provide accessible destination/location controls, nearby people and clear blocked-movement feedback. Support keyboard activation of direction controls. Verify focus return after closing conversations and replacement dialogs. Test on a real phone with the on-screen keyboard open, enlarged text and a screen reader.

Evidence: [canvas](../../src/components/town/TownApp.tsx#L1263), [direction pad](../../src/components/town/TownApp.tsx#L1584), [browser results](../review/quality-2026-10-13/browser-journeys.json).

## Saves and recovery

**Strong points.** Version-1 towns migrate without recreating their established residents. The legacy storage key remains intact. Unreadable newer saves retain their original bytes rather than silently falling back to an older town. Failed saving warns the player and offers a download; quota fallback drops disposable replay rather than identity, memories or debts. Unsupported experimental economy saves are rejected for recovery.

**Weakness.** There is no arbitration between browser tabs. A mocked-storage reproduction using current code loaded two copies on day 1: one saved day 3, then the stale copy saved day 1. Both succeeded and storage reverted to day 1. Account-based cross-device saving is also absent, although the browser-local limitation is disclosed.

**Improve.** Protect same-browser progress with a single-writer lease or revision conflict detection before introducing cloud synchronization. Preserve both snapshots when there is a conflict. Later, cross-device saving needs explicit ownership, conflict handling and migration, rather than merely attaching local storage to login.

Evidence: [read and recovery](../../src/game/save.ts#L404), [unconditional write](../../src/game/save.ts#L431), [save on hide](../../src/components/town/TownApp.tsx#L629).

## AI service and operating controls

**Strong points.** Provider output is validated before simulation effects. Keys stay server-side. The opt-in pool has quota reservations, credential-host guards, bounded attempts and fallback; operational accounting excludes conversation contents. The current AI status is more honest than older release evidence.

**Weakness.** The default legacy service limits requests in one process, without a durable shared monetary ceiling or fair per-player allocation. Pool request/token quotas do not establish a shared cash budget. Broad public use could therefore have unpredictable cost and contention. The interface also lacks a persistent local-only preference and a simple explanation of which player text and context are sent to an external provider.

**Improve.** Add shared usage accounting and budget reservations across both modes before broader paid operation. Reserve interactive capacity ahead of background work and fall back when exhausted. Give players a clear local-only choice that also stops autonomous provider calls. Evaluate live dialogue quality, latency and capacity independently; more model options do not by themselves improve the game loop.

Evidence: [legacy limiter](../../src/lib/mind.functions.ts#L4), [request gateway](../../src/lib/mind.gateway.ts), [pool documentation](../AI_PROVIDER_POOL.md), [player prompt](../../src/game/prompt.ts#L107).

## Performance and engineering

**Strong points.** Automated tests cover game rules, migration, conversations, providers, app and authentication boundaries. Type checking, lint and a credential-free local production build pass. Rendering uses cached art and bounded pixel density; the isolated paused-render observation was fast on this machine. Current diagnostics round-trip six exports through day 30.

**Weakness.** Protected memory summaries accumulate, and saving clones/serializes the town synchronously. Retrieval ranks the permitted memory stream. The 30-day diagnostic reached 1,253 memories, about 2.15 MB of serialized internal town state and a 733 kB portable export. That is currently manageable, but does not establish indefinite scalability. Imports have an 8 MiB ceiling, while exports do not enforce the same ceiling.

`TownApp` combines input, storage, AI, simulation orchestration and presentation. That makes changes harder to reason about. There are also duplicate npm script keys and some outdated design assumptions. These are smaller concerns than the player-facing gaps.

**Improve.** Measure longer synthetic towns with heavy dialogue, including save/retrieval latency on phone-class hardware. Keep exports reimportable and preserve source-backed outcomes while archiving history. Extract orchestration boundaries while repairing responsiveness and saves, rather than starting a broad rewrite. Reconcile old v1/six-actor/77-coin design contracts with v2/eight actors/90 coins before economy activation.

Evidence: [compression](../../src/game/memory.ts#L196), [serialization](../../src/game/save.ts#L380), [import ceiling](../../src/game/save.ts#L474), [implementation assumptions](../implementation/community-project.md#s1--accounts-work-contracts-and-compatible-state).

## Release readiness

**Strong points.** The consolidated source has a clear history and explicit distinction from the hosted build. The project preserves auth/PWA contracts and separates local validation from live database migration and publication.

**Weakness.** Source completion does not establish hosted parity. Automated CI does not currently run the desktop/phone journey. Passing rule tests also does not establish enjoyment, accessible interaction or a reason to return.

**Improve.** Add repeatable browser checks against the exact built artifact, including delayed AI and competing tabs. Show a build identifier. Verify the hosted revision and the same save/conversation/transaction journeys when a release is authorized. Use the existing five-player diagnostic to evaluate comprehension and voluntary return before expanding scope.

Evidence: [CI](../../.github/workflows/verify.yml), [consolidation](../CONSOLIDATION.md), [five-player gate](../design/consequential-first-week.md#five-player-diagnostic-gate).

## Actionable delivery order

The owners below are proposed implementation lanes, not staffing assignments. P1 means next substantial work or required before broader operation; P2 means the following improvement pass; P3 means optional polish after the core experience works. No P0 emergency was established by this review.

| Priority | Action | Proposed lane | Completion criterion |
| --- | --- | --- | --- |
| P1 | Protect competing browser tabs | Saves/simulation | A stale tab cannot silently replace newer progress; both snapshots remain recoverable. |
| P1 | Keep the game responsive during AI | Integration/UX | A 30-second delayed job leaves keyboard/touch movement and journal usable; late replies cannot affect a replaced town. |
| P1 | Repair guidance and basic navigation | UX | Help and Journal remain reachable after any first reply and reload; opening a resident reliably shows that resident. |
| P1 | Reconcile and activate funded accounts | Simulation | v1/v2 imports preserve money; every change has a source; reservations cannot double-spend; earned unpaid work survives midnight/reload. |
| P1 | Deliver the offline library contribution | Simulation + UX | A fresh player discovers terms, contributes or declines, and sees a real lookup result in 10–15 minutes. |
| P1 | Make tomorrow show the actual result | Simulation + content | Attribution, usefulness and a bounded correction path survive reload and differ by the player's real outcome. |
| P1 before broader paid use | Add shared AI allowance and fair access | Backend | Concurrency/restarts respect the shared limit; background jobs cannot consume all direct-reply capacity; exhaustion uses local dialogue. |
| P2, small repair suitable now | Include the current conversation partner | Conversation | Data/Amelia prompts contain the player relationship; adding residents cannot silently remove it. |
| P2 | Preserve older memory and accepted agency | Memory/simulation | Facts from all folded records remain attributable and retrievable; no invented noon obligation appears. |
| P2 | Expand everyday offline answers | Content | Role, work, concern, direction and recent-event questions work across common paraphrases without an AI key. |
| P2 | Finish inventory and progress feedback | UX/simulation | Eat from inventory; see worked units, payment state, debt and held items without opening an unrelated conversation. |
| P2 | Add local-only preference and processing explanation | UX/backend | Local-only emits no provider calls; the player can understand the active mode and external processing. |
| P2 | Complete accessible navigation and real-device checks | UX | Destination selection, movement, location and conversations work by keyboard/screen reader; phone keyboard and text zoom remain usable. |
| P2 | Measure longevity and automate release journeys | Integration | Heavy long-running saves remain reimportable within recorded budgets; built desktop/phone/conflict/delay checks run repeatably. |
| P3 | Add the optional shared meal and atmosphere | Content/UX | One voluntary meal consumes items once, preserves debts and produces a witnessed social event. |

Small context, pin, help and agency repairs can be delivered while accounts are reconciled. Funded accounts and their player-facing terms should activate as a coherent feature, followed by the library result and tomorrow's consequence. Keep the no-key journey usable throughout.

## Missing scope and expansion boundaries

**Include in the next playable milestone:** the funded library task; secure payment and durable wage claims; evidence and result interactions; understandable journal/progress; sourced next-day consequences; responsive controls; competing-tab protection. These address the current promise directly.

**Include in the next polish pass:** stronger everyday local dialogue; pair/topic memory summaries; own-inventory actions; optional meal; local-only mode; accessible navigation; longer-town measurements; built-artifact browser checks and user diagnostics.

**Separate later architecture:** account-based cross-device saves, conflict resolution across devices, a continuously running shared town, filtered spectator views and Freeman Show infrastructure. The current browser simulation does not continue as a shared world when viewers leave. These are significant projects, not small hosting switches.

**Defer until the contribution loop is proven:** more residents, a larger map, banking, markets, a generalized job scheduler, a large item catalog and another wholesale visual redesign. None is required to prove that a useful action creates an interesting tomorrow.

**Status of existing plans:** the account foundation remains outside current runtime and requires v2/eight-actor reconciliation; the funded library, week-one consequences and optional meal are designed but not playable. The consolidated seven-resident source is implemented locally; hosted parity is not established here. Refresh the detailed design documents that still describe five residents, separate neon work or a v1 account extension.

## Evidence and evaluation gates

Fresh local checks used Node 24.19.0 and synthetic towns, with provider/database credentials unset. Existing personal towns were not opened or altered.

| Check | Current result |
| --- | --- |
| Typecheck | Pass. |
| Lint | Zero errors; one existing unused auth-disable warning. |
| Full automated suite | 425 passed: 370 script tests plus 55 app/auth tests; zero failures or skips. Town tests are included in this suite. |
| Production build | Pass; database migration skipped because `DATABASE_URL` was unset. |
| Offline diagnostics | No world-audit issues; exports for days 1, 2, 5, 7, 14 and 30 reimported successfully. |
| Desktop 1280×800 and phone 390×844 | Both journeys passed name entry, movement, pause, conversations, export/import and reload; zero captured console/page errors. |
| Ordinary first-session keyboard journey | Pass: walked to Kevin, asked identity, read and accepted shift. Confirmed disappearing help and absent Journal button with a commitment but no debt. |
| Renderer | Fresh paused-art and town-immutability checks passed. The graphics script's separate renderer-page navigation timed out after both player journeys passed; full fresh animation/occlusion/reduced-motion certification remains incomplete. |
| Focused engine/storage probes | Confirmed midnight balance changes, specialist relationship omission, lost old conversation content and stale-tab overwrite using isolated fixtures. |
| Live providers, hosted release, physical devices | Not certified by these local/offline checks. |

The diagnostics contain an old embedded baseline label; their observations here ran against `221ad79`. The browser phone viewport is emulation, not a physical-device result. Renderer timing is a local observation, not a device performance guarantee.

For the next milestone, run five uncoached sessions across desktop and phone. Ask players to find something to help with, or decline it, and then reopen their town on the next game day. Use the existing design gate: four of five can explain their chosen action and recognize its consequence; at least three choose another visit without a directed reward. Ask separately who funded the work, who was paid, whether the result helped, and who owns it. This is a small diagnostic for confusion and motivation, not a retention statistic.

The game already has enough foundation to test that promise. The development priority is to make the existing town useful and consequential, then use real player evidence to decide how it should grow.
