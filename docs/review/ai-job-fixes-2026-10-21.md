# Resident planning and reflection fixes — 21 October 2026

The previous synthetic run accepted a grocery plan whose `home` flag sent Baba to his townhouse, and a reflection which changed an offer to start a kettle into an action completed at 07:00. This continuation implements two narrow changes using the existing game and provider tooling.

- `plan.ts` treats `home` as valid only when the declared place matches the resident's actual home place. Both beat interpretation and direct destination lookup enforce this. Existing saved plans remain intact; the runtime interprets contradictory flags as public destinations. Correct home plans, public-counter sharing and status labels retain their existing behavior.
- Planning requests supply each resident's `homePlace`, explain public work/visits and request rest/work/breaks. Reflection requests separate retrieved events, statements and interpretations, preserve their original IDs/dates/sources, and explicitly distinguish conditional offers from occurrences and record timestamps from action times. This is a prompt-level grounding change, not a general semantic verifier of generated prose.

Five new regressions all failed before the changes and pass afterward. They cover the captured Baba plan through parse/application/save/reload, direct destination lookup for the resident roster, shared-counter arrival/movement, reflection evidence/date separation after reload, and per-resident planning home locations. Node 24 checks pass: 348 town tests; 874 script plus 55 app/auth tests (929 total); typecheck; lint (zero errors, one inherited unused auth directive); town diagnostics; credential-free build with authentication enabled and database migrations skipped. The first full-suite run hit the sandbox's loopback-listen restriction; the unchanged port-collision test passed in the final run with local sockets allowed. Formatting and diff whitespace checks pass.

## Bounded live attempts — acceptance remains pending

Normal runtime routes remained disabled. The same retained synthetic cup-offer fixture and the existing SQL quota/budget stores, router, parser, effects and save code were reused. Existing verified free accounts and all original accounting were preserved; no quota or timeout was increased.

1. A two-resident Flash-Lite plan was skipped before transport by the existing daily token guard: the account had 91,825 conservatively reserved tokens against its 100,000-token local ceiling. This made no real request; its budget reservation remains charged and settled.
2. A smaller Baba-only Cohere plan fit its original allowance but returned no HTTP response before the 12,008 ms deadline. Outcome: `unreachable`; usage unknown.
3. The remaining bounded request tested Kevin's reflection with Flash-Lite, a 5,438-byte full system/user packet and 2,000 output tokens. It also returned no HTTP response before 12,007 ms. Outcome: `unreachable`; usage unknown.

That is **two real requests at $0**, one local quota skip and no further generation retries. Unauthenticated HEAD checks subsequently reached both API hosts using curl and Node; they do not explain the generation delays or qualify the model output. Neither new live output was available for parsing or quality review. The captured bad plan is fixed deterministically, while fresh generated-plan and reflection-grounding acceptance remains open. Historical successes are not presented as fresh verification.

The ledger now contains 20 budget rows and 23 pool rows. The three new budget records are settled, including the conservative quota-skip charge. All earlier rows are unchanged, and normal runtime providers remain disabled. No personal town, save schema, payroll, auth, production configuration, merge or deployment changed.

Ignored local evidence beneath `artifacts/ai-playtest/local-playtest/`: `resident-job-fixes-receipt.json` (quota skip), `resident-job-fixes-live-receipt.json` (Cohere), `resident-job-fixes-reflection-receipt.json` (Flash-Lite), and `resident-job-fixes.mjs` (finite harness). Validation logs are in `artifacts/ai-playtest/resident-job-fixes/`. Private keys, account data and town snapshots remain excluded from Git.
