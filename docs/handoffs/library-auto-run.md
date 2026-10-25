# Automatic library meeting run helper

24 October 2026. Core orchestration helper owned by `conversation_research` in shared checkout `library-meeting/`, branch `codex/library-auto-meeting-20261024`, based on main `6f890ad`. This handoff covers only `src/game/discussion-run.ts` and `scripts/discussion-run.test.mjs`; TownApp integration, discussion UI and any new engine attention cues have separate owners.

## Pure API

The helper exports `DiscussionRunSnapshot`, `DiscussionRunState`, `DiscussionRunToken`, `DiscussionRunDecision`, `DISCUSSION_RUN_INTERVAL_MS`, and these functions:

- `startDiscussionRun(snapshot, nowMs, previous = null)` requires an explicit user start or resume. It binds the actual town object, world identity, meeting ID and lifecycle epoch. Previous state retains pacing across stops. A prior unsettled request must settle before another explicit start can succeed.
- `evaluateDiscussionRun(state, snapshot, nowMs)` returns `stopped`, `wait` or `ready`, the resulting immutable state, a readable reason, and waiting duration. A ready result includes the actual supplied normal NPC job. Waiting identifies a request, pacing, player turn or arrival.
- `markDiscussionRunStarted(state, snapshot, nowMs)` rechecks eligibility and returns `{ state, token, job }` only for an actual eligible physical start. It increments the helper's start ledger and marks one request in flight.
- `settleDiscussionRun(state, token, success)` releases only the exact opaque token returned by that mark. A failed accepted attempt stops the run. A completion never restarts a stopped run; stale, copied or unrelated tokens have no effect.
- `stopDiscussionRun(state, reason)` stops future automatic dispatch without cancelling transport, altering a meeting, clearing pacing, or manufacturing a result.

The snapshot supplies the current town object and world identity, meeting status/epoch/counts/floor actor, actual `nextDiscussionJob` result and freshness, visibility/replay/import/preferences/capability flags, the existing global busy signal, the shared last physical request-start time, and an optional genuine `waitingForArrival` indication. No helper reads `Date.now`, uses timers, accesses browser APIs, calls a provider, modifies town/save state, advances time, or changes the NPC queue.

## Integration requirements

Retain this state only in UI memory. Do not serialize it into a town or browser preference. Fresh page load has no automatic authorization. Import/replacement of even the same saved world changes the actual town reference and stops the prior run. Recovery of visibility, AI availability or the live view never starts a stopped run without another user action.

Call the marker at the physical request start, after successful preparation and immediately before dispatch. A prepared decision or a pacing wait must not increment counts, consume a request, or create an in-flight mark. If the core has already marked its own pending request, use the retained pre-mark authorization snapshot and preserve the separate global transport check; the helper must not mistake that same request's logical pending flag or incremented core decision count for a competing request. Keep the shared timestamp across manual requests and town changes. The minimum interval is 31,000 milliseconds from the latest helper or shared physical start. Clock rollback waits conservatively; invalid clock values cannot dispatch.

Keep the existing global transport lock in addition to the helper's flight token. Retain the exact token object in the request closure rather than cloning or serializing it. Release its helper flight when the underlying request settles, including after UI cancellation; the existing request generation/actor/session validation still controls whether a result may commit. Stopping this helper alone is not transport cancellation or core result invalidation. Inference/validation errors should stop explicitly through the existing error path.

Hidden tabs, replay, import, changed town/session, local-only mode, disabled meetings, unavailable AI, closed/paused meetings, invalid/stale jobs and caps stop future dispatch. The final allowed request may settle before the newly marked cap prevents another one. A player floor waits for actual player speech/pass and never invents a pass. A genuine arrival wait makes no call. A missing normal NPC job without arrivals stops; it does not force listeners to participate or poll every listener through inference. Any deliberate engine reconsideration cue remains a separate normal engine rule, not a timer in this helper.

Existing free routing, server quotas, monetary controls, six spoken turns, sixteen model decisions, hearing receipts and all NPC choices remain authoritative outside this helper. Helper counters record starts for orchestration only and cannot replace provider accounting.

## Verification and limits

Thirteen pure Node 24 tests pass. They cover absent authorization, exact 31-second boundaries across explicit resume, shared manual starts, clock rollback/invalid clocks, global/owned overlap prevention, waiting without marking, final permitted request settlement, player/arrival waits, voluntary silence, lifecycle interruptions, same-world imported copies, stale/foreign jobs, failure/cancellation, opaque token collisions and input immutability. No inference, browser, save write or database connection belongs to this lane.

The helper requires accurate snapshots and actual physical-start callbacks from TownApp. It does not independently enforce server authorization, acquire the global transport lock, move residents, determine acoustic eligibility, schedule listener reconsideration, persist runs, or run while the browser is closed. UI/browser integration and its race checks remain required before release.
