# Library meeting core handoff

22 October 2026. Owner: core subagent `conversation_research`, coordinated by the current library-meeting chat. Checkout/branch: `library-meeting/`, `codex/library-meeting-20261022`. Reviewed integrated runtime: `0e69322`, including the manuscript dependency through `667d633`. This receipt describes local implementation and synthetic verification; it is not a production publication or real-provider qualification.

## Engine contract

`src/game/discussion-types.ts` defines the shared contract. `discussions.ts` exports `createLibraryDiscussion`, `applyDiscussionCommand`, `advanceDiscussions`, `meetingMovementGoals`, `discussionView`, `discussionObservation`, `nextDiscussionJob`, `markDiscussionRequest`, `isDiscussionJobFresh`, `applyDiscussionResult`, `recordDiscussionUsage`, `pauseDiscussion`, `resumeDiscussion`, `recoverDiscussions` and `validateDiscussions`.

The pilot has one library meeting, proposed facilitator Northern, invited Arwyn and Sub, and an optional player. Proposal, delivered/read invitation, acceptance, physical arrival, listening and speaking are distinct. NPC choices and words require the supported AI decision path; the engine supplies no substitute dialogue or acceptance. An invitation can be delivered face to face by the player, or explicitly read from the perceived library cue. Ignoring a cue does not repeatedly schedule the same unchanged decision.

The lifecycle is gathering → active ↔ paused → closed. Activation needs the accepted facilitator and another willing, physically present listener. The floor and queue grant bounded speaking opportunities; listening alone never forces a reply. Limits are six committed utterances, sixteen marked AI decisions, one pending meeting request, 400 characters per utterance, and eight closed meetings plus the unfinished meeting. A paused resident can stop listening or leave without resuming or closing everyone else's meeting.

Discussion jobs reuse `kind: "act"` with required `task: "discussion"`, meeting identity, lifecycle epoch, acting-member revision and reserved turn ID. Physical jobs retain optional `task: "physical"`. Listener changes do not invalidate an otherwise valid speaker result; changed speaker authority/presence, withdrawn floor, pause/closure and replacement/import cancellation do. The shared UI orchestration also guards the live town/request generation. Accounting accepts completion after applying the decision and preserves unknown usage after interruption.

## Knowledge, acoustics and movement

`attention.ts` treats six Manhattan tiles as an opportunity to hear, subject to acoustic area and intervening walls. Connected outdoor map labels share an area; buildings remain separate. Furniture does not block sound. The pilot does not transmit indoor speech outdoors.

At commitment, each utterance stores its actual attentive recipients. Only those recipients and the speaker receive attributed statement memories. Late arrival grants subsequent speech; a recap is a new statement. Observation/prompt history contains only that actor's own or actually received turns. The spectator view omits recipient receipts and cannot grant character knowledge. Existing player witnessing of legacy pair exchanges and fixed reading outcomes remains unchanged.

New unscoped manuscript speech retains the speaker's words without automatically teaching nearby bystanders. Actual meeting speech uses its separate attention-aware delivery path. The merged unchanged-read receipt guard remains actor/content-specific and does not change either speech path.

Meeting navigation supplies temporary goals to the existing movement engine; it does not teleport residents or rewrite their plans. Existing library appointments, physical intentions and actual funded-work commitments take priority. Physical attendance is rechecked before committing delayed speech as well as during simulation ticks.

## Save and recovery contract

`Town.discussions` is an optional version-1 extension inside Town version 2. Old v1/v2 towns without it remain valid. Discussion history has its own validation and projection; it is not forced through the pair-only social importer. Validation bounds IDs, cast, text/counts, lifecycle/turn state, usage and chronology: creation cannot be after town time, and speech must fall between creation and current town time. Player/NPC generation markers must match the speaker.

Accepted speech is idempotent and materializes bounded statement memories immediately, so closed transcript eviction creates no dangling knowledge references. Active/paused history is retained. Save ID repair includes namespaced discussion IDs, and new allocation also skips retained collisions. Invalid extension data follows the raw recovery path rather than silently clearing a meeting or town.

Exports retain in-flight state. Loading that state restores the meeting paused with an unknown request outcome; it never resends automatically. Explicit resume revalidates the current state. Durable provider settlement remains the existing accounting layer's responsibility.

## Verification and limits

The focused discussion/AI suite passed **29 tests**. The integrated candidate passed **410 town tests, 961 script/application tests and 55 typed tests**, with typecheck and changed-file lint passing. Meaningful cases cover inattentive bystanders, invitation/topic masking, different-context knowledge, late joining/recap, listener changes during inference, moved speakers, duplicate delivery, six-turn closure without financial effects, pending reload, damaged ID repair, paused exits, invalid/future/backdated receipts with byte-preserving recovery, normal movement/reservation priority, transcript retention, physical speech privacy and strict physical/discussion response separation.

These are synthetic mechanics and regression results. Production background inference remains separately gated; no quota increase, model call, migration or deployment belongs to this core delivery. Generic deliberate listening to old atomic pair conversations, multiple concurrent meetings, microphone input, binding votes, asynchronous forums and away-time shared-server life remain outside the pilot. Full transcript retention is bounded; existing resident-memory compression still applies.
