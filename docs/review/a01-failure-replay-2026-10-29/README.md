# F00 / A01.1 local review packet

29 October 2026. Owner: GPT-6.1 Sol, chat
`01a18874-463c-7be1-80a3-ed7eefdace15`.
Checkout `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a01-replay`, branch
`codex/a01-replay`, base `a26714e03192a17acaa963d7d2681e74a1ac425b`.
Implementation revision and final checks are recorded in `checks.json`.

## F00 findings

[Baseline receipt](baseline.json) separates observed source/ownership from
inherited publication evidence. `product/` is clean but 97 commits behind
refreshed main and lacks current status. Its checkout was preserved. The wrapper
root is not the product repository. The new isolated worktree starts at main;
no runtime dependency on the outstanding UI stack is needed.

PR [#61](https://github.com/arwyn6969/the-game/pull/61) remains open, ready for
review at `cd44d165002ddd75b6c92e5ce0efb9ac4fecd568`, with successful
[Verify 40506547367](https://github.com/arwyn6969/the-game/actions/runs/40506547367).
Draft [#62](https://github.com/arwyn6969/the-game/pull/62) remains stacked on #61
at `44745f42719b66230e6ee99d248c8bbe79c2359c`, with successful
[Verify 40865099031](https://github.com/arwyn6969/the-game/actions/runs/40865099031).
Merge order remains #61 then #62 if separately authorized. Draft #59 is an
independent personal/local provider candidate; its contracts were not imported.
Other open evidence-only PRs do not own this new test/docs lane. Relevant
existing worktrees were clean and no A01.1 assignment was found. The social
checkout's current branch contains a documentation receipt only; its older
"active" label does not authorize taking over runtime work. No other chat or
Grok was messaged, started or awakened.

[Four freshly fetched public asset hashes](public-assets.json) match the
27 October package for runtime `01470e291065`. The merged main has that source's
full tree. Worker `c4b89bfc-d9e4-48d1-ba1d-930280eaa8f5`, rollback
`c13e181a-8360-4559-aed9-0b10c66be579`, 18 binding definitions, seven secret
definitions and 52 routes are inherited from the publication receipt; the
control plane was not re-audited. No authenticated hosted acceptance or provider
headroom check occurred. The original sandbox/public-web DNS attempts failed;
a read-only permitted public fetch supplied the hash evidence.

The separate `social-experience-fix/docs/review/meeting-pass-recovery-2026-10-27/`
receipt records hosted acceptance failure: an unavailable decision, invalid
final completion, and manual exhausted closure. The polish status's earlier
meeting text predates that receipt. A01.1 preserves these failure classes;
synthetic evidence does not overturn the hosted failure.

## Replay and diagnosis

Run with Node 24 from this checkout:

```sh
node scripts/a01-failure-replay.mjs --report /private/tmp/a01-replay.json
node --test scripts/a01-failure-replay.test.mjs
```

The [fixture register](../../../scripts/fixtures/a01-failure-cases.json) and
[replay output](replay.json) cover:

| Case                                | Current observed outcome                                                                                                           | New budget / provider charges |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Unavailable action                  | Syntax passes; engine rejects listener speech without a floor and pauses.                                                          | 1 / 1                         |
| Malformed completion                | Router classifies invalid JSON; pause, no speech.                                                                                  | 1 / 1                         |
| Empty completion                    | Router classifies empty output; pause, no speech.                                                                                  | 1 / 1                         |
| Repeated pass                       | One pass parks the speaker; polling, duplicate delivery and reload do not requeue.                                                 | 1 / 1                         |
| Provider timeout                    | Real AbortSignal deadline settles timeout; no retry or substitute.                                                                 | 1 / 1                         |
| Shared action allowance exhausted   | No provider transmission or new charge; marked town decision remains consumed, attempt count unknown to its diagnostic projection. | 0 / 0                         |
| Provider allowance exhausted        | No transmission; conservative budget reservation remains charged.                                                                  | 1 / 0                         |
| Cancellation then late valid result | Cancelled epoch rejects result; underlying SQL charge settles, town attempt remains unknown.                                       | 1 / 1                         |
| Empty sixteenth result              | Exhausted paused meeting cannot resume; normal player Close preserves history and reload.                                          | 1 / 1                         |
| Valid sixteenth control             | Valid result commits, then ordinary cap closure prevents request 17.                                                               | 1 / 1                         |

The **remaining A01.2 gap** is the exhausted paused terminal state. The replay
asserts this existing behaviour as a baseline and explicitly reports the unmet
coherent termination requirement. It does not weaken an acceptance assertion
or claim the runtime issue is fixed. Unavailable proposals and malformed/empty
output still occur; this packet does not improve model decision quality.

Every case compares the entire town outside meeting bookkeeping, including all
eight identity records, names, memories, relationships, financial balances,
accounts, a nonempty prior payment, an outstanding debt, commitments, physical
state and clocks. Prior speech and its recipient arrays remain exact. All eight
actual knowledge projections are audited; nearby opted-out player/Baba receive
no prior speech. Every retained SQL row, ID, timestamp and charge is compared,
not only aggregate totals. Duplicate result/usage delivery has no additional
effect. The full canonical town survives export/import; terminal manual closure
is also reloaded and audited. No SQL timestamps or charges are reset or aged to
create headroom: historical rows are initialized once in a fresh disposable DB.

The driver uses actual engine, prompt/parser, save, scheduler, router and both
SQL stores, with synthetic history and an injected fake transport. The test
also blocks global fetch and asserts no escape. It exercises a shortened
one-second provider deadline through the existing timeout seam. It reproduces
the UI's pause/accounting policy at those seams; it **does not execute the React
controller**, authenticated server function, 45-second client timeout or browser
lifecycle. Existing browser/hosted evidence remains separate. No production
source, migration, provider model, quota, save schema, auth or UI file changes.

## Local verification and recovery

Node `v24.19.0`; clean `npm ci`. Required results are in [checks.json](checks.json):
typecheck, lint, town/full tests, diagnostics and credential-free build. Lint's
single unused-disable warning in `src/lib/auth/use-current-user.ts` is inherited.
The first full suite passed 1,098/1,101 script tests; three localhost binding
checks failed with sandbox EPERM. A permitted rerun passed all 1,101 script and
55 typed tests. Final replay accounting was tightened to preserve unknown
attempt diagnostics on a budget denial and verified again at the recorded head.
Build explicitly reports DATABASE_URL unset and migrations skipped. No browser
suite was added or run for this test/docs-only change.

Recovery: revert the new test/fixture/docs commits if needed. No town, account,
production database or runtime setting changed. Preserve the existing checkout
and private evidence. This packet is locally verified; its new branch has no
CI, PR, merge, deployment or human acceptance receipt. It makes zero live
inference calls and spends zero. Grok and the historical follow-up remain paused;
mobile remains on hold.

Next: scope A01.2 around `final-empty-completion`. Inspect
`src/game/discussions.ts` (`applyDiscussionResult`, `pauseDiscussion`,
`resumeDiscussion`) and the failure/finally path in `TownApp.tsx`. Define a factual
terminal result that preserves the final attempted charge, speech/audiences,
identities and cancellation authority. Retain the valid-sixteenth control, then
qualify the actual browser controller. Merge/deploy/live-provider authority is
still separate. A01.2 remains unassigned until the next explicit kickoff.
