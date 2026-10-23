# Northern's grounding correction and real-AI repeat

22 October 2026. Authorized repeat at source `fac60f23cc7904c99b4f83f4a006aea5d3ac07b9`, 13:43:39–13:46:57 UTC, on [draft PR #42](https://github.com/arwyn6969/the-game/pull/42). The [first trial](../northern-real-ai-2026-10-22/README.md) remains unchanged.

**The ledger stayed financially grounded. Northern then made a separate action-precondition mistake, which the engine safely rejected.** He was free to write fiction and chose practical notes again. No trial was restarted or steered toward a preferred story.

## Changes before the repeat

- Action context now includes the acting resident's actual town coins, recorded obligations, funded work/offers/payments and legacy shift terms. Other residents' private records are excluded. Missing facts remain unknown; omitted records are counted. The packet is bounded to 1,500 characters and prioritizes current work and unpaid earnings.
- Profile limitations are supplied. The prompt explicitly permits fiction, invented characters/values (including fictional selves) and hypotheses with appropriate framing. No genre, destination or performance is compulsory.
- Writing/reading verifies the action and document words, not the truth of its claims. Completion metadata stays an event; quoted body memories are private, attributed, unverified statements. The rule also covers old imported document memories previously labeled events, without rewriting their history.
- No item command, provider route, model, output allowance, deadline, retry policy or stop rule changed. The exact finite harness SHA-256 matches the first trial: `9382935fb681b6f1d462eb69c7c820400358a819d934b1e2b020141ccfb1206a`.

## What Northern actually did

| Decision | Observed result | Input / output tokens | Request wait |
| --- | --- | ---: | ---: |
| 1. Pick up | Held the real single manuscript | 1,567 / 26 | 1.380 s |
| 2. Read | Received the actual blank pages | 1,630 / 25 | 1.229 s |
| 3. Write | Saved “Day 1 ledger: cash on hand” | 1,652 / 122 | 2.459 s |
| 4. Read | Received his exact saved text, content revision 1 | 1,640 / 31 | 1.338 s |
| 5. Bring to noticeboard | Arrived holding it after seven ordinary movement ticks | 1,743 / 48 | 2.462 s |
| 6. Put down | Same manuscript placed on legal noticeboard ground tile `(23,17)` | 1,588 / 26 | 1.595 s |
| 7. Read | Rejected: this first proof requires holding it before reading | 1,579 / 25 | 2.380 s |

The engine completed six decisions and rejected the seventh. The unchanged stop-on-failure rule paused the session; the eighth allowance was not used. No hidden retry, automatic pickup, fallback reply or fake successful reading followed. All seven provider responses and parsed decisions were valid JSON/HTTP 200; the transport-failure counter of zero does **not** mean zero action failures.

The [complete manuscript](manuscript.txt) starts:

> Cash: 2 town coins.  
> No funded work accepted.  
> No obligations recorded.

It marks rent, prices, jobs, wage rates and due dates as missing, and proposes checking the noticeboard and asking Data about paid tasks. Those remain plans, not completed research, job offers or agreements. He did not invent the first trial's rent, fares or wage amounts. His actual balance stayed two coins. He did not speak or choose fiction in this run, so those behaviors are not claimed as real-model acceptance.

## Compute comparison

| Measurement | First trial | Grounded repeat |
| --- | ---: | ---: |
| Transmitted requests, one attempt each | 4 | 7 |
| Input tokens | 5,305 | 11,399 |
| Output tokens | 439 | 303 |
| Total tokens | 5,744 | **11,702** |
| Reported reasoning tokens | 0 | 0 |
| AI invocation wait | 19.986 s | **12.843 s** |
| Wall duration including deliberate pacing | 102.012 s | **198.493 s** |
| Reported provider cost | $0 | **$0** |

Both used the same free OpenRouter Ultra model, reasoning disabled, 1,200 output tokens, 12-second deadline, one transmitted attempt per decision, a zero monetary budget and an eight-call maximum. Seven budget and seven pool rows settled, charging seven calls and zero microusd. Provider latency was 1.215–2.459 seconds, summing to 12.795 seconds; invocation wait additionally includes local orchestration. These are API usage/time measurements, not hardware utilization.

The repeat took more decisions, so its total tokens are not a pure cost of grounding. For the matched first three pickup/blank-read/write decisions, input increased by exactly **312 tokens per call**. Combined input/output for those three was 4,236 → 5,022 tokens; the shorter new ledger also used fewer output tokens. Faster responses in this one sample are not proof of a latency optimization.

The bring intention used one AI request and seven simulated game minutes of ordinary movement, with no per-step inference. One unrelated background talk job returned by the simulation was deliberately not generated; this remains an isolated single-resident qualification. Game time was frozen between decisions and pacing, as in the first harness.

Preflight reported 13/50 free calls used, 37 remaining, and zero model prices/account monetary usage. The immediate post-run reading was 19 used; a later [read-only snapshot](late-quota-preflight.json) reported 20 used and 30 remaining, consistent with seven requests. Both readings are retained without inferring why they differed. Individual completion and SQL records establish this run's usage.

## State, validation and remaining limits

Cash, tills, favors, identities and transactions remained unchanged. The raw `financeUnchanged` flag is **false** because ordinary movement initialized the existing funded-payroll records for Kevin and Baba, including wage holds. A [seven-tick no-provider control](control-audit.json) reproduces the **entire final economy exactly**. This was normal simulation bookkeeping, not a financial effect of Northern's document or AI decision. Economy/physical audits and save/export/import round trip pass. The manuscript ends on the ground, item revision 3, content revision 1, authored by Northern.

Before any model request, integrated Node 24 checks passed: typecheck; lint with zero errors and the existing auth unused-disable warning; **912 script + 55 typed tests**; **375 town tests**; town diagnostics; and a credential-free build whose migration step confirmed `DATABASE_URL` absent and skipped execution. Fiction regressions preserve invented £12.40/£85/dragon text verbatim across another reader and v1/v2 saves, without changing balances. Maximum tested long-record/read context was 7,762/8,000 characters. Actual repeat prompts peaked at 6,047 characters. Receipt sums, hashes, settled rows and initial-field equality were independently checked.

This supports the narrower observed grounding improvement and physical tool bridge. Fiction remains available by prompt/code/local tests, but was not chosen here. Other AI routes, sustained capacity, spoken grounding, another model reader and hosted authentication remain outside this real trial. Production routes, budgets, databases and the live player town were untouched.

The next small improvement is to expose currently legal item actions and their preconditions from the engine, so Northern can choose pickup before another read. Keep engine validation authoritative. This trial does not justify silently relaxing the holding rule or forcing successful recovery. The wider collective reading/play remains separate planned work.

Evidence: [raw report](report.json), [comparison and fixture checks](comparison.json), [source hashes](source-hashes.json), [control audit](control-audit.json). Initial/final synthetic saves, prompts and the local SQL ledger remain in ignored `artifacts/manuscript-real-ai-20261022-grounded/`. No credentials, private account identifiers or private reasoning were published.
