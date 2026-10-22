# One real-AI library meeting — facilitator declined

22 October 2026. The user authorized one local library meeting with real AI and an audit of opt-in hearing, with production unchanged, then explicitly approved up to twelve additional free-model calls today. The single trial ran at source **`ab3dcb4c422aec3bd1a09c670b6df06f5d8b2d3d`**, continuing [draft PR #44](https://github.com/arwyn6969/the-game/pull/44). The game implementation is unchanged from the earlier local candidate; this packet adds the finite operator harness, audit and evidence.

## Actual result

**Northern declined the invitation to facilitate on the first real AI decision. The engine closed the meeting, and the runner stopped after one request. Nobody spoke. Opt-in hearing with real speech remains unqualified.** No acceptance, words, reason for declining or substitute facilitator was invented, and the unused allowance was not used to restart or create another meeting.

The exact response was `{"task":"discussion","decision":{"kind":"decline"}}`. It was valid against the offered accept/decline actions, parsed by the real game protocol and applied by the actual discussion executor. Northern's saved choice is declined; Arwyn and Sub remain pending, with all NPC listening modes off. No speaker, queue, pending request or utterance remains. The response supplied no explanation, so this receipt does not infer Northern's motive.

| Observation                                     | Measured result                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Real transmissions / approved maximum           | **1 / 12**, one attempt, no retry                                                            |
| Actual input / output / total tokens            | **1,218 / 15 / 1,233**                                                                       |
| AI wait / provider latency                      | **3.661 / 3.649 seconds**                                                                    |
| Provider-reported cost                          | **$0**; known zero model prices                                                              |
| Committed spoken turns / delivery audits        | **0 / 0**; hearing checks explicitly null, not a pass                                        |
| Player listening / stopping transitions         | None; no first or second spoken turn occurred                                                |
| Resident memories after the decision            | Unchanged from the post-invitation starting town                                             |
| Finances / save round trip / reloaded knowledge | Unchanged / pass / unchanged                                                                 |
| Local SQL accounting                            | One settled `act` budget row and one settled provider row, 1,233 tokens, zero unknown counts |

All eight residents' received-turn projections remain empty, including nearby Baba and the silent player. The only new memories relative to the original fresh town are the three explicit invitation deliveries, which precede the first AI request. These observations establish voluntary refusal, correct closure, no fabricated continuation and consistent saves/accounting. They do **not** exercise positive listener delivery, exclusion during actual speech, late joining, stopping, or multi-agent discussion quality. The prior synthetic hearing tests retain their separate scope.

An independent read-only audit reproduced the saved meeting by replaying the actual parsed decline, matched the transmitted prompt hash and scoped observation, compared post-invitation/final resident memories and finances, and checked save/reload projections. Inspection of a copy of the local ledger confirmed one settled call with no open reservation or unknown usage. It made no model request and did not modify the original evidence. Its hearing verdict is also unqualified because no speech occurred.

Evidence: [complete machine receipt](report.json), [source and retained-input hashes](source-hashes.json), and the [later read-only account snapshot](after-preflight.json). The full prompt, synthetic initial/final town and local SQL ledger remain under ignored `artifacts/library-meeting-real-ai-20261022-once/`. The directory is retained and blocks another run at that path. No credential, private account identifier or private reasoning is included in the committed receipt.

## Initial gate and authority

The initial [read-only provider preflight](preflight.json) confirmed the exact free Ultra model and zero reported prices. It reported **25 requests already used**, 25 provider requests remaining, and **zero headroom under the existing 24/day operator ceiling**. The user then approved: “Allow up to 12 additional free calls today.” The experiment alone allowed at most twelve requests and an account ceiling of 37 from that starting counter. The saved ceiling and all production settings remained unchanged. No automatic follow-up is scheduled and no additional generation is pending.

The immediate post-trial account snapshot still reported 25 used; the later read-only snapshot at **16:05:38 UTC** reports **26 used / 24 remaining**, with monetary usage today still zero. The one transmitted request and settled local ledger are recorded independently of the provider counter's immediate snapshot.

The ceiling comes from the existing [operator trial runner](../../../scripts/manuscript-real-ai.mjs), not a new provider restriction. Provider free headroom alone is not authority to exceed that local limit.

## Concrete single-run procedure

The trial used [library-meeting-real-ai.mjs](../../../scripts/library-meeting-real-ai.mjs) with the fixed exclusive output directory, `artifacts/library-meeting-real-ai-20261022-once`. An existing directory prevents a restart, including after interruption. The runner extracted only the existing OpenRouter credential, created its own synthetic town and local PGlite budget/quota ledger, and made no hosted-game or production-database request. Replaying the saved receipt is read-only; another model trial would need fresh authorization rather than a new output path.

The fixture positions Northern, Arwyn, Sub, the player and Baba in the library. The player delivers the three invitations through actual validated commands; NPC acceptance, listening, participation, passing, speech, leaving and closure are real AI choices. No NPC action or line is prescribed. The player initially does not listen, joins after the first actual spoken turn and stops after the second. Baba remains a nearby inattentive nonmember throughout. Initial positions qualify delivery mechanics, not travel or human playability.

The bound is **one meeting, at most twelve requests, six spoken turns, one attempt per decision, 1,200 output tokens per request, a twelve-second deadline, and at least 31 seconds between transmissions**. Only `nvidia/nemotron-3-ultra-550b-a55b:free` at the exact OpenRouter origin is allowed. Unknown/nonzero pricing fails closed. The runner rereads actual free headroom before each transmission. Decline, silence, closure, failure, invalid output, changed finances or allowance exhaustion stops the trial without coaxing, substitute dialogue, a paid fallback, retry or second meeting. Reported nonzero cost stops further requests.

Each outgoing prompt is compared with the actual actor-scoped observation. Every committed utterance is audited against a pre-commit snapshot, including the turn that closes a meeting: the exact recipients must be accepted, arrived, deliberately listening/participating and acoustically eligible. Only the speaker and actual recipients may receive a new, fully attributed statement memory. All bystander memories must remain unchanged. Every resident's actual observation is checked for only own/received turns; later attention cannot rewrite earlier receipts. Export/reload is audited for unchanged speech, recipients and knowledge, with no backfilled memory.

The report distinguishes actual verified turns from unexercised cases. Zero speech leaves hearing unqualified. Fewer than three spoken turns may leave late-listening or stopping unqualified. No minimum amount of speech is forced to obtain a successful-looking result.

## Preparation checks

Node 24: **13 focused tests passed**, with no skips; changed-script ESLint and `git diff --check` pass. Tests cover omitted/added recipients, leaked bystander memory, false provenance, observation leakage, closing-turn snapshots, late joins/opt-outs, reload backfill, exhausted authority, exact twelve-call bounds, unknown/nonzero pricing and occupied output. An isolated fake-network run exercised the real route/parser/SQL ledger/engine with a facilitator decline; it correctly closed the sole meeting after one synthetic request and reported hearing unqualified. No real provider credential or network was used by these tests.

Independent reviews checked the budget, transport, restart, protocol and privacy guards. No game runtime, authentication, production quota, secret, shared database, main branch or deployment was changed. The earlier implementation receipt retains its full local regression and desktop/phone scope; this operator harness is a headless model/engine experiment, not hosted sign-in or live browser acceptance.
