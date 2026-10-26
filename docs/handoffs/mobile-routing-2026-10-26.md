# Mobile test: apex game routing

Owner: this mobile session-recovery task, with routing diagnosis delegated to
`routing_diagnosis`. This handoff records a proposed routing repair; no Cloudflare
configuration or live deployment has been changed by this routing work.

## Reproduced public behavior

Public HTTP checks on 26 October 2026 at approximately 11:04 UTC found:

| Entry | Result |
| --- | --- |
| `https://arwyn.party/thegame` | 404, homepage header `x-arwyn-release: 0b540d0446db83de` |
| `https://arwyn.party/thegame/` | 404, same homepage release header |
| `https://www.arwyn.party/thegame` | 307 to `/thegame/` |
| `https://www.arwyn.party/thegame/` | 200 |
| `http://arwyn.party/thegame` | 308 to `https://arwyn.party/thegame`, which returns 404 |
| `https://arwyn.party/` | 200, existing homepage |
| `https://www.arwyn.party/` | 308 to `https://arwyn.party/` |

The apex 404 body is the homepage's “The frog has wandered off” project notice.
It is not a game authentication error. The preserved hosting route inventory
under ignored `artifacts/hosted-ai-rollout/cloudflare-routes-after.json` in the
`hosted-ai-rollout/` checkout assigns only `www.arwyn.party/thegame` and
`www.arwyn.party/thegame/*` to `the-game-production`; the broad apex and www
homepage routes belong to `emblem-homepage-home`. This agrees with the intended
cutover in [Cloudflare hosting](../implementation/cloudflare-hosting.md).

The generated `.output/server/wrangler.json` does not declare routes. Editing
game application code alone cannot affect apex requests currently handled by
the homepage Worker. A fresh Cloudflare API inventory was not obtained: the
read-only API attempt could not resolve `api.cloudflare.com` in the sandbox.
The saved route inventory is historical evidence, while the public responses
above establish the current symptom.

## Prepared repair and application boundary

[The prepared rule](../../config/cloudflare-apex-game-redirect.json) is a single
Cloudflare Single Redirect rule. It matches the exact apex `/thegame` path and
its `/thegame/` descendants, redirects to HTTPS www, and preserves the path and
query string. The initial 307 avoids creating another permanent browser cache
entry during verification. The bare path takes the existing www trailing-slash
redirect afterward. Paths such as `/thegame-other` do not match.

This keeps sign-in, host-bound cookies and saved towns on the established
`https://www.arwyn.party` origin. It does not add an independent apex game
origin, change Google callback URLs, or alter the homepage routes.

Application remains pending the coordinating task's decision on authorization
for this specific production hosting change. Once authorized:

1. Retrieve and privately preserve the current zone redirect rules and their
   order. Confirm the target zone is `arwyn.party` in account
   `dcde0fefc3f48090702893970a1b9145`.
2. Add this individual rule to the zone's existing
   `http_request_dynamic_redirect` entry point ruleset through the dashboard or
   Rulesets API. Put it before generic redirect rules so HTTP apex game links
   can go directly to HTTPS www. Preserve every existing rule and its behavior.
3. Do not upload this JSON as an entire ruleset or use it as a replacement
   `rules` array. If the API operation updates the whole ruleset, first retain
   every current rule and add only this rule. Prefer the API's individual rule
   operation where available.
4. Verify apex bare/slash entry, a descendant such as `/thegame/privacy`, and a
   query-bearing URL reach their www equivalents. Verify apex homepage, www
   homepage and an unrelated existing project retain their prior behavior.
   Verify the mounted manifest and anonymous session endpoint remain available.
5. Rollback removes only this newly added rule. Preserve all existing Worker
   routes, authentication settings, database contents and browser saves.

The [Single Redirect API documentation](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/)
specifies the redirect phase and **Zone → Single Redirect → Edit** permission.
The [root-to-www example](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-root-to-www/)
documents preserving the request path and query string. The
[Worker route documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/)
explains host matching and precedence.

## Access and browser acceptance

A local Wrangler OAuth configuration exists at
`~/Library/Preferences/.wrangler/config/default.toml`. Its recorded access token
expired on 25 October 2026, and its scope list includes Worker route permissions
but no Single Redirect permission. No token or other credential is included in
this handoff. A suitable existing dashboard session or an account-owned API
token with the required zone permission could apply the rule after authorization.
The dashboard's current signed-in state has not been inspected; no dashboard
interaction is needed to prepare this repair.

Earlier hosting receipts record an obsolete permanent www-to-apex redirect
cached by one browser profile. A new apex-to-www redirect may loop in a profile
that still applies that old cached redirect to the same www URL. Use a fresh
versioned www URL, for example
`https://www.arwyn.party/thegame/?routing=20261026`, for browser acceptance and
check the ordinary unversioned links separately. Do not clear the player's town
or other site storage to conceal the issue.

## Validation

The prepared rule was parsed as JSON locally. No live rule application,
deployment, Google sign-in or physical-device acceptance is claimed by this
handoff.
