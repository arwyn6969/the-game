# Northern's first real manuscript trial

22 October 2026, 13:15–13:17 UTC. Source `0595b5437d4c45cb520c804e2f1e7786cb16d37e`, stacked over [draft PR #42](https://github.com/arwyn6969/the-game/pull/42). Arwyn authorized this bounded qualification before the larger reading/play release.

**The physical AI/action connection worked. Factual grounding failed.** Northern used the blank manuscript as a budget notebook, then repeated invented personal finances aloud. This is useful negative evidence; the trial was not restarted, steered toward a performance or rerun to obtain a better result.

## Actual choices and compute

| Decision | Engine result | Input tokens | Output tokens | Request wait |
| --- | --- | ---: | ---: | ---: |
| Pick up | Northern actually held the single manuscript | 1,255 | 26 | 1.742 s |
| Read | The engine returned its actual blank contents | 1,318 | 25 | 1.025 s |
| Write | Saved original text titled “Ledger — Day 1”, authored by Northern | 1,340 | 272 | 11.860 s |
| Speak | Said words about that ledger within earshot of Data and Observer; the trial parked | 1,392 | 116 | 5.359 s |
| **Total** | **4 requests, 4 transmitted attempts** | **5,305** | **439** | **19.986 s** |

**5,744 total tokens; zero reported reasoning tokens; $0 reported provider cost.** All four responses were HTTP 200 with a normal stop, one attempt each. All four budget and pool rows settled, charging four calls and zero microusd. The zero transport-failure count is not a narrative-quality pass.

The 102.012-second wall duration includes setup, quota checks and deliberate 31-second spacing between request starts to preserve the existing 2/minute ceiling. Actual provider latency was 1.019–11.851 seconds; the write response came close to the unchanged 12-second attempt deadline. This small sample does not establish sustained capacity or a typical long-run latency. These are API token/time measurements, not measured GPU energy or hardware utilization.

The exact model was `nvidia/nemotron-3-ultra-550b-a55b:free` at the existing OpenRouter endpoint, with reasoning disabled, JSON mode off, strict response validation, a 1,200-output-token cap and no retry/failover. The model's [current listing](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free) identifies the free endpoint; authenticated preflight additionally verified zero prompt/completion prices and 41/50 free requests remaining. The immediate post-run account reading showed 12 used; a later [read-only check](late-quota-preflight.json) showed 13 used and 37 remaining, consistent with four calls after the initial 9. Both readings are preserved; the receipt does not infer the reason for their timing difference. Individual completion records and SQL rows establish this trial's actual usage. Account monetary usage stayed zero.

## What he wrote and what was wrong

The [complete manuscript](manuscript.txt) begins:

> Cash on hand: £12.40  
> Rent due: £85 (Friday)  
> Bus pass: £22 (expires 15th)

It proposes library shelving at £9/hour and cafe dishwashing at £8.50/hour. These are Northern's generated claims, **not game facts**. His actual cash was **2 town coins**, before and after. There was no supplied rent, bus-pass system, library wage offer or agreement supporting these numbers. His final speech repeated them as personal facts. He did not obtain work, receive wages, pay rent or create a debt.

The current act prompt supplied his student role, practical voice, money-focused goal and pickup/read memories, but omitted his authoritative money/work/obligation facts and profile limitations. After writing, a memory of the text used event provenance, while the prompt said his own writing was knowledge. That blurred the distinction between knowing the document's words and knowing its claims were true. This is a source-level explanation consistent with the trace, not proof of the model's hidden reasoning.

The game preserved custody, authored content, identity, cash, tills, favors and economy state. Save/export/import round trip passed. Northern retained the closed manuscript at the library, item revision 2 and content revision 1. Data was already nearby in the fresh town; Data and Observer received attributed memories of his spoken claims. Neither was made to reply. Northern did not carry the manuscript to the park, put it down or reread the finished text in this trial. No performance, collective choice or social agreement occurred.

The later credential-free checks passed: integrated typecheck, 23 focused action/parser/save/navigation/budget tests, receipt consistency assertions and documentation links. Lint has zero errors and the same existing unused-disable warning in auth code. No game runtime code was changed to obtain this result; additions are the finite operator harness and evidence. The earlier prototype's full-suite and build receipts remain attached to their tested runtime revision.

## Scope and safeguards

This was an operator-driven **headless local town using the real model and game engine**, not the live player town or a hosted browser/authentication test. Northern and a silent synthetic player named Observer were placed beside the library manuscript as the initial test condition. His existing character, goals and memories were not rewritten; other NPCs were not repositioned or made to answer. The actual prompt/parser/executor and SQL budget/quota implementations were used.

Only `act` requests could be transmitted. A local zero-monetary budget capped the experiment at eight calls, with one pending transmission, one provider attempt and no local fallback. Current saved provider ceilings were retained. The trial stopped naturally at four when Northern chose speech. Its local ledger did not reset or change the production ledger, route, budget or database. Account preflight checked the shared key's real allowance.

Game time would advance only through normal movement if Northern chose a travel intention. He did not; simulation minutes and suppressed background jobs were both zero. Time was frozen between these headless decisions, including rate-limit pacing. This does not demonstrate unattended town life or the ordinary browser's advancing-clock behavior. No deployment or additional model call followed the result.

## Small next packet before the reading/play

1. Add a concise authoritative own-facts packet to action context: current town coins, recorded obligations and actual accepted work. Explicitly represent missing facts; do not invent an offer or reuse a player-specific agreement packet for the wrong actor.
2. Make the provenance rule explicit: writing/reading proves which words are on the page, not the truth of those words. Preserve factual pickup/write/read events while labeling quoted document contents as authored, unverified claims or fiction. Apply this to both writing and reading so another reader cannot turn a document's claims into verified world events.
3. Keep original fiction available and clearly framed. Do not force a story, chosen piece, park destination or successful performance.
4. Add credential-free regressions for the facts/provenance boundaries, then separately qualify the correction with another bounded real-AI trial. Broader reading/play work and public action-route enablement remain behind that gate.

Evidence: [complete machine receipt](report.json), [retained-source hashes](source-hashes.json). Prompts, initial/final synthetic saves and the persistent local SQL ledger remain in ignored `artifacts/manuscript-real-ai-20261022-first/`. No credentials, private account identifiers or private reasoning are included. Reproducible finite harness: [manuscript-real-ai.mjs](../../../scripts/manuscript-real-ai.mjs); it requires an explicit `--run`, the existing private credential and fresh free headroom. Running it again would be a new model trial, not replaying this receipt.
