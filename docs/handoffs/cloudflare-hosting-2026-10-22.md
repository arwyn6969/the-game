# Browser hosting review and live AI — 22 October 2026

Owner: chat **Review release readiness**, `01a16334-5f21-7ee2-b45b-11bbcde2a62f`.
Checkout/branch: `hosted-ai-rollout/`, `codex/cloudflare-hosted-ai`.
Base: `dab257bb4911d8abf63b412aca5e427cc0dcb2ab` after a fast-forward that preserved the earlier hosting implementation and all ignored private files.

The user requested review and push of the browser-hosting changes and verification of AI on the live game. The earlier **Diagnose live AI replies** implementation is preserved in this delivery. Browser simulation and local portable saves remain the product scope; the server-world and blockchain feasibility work is separate.

## Reviewed behavior

The Cloudflare target mounts the game, PWA assets and direct Google authentication at `/thegame/`. Request-local PostgreSQL connections use the existing Hyperdrive binding while the Node target keeps its pooling behavior. Provider and fixed-origin media/chain HTTP transports reject manual redirects without forwarding credentials. The Images binding handles the bounded stamp raster conversion without loading Sharp into the Worker.

Two independent code-review lanes examined authentication/paths/PWA/images/build configuration and database/budget/provider/receiving-account changes. The confirmed mounted Vite preview PWA bug was fixed: manifests, install URLs and head links now share Vite's normalized mount. Real loopback regressions cover both `/` and `/thegame/`. No production auth or accounting defect was found by those reviews.

CI now also compiles the Cloudflare target after its existing browser checks. Worker tracing is sampled at 1%, and URL query strings are redacted in observability. Existing model selection, secrets, finite quotas and $0 tariffs remain the operational configuration.

## Fresh verification

- Node 24: **945/945 application tests passed** in one `npm test` invocation, no skips. Localhost listener permission was available for integration tests.
- Typecheck passed. Lint passed with zero errors and the inherited unused auth-directive warning.
- `diagnose:town` completed; it is an observation report, not a release verdict.
- Legacy `npm run build` passed with `DATABASE_URL` unset; the migration script explicitly skipped its database connection.
- The earlier same-day authority/adapter run passed 42/42 local experimental tests. It is not shared-world production evidence.
- `check:auth` without a running dev server is indeterminate; it is not presented as a pass.

Ignored evidence and logs are under `artifacts/hosted-ai-rollout/`; fresh suite logs are also `/private/tmp/the-game-release-audit-final-*.log`. Screenshots, real saves, account data and credentials stay outside Git.

## Real production AI acceptance

Target: <https://www.arwyn.party/thegame/?deployment=20261021>.
Worker at the initial successful check: `112cdeb0-2a07-458e-842e-1b712bb138cf`, whose visible build was `7ddda79a9178 + local changes`.

The existing synthetic **Hosting check** town remained paused at day 1, 07:00 with 4 coins. Its local-dialogue-only setting was disabled through normal controls. Normal movement reached Hobbs Cafe; a normal conversation submitted: “What do you like about a quiet morning at Hobbs?”

The UI displayed **AI RESPONDED** and Kevin's generated answer about the morning light, kettle and cups. After reload, Town life retained the complete exchange with the **AI dialogue** marker. No relationship score changed in this exchange.

Production Neon project `plain-dawn-91632624`, branch `br-rough-base-ar5t8ai4`, database `the_game` independently recorded:

| Evidence                 | Result                                               |
| ------------------------ | ---------------------------------------------------- |
| Provider/model           | OpenRouter, `nvidia/nemotron-3-ultra-550b-a55b:free` |
| Kind/status/outcome      | `player`, HTTP 200, `ok`                             |
| Provider latency         | 4,639 ms                                             |
| Actual tokens            | 1,516                                                |
| Budget settlement        | One reserved and charged call; 0 microusd            |
| Outstanding reservations | Zero pool and zero budget reservations               |

Before the test both production attempt tables were empty. The read-only provider check reported 49 of 50 daily free requests remaining. Exactly one generated request was made for this initial acceptance; no background jobs, paid fallback, wallet action, ledger reset or production migration was used. The reset itself was not treated as evidence of success.

Private screenshot evidence: `live-ai-20261022.png` and `live-ai-reloaded-20261022.png` in the ignored hosting artifacts folder. This establishes one real authenticated reply, game acceptance, durable accounting and local reload persistence. It does not establish sustained model availability or account-wide capacity.

## Reviewed source delivery and second live check

Source commit: `cc186b2868d4f5396be96668905b576e4de42dcd`.
Pushed branch with its own upstream: `origin/codex/cloudflare-hosted-ai`.
Review: [PR #41](https://github.com/arwyn6969/the-game/pull/41).
The exact source commit's [Verify run](https://github.com/arwyn6969/the-game/actions/runs/39767941785) passed, including the added Cloudflare build, application tests and all existing browser checks.

The production Cloudflare build and Wrangler 4.151.3 packaging dry run passed. The reviewed source was deployed to existing Worker `the-game-production` as version **`72863242-780e-4738-a379-50fb5ddc1814`**, tagged `cc186b2868d4`. The existing Hyperdrive/Images bindings and remote secrets were retained; there was no secret upload, database migration or new route configuration. The previous version `112cdeb0-2a07-458e-842e-1b712bb138cf` remains the recorded rollback point. The live Help panel displayed **Build cc186b2868d4** without the local-changes suffix.

Fresh entry: <https://www.arwyn.party/thegame/?deployment=cc186b2868d4>.

A second ordinary authenticated player question asked what Kevin noticed about the kettle's sound in the quiet cafe. The accepted generated reply described its lower hum and cycling element, coherently continuing the saved exchange. PostgreSQL recorded HTTP 200 / `ok`, **2,112 ms**, **1,764 tokens**, one settled call and **0 microusd**. Across both checks there are exactly two successful player attempts and two settled budget rows, no outstanding reservations, no retries and no background AI calls. The clock stayed paused at day 1, 07:00 with 4 coins. Reload retained both exchanges, including the complete second reply marked **AI dialogue**. The per-page AI badge correctly returns to unverified after reload; it reports that page session's provider observation, not deletion of saved history.

The reviewed build was checked at 1280×800 and 390×844. Document scroll width matched each viewport; the phone conversation textbox remained within the viewport (x 25–365, y 704.5–764.5). Temporary viewport settings were reset. Earlier phone direction-button use moved the synthetic player; normal destination navigation returned them to Kevin without advancing town time.

Normal sign-out hid private owner details and returned the owner tools to a sign-in requirement. Google account selection then created the expected production session again. This Chrome profile still followed its historical cached www-to-apex redirect on the bare callback destination; opening the fresh versioned www link restored the signed-in game without clearing a town or changing site security. Separate-account switching is not verified.

Public curl checks returned 200 for the game, privacy page, mounted manifest and unauthenticated session endpoint. Manifest ID/scope/start URL are all `/thegame/`; the anonymous session is null. HTTP game entry upgrades to HTTPS with 308, and the pre-existing bitcoinart www-to-apex redirect remains 308. Python's default HTTP client was separately blocked with 403; this was not treated as a Worker runtime failure or bypassed by weakening site security.

Private final evidence: `live-ai-reviewed-20261022.jpg`, `live-ai-reviewed-phone-20261022.jpg`, `reviewed-live-build-20261022.png`, the production deployment log and HTTP receipts under ignored `artifacts/hosted-ai-rollout/`. Later commits in this PR that only update these receipts do not change the deployed runtime commit above.

## Remaining acceptance

The reviewed hosting source is pushed, reviewed, CI-verified and deployed, with real live AI acceptance above. Main integration is a separate action. Each subsequent PR head still needs its own required check before merge. Retain the old Grok origin and browser save export/import path.

Production export/import, separate-account switching, real hosted stamp transformation, human/physical-device sessions, sustained AI and operator recovery/rollback remain separately scoped. The browser viewport checks and same-account logout/relogin evidence above are bounded; they do not close physical-device or broader authentication acceptance. The application keeps its finite free-only quotas and disables background AI. A paused browser town is an intentional supported release scope.

Build/deploy, existing resource identifiers, secret handling, isolated preview and rollback details are in [Cloudflare hosting](../implementation/cloudflare-hosting.md).
