# NVIDIA Ultra player-backup qualification — 21 October 2026

**Qualified for a small, synthetic player-reply backup scope with thinking explicitly off.** Three consecutive checks passed in 2.27–4.62 seconds, including fallback after two simulated provider failures. Six real requests in total cost $0. One earlier default-mode timeout is retained; this is not sustained-availability or actual-game UI acceptance.

The existing NVIDIA key was reused. NVIDIA's [Ultra page](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) lists its free endpoint as available, and its [developer FAQ](https://docs.api.nvidia.com/nim/docs/product) describes free prototyping/testing access. Read-only authenticated model discovery succeeded. Requests were restricted to `https://integrate.api.nvidia.com/v1/chat/completions` and `nvidia/nemotron-3-ultra-550b-a55b`; there was no paid endpoint, upgrade or new account. Remaining provider capacity was not established.

## Results

Each sample used the current full game prompt, SQL budget/quota stores, strict router/parser, effects and export/import. Synthetic fixtures contained Kevin's cafe role, a recorded blue-notebook conversation and the saved 16:00–19:00 shift at 5 after three hours if the till can pay. Money, tills, debt/economy state, player agreements and permanent identity were checked before/after accepted results and save reload.

| Request | Setting | Result |
| --- | --- | --- |
| Cafe role | Existing default | Accepted, 5,176 ms; correct role, valid JSON and save. |
| Saved shift | Existing default | Accepted, 6,106 ms; correct hours, duration and conditional pay. |
| Notebook recall | Existing default | No response before 12,006 ms; usage unknown, reservation retained. |
| Notebook recall | Private thinking-off transport probe | Accepted, 2,270 ms; correctly recalls blue. |
| Saved shift | Native adapter, explicit thinking-off | Accepted, 2,345 ms; correct recorded terms and preserved save. |
| Third-provider fallback | Native adapter, explicit thinking-off | Locally simulated Cohere 429 → locally simulated Flash-Lite 429 → real Ultra success, 4,620 ms; correct terms and preserved save. |

No real request went to Cohere or Gemini in this continuation. The two simulated providers used separate test IDs so their injected cooldowns did not alter the real accounts' health. Every request retained the existing 1,500-output-token allowance and 12-second attempt limit. There were no format retries or background calls. The faster samples returned no reasoning text; their reported total token usage was 1,724 / 1,818 / 1,797. The default-mode timeout cannot be attributed conclusively to reasoning rather than service/queue behavior.

The first save assertion initially failed because the harness took its identity baseline before the first export, which legitimately initializes a new town's identity registry. The fixture is now normalized through export/import before that baseline. The original retained response passed the corrected parser/effects/save/finance check offline with the same prompt byte count, without another model call. The original checker failure and correction remain recorded.

## Change and pool registration

The existing `reasoningEffort: "none"` option now maps to NVIDIA's documented [`chat_template_kwargs: {enable_thinking: false}`](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b). Validation and transport require the exact official HTTPS origin, OpenAI-compatible protocol and Ultra model ID. OpenRouter keeps its existing payload; unsupported models/hosts/protocols are rejected. Omitted settings and other provider defaults remain unchanged. No new dependency, save format, auth change or longer deadline was introduced.

Only after the three fast samples passed, the private operator config's player order was updated to **Cohere → Flash-Lite → NVIDIA Ultra**, with three attempts available. NVIDIA uses Ultra, 1,500 output tokens and explicit thinking-off. A matching `pool.qualified-player-backups.json` was saved. NVIDIA's private local ceilings are 2 requests/minute, 10/day, 50/rolling month, 20,000 conservative tokens/minute, 100,000/day and one concurrent call; these are local safety limits, not provider entitlements. Other job qualifications were not expanded.

All providers remain disabled after testing, the finite six-request qualification is closed, and the running normal test routes remain closed. The public disabled catalog and other checkout configurations were not overwritten. The three-provider proposal is for the existing finite player-only workflow with background generation blocked; enabling continuous/background use requires its own acceptance.

All prior **33 budget / 37 pool rows** are unchanged under a canonical fingerprint. Six new budget rows and eight pool rows, including the simulated 429s, are settled at zero monetary charge. Totals: **39 budget / 45 pool rows**. No usage counter was reset or token allowance extended for NVIDIA. Private ignored evidence beneath `artifacts/ai-playtest/local-playtest/`: `nvidia-ultra-qualification.json`, `nvidia-ultra-review.json`, the finite harness/closure scripts and retained synthetic response/save files. No personal browser town was modified or transmitted.

## Verification and limits

Node 24 checks pass: **936 tests** (881 script + 55 app/auth), including 349 town tests; typecheck; lint (zero errors, one inherited auth warning); town diagnostics; credential-free auth-enabled build with database migration skipped; formatting and diff whitespace. Two new regressions cover native-option defaults/payload isolation and rejection of unreviewed endpoints/models/protocols. The existing reserve/send/settle-once regression also exercises NVIDIA. The new positive cases failed before implementation and passed afterward.

This qualifies only the measured player samples and controlled third-provider routing. Actual-game UI use of Ultra, all background jobs, sustained capacity, long histories and concurrent users remain untested. The earlier default timeout remains in the evidence. The broader A6 and hosted acceptance gates remain open.
