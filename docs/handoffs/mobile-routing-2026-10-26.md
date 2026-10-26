# Mobile test: apex game routing

Owner: this mobile session-recovery task, with routing work delegated to
`routing_diagnosis`. The user authorized pushing and publishing the fixes and
repairing the apex link on 26 October 2026. The redirect is **published and
verified**, following passing current-head checks and the merge of
[PR #54](https://github.com/arwyn6969/the-game/pull/54). Runtime source is
`b41eeeb`; merged main `66d161d` has the same tree.

## Preflight diagnosis — 26 October 2026, before repair

The dated preflight checks found the following behavior. These 404 results
describe the fault before deployment, not the current game links.

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

The apex 404 was the homepage's “The frog has wandered off” project notice,
separate from the game's sign-in recovery defect. Authenticated read-only
Cloudflare API checks confirmed account `dcde0fefc3f48090702893970a1b9145`, zone
`arwyn.party` (`b137a4e623284b4cdbb41605ea8b497b`), and all **51 pre-existing
Worker routes**. Only `www.arwyn.party/thegame` and
`www.arwyn.party/thegame/*` targeted `the-game-production`; the broad apex and www
homepage routes targeted `emblem-homepage-home`. The redirect Worker name was
absent among the 14 scripts, and its proposed route had no exact conflict.

Cloudflare includes the query string in route matching. A pre-deployment check
of `https://www.arwyn.party/thegame?routing=20261026` returned the homepage's 308
to the same apex bare URL, bypassing the game. The published redirect therefore
uses a route ending in `*` and sends bare game entry directly to the slash form.

## Published implementation

[Worker source](../../config/game-link-redirect/worker.mjs) and
[Wrangler configuration](../../config/game-link-redirect/wrangler.jsonc) implement
**`the-game-link-redirect`** on one added route: `arwyn.party/thegame*`.
This route includes query-bearing bare entry URLs.

The Worker guards the pathname. Only GET/HEAD requests for exact `/thegame` or
`/thegame/` descendants redirect, with 307 and `Cache-Control: no-store`, to the
fixed `https://www.arwyn.party` origin. Bare entry becomes `/thegame/`;
descendant paths and query strings are retained. Non-navigation methods on game
paths return 405 without consuming or replaying their bodies. The alias sets no
cookies and invokes no game API, provider or database.

Other paths caught by the prefix route, such as `/thegame-other`, call the
existing **`emblem-homepage-home`** service through the redirect Worker's
`HOMEPAGE` binding. The original Request and returned Response pass through
unchanged, including method, body, status and headers. The binding avoids a
same-zone network fetch or redirect recursion. It adds no binding or
configuration to the existing homepage Worker. Read-only metadata confirmed
that service's default environment is `production` and its handler is `fetch`.

The Worker has no secrets, database binding or public `workers.dev`/preview URL.
It uses compatibility date `2026-10-26`, observability with redacted query
strings, and traces sampled at 1%. Existing game routes, auth origin, browser
town storage, homepage service and database retain their existing configuration.
The redirect uses the existing script/route permissions, so no extra credential
access or dashboard sign-in was required.

The [Worker routes documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/)
documents route precedence and query-string matching.
[HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
and the [Wrangler service configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings)
document the downstream fetch and `services` configuration. The installed
Wrangler 4.151.3 schema supports the fields used here.

## Publication receipt and rollback

Node 24 and the installed Wrangler **4.151.3** published only the redirect
configuration after the coordinating task's review and passing checks. The CLI
returned exit 0. The game was published separately by the coordinating task.
All remaining routing administration and verification used the Cloudflare API
and CLI; no dashboard login or new credential permission was needed.

| Published item   | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Worker           | `the-game-link-redirect`                                               |
| Worker version   | `1a44f41b-2b19-47d5-b0be-ca495abffbee`                                 |
| Route            | `arwyn.party/thegame*`                                                 |
| Route ID         | `cdc62f1fbb6548fba198d5afa918ecd9`                                     |
| Route comparison | All **51 previous records unchanged**, exactly one added; **52 total** |
| Verified at      | 26 October 2026, approximately 13:31 UTC                               |

Live API settings confirm the `HOMEPAGE` binding targets the existing production
`emblem-homepage-home` service, compatibility date is `2026-10-26`, query strings
are redacted, and trace sampling is 1%. Both `workers.dev` and preview URLs are
disabled. No secret upload, existing Worker mutation, migration, provider call
or database change belongs to this redirect publication.

Rollback removes **only** route record `cdc62f1fbb6548fba198d5afa918ecd9` from
zone `b137a4e623284b4cdbb41605ea8b497b`, using the route API or equivalent route
management. The exact route resource is
`/zones/b137a4e623284b4cdbb41605ea8b497b/workers/routes/cdc62f1fbb6548fba198d5afa918ecd9`.
Confirm that record still points to `the-game-link-redirect` before removing it.
With it removed, the existing broad homepage route resumes handling these
paths. Retain the unused redirect Worker for recovery. Do not remove the
existing homepage or game routes, change redirect rules, or reset database or
browser storage.

## Validation and private evidence

Node 24 passed **7 focused redirect tests**, including host/path boundaries,
bare-entry/query canonicalization, HEAD, fixed-origin safety, rejected API/form
replay, and forwarding the original request exactly once while preserving the
homepage response body/status/headers. Scoped ESLint, formatting and whitespace
checks, generated binding types, and the Wrangler 4.151.3 packaging dry run
passed before publication.

Post-publication HTTP checks establish that apex bare/slash/privacy/query links
reach their www equivalents with final HTTP 200. Bare apex entry redirects
directly to www `/thegame/`; its first redirect preserves query strings, including
repeated parameters. The existing game router subsequently normalizes repeated
parameters into its own array representation. HTTP apex entry and the existing
www bare-entry query path also terminate successfully. HEAD returns an empty
307, while POST to an apex game path returns 405 without a Location header.

The apex homepage, www homepage redirect, www `/bitcoinart` redirect, a prefix
lookalike, and an encoded delimiter path all retain their pre-deployment status,
Location, content type, homepage release header and complete body SHA-256. This
also exercises the deployed `HOMEPAGE` service fallback. The mounted www manifest
and anonymous session endpoint return 200; the session is `null`. These checks
do not claim a fresh physical-device Google login or a model reply.

Ignored private evidence is under
`artifacts/mobile-session-release-20261026/`: `routing-worker-routes-before.json`,
`routing-worker-routes-predeploy.json`, `routing-worker-routes-after.json`,
`redirect-worker-name-preflight.json`, `redirect-final-preflight.json`,
`homepage-service-preflight.json`, `redirect-unrelated-predeploy.json`,
`redirect-routing-verification.json`, `redirect-live-settings.json`,
`redirect-subdomain-verification.json`, `redirect-deploy.log`,
`routing-public-before.json`, `routing-public-after.json`,
`redirect-local-validation.json`, and `redirect-package/`. No credential values
appear in this handoff.

Earlier hosting receipts record an obsolete permanent www-to-apex redirect
cached by one browser profile. A fresh versioned slash-form www URL, for example
`https://www.arwyn.party/thegame/?routing=20261026`, avoids that old cached bare
destination during acceptance. Ordinary unversioned links were checked through
HTTP as recorded above. No player's town or other site storage was cleared.
