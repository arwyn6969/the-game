# Resident planning and reflection fixes — 21 October 2026

**Latest status:** the [live continuation below](#timeout-recovery-and-completed-live-checks) now passes both narrow cases at $0. The first attempted verification described here remains preserved as historical evidence.

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

## Timeout recovery and completed live checks

The next authorized continuation reused the same synthetic cup-offer town, router, persistent SQL stores, game parser, effects and export/import. The earlier timeout records contain no response or transport detail sufficient to prove their exact individual causes retrospectively. Current measurements establish these concrete problems and the working route:

- Non-generating dummy-key POST controls reached both completion endpoints in under half a second. Audit-file writes took 4–6 ms. No network/ledger reset or longer deadline was needed for the successful tests.
- [Cohere documents](https://docs.cohere.com/docs/reasoning) default thinking for its reasoning models. A+ returned an empty example verbatim in 769 ms when thinking was explicitly disabled; that example named Kevin even though only Baba was requested. A subsequent A+ response put analysis into its final text and exhausted 2,000 output tokens in 8,092 ms. Strict validation rejected it as truncated. Merely turning thinking off did not qualify this route.
- The empty plan/reflection examples were replaced with field descriptions requesting exactly one filled result per supplied resident. This removes misleading concrete IDs and blank values without loosening parsing.
- Flash-Lite's minimal reasoning setting, supported by [Google's compatibility mapping](https://ai.google.dev/gemini-api/docs/openai), is now an opt-in route choice in the existing adapter. It is host/protocol restricted and does not change defaults, deadlines or paid-provider guards. The first fast Flash-Lite planning response took 2,309 ms but failed JSON validation; its rejection remains recorded.

The final accepted samples are:

| Fix | Actual route | Result |
| --- | --- | --- |
| Baba's plan | Cohere `command-a-03-2025`, verified available on the same free evaluation account; 2,000 output-token ceiling | **4,114 ms**, 2,150 total tokens. Seven blocks cover 0–24 exactly. Grocery hours 08:00–17:00 use `out` and all target the grocery; home rest uses townhouses. Applied plan survives export/import. |
| Conditional reflection | Gemini `gemini-3.5-flash-lite`, minimal effort; 1,500 output-token ceiling | **1,002 ms**, 1,377 total tokens. Kevin remembers that he **offered** to start the kettle and does not know whether anyone drank. Two reflections parse, apply and survive export/import with reflection provenance. |

The first reflection checker wrongly banned every occurrence of `07:00`. That time correctly dated the recorded **offer**, rather than a completed action. The retained real response was reviewed and applied offline through the unchanged parser/effects/save path, without another model request. The corrected check still rejects the original unsupported completion. The private fact remained with its owner; balances, tills, debt/economy records, identity and the saved player shift were preserved.

Standard Command A was confirmed by the account's non-generating model list and [Cohere's live model catalog](https://docs.cohere.com/docs/models). The already verified trial key was reused; [evaluation usage is free](https://docs.cohere.com/docs/rate-limits). Flash-Lite input/output remain free on the verified free-tier account ([pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)). No upgrade or new account was involved.

This continuation used **five real model requests at $0**: three rejected outputs and two accepted samples. The finite cap was raised explicitly as the measured format failures were resolved; there is no retry loop. The exhausted 100,000-token **local test** ceiling was extended in the private harness by only the exact next conservative reservation, with every old ledger row retained. Provider request/monthly limits, the 12-second deadline, strict parsers and the literal monetary cap were preserved. The public/default configuration and normal runtime providers remain disabled. Ledger totals are now **25 budget rows / 28 pool rows**, all settled; no earlier record changed.

Fresh Node 24 verification passes: **934 tests** (879 script plus 55 app/auth), including 349 town tests; typecheck; lint (zero errors, one inherited warning); town diagnostics; credential-free auth-enabled build with migrations skipped; diff whitespace check. Four new adapter regressions and one prompt-contract regression cover the optional fast setting, endpoint isolation, one-attempt settlement, unchanged Cohere behavior, and the reproduced misleading example.

This completes the narrow A5 fixture checks. It does not qualify every model/job combination, continuous scheduling, weekly identity rewriting, long histories or sustained/concurrent play. The earlier individual no-header timeouts remain incompletely attributable; the selected measured routes now provide accepted output within the unchanged limit.

Evidence under ignored `artifacts/ai-playtest/local-playtest/`: `timeout-recovery-receipt.json` (combined audit), `resident-job-command-a-plan-receipt.json`, `resident-job-finish-reflection-review.json`, and the preserved `resident-job-finish*-receipt.json` attempts. Synthetic response/save snapshots remain private. Offline logs are under `artifacts/ai-playtest/timeout-recovery/`.
