# Library meetings: production release, 23 October 2026

The user authorized publication to the main game. The clean runtime below is live at **https://www.arwyn.party/thegame/**. Source delivery and main integration are tracked in [PR #44](https://github.com/arwyn6969/the-game/pull/44). Subsequent receipt commits change documentation only.

| Item | Exact reference |
| --- | --- |
| Runtime source | `2b2b8a4dbb7a62b3d5db20b8f2aca4ec4396a7f1` |
| Runtime tree | `38a63c02d33f98065aea543775ac19c7e9e40920` |
| Required runtime Verify | [Run 39961380699: passed](https://github.com/arwyn6969/the-game/actions/runs/39961380699) |
| Production Worker | `the-game-production` |
| Published version | `8852b4fc-0ca5-4217-8f71-6c7420cd0d72`, tag `2b2b8a4dbb7a` |
| Previous live version / rollback | `2aa20e83-310a-45eb-a211-811618202e10` |
| Hosting prerequisite | #41, published head `adb1f47`; main `b8381df` integrated |
| Manuscript prerequisite | #42, including completed-trial receipt `c2f35b3` |
| Existing live stamp/Leather fixes | #43, head `60630d5`, preserved with ancestry |

## Available behavior

Use **Town life → Library meeting → Enable library meetings (experimental)**. Propose one topic, let residents encounter the invitation through existing reading/navigation mechanics, then explicitly request each decision. Residents can decline. Accepted attendance, arrival, listening and participation are separate choices. Merely standing nearby does not grant speech knowledge. The player can listen, speak, pass or leave; watching the transcript does not opt their resident in.

Statements capture actual attentive recipients when committed. Only those recipients and the speaker retain attributed statement memories; late listening does not backfill earlier words. AI output cannot change money, work or other game authority. Save compatibility, request serialization, draft retention and pause-on-failure remain enforced. The facilitator defaults to Northern in the player UI; the locally tested Arwyn facilitator is available through the core API, without a new player selector in this release.

## Budget and migration scope

Production retains **24 shared calls/day, 12/player/day, 3/player/minute, one global concurrent request**, all existing interactive reserves, zero monetary ceilings/tariffs, and the same explicitly free `nvidia/nemotron-3-ultra-550b-a55b:free` model. Autonomous `plan`, `talk` and `reflect` requests remain blocked by `backgroundConcurrent: 0`.

Only two existing private configurations changed: the pool gained an `act` route capped at 1,200 output tokens; the budget gained optional `actionConcurrent: 1`. This lane permits authenticated, explicitly started manuscript actions and manually stepped meeting decisions. All global/player totals, monetary checks and interactive reserve deductions still apply. Missing/zero action concurrency keeps legacy gating. Existing auth/provider credentials, other routes, bindings, mount and homepage routing were preserved. There is no paid fallback or automatic meeting loop.

The forward migrations are:

- `20261022_mind_actions.sql`: SHA-256 `85a18617e17c0816829f12deec8ed5a6cbfbaba7cde5a54e8de9e621ff775e03`.
- `20261023_manual_action_budget.sql`: SHA-256 `4c17a44ae94731f17410ab1dc2518a2e8ca7b53c11f5a73c6d87e50e26f5e569`.

Both passed first on isolated production child `br-falling-brook-arbz1jzt` in project `plain-dawn-91632624`, database `the_game`. It expires automatically on 24 October at 13:30 UTC. No existing local environment file was changed. They were then applied transactionally to production `br-rough-base-ar5t8ai4`, with bounded lock/statement timeouts and migration receipts.

A rollback-only SQL smoke passed on both branches: automatic jobs rejected; one action admitted; second action and overlapping player request rejected; positive-cost reservation rejected. The smoke restores its writes before returning. Production's three pre-existing budget rows retained digest `317f0ddeea3baba68f0faa0fe415ee29` before/after migration. No provider generation, ledger reset or save reset belongs to this release.

## Verification

Node 24: **1,035 script + 55 typed tests**, **415 town tests**, typecheck, lint (zero errors, one inherited auth-file warning), diagnostics, credential-free Node build with migration skipped, production Cloudflare build and Wrangler 4.151.3 packaging passed. Thirty-three focused budget/action checks and independent source/memory-store review passed. Full runtime CI additionally passed existing browser, accessibility, stamp, wallet and both-target build gates.

Combined local desktop **1280×800** and phone **390×844** meeting journeys and full delayed-AI/recovery journeys passed with synthetic transport, zero page errors and no real server-function/provider calls. Early development runs were interrupted by build-output hot reloads; the stable-source rerun passed every assertion without suppression. Temporary harness diagnostics were not shipped.

Public HTTP checks returned 200 for the normal game, privacy and anonymous session endpoints; the latter returned `null`. Existing homepage redirect still reaches `https://arwyn.party/`. Manifest start/scope remain `/thegame/`. Public CSS/JavaScript bytes match the clean production output:

| Asset | SHA-256 |
| --- | --- |
| `styles-Dm22ONFg.css` | `79dbe36a39bcd689bb19a9b32adb3b5f482c8a52130f464b0968ddf1b45c4ef5` |
| `index-C5WfBYDm.js` | `0838563a9c616f9f88419ee51b9e359c8e0513a4091a08cf02e19b561c702485` |
| `routes-CtthzRCT.js` | `7cf213f9707bf16776def417a30160f82eab86f4d507c8b70be3bea250f805c7` |

Private deployment/packaging/config-scope and HTTP receipts stay under ignored `artifacts/library-meeting-release-20261023/`. Local browser evidence stays under ignored `artifacts/ui-combined-release-20261023/`.

## Scope and recovery

The [prior real-Arwyn receipt](../library-arwyn-real-ai-2026-10-22/README.md) established two actual statements' opt-in delivery in a targeted legal-floor probe. Uninterrupted group flow and post-stop real speech remain unqualified after provider overload. This release makes no new inference request and does not establish fresh hosted real-AI, separate-account login, physical-device or human usability acceptance. Existing towns in a human browser were not touched.

Restore the recorded previous Worker version if runtime recovery is needed, using the established Wrangler rollback procedure and checking its bindings/configuration. Worker rollback preserves database contents and browser towns; do not reset the database. These additive migrations remain compatible with prior gating. The prior Worker version carries its previous AI configuration; retain the private old configuration as a recovery reference. Use a normal Git revert PR for source recovery, without rewriting main history.
