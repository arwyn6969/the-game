# Actual-game interruptions, switching and saves — 21 October 2026

**Passed within a finite player-session scope: eight real requests, $0, no timeouts.** The normal authenticated game UI used the existing personal town, parser, effects, save path, router and persistent SQL budget/quota stores. Application source was unchanged at `beef92daade1af8e8133a6b24964cf1ad6ff29ee` (tree `5d285c2ebd4149ffb3ad66f50c5c55f6de223522`). No production, auth or save-schema changes were made.

The eight requests ran from 11:55:04 to 12:00:49 UTC, about six minutes, with four calls to standard Cohere `command-a-03-2025` and four to Gemini `gemini-3.5-flash-lite` at minimal effort. Both used 1,500 output tokens and the unchanged 12-second attempt deadline. The private guard allowed at most ten real requests, expired after 30 minutes, restricted the exact endpoints/models and blocked background generation. It was closed after eight requests; all normal and session providers are disabled afterward.

| Check | Observed result |
| --- | --- |
| Saved agreement | Both providers recalled 16:00–19:00, three hours, and payment of 5 only if the till can pay. |
| Local quota switching | Cohere's conservative per-minute token guard skipped it; Flash-Lite replied. The same switch worked again after server restart. |
| Controlled 429 | One locally injected Cohere 429, with no external Cohere request, led to a real accepted Flash-Lite reply. This tests router behavior, not actual provider exhaustion. |
| Local reply during a request | A real Cohere response was delayed eight seconds for delivery. “Use local reply now” saved exactly one local exchange; the later valid online result added nothing. |
| Replay during a request | A delayed real Flash-Lite result was ignored after entering replay and returning to now. The draft remained available; no exchange was added. |
| Reload during a request | Reload abandoned the delayed Cohere result. It subsequently completed and settled, but never appeared in the restored town. |
| Idle server restart | The same database, auth secret, browser save, usage counters and finite guard were reused. A new Cohere reply and subsequent Flash-Lite reply succeeded. This was not an in-flight process crash. |
| Saves and journal | Final reload showed 20 exchanges, up from 14: five new AI exchanges and one local exchange, each new question appearing once. The journal retained 4 coins, bread debt 2, the original shift and no accepted funded task. The clock briefly ran at 1× from 13:44 to 13:56, then stayed paused. |

All eight real requests returned accepted responses. The three controlled delivery holds account for measured router times of 9.67–10.73 seconds; those are not provider-generation latency. The five undelayed replies took 2.02–5.37 seconds. No timeout, format retry or background request occurred.

The prior **25 budget / 28 pool rows** are byte-for-byte unchanged under a canonical JSON fingerprint. The session added eight budget rows and nine pool rows, including the simulated 429. All settled at zero monetary charge, with the same authenticated user hash. Final totals: **33 budget / 37 pool rows**. The private conservative daily token ceiling was extended by a finite 200,000-token reservation allowance per provider for this test; the shared ten-request guard, request/monthly caps, per-minute limits and $0 tariffs remained. No counters were cleared or reset.

UI and ledger assertions passed in the existing ignored tooling. Evidence beneath `artifacts/ai-playtest/local-playtest/`: `long-session-review.json`, `long-session-accounting.json`, `long-session-receipt.json`, `finalize-long-session.mjs`, private before/after UI transcripts, and `long-session-journal.png`. Personal save content and identifiers remain excluded from Git. No fresh full-state file export/import was attempted; this session's save evidence is normal UI reload and idle-server restart persistence.

## Existing reserve providers

Read-only checks at 11:55 UTC made **zero generation calls**:

- **NVIDIA:** the existing key authenticated successfully against the model-list endpoint. The configured Super and Ultra models are listed, but listing alone does not establish endpoint availability. NVIDIA's [Super detail page](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b) marks its free endpoint **Deprecated**. The [Ultra page](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) marks its free endpoint **Available**. Ultra remains a candidate for one bounded full-game-prompt qualification, including latency and strict JSON acceptance; it has not been added to the working game routes. NVIDIA describes its [free developer endpoints](https://docs.api.nvidia.com/nim/docs/product) as prototyping/testing access.
- **OpenRouter:** the existing key is valid and free-tier, with its monetary cap and remaining paid allowance both $0. The documented `free_model_daily_requests.remaining` is **0**, so it is not an available reserve today. The deprecated `rate_limit.requests` field was disregarded; see the [current key API](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key). The earlier full-game format/timeout failures also remain unqualified.

The already verified Cohere and Gemini free accounts sufficed for this run. Their exact remaining free allowances were not re-established here. Adding a model does not by itself prove additional free capacity. No new account, paid plan, purchase or provider activation was needed. Private read-only result: `reserve-provider-preflight.json`.

## Remaining acceptance

A6 remains open for a true long soak, concurrent tabs/users, continuous background scheduling, long-save histories and crash-in-flight accounting. The full provider/job matrix and hosted operating setup also remain separate. Replies retained the shift terms but repeatedly added generic caveats about unspecified tasks and a stocking suggestion; this run does not close broader dialogue-quality review. No application fix was required for the tested interruption/save cases. The previous source verification (934 tests, typecheck, lint, diagnostics and build) belongs to the unchanged source commit; it was not rerun or relabeled as fresh validation here. This continuation verified the live scenarios, private audit assertions and documentation whitespace only.
