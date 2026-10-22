# Library meeting interface handoff

22 October 2026. UI and orchestration lane on `codex/library-meeting-20261022`, runtime checkpoint `0e69322a19d74e4501e4e1ff1c940263854dad5a`. The local candidate depends on the pinned manuscript/action support recorded in [current status](../CURRENT_STATUS.md). This receipt does not claim a merge, deployment, production enablement or real-model qualification.

## Find and use the meeting

Open **Town life → Library meeting**. There is no additional permanent toolbar button. Enable **the local meeting prototype**, enter a topic of up to 160 characters, and choose **Propose library meeting**. The browser remembers the explicit prototype preference; enabling it starts no inference and joins nobody to the discussion.

Use **Go to library** for ordinary navigation. Deliver invitations to eligible nearby invitees through **Your invitations → Invite [name]**, or let residents discover the library invitation. Residents choose whether to read, accept, decline, listen or participate through their own AI decisions. The UI offers no buttons that choose NPC actions or words.

**Request next AI decision** requests exactly one legal resident decision through the existing authenticated `act` capability and background allocation. There is no automatic request loop. Unavailable capability, local-only mode, a hidden browser, a paused meeting or an exhausted allocation leaves the meeting waiting. **Check AI availability** is a capability check, not a generated response. No new meeting dialogue uses authored fallback.

The player uses the core-provided **Join and listen**, **Join as a speaker**, **Request a turn**, **Withdraw turn request**, **Pass this turn**, **Stop listening** and **Leave discussion** choices when legal. Viewing the transcript does not join, grant attendance or add character knowledge. Public joins/arrivals are observable meeting activity, not a census of everyone within earshot. Recipient receipts remain out of the UI projection.

## Requests, drafts and recovery

`TownApp.tsx` dispatches discussion `act` jobs before the physical-action branch. All `thinkTown` calls share one transport guard. Cancellation, replay, imports, local-only selection and UI timeout cannot start a second underlying request before the first promise actually settles. Movement, reading and local listening/leave controls remain available. The UI reports when a previous request is still settling.

Discussion results require the same town, request generation and valid core actor/session/turn state. Listener changes during generation do not invalidate an otherwise valid speaker; the executor calculates recipients at actual commitment. Invalid or failed decisions pause honestly without adding substitute speech. Resume and another request are explicit.

The speech draft lives in TownApp. Closing the pane, switching Town life sections, waiting, cancellation and failed sends retain it. Successful commitment clears only the matching submitted text. Unsent drafts are page-local and are not promised across browser reload. Reload preserves committed meeting history; an in-flight saved request recovers as paused with unknown outcome and is never automatically resent. The prototype preference alone does not resume it. Replay hides the current meeting controls/history instead of presenting them as historical map state.

## Reading and phone layout

The composer is collapsed behind **Prepare a line** while watching/listening. It opens automatically when the player's turn arrives. **Hide draft** restores reading space without losing the draft; its control shares the send row when expanded. New turns preserve a transcript reading position, with **Follow latest turn** available after scrolling back. The existing Town life close and town Pause controls remain reachable.

The final browser gate passed at 1280×800 and 390×844, including at least 180 pixels of readable meeting-body space in watch/listen mode. It covered proposal, explicit listening and non-listening knowledge, pending join/leave, player turns, failure, cancellation/settlement, hidden tabs, reload and unavailable action capability. Fixtures use synthetic model transport through the real discussion protocol/executor; they made zero live model calls. Full intermediates remain under ignored `artifacts/discussion-ui/`; selected synthetic screenshots and machine receipts are preserved in the [integration receipt](../review/library-meeting-2026-10-22/README.md).

Node 24 typecheck and changed-file ESLint passed. The integrated desktop/phone manuscript journeys passed. The existing delayed-AI browser gate also passed after its parallel-request expectation was updated to require settlement followed by explicit resend; late text remains rejected. These checks establish local mechanics, not real-model quality, production capacity, physical-device keyboard behavior or assistive-technology acceptance. Wider interface reorganization and automatic town-meeting scheduling are outside this slice.
