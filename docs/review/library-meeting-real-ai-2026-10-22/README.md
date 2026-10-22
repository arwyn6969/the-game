# One real-AI library meeting — prepared trial

22 October 2026. The user authorized one local library meeting with real AI and an audit of opt-in hearing, with production unchanged. This continues [draft PR #44](https://github.com/arwyn6969/the-game/pull/44) from runtime/source `60d3300`; the game implementation is unchanged by this preparation.

## Current gate

The [read-only provider preflight](preflight.json) confirms the exact free Ultra model and zero reported prices. It reports **25 requests already used**, 25 provider requests remaining, and **zero headroom under the existing 24/day operator ceiling**. No generation has been transmitted for this meeting. The additional per-experiment allowance defaults to zero; twelve extra free requests today require the user's separate approval. This does not alter the saved ceiling or any production configuration. No automatic follow-up is scheduled.

The ceiling comes from the existing [operator trial runner](../../../scripts/manuscript-real-ai.mjs), not a new provider restriction. Provider free headroom alone is not authority to exceed that local limit.

## Concrete single-run procedure

Use [library-meeting-real-ai.mjs](../../../scripts/library-meeting-real-ai.mjs) with a fixed exclusive output directory, `artifacts/library-meeting-real-ai-20261022-once`. An existing directory prevents a restart, including after interruption. The runner extracts only the existing OpenRouter credential, creates its own synthetic town and local PGlite budget/quota ledger, and makes no hosted-game or production-database request.

The fixture positions Northern, Arwyn, Sub, the player and Baba in the library. The player delivers the three invitations through actual validated commands; NPC acceptance, listening, participation, passing, speech, leaving and closure are real AI choices. No NPC action or line is prescribed. The player initially does not listen, joins after the first actual spoken turn and stops after the second. Baba remains a nearby inattentive nonmember throughout. Initial positions qualify delivery mechanics, not travel or human playability.

The bound is **one meeting, at most twelve requests, six spoken turns, one attempt per decision, 1,200 output tokens per request, a twelve-second deadline, and at least 31 seconds between transmissions**. Only `nvidia/nemotron-3-ultra-550b-a55b:free` at the exact OpenRouter origin is allowed. Unknown/nonzero pricing fails closed. The runner rereads actual free headroom before each transmission. Decline, silence, closure, failure, invalid output, changed finances or allowance exhaustion stops the trial without coaxing, substitute dialogue, a paid fallback, retry or second meeting. Reported nonzero cost stops further requests.

Each outgoing prompt is compared with the actual actor-scoped observation. Every committed utterance is audited against a pre-commit snapshot, including the turn that closes a meeting: the exact recipients must be accepted, arrived, deliberately listening/participating and acoustically eligible. Only the speaker and actual recipients may receive a new, fully attributed statement memory. All bystander memories must remain unchanged. Every resident's actual observation is checked for only own/received turns; later attention cannot rewrite earlier receipts. Export/reload is audited for unchanged speech, recipients and knowledge, with no backfilled memory.

The report distinguishes actual verified turns from unexercised cases. Zero speech leaves hearing unqualified. Fewer than three spoken turns may leave late-listening or stopping unqualified. No minimum amount of speech is forced to obtain a successful-looking result.

## Preparation checks

Node 24: **13 focused tests passed**, with no skips; changed-script ESLint and `git diff --check` pass. Tests cover omitted/added recipients, leaked bystander memory, false provenance, observation leakage, closing-turn snapshots, late joins/opt-outs, reload backfill, exhausted authority, exact twelve-call bounds, unknown/nonzero pricing and occupied output. An isolated fake-network run exercised the real route/parser/SQL ledger/engine with a facilitator decline; it correctly closed the sole meeting after one synthetic request and reported hearing unqualified. No real provider credential or network was used by these tests.

Independent reviews checked the budget, transport, restart, protocol and privacy guards. No game runtime, authentication, production quota, secret, shared database, main branch or deployment was changed. The earlier implementation receipt retains its full local regression and desktop/phone scope; this operator harness is a headless model/engine experiment, not hosted sign-in or live browser acceptance.
