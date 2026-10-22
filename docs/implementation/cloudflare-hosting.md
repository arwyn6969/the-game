# THE GAME on Cloudflare

The Cloudflare target mounts the existing game at `/thegame/`, serves its assets
and PWA under that prefix, and replaces the Grok OAuth broker with direct Google
sign-in. Game rules, portable saves, account-link ownership checks and shared AI
budget enforcement remain in place. This does not introduce a continuously
running multiplayer simulation.

## Build and preview

Use Node 24 and `npm ci`, then `npm run build:cloudflare`. This command does not
connect to a database or run migrations. The normal `npm run build` remains the
Grok/Vercel target; unset `DATABASE_URL` when validating it locally.

The generated Worker configuration is `.output/server/wrangler.json`. Deployment
uses Wrangler 4.151.3:

```sh
npx wrangler@4.151.3 deploy --config .output/server/wrangler.json \
  --secrets-file /absolute/path/to/private-worker-secrets.json
```

Store that secrets file outside tracked source, with mode 0600. It contains
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a stable random
`BETTER_AUTH_SECRET`. Never put these in a `VITE_` variable, a build artifact or
a commit. Local `.dev.vars` values are only for local development.

The default deployment is `the-game-preview.mrarwyn.workers.dev/thegame/` and
uses the isolated Neon preview branch through its Hyperdrive binding. Hyperdrive
owns the remote connection pool; the app closes each request's local connections
instead of sharing sockets between Worker requests. Query caching is disabled
for authentication, identity and quota correctness.

The Cloudflare deployment API reported the Free plan on 21 October 2026, despite
an earlier account metadata label of Standard. No upgrade is performed by these
commands. The generated configuration uses the account's default CPU limits;
successful local tests do not establish sufficient hosted CPU capacity.

Cloudflare Images supplies the bounded stamp raster conversion through the
`IMAGES` binding. Node deployments retain Sharp. The hosted image path validates
input dimensions and the output PNG; it uses the image service's interpolation
instead of Sharp's nearest-neighbor resize. The native Sharp module is loaded
only on the Node path so that opening account tools works in Workers.

## Google sign-in

Use the dedicated Google project `the-game-arwyn-20261021`, with only basic
OpenID profile/email scopes. The web client's redirect URIs are:

- `https://the-game-preview.mrarwyn.workers.dev/thegame/api/auth/callback/google`
- `https://www.arwyn.party/thegame/api/auth/callback/google`

`BETTER_AUTH_URL` is the origin without `/thegame`; the authentication base path
adds `/thegame/api/auth`. Hosted cookies use the distinct
`__Host-the-game-auth` prefix, secure transport and Path=/.

On 21 October 2026, the user explicitly approved publishing the OAuth audience
and Google confirmed **In production**. A real production login succeeded; the
owner panel recognized the signed-in user and the production database contained
one user, one session and one Google account. Logout and account switching remain
unverified. Creating a credential alone is not evidence that those flows work.

## AI activation

Configure server-only `MIND_PROVIDER_MODE=pool`, `MIND_POOL_CONFIG`,
`MIND_BUDGET_CONFIG` and the explicitly qualified provider credentials after
authentication and shared database accounting work. Keep the agreed $0 model
tariffs, finite per-day/per-player limits and disabled background calls. Do not
enable `MIND_BUDGET_LOCAL_DEV` on either public Worker. Do not substitute paid
fallbacks when a free provider is unavailable.

Run one bounded authenticated hosted check, verify that the actual provider was
used and that PostgreSQL recorded the charge/reservation, then check reload.
An authored local reply is useful fallback behavior, not proof of AI activation.

The current Cloudflare configuration selects only
`nvidia/nemotron-3-ultra-550b-a55b:free` through OpenRouter. There is no paid
fallback. Production limits are 24 shared calls/day, 12/player/day, 3/player/minute,
one concurrent call, and no background AI calls. Provider reservations additionally
cap requests at 2/minute, 24/day and 744 per rolling 31 days, with token ceilings.
The session secret differs between preview and production.

On 21 October 2026, the preview reached OpenRouter and received HTTP 429.
The account's read-only quota endpoint reported 277 free requests used, a daily
limit of 50, and zero remaining. The user explicitly chose to keep $0 spend and
wait for the reset. A successful generated reply remains unverified on Cloudflare;
do not confuse this account-level limit with a hosting failure. After the UTC
daily reset, check the allowance before one bounded authenticated dialogue test.

Workers rejects `redirect: "error"` before making a request. The AI and fixed
blockchain/media transports now use `manual`, reject unsuccessful/redirected
responses, and never follow a redirect with credentials. A local Workerd probe
reproduced the old error and returned HTTP 200 with the supported option.

## Production cutover

Preview migrations belong to the isolated `cloudflare-preview-20261021` branch
of Neon project `plain-dawn-91632624`. Production uses its separate root branch.
Apply the committed migrations explicitly against the named target branch only
after preview validation. Set `GAME_HYPERDRIVE_ID` to the production binding,
`GAME_WORKER_NAME` to the production Worker name and `GAME_PUBLIC_ORIGIN` to
`https://www.arwyn.party` when rebuilding for production.

Route only `www.arwyn.party/thegame` and `www.arwyn.party/thegame/*` to the new
Worker. The existing `www.arwyn.party/*` homepage route must remain intact.
Verify the live entry page, static assets, manifest, session endpoint, Google
login and a bounded AI request before declaring the migration complete.

Browser storage is scoped to each origin. A town on `thegame.grok.me` will not
automatically appear on `www.arwyn.party`; export it on the old site and import
it on the new site. Existing server-side identities and wallet ownership require
an explicit migration/recovery process; matching an email is not authorization
to transfer ownership. Keep the old site and its data available.

Rollback removes only the two game routes or restores the preceding game
Worker version. Preserve database contents and browser saves. Never reset the
Neon root branch or replace the site's broad homepage routes as a rollback.

## Validation recorded before hosted acceptance

On 21 October 2026, both hosting builds, typecheck and 943 tests passed. Lint
reported no errors and the inherited unused auth-directive warning. Local
Workerd served the mounted page, assets, manifest and session endpoint. Three
synthetic OAuth starts, including concurrent requests, successfully used the
isolated Neon branch. Browser entry, movement and reload preserved a synthetic
town. Real Google login and the signed-in owner tools passed on the hosted
preview. Hosted AI is blocked by the exhausted free allowance described above.
The normal build skipped migrations with `DATABASE_URL` unset. Production's
previously empty Neon root branch was initialized explicitly with the same six
migrations already exercised on preview.

The first full rerun found three mock assertions still expecting `redirect:
"error"` and one sandbox-denied local port test. Updating the mocks to the supported
option and allowing the test listener produced 943 passes; no assertions were
removed. `diagnose:town` also completed and remains an observation report.

## Live handoff — 21 October 2026

Production is live at `https://www.arwyn.party/thegame/`, Worker version
`112cdeb0-2a07-458e-842e-1b712bb138cf`. Preview version is
`afd55083-f1c4-4e2c-bc2f-d6bd26b6c093`. The privacy page is live at
`https://www.arwyn.party/thegame/privacy`.

Only the two game routes were added; all 49 pre-existing Worker routes remain.
The existing www-to-apex redirect excludes HTTPS game paths, and a new first
rule upgrades HTTP game paths to HTTPS while retaining www. HTTP checks verified
the game and privacy pages, the HTTPS upgrade, the trailing-slash redirect and
unchanged homepage/bitcoinart redirects. Route backups are private ignored
artifacts. Rollback must also account for these two redirect-rule adjustments.

This Chrome session retained an obsolete permanent redirect for the bare game
URL. The verified signed-in browser entry is
`https://www.arwyn.party/thegame/?deployment=20261021`; the fresh query avoids
that cached redirect. No browser data or town was cleared. The synthetic
"Hosting check" town is paused and has **Use local dialogue only** enabled.
Disable that setting for the next explicitly bounded AI acceptance check.

Production has zero AI attempts. Preview reached the provider's exhausted daily
free quota. The next daily reset is 00:00 UTC / 01:00 BST on 22 October; a reset
does not prove model availability or an accepted generated reply. No credits,
hosting upgrade or other purchase was made. The Cloudflare deployment API
identified this account's effective Workers plan as Free, despite earlier
"Standard" metadata.

Production browser arrival, pause, reload and Google owner status were checked.
Exact 1280×800/390×844 checks, production browser export/import, logout/account
switching and a real hosted image transformation remain unverified. Existing
Grok saves remain on their original origin; use export/import to move a town.

An attempted one-off follow-up automation was **not created**: automatic
approval review failed because of an account usage limit. There is no scheduled
post-reset verification. Migration source remains an uncommitted reviewable
diff on `codex/cloudflare-hosted-ai`; it has not been pushed or put in a new PR.
The deployed Worker and a committed GitHub delivery are separate statuses.

## Reviewed source and live acceptance — 22 October 2026

The [current handoff](../handoffs/cloudflare-hosting-2026-10-22.md) supersedes the
21 October quota blocker for one bounded production player exchange. The free
allowance was checked before normal authenticated gameplay generated an accepted
OpenRouter/NVIDIA Ultra reply in 4,639 ms. Production PostgreSQL recorded one
settled call at 0 microusd, no outstanding reservations, and reload preserved the
exchange. This is a real provider reply, not a local fallback or a quota-reset
assumption. The synthetic town stayed paused at day 1, 07:00 with 4 coins.

Independent source review found and fixed the mounted Vite preview PWA paths;
the new regressions exercise both root and `/thegame/` preview URLs. All 945
application tests, typecheck and lint pass (one inherited lint warning). CI now
also builds the Cloudflare target after its browser checks. Sampled Worker traces
and query-string redaction are configured in the source. The legacy build passed
without connecting to a database.

Keep the initial acceptance Worker version separate from any later deployment
of the reviewed Git commit. The handoff records source delivery and subsequent
hosted evidence without changing the agreed free-only model limits.

Reviewed runtime commit `cc186b2868d4f5396be96668905b576e4de42dcd` is pushed in
[PR #41](https://github.com/arwyn6969/the-game/pull/41); its full
[Verify run](https://github.com/arwyn6969/the-game/actions/runs/39767941785) passed.
It is deployed on production Worker version
`72863242-780e-4738-a379-50fb5ddc1814`, with tag `cc186b2868d4`. Use
<https://www.arwyn.party/thegame/?deployment=cc186b2868d4> for the fresh entry.
A second real player reply on that exact build passed in 2,112 ms and settled
at $0. Both exchanges survived reload; all reservations are settled. The handoff
records viewport, logout/relogin, HTTP evidence and the retained cached-redirect
limitation. The prior Worker version remains the rollback reference above.
