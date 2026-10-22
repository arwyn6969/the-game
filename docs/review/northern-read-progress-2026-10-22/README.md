# Known manuscript revisions and the quota-qualified repeat

22 October 2026. User authorization: prevent pointless rereading without scripting Northern's next action, then run the same bounded real-AI experiment when quota permits. This continues [draft PR #42](https://github.com/arwyn6969/the-game/pull/42) from `23fd81f`. Runtime checked at `9e39980126e69a1dfd9a94c757efb0d02a7ee6e9`.

## Implemented behavior

- A successful read records the current content revision in the acting NPC's bounded session. The optional saved receipt preserves old saves and survives export/import. Revision zero is a real receipt, including for blank pages.
- While that sequence is active, the already-read content revision is omitted from the AI's available reads. Pickup, put-down and carrying change custody rather than the words, so they do not erase this knowledge.
- The same actor retains the actual known words in `knownManuscript` when the item is visible and its content revision still matches. The prompt includes the full body once and treats authored claims as unverified. Other residents do not receive that receipt or its words.
- If the model nevertheless proposes an unchanged read, the shared executor returns a factual failure and directly pauses the trial. It adds no read memory, pose or item effect. Any inference already used remains counted; no alternative action or speech is generated for the resident.
- Changed content or an explicit new trial permits reading again. The player's physical Read control and deliberate rereading remain available. Northern may freely choose any remaining action, write fiction when holding the manuscript, speak or wait.

The change targets known unchanged reading within one finite sequence. It does not judge the literary usefulness of prose or prevent a writer from deliberately creating another revision.

## Current verification

Node 24 typecheck, lint (zero errors; one inherited unused-disable warning), **932 script + 55 typed tests**, **392 town tests**, diagnostics and a credential-free build pass. `DATABASE_URL` was absent and migrations skipped. Dense current context with a full 1,200-character known manuscript is 7,941 characters under the unchanged 8,000 cap. Focused cases cover old saves, persisted receipts, revision zero, custody changes, changed fiction, another reader, new trials, stale/duplicate proposals, private knowledge and consumed accounting.

[Desktop and phone browser acceptance](../manuscript-read-progress-2026-10-22/README.md), integrated as `db38538`, also passes with synthetic transport. A deliberately repeated AI proposal pauses visibly after two counted requests, leaves one read event and unchanged custody, and dispatches no third call. Manual player rereading succeeds twice; reload preserves the pause. Retained movement, conversation, pause/replay, import/export and session-guard journeys pass. These browser token samples are synthetic and are not provider compute measurements.

The scheduled gate has separate network-free tests for partial/exhausted headroom, free allowance below eight, read-only preflight and exclusive one-run output. A real read-only invocation of `--run-when-ready` returned [waiting-for-quota](quota-wait.json) at 14:50 UTC: provider usage 25/50, with zero remaining headroom under the unchanged 24/day operator ceiling. It created no trial directory or ledger and sent no generation request. **There is no new real-model choice, token usage or cost result yet.**

## Authorized repeat and stop conditions

Wait until all eight calls fit within both provider free allowance and the saved 24/day ceiling. Retain the exact free Ultra model, fresh original town/blank manuscript and positions, 1,200-output-token limit, 12-second deadline, one transmitted attempt per decision, deliberate pacing and local SQL accounting. Speech, wait, failure or eight decisions ends the one run. No coaxing, restart or second trial follows.

The fixed ignored output directory is `artifacts/manuscript-real-ai-read-progress-20261022-authorized`. Exclusive creation prevents a concurrent or interrupted run from being restarted with a fresh allowance. Before calling the scheduled runner, inspect an existing directory/report and recover its outcome instead of rerunning it. The runner requires `MANUSCRIPT_TRIAL_OUT` in scheduled mode and waits before directory creation whenever eight-call headroom is unavailable.

The follow-up must report actual chosen actions, manuscript words, transmitted requests, known/unknown tokens, AI wait and wall time, reported cost, stop reason, settled accounting and state/save audit. Ordinary travel ticks may initialize existing payroll bookkeeping; distinguish that from AI financial effects as in the prior control receipt. Update this receipt with the measured outcome and stop the follow-up after its one trial.

The native **Northern read-progress real-AI trial** follow-up is active in this chat on an hourly cadence. While quota is unavailable it ends quietly; after its one run it reports here and pauses. It is a local desktop task, so the computer and app must be running as described in the [official scheduled-task documentation](https://learn.chatgpt.com/docs/automations).

Production configuration, budgets, databases and hosting are unchanged. Current code is a draft candidate; the real-model repeat remains pending quota.
