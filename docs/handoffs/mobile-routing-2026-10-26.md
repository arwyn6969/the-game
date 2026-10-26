# Mobile test: apex game routing

Owner: this mobile session-recovery task, with routing work delegated to
`routing_diagnosis`. The user authorized pushing and publishing the fixes and
repairing the apex link on 26 October 2026. The coordinating task must review
the final source and passing checks before this Worker is deployed. No routing
change has been applied at this handoff checkpoint.

## Reproduced behavior and current route inventory

Public HTTP checks on 26 October 2026 found:

| Entry                                                     | Result before repair                     |
| --------------------------------------------------------- | ---------------------------------------- |
| `https://arwyn.party/thegame`                             | 404, homepage release `0b540d0446db83de` |
| `https://arwyn.party/thegame/`                            | 404, same homepage release               |
| Apex `/thegame/privacy` and game URLs with queries        | 404, same homepage release               |
| `https://www.arwyn.party/thegame`                         | 307 to `/thegame/`                       |
| `https://www.arwyn.party/thegame/` and `/thegame/privacy` | 200                                      |
| Mounted www session and manifest endpoints                | 200; anonymous session `null`            |
| `http://arwyn.party/thegame`                              | 308 to HTTPS apex, then 404              |
| `https://arwyn.party/`                                    | 200, existing homepage                   |
| www homepage and `/bitcoinart`                            | 308 to the corresponding apex URL        |

The apex 404 is the homepage's “The frog has wandered off” project notice. It
is separate from the game's sign-in recovery defect. Authenticated read-only
Cloudflare API checks confirmed account `dcde0fefc3f48090702893970a1b9145`, zone
`arwyn.party` (`b137a4e623284b4cdbb41605ea8b497b`), and all **51 existing Worker
routes**. Only `www.arwyn.party/thegame` and `www.arwyn.party/thegame/*` target
`the-game-production`; the broad apex and www homepage routes target
`emblem-homepage-home`. The new redirect Worker name was absent among the 14
existing scripts, and its proposed route had no exact conflict.

The exact bare route has an additional boundary: Cloudflare includes the query
string in route matching. A live check of
`https://www.arwyn.party/thegame?routing=20261026` returned the homepage's 308
to the same apex bare URL, bypassing the game. The redirect therefore needs a
route ending in `*` and must send bare game entry directly to the slash form.

## Prepared implementation

[Worker source](../../config/game-link-redirect/worker.mjs) and
[Wrangler configuration](../../config/game-link-redirect/wrangler.jsonc) prepare
the new **`the-game-link-redirect`** Worker on exactly one new route:
`arwyn.party/thegame*`. This route includes query-bearing bare entry URLs.

The Worker guards the actual pathname. Only GET/HEAD requests for exact
`/thegame` or `/thegame/` descendants redirect, with 307 and `Cache-Control:
no-store`, to the fixed `https://www.arwyn.party` origin. Bare entry becomes
`/thegame/`; descendant paths and query strings are retained. Non-navigation
methods on game paths return 405 without consuming or replaying their bodies.
The alias sets no cookies and invokes no game API, provider or database.

Other paths caught by the prefix route, such as `/thegame-other`, call the
existing **`emblem-homepage-home`** service through the new Worker's `HOMEPAGE`
binding. The original Request and the returned Response pass through unchanged,
including method, body, status and headers. The binding avoids a same-zone
network fetch or redirect recursion. It adds no binding or configuration to the
existing homepage Worker. Read-only service metadata confirmed that service's
default environment is `production` and its handler is `fetch`.

The Worker has no secrets, database binding or public `workers.dev`/preview URL.
It uses compatibility date `2026-10-26`, observability with redacted query
strings, and traces sampled at 1%. Existing game routes, auth origin, browser
town storage, homepage service and database remain under their existing owners.
The dedicated Worker uses the existing script/route permissions, so no extra
credential access or dashboard sign-in is required.

The [Worker routes documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/)
documents route precedence and the query-string matching boundary.
[HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
and the [Wrangler service configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings)
document the downstream fetch and `services` configuration. The installed
Wrangler 4.151.3 schema supports the fields used here.

## Deployment and rollback boundary

After the coordinating task's source review and passing checks:

1. Reconfirm `the-game-link-redirect` is absent and
   `arwyn.party/thegame*` has no conflicting exact route. Preserve a fresh
   private copy of the zone's current Worker routes. Do not deploy over a name
   or route newly assigned to another owner.
2. Deploy only `config/game-link-redirect/wrangler.jsonc` with the installed
   Wrangler 4.151.3 and Node 24. It creates the new Worker, its single route and
   its homepage service binding. Do not upload secrets or alter existing Worker
   routes, homepage rules, game settings or database resources.
3. Compare the zone's route list against the backup: all previous 51 route
   records must be unchanged, with only the new redirect route added. Record the
   new route ID and Worker version below after actual deployment.
4. Verify public apex bare/slash/privacy/query links reach their www targets;
   verify bare entry with a query reaches www `/thegame/` directly. Verify apex
   homepage, www homepage, `/bitcoinart` and a prefix lookalike retain their
   prior status/body/header behavior. Check the www manifest and anonymous
   session endpoint. Do not initiate a model request as a routing test.
5. Rollback removes only the newly added route by its recorded ID. With the
   route removed, the existing broad homepage route resumes handling these
   paths. The unused redirect Worker may be retained for recovery. Never remove
   the existing homepage/game routes or reset database/browser storage.

Deployment route ID and Worker version: **pending; not deployed**.

## Validation and private evidence

Node 24 passes **7 focused redirect tests**, including host/path boundaries,
bare-entry/query canonicalization, HEAD, fixed-origin safety, rejected API/form
replay, and forwarding the original request exactly once while preserving the
homepage response body/status/headers. Scoped ESLint and whitespace checks pass.
Wrangler 4.151.3 packaging dry run passes. These are local checks; successful
remote routing, service invocation and physical-device sign-in remain separate
acceptance steps.

Ignored private evidence is under
`artifacts/mobile-session-release-20261026/`: `routing-worker-routes-before.json`,
`redirect-worker-name-preflight.json`, `homepage-service-preflight.json`,
`routing-rulesets-before.json`, `routing-public-before.json`, and
`redirect-package/`. No credential values appear in this handoff.

Earlier hosting receipts record an obsolete permanent www-to-apex redirect
cached by one browser profile. A fresh versioned slash-form www URL, for example
`https://www.arwyn.party/thegame/?routing=20261026`, avoids that old cached bare
destination during acceptance. Check ordinary unversioned entry separately.
Do not clear the player's town or other site storage to conceal a routing error.
