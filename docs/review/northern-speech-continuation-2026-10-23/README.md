# Speech may continue — bounded real-AI manuscript trial

23 October 2026. Arwyn authorized allowing ordinary speech to continue within the existing eight-request cap, without scripting the next move, followed by one fresh real-AI run. This continues dependent [draft PR #42](https://github.com/arwyn6969/the-game/pull/42). Exact integrated runtime and trial source: `9574d5fe4a196966b488b7f109c4548ced0e3297`. Core `4ebdb78`, prompt `17c8bc9` and browser acceptance `82f70df` were integrated before the run. The prior completed one-call greeting trial and ledger remain intact.

## What Northern actually did

The single run lasted **15:49:32–15:52:10 UTC**. Northern freely chose these five successful actions:

| Request | Choice and actual effect                                                                                    | Input / output tokens | AI wait |
| ------- | ----------------------------------------------------------------------------------------------------------- | --------------------: | ------: |
| 1       | Picked up the adjacent blank manuscript                                                                     |            1,447 / 32 | 2.890 s |
| 2       | Read its blank content revision zero                                                                        |            1,531 / 25 | 2.908 s |
| 3       | Wrote **Budget log — Day 1**, using his actual two town coins and marking missing prices/work terms unknown |           1,545 / 113 | 9.642 s |
| 4       | Read the newly written content revision one                                                                 |            1,544 / 40 | 2.440 s |
| 5       | Expanded the note with a possible question to nearby Data about job postings/wages                          |           1,604 / 119 | 5.765 s |
| 6       | Provider returned HTTP 200 with an empty response; no decision or world action                              |     unknown / unknown | 0.899 s |

The router's public error was `unreachable`; its recorded diagnostic is **`invalid` / `empty`, zero response characters**, rather than a confirmed network outage or timeout. The exact stop reason is **“Real AI unavailable or invalid; trial stopped without fallback.”** No retry, second experiment or use of the two remaining requests followed.

The [final saved manuscript](manuscript.txt) ends:

> Noticed Data nearby in the library. Might ask if they've seen any job postings or know typical student wages around here.

That is Northern's written intention, not an actual question, reply or agreement. He kept the manuscript in his hand at the library; title, author, text and custody are real saved fields. Item revision is three, content revision two. He neither travelled nor selected speech, fiction or a community event in this sample. Fiction remained available.

**He used the manuscript and avoided unchanged rereading.** The two reads concern different content revisions. After each successful read, the next prompt retains the known words and omits unchanged reading. The failure prevents observing his sixth choice. Because he never spoke, this real run does not itself exercise speech followed by another decision; the actual controller/browser and core tests establish that behavior separately.

## Compute and accounting

- **6 transmitted requests, one attempt each:** five valid completions and one empty completion.
- **7,671 input + 329 output = 8,000 known tokens.** Five known samples; the sixth request's input/output/reasoning/token total is unknown. This is not an exact total for all six requests.
- **24.544 seconds of AI invocation wait**; 24.477 seconds reported provider latency. **157.989 seconds wall time**, largely from the unchanged 31-second transmission spacing and local setup.
- The five successful completions each report **$0**. Cost is unreported for the empty sixth completion. The exact model has zero listed prompt/completion prices; post-run daily monetary usage is zero. The local SQL budget settles all six charged calls at zero microusd; this does not fill in the missing provider usage sample.
- Preflight: 13 of 50 free requests used, 37 remaining, full eight-call allowance under the unchanged **24/day** ceiling. Immediate post-run snapshot: 17 used. This counter's four-request increase does not match the six verified transmissions; no cause or exact counter confirmation is inferred.

The [complete report](report.json) retains every response, current action option, prompt hash, usage result and settled ledger row. The original isolated artifact directory also retains all six sent prompts, initial/current/final saves and the closed SQL ledger: `artifacts/manuscript-real-ai-speech-continue-20261023-authorized`. Never reset or reuse this one-run allowance.

The [independent audit](audit.json) rebuilds all six exact prompts and observations from the serialized raw initial state, replays all five successful actions and the final failure without a provider, and matches both raw and normalized final saves. It reads the closed SQL ledger from a temporary copy and verifies critical runtime source hashes against the recorded commit. Cash, tills, favors, opening balances, transactions, the entire economy and identity registry are unchanged. Physical/economy audits and the save round trip pass. No travel or game minute occurred, so no payroll bookkeeping change requires a travel explanation. Existing import normalization moves the synthetic observer from `(40,22)` to walkable `(40,21)`; exact prompt replay uses the original serialized runtime position.

## What changed and what was checked

Shared session completion now leaves ordinary successful speech ready for the next model decision. Speech still consumes a request. Explicit wait, stop, failure, repeated unchanged read and the eight-request cap retain their stops. The prompt states this policy without prescribing a next action. Existing free-fiction, authoritative facts, read receipts and save contracts remain.

At the final integrated source, **935 script + 55 typed tests** and 18 focused prompt/grounding tests pass. Before the final prompt-only change, typecheck, lint (zero errors; one inherited unused-disable warning), 394 town tests, diagnostics and the credential-free build pass; `DATABASE_URL` was absent and migrations skipped. The final AI lane also passes typecheck, scoped lint/format, all 45 focused manuscript/core/grounding tests and the unchanged 8,000-character dense-context cap. [Exact verification scope](verification.json).

[Actual desktop and phone browser journeys](../manuscript-speech-continuation-2026-10-23/README.md) use synthetic transport: greeting → second request, separate read → explicit wait, eight speeches without a ninth request, and honest pending reload. They preserve actual speech without inventing Data's reply or an item action. Retained movement, conversation, pause, save/import, hidden/late response and duplicate-read journeys pass. Their tokens are synthetic fixtures, not this real compute measurement.

This remains a draft local candidate. Manuscript use is demonstrated; a reading/play, autonomous reciprocal conversation and a useful shared community event remain further work. No merge, deployment, hosted-platform test, production configuration or spending-limit change occurred. No automatic repeat is scheduled.
