# Known manuscript revisions and the quota-qualified repeat

22 October 2026 authorization; completed 23 October. Prevent pointless rereading without scripting Northern's next action, then run the same bounded real-AI experiment when quota permits. This continues [draft PR #42](https://github.com/arwyn6969/the-game/pull/42) from `23fd81f`. Runtime checked at `9e39980126e69a1dfd9a94c757efb0d02a7ee6e9`; the real run used source `667d633abe152b70be806c4471a8c534ccd35d3f` with no runtime differences.

## Real-AI outcome — 23 October

At 13:16:49–13:16:58 UTC, Northern's first decision was to speak:

> Data. You're up early.

Data was beside him in the library at 07:00 game time. The engine recorded Northern's actual speech for residents within earshot; no reply from Data was generated. The unchanged speech stop rule parked the trial immediately, leaving seven calls unused. No restart, intervention or second experiment followed. The manuscript stayed blank on the ground at `(40,20)`, item/content revision zero.

**This run did not exercise reading, writing or the unchanged-read guard.** It shows a valid free choice and correct bounded stopping. The guard's local and synthetic-browser evidence remains valid within its stated scope; real-model manuscript progress remains unqualified.

| Measurement | Actual result |
| --- | ---: |
| Transmitted requests / attempts | 1 / 1 |
| Input / output tokens | 1,464 / 24 |
| Total tokens | **1,488** |
| Reported reasoning tokens / unknown samples | 0 / 0 |
| AI invocation wait | **7.847 s** |
| Provider latency | 7.829 s |
| Wall duration including local setup | 9.380 s |
| Provider-reported cost | **$0** |
| Charged calls / microusd in settled SQL accounting | 1 / 0 |

The [complete report](report.json) retains the response, observation, stop reason and accounting. The [independent state/source audit](audit.json) verifies the actual SQL ledger from a temporary copy, the sent prompt hash, five critical source hashes and a local deterministic replay without another provider call. The exact sent prompt rebuilds from the serialized runtime state; existing observer-floor normalization on import is documented separately in the audit.

Preflight showed six free requests already used, 44 remaining of 50, zero model prices and full eight-call headroom under the unchanged 24/day ceiling. The immediate post-run account snapshot still showed six used. Its cause is unknown; no quota-counter confirmation is claimed. The actual transmitted completion and settled SQL rows establish this one request.

Cash, the whole economy, tills, favors and identities remained unchanged. Economy/physical audits and the physical save round trip pass. There was no movement or simulation-minute advance, hence no travel-related payroll bookkeeping. The opening actors, clock, money and blank item match the earlier grounded fixtures; their fresh identity UUIDs remain separate synthetic town identities.

The native **Northern read-progress real-AI trial** follow-up was deleted after this completed one-shot run. No further automatic checks or experiments are scheduled for it.

## Implemented behavior

- A successful read records the current content revision in the acting NPC's bounded session. The optional saved receipt preserves old saves and survives export/import. Revision zero is a real receipt, including for blank pages.
- While that sequence is active, the already-read content revision is omitted from the AI's available reads. Pickup, put-down and carrying change custody rather than the words, so they do not erase this knowledge.
- The same actor retains the actual known words in `knownManuscript` when the item is visible and its content revision still matches. The prompt includes the full body once and treats authored claims as unverified. Other residents do not receive that receipt or its words.
- If the model nevertheless proposes an unchanged read, the shared executor returns a factual failure and directly pauses the trial. It adds no read memory, pose or item effect. Any inference already used remains counted; no alternative action or speech is generated for the resident.
- Changed content or an explicit new trial permits reading again. The player's physical Read control and deliberate rereading remain available. Northern may freely choose any remaining action, write fiction when holding the manuscript, speak or wait.

The change targets known unchanged reading within one finite sequence. It does not judge the literary usefulness of prose or prevent a writer from deliberately creating another revision.

## Existing verification before the real run

At runtime source `9e39980`, Node 24 typecheck, lint (zero errors; one inherited unused-disable warning), **932 script + 55 typed tests**, **392 town tests**, diagnostics and a credential-free build passed. `DATABASE_URL` was absent and migrations skipped. These checks were recorded on 22 October, not rerun for this evidence-only update. Dense current context with a full 1,200-character known manuscript is 7,941 characters under the unchanged 8,000 cap. Focused cases cover old saves, persisted receipts, revision zero, custody changes, changed fiction, another reader, new trials, stale/duplicate proposals, private knowledge and consumed accounting.

[Desktop and phone browser acceptance](../manuscript-read-progress-2026-10-22/README.md), integrated as `db38538`, passes with synthetic transport. A deliberately repeated AI proposal pauses visibly after two counted requests, leaves one read event and unchanged custody, and dispatches no third call. Manual player rereading succeeds twice; reload preserves the pause. Retained movement, conversation, pause/replay, import/export and session-guard journeys pass. These browser token samples are synthetic and are not provider compute measurements.

The scheduled gate has separate network-free tests for partial/exhausted headroom, free allowance below eight, read-only preflight and exclusive one-run output. Its [earlier waiting snapshot](quota-wait.json) on 22 October at 14:50 UTC showed 25 requests already used and zero operator headroom, with no trial directory or generation. The permitted run began only after full eight-call headroom was available on 23 October.

## Preserved trial bounds

The run retained the exact free Ultra model, fresh original town/blank manuscript and positions, 1,200-output-token limit, 12-second deadline, one transmitted attempt per decision, deliberate pacing and local SQL accounting. Speech, wait, failure or eight decisions ends the run. Speech ended this sample after one decision, so inter-request pacing was never needed.

The fixed ignored output directory is `artifacts/manuscript-real-ai-read-progress-20261022-authorized`. Its completed evidence and ledger remain intact; the directory must never be reset or reused as a fresh allowance.

Production configuration, budgets, databases and hosting are unchanged. The implementation remains a draft candidate; this one authorized real-model repeat is complete with the limited qualification above.
