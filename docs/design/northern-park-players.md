# Northern's Park Players — next community release brief

Planning record: 22 October 2026. Status: proposed community release scope, with the user's creative direction recorded below. The branch contains the separate bounded physical-manuscript prototype over main baseline `dab257b`; its [implementation receipt](../review/manuscript-prototype-2026-10-22.md) distinguishes tested mechanics from this larger programme. One authorized [headless real-model trial](../review/northern-real-ai-2026-10-22/README.md) demonstrated the physical loop and exposed a grounding gap to fix first. The wider community activity is not implemented, tested or deployed. The hosting owner's separate changes remain in their checkout.

**Immediate next packet revised:** start with [CP0: one physical manuscript](physical-interaction-foundation.md). It specifies the actual sprites/poses, movement, pickup/carry/put-down/read commands, minimal inventory view and saved object state. CP1–CP9 below describe the larger programme, not a single first sprint. Prove this connection before adding theatre props, construction or general furniture movement.

The [grounding correction and second real trial](../review/northern-grounding-repeat-2026-10-22/README.md) preserve free fiction and demonstrate grounded notes plus actual manuscript travel/placement. The [ground-read follow-up](../review/northern-ground-read-2026-10-22/README.md) succeeds mechanically but spends three calls reading unchanged blank pages before pickup. [Known-revision handling](../review/northern-read-progress-2026-10-22/README.md) now removes unchanged rereads while retaining the known words and all remaining creative choices. Automated checks pass; the one real repeat is scheduled for available quota. Purposeful real-model progress remains unqualified until that run. The full programme below is still planned, not delivered.

## Product direction agreed with Arwyn

- Develop the existing cast before adding residents.
- Northern suggests a reading. Residents propose a few short pieces and choose together; a reading may grow into a short play in the park.
- The tone is playful and chaotic, with room for a charming failure.
- The player primarily watches the residents organize themselves and steps in when invited. Watching, leaving or declining is a valid way to play.
- Residents are AI controlled throughout the intended release. Story ideas are motivations and opportunities, not compulsory authored plot transitions. New NPC intentions, conversation, planning and reflection must not secretly substitute local authored replies or predetermined decisions when inference is unavailable.
- Items are acceptable where they support actual game actions. Do not claim that an agent built, carried, placed, paid for or used something unless a supported action changed durable state.
- Keep Northern, Kevin, Baba, Data, Arwyn, Sub and Amelia. No new resident is required for this release.

**Release promise:** I can watch AI residents pursue a shared creative idea, occasionally join in, and return to a town that remembers what actually happened.

This release does not promise that a performance always happens or that everyone agrees. A genuine smaller reading, an unfinished draft, a postponed attempt or a surprising improvisation can be valid outcomes. A finite observed attempt must have an understandable status and cause rather than silently stalling.

## Existing foundation and boundaries

The current reading already supports park/library venues, guest routing, physical arrival, listening or volunteering an opening line, and saved attendance/outcomes. Its park cast is Northern and Sub; the library adds Arwyn. It is reached through player-driven library-project controls. That is useful implementation precedent, but it does not yet deliver this resident-led, AI-driven project.

The old reading's validation reconstructs its exact original scene and participant count. Preserve those meanings. Add a separate optional, versioned community-activity record rather than rewriting completed readings or expanding their guest lists in place. Do not replay payments, receipts or conversations while migrating old saves.

Allow Northern to propose a new public reading without requiring the player to solve the library index or approve a project. If an earlier reading has actually happened, it may inform Northern's motivation. If it has not, do not invent that history. Respect existing work and event appointments and avoid scheduling the same resident into overlapping commitments.

The town currently runs in the browser. This activity can first be developed while a town is open; genuine activity after all browsers close depends on the authoritative-server work. The latest hosted handoff describes a limited free player-reply configuration, with background AI disabled. That configuration does not meet this release's AI-activity promise.

## Characters and reasons to get involved

These are interests the AI may act on, not guaranteed role assignments or compulsory lines.

| Resident | Direction and possible contribution |
| --- | --- |
| Northern | Originates the wish to share a reading. May suggest a piece, invite responses, try a role or decide a smaller gathering suits the moment. Preserve ownership of the idea without making Northern an omnipotent director. |
| Sub | User direction: very friendly, enthusiastic, hardworking, creative artist and writer. May propose original material, develop another resident's idea, revise a scene or improvise. Refresh the current drier voice rather than treating it as the final character brief. |
| Arwyn | Helpful nexus; brings people together with infectious enthusiasm. May circulate invitations and help resolve competing ideas. Cannot accept for others or commit the player's time. |
| Baba | Helpful guru who wants to build useful things. May propose a practical preparation task and carry it through using supported tools. Distinguish encouragement, an actual small made object and the future general construction system. |
| Kevin | Philosophically curious, including study of Shingon Buddhism among other interests. May bring a question, suggest a reading or discuss an idea; retain the cafe and existing commitments. Specific claims about a tradition need suitable source material, not invented expertise. |
| Data | Keen student and activist for the ASI Bill of Rights. May propose a piece, learn a part or raise a question about participation and agency. Advocacy is part of Data's perspective; other residents may disagree or choose another subject. |
| Amelia | Preserve Dr. Amelia Keynes's original Kevin World profile: macroeconomics, monetary policy, economic models, decentralized systems, fair access, valuing contributions and practical commerce. The original 14 September 2023 profile was recovered during this planning pass. Her broad aspirations do not grant control of residents' money. She may act, watch, contribute an idea or discuss practical tradeoffs; she is not automatically assigned bookkeeping. |

The recovered Amelia text does not identify a named composite list of economists. Do not invent such a list. Existing lives, memories, agreements and private history survive any public-character-profile refresh.

Data's reference is the [ASI Bill of Rights repository](https://github.com/arwyn6969/asi-bill-of-rights/). Its README currently identifies adopted project charter v5.0 and separate v5.1 draft work. For this release, select a small source-labelled reading resource and record its exact revision during implementation. External research, repository contributions and real-world advocacy actions are separate capabilities. The game must not claim Data has performed them from dialogue alone.

## AI decisions and dependable world rules

The runtime loop is: observe permitted state → form an AI intention → request supported actions → validate and commit → observe the actual result. AI decides purposes, proposals, speech, creative preferences, invitations, acceptance and interpretation. The engine supplies movement, clocks, permissions, item state, money rules and receipts.

This is a release-wide policy, not an exception limited to the new event. Inventory normal player replies, resident-pair talk, plans, reflections, startup decisions, time-advance/offline-result paths, recovery and the old reading's authored live continuation. New NPC speech or intentions on those paths must come from AI or remain pending. Preserve historical authored records as history. An unfinished legacy event needs an explicit compatible transition or parked status; do not mark it completed with synthetic text merely to satisfy its old validator. Already accepted physical actions and rule-defined obligations can still settle from actual evidence.

Do not call a model for every animation frame. Request decisions on relevant changes and at bounded opportunities. Continue an already accepted walk or other valid action through deterministic simulation; an absent model response cannot generate a new intention or spoken exchange.

Provide a small capability set rather than permission to narrate arbitrary effects:

| Capability | Required committed evidence |
| --- | --- |
| Propose or revise a piece | Attributed text, author, revision, previous revision and source/original-work label |
| Respond to a proposal | Actual resident response to a known revision; no invented unanimous agreement |
| Invite, accept, decline or suggest another time | Named participants, offered role/time, acceptance status and existing commitment checks |
| Choose a piece together | Explicit preferences and accepted creative commitments; unresolved disagreement remains visible |
| Prepare or use an object | Actual object/resource identity, reach, permissions, prerequisites, work/placement result and receipt |
| Perform or speak | Present actor, current piece/cue or improvisation, actual utterance and actual listeners/witnesses |
| Publish an outcome | Factual projection of recorded actions and attendance, with credit to actual contributors |

Residents can develop different goals. No player approval is required to start the idea, choose a piece, invite others, rehearse or begin. An optional audience member is not a prerequisite for a performance. Declining to act does not prevent someone from attending. Invitations to the player neither spend money nor create an obligation without explicit acceptance.

A programme, Baba's participation and a physical prop are optional aids. Residents can read or perform without them; their absence must not become an artificial event-start gate.

**AI unavailability:** expose the pending/unavailable state and retain intentions, drafts and accepted commitments. Let already committed physical actions finish when appropriate; new AI decisions wait or the activity pauses. No authored NPC speech, synthetic preference, completed work or automatic story resolution stands in for a missing reply. Do not enable paid routes or increase spending limits through this plan.

Qualifying service capacity, job routes, queue policy and bounded operating limits is a prerequisite for accepting the AI-driven release. Reuse the existing validated gateway and durable accounting. Current short player-reply tests are useful evidence, not proof of continuous seven-resident operation.

## Items: a small honest capability surface

Current map furniture is static scenery/collision data. A drawn table is not automatically a movable item. The existing carried-loaf and refreshment systems are narrow and do not implement a general inventory or construction system.

For this release, distinguish:

1. **Fixtures:** existing tables, benches and shelves stay fixed unless a later feature explicitly makes one movable.
2. **Creative records:** a script/programme is a versioned game record that people can read, revise and use. It needs no invented physical carrying claim.
3. **Portable props:** introduce only a prop with a real function, such as a shared cue-board. A portable prop needs identity, location/holder, access, supported placement, rendering, use and persistence.
4. **Constructed structures:** a stage, building or freely placed furniture needs additional material, work, map, navigation and ownership rules. That is outside the small event's core scope.

**Recommended Baba scope:** first implement preparing and posting the agreed programme at the existing noticeboard as a real resident action. Baba must accept the task and reach the board; the published programme must match the agreed piece revision. Readers gain that public information through the board. Call this programme preparation, not construction.

If a physical making task is selected for the release, scope one functional cue-board as a separate, bounded task. Introduce its finite supplied/borrowed component or kit explicitly, track its source and ownership, require actual work/presence, place it only at an allowed location, render and inspect it, and preserve it through reload. It can support cues and later be reused. A sentence saying “Baba built a stage” is not an acceptable substitute. Do not make this prop mandatory for a reading; residents may decide to use spoken cues instead.

Avoid implementing movable tables, a catalogue of decorative items or a general crafting tree before an activity calls for them. The first prototype should establish whether a physical prop adds a recognizable capability beyond the useful programme record.

## Meaningful choices and open outcomes

Examples below are possibilities to support, not scheduled scenes:

- Different residents favour different short pieces. They may combine contributions, select one for now, split into readings or disagree and reconsider later.
- A cast member prefers watching. Residents can change the cast, make a smaller version, recruit a willing substitute or postpone.
- A changed script makes an old cue-sheet stale. Residents may notice, correct it, improvise or abandon that version; the engine must not force a comic mistake.
- Preparation clashes with a real work commitment. Residents can choose another time or simplify the event. Protect existing paid work and earned wages.
- The player accepts a small invitation to read a line, offer an opinion or help. Record only what the player actually chose and did. Silence is not consent.

Humour can arise from different ideas, overenthusiasm, genuine timing mistakes and responses to actual constraints. Do not inject a mandatory accident or punish a spectator to manufacture drama.

## What should remain on the next visit

Persist what happened rather than a generic success flag:

- Proposed pieces, revisions and the residents' actual choices or remaining disagreement.
- Actual authors, performers, helpers, audience, absences and postponements.
- A readable programme/outcome notice linked to those receipts.
- Any actual cue-board state, placement or loan status, if that item was implemented and used.
- Relevant memories for participants and actual witnesses. Other residents learn through a later conversation or public notice, not hidden global knowledge.
- An AI may suggest another gathering, revisit a joke, repair a misunderstanding or pursue a different idea. These are future decisions, not guaranteed sequel text.

If the player missed an event, the public record explains it without pretending the player watched. In the browser-local milestone, returning after real-world absence does not imply game time advanced. Continuous away-time consequences belong to the server milestone.

## Practical delivery tasks

These are proposed implementation packets. Roles below are ownership recommendations; nobody has been assigned or messaged to start implementation by this document. Difficulty is an initial engineering estimate from 1 to 10, not completion percentage or calendar time.

| ID | Task and reviewable deliverable | Suggested lane | Dependencies | Difficulty |
| --- | --- | --- | --- | --- |
| CP1 | Refresh the seven public character briefs and interests from the directions above; preserve Amelia's recovered scope and existing private/history boundaries. Produce prompt/local-metadata changes without authored event speech. | Character/AI | Agreed direction | 3/10 |
| CP2 | Define and qualify actual AI activity routes, event-driven decision scheduling, shared accounting, pending/unavailable UI and recovery. Audit and replace automatic authored substitution across all new NPC decisions and speech, including existing talk/plan/reflection/player, startup, time-advance and legacy activity paths. Establish a measured capacity/configuration proposal without purchases. | AI/runtime | Existing gateway and hosting source reconciliation | 7–8/10 |
| CP3 | Design and implement an optional versioned community-activity record and typed proposal/invitation/response/action receipts. Validate state and imports; preserve old reading meanings and wages; explicitly handle unfinished legacy readings under the all-AI policy. Agree interfaces before parallel UI work. | Simulation/save | CP1; CP2 contract | 6/10 |
| CP4 | Give residents tools to propose original short material, read the same revisions, choose cooperatively and volunteer/decline roles. Store the actual model decisions. Select source-labelled reference material for Data and Kevin where needed. | AI + simulation | CP1–CP3 | 6/10 |
| CP5 | Implement autonomous invitations, availability, real routing and attendance. Allow activity to begin with no player project-management actions, and report waiting/replanning honestly. | Simulation | CP3–CP4 | 6/10 |
| CP6a | Implement the optional resident programme-posting task and an inspectable public programme. A missing or unfinished programme cannot prevent a reading or improvised performance. | Simulation + UI | CP3–CP5 | 4/10 |
| CP6b | Optional physical-item packet: prototype a functional saved cue-board only if it adds useful play; specify any kit/source/work rules before adding it. This packet is not a dependency of the event or its UI. | Simulation + art/UI | CP3; explicit physical-item scope | 5–6/10 |
| CP7 | Show creative proposals, rehearsals and performance as actual attributed AI exchanges and actions. Provide watching/following, optional invitations and understandable current status without forcing the player to operate a checklist. | Player experience | CP3 interface; CP4–CP5; CP6a integration when available | 5/10 |
| CP8 | Add factual next-visit notices, participant/witness memories and any reusable object state. AI follow-up uses those facts and cannot award credit for planned but unfinished work. | Memory + UI | CP3–CP5, CP7; CP6a/CP6b where included | 5/10 |
| CP9 | Integrate one candidate; validate AI action boundaries, unavailable inference, passive watching, optional participation, conflicts, save/reload and old towns. Then collect human observations on initiative, comedy and recognizable consequences. | Integration/review | CP1–CP8 core; CP6b only if included | 5/10 |

CP1, the CP2 runtime assessment and a CP7 visual interaction proposal can start in parallel in isolated checkouts. CP3 establishes a shared contract before engine and UI implementation diverge. CP4/CP5 share engine ownership and should not edit shared files concurrently without a handoff. Server authority remains a separate lane with an explicit integration dependency for 24-hour operation.

The next content increment can be named **Northern's Park Players**. Choose its numeric version after the deployed First Week baseline and hosting source have been captured. Do not tag or advertise this plan as a delivered release. Overall difficulty is approximately **7–8/10** with the release-wide AI runtime requirements; general construction and continuous server operation are additional milestones. CP6b is an optional scope addition and cannot hold the core event release hostage.

## Acceptance and release boundaries

- A real-AI observation can show residents initiating, responding and taking validated steps while the player only watches. A performance is one possible observed outcome; credible disagreement/postponement has actual decisions and reasons.
- Fake providers are useful for rule tests, but cannot close AI autonomy, creative-quality or human acceptance gates.
- No missing provider response is replaced with authored speech or invented completed work, across the new activity and existing NPC paths. Limits and unavailable service are visible.
- A model sentence cannot move money, create objects, consent for another resident, teleport people or set attendance.
- Actual supported items can be found, used, inspected and restored consistently; duplicate actions cannot duplicate objects, loans, payments or performances.
- Old completed readings, identities, finances, private memories and v1/v2 import/recovery remain valid.
- Present spectators can understand the situation and follow it using keyboard/touch/accessibility controls. The player can refuse or leave without an unintended obligation.
- After reload or the next game day, the record and resident recollections match actual participation and unresolved work.
- The runtime can sustain its stated AI activity within declared limits; a finite successful sample is not a continuous-service guarantee.
- No new cast, permanent stage, market, paid AI service, public asset transfer or general crafting system is included merely by writing this plan.

## Source references

- [Current playable loop](../implementation/game-quality-delivery.md)
- [Current reading implementation](../../src/game/reading-evening.ts)
- [Existing character profiles](../../src/game/characters.ts) and [town biographies](../../src/game/town.ts)
- [Original Kevin World scope](../KEVIN_WORLD.md)
- [AI pool](../AI_PROVIDER_POOL.md)
- [Production plan](../PRODUCTION_PLAN.md) and [server prototype limits](../../experiments/server-adapter/README.md)
- [Future construction and apps](../implementation/agent-created-world.md)
- [ASI project README](https://github.com/arwyn6969/asi-bill-of-rights/blob/main/README.md) and [adopted project charter](https://github.com/arwyn6969/asi-bill-of-rights/blob/main/charter/asi-bor-v5.0.md)
