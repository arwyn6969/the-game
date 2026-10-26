# Social facilitation release — 26 October 2026

Live: **https://www.arwyn.party/thegame/**. [PR #57](https://github.com/arwyn6969/the-game/pull/57)
passed every required [current-head Verify check](https://github.com/arwyn6969/the-game/actions/runs/40401155916)
at `9e610475b535b04587dc02603d2e3e16e7ebd9b0`, with no unresolved review threads.
It merged as `a40867e5ca977453a5f42df2aff2cb9fbf022f82`; the complete merged tree
equals that verified head. The release incorporates the already-published
coin-label PR #45 and existing mobile AI recovery; it introduces no mobile work.

The clean archived verified source was built for the existing production Worker
and packaged with the established Wrangler 4.151.3. Production Worker version
**`87687764-4b95-478d-b1bb-f3dfbd5329dc`** publishes runtime/build
**`9e610475b535`**. Prior version/rollback:
`82c1f2d0-dcf5-4387-8934-549a7ba267f2`.

## Published checks

- Four public JavaScript/CSS asset hashes match the exact clean package.
- Game, privacy, anonymous session and mounted PWA manifest checks pass. All
  seven canonical HTTP/query-bearing game link checks pass, and unrelated
  homepage/prefix routing retains its previous behavior.
- All **18 production binding definitions**, including **seven secret
  definitions**, compare identical before/after. Compatibility date/flags, usage
  model, observability, placement, logpush and tail-consumer settings match.
  All **52 route records** remain identical. Deployment retained remote variables
  and secrets; it made no secret upload, migration, provider change or purchase.
- The deployed Help panel displays **Build 9e610475b535** and retains explicit
  coin units. This read-only in-app browser check made no model request. No
  personal town was exported, imported or cleared.

The OAuth session was refreshed through existing Wrangler access when expired.
Connected-tool discovery returned no Cloudflare integration, so publication used
the existing API/CLI path. The final predeployment metadata was checked again
after refresh and matched the package's rollback/binding baseline. Raw protected
metadata, build/package/deploy logs, public checks and the live screenshot remain
ignored under `artifacts/social-release-20261026/`. [Sanitized receipt](release.json).

## Remaining social acceptance

Publication consumed **zero real model requests**. The actual social checkpoint
still contains twelve charged attempts, all settled. One facilitator speech and
Northern's voluntary participation are verified; a second distinct NPC's spoken
reply and a genuine subsequent spoken turn after player opt-out remain open.
See the [continuation packet](../../handoffs/social-acceptance-continuation-2026-10-26.md).

Inspection of a copy of the closed ledger places the last charged attempt at
**26 October 20:37:40.842 UTC**. Its entire rolling 24-hour player allowance cannot
be available before **27 October 20:37:41.842 UTC**, and other usage may postpone
that. Provider UTC-day counters alone do not establish SQL allowance.

The user authorized completing those cases when free allowance permits. Automatic
approval review rejected both recurring and one-off scheduled execution without
explicit scheduling consent; no automation has been created. A specific one-off
continuation at **27 October 20:45 UK time**, with at most four physical free
requests in the existing meeting, is awaiting that consent. Mobile work stays
on hold. Do not infer scheduling approval from this receipt.

## Rollback

Restore the previous existing Worker version above using the established
Wrangler rollback flow, then verify public assets and bindings. Code rollback
does not restore browser towns or database history. Preserve all routes,
production accounting, saves, credentials and raw acceptance evidence.
