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

## Remaining delivery and acceptance

The reviewed source must be pushed with its own upstream and PR, pass the current Verify check, and record any subsequent reviewed-source Worker version separately from the initial acceptance above. Main integration is a separate action. Retain the old Grok origin and browser save export/import path.

Production desktop/phone viewport, export/import, logout/account switching, real hosted stamp transformation, human/device sessions, sustained AI and operator recovery/rollback remain separately scoped unless later evidence below closes a named check. The application keeps its finite free-only quotas and disables background AI. A paused browser town is an intentional supported release scope.

Build/deploy, existing resource identifiers, secret handling, isolated preview and rollback details are in [Cloudflare hosting](../implementation/cloudflare-hosting.md).
