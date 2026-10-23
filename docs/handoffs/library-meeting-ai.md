# Library meeting AI protocol

22 October 2026. Runtime source: `0e69322`. This handoff covers the local, explicitly stepped discussion slice. It does not authorize provider calls, production background inference, quota changes or publication.

## Request and result contract

Discussion decisions reuse the authenticated, background-accounted `act` capability. A `DiscussionJob` carries `kind: "act"`, `task: "discussion"`, `agentId`, `meetingId`, `sessionRevision` (the session epoch), `actorRevision`, nullable `turnId`, and game `day`/`minute`. The request uses the existing `thinkTown` RPC with `{kind: "act", user: buildPrompt(town, job)}`; no new provider route or database kind was added.

The model returns exactly one discriminated envelope:

```json
{"task":"discussion","decision":{"kind":"listen"}}
```

Allowed self-only kinds are `read-invitation`, `ignore`, `accept`, `decline`, `listen`, `participate`, `stop-listening`, `request-turn`, `withdraw-turn`, `pass`, `leave`, `close`, and `speak`. Only `speak` adds `text`, limited to 400 characters. All other decisions contain only `kind`. The model cannot supply actor/context identity, recipients, extra commands, financial edits or decisions for other residents. The player-only face-to-face `invite` command is not an AI decision.

`parseMind` binds the result's actor, meeting, epoch, actor revision and turn identity from the job. Parsing checks exact syntax; the core executor separately checks current offered actions, presence, attention and the speaking floor. A valid shape is not permission to act. See [discussion types](../../src/game/discussion-types.ts), [strict parser](../../src/lib/discussion-actions.ts) and [prompt construction](../../src/game/prompt.ts).

## Knowledge and grounding

The prompt receives the selected resident's own profile, bounded own-memory retrieval, actual own cash/work/obligation facts, and `discussionObservation`. Retrieval uses a disclosed topic only; an unread invitation supplies a coarse local cue instead. It never searches the spectator transcript to decide what interests an inattentive resident.

Discussion context contains only the actor's own contributions and turns whose accepted recipient receipts include that actor. Other residents' memories, unseen earlier dialogue and global Town life history are excluded. Statements remain attributed claims, not verified events or accepted obligations. No utterance buys, pays, accepts work or commits another resident's time.

Recipients are determined when an utterance commits. Leaving during inference prevents receipt of the eventual new words; a new listener may hear the reply without learning its earlier question. Watching the public transcript grants no resident knowledge.

## Compatibility and failure behavior

The transport accepts the explicit discussion envelope while preserving existing physical `{ "decision": {…} }` envelopes. A physical job cannot consume discussion output, and a discussion job cannot consume a physical decision. Existing optional `act` capability checks, single-attempt routing, 1,200-token output cap and background accounting remain unchanged. No gateway, provider configuration or migration change was needed for this extension.

The UI shares one pending-request/transport guard across discussions, manuscript actions and legacy jobs. The transport remains occupied until its underlying promise settles, including after the 15-second UI timeout or cancellation. Freshness uses town/request generation plus meeting/actor/turn state rather than an unchanged global clock. Import, replay, pause, closure and cancellation invalidate pending application. Unknown provider usage remains unknown; no automatic retry or rebroadcast occurs.

Unavailable, invalid or timed-out inference adds no authored NPC speech or invented choice. The meeting waits/pauses with explicit recovery. Reload converts a saved pending decision to paused/unknown and never resends it automatically. Current hosted background restrictions remain a separate enablement gate.

## Limits and verification

The pilot has one library meeting, three possible NPC attendees plus the optional player, six committed utterances, sixteen decision opportunities, 400 characters per utterance, and eight retained closed meetings plus unfinished state. Discussion prompts are bounded to 10,000 characters; each request chooses one actor and one action.

Focused checks passed: eleven new discussion parser/privacy/transport tests, plus existing physical-action, grounding and route compatibility regressions. The final core/protocol review ran 29 discussion tests successfully. Integration verification recorded at `0e69322`: **961 script tests and 55 typed tests passed; the 410 town tests are a subset of the script suite**. Transport in these checks was synthetic; these results do not establish real-provider meeting quality, cadence or production availability.

Tests: [syntax/transport](../../scripts/discussion-mind.test.mjs), [prompt privacy/context](../../scripts/discussion-mind-context.test.mjs), and [core lifecycle/recovery](../../scripts/town-discussions.test.mjs).
