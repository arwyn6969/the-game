# F1 — accompany and remember

Local acceptance record, 5 November 2026. Owner: this Codex chat.
Branch: `codex/followers-local`, in the reused clean `a01-replay/` checkout.
Fetched main: `49cf76f2236f12ff79b092f4e1df84e13f9b5a42`.
Feature base: `2ee631fa62ca9ecbba9aab4453d7bfd7c3b69399`, the open PR #71 head.
Implementation head: `40c67dc7c2699a295698aacac0b22283625bddeb`.
[Machine receipt](checks.json) records the final source identity and checks;
[browser receipt](browser.json) records all eight journeys and screenshots.

## Delivered behaviour

Choose a nearby resident's card and **Spend time with**. Choose 30, 60 or 120
game minutes (default 60), with optional listening. **Watch character** remains
camera-only. One explicit local grant controls one follower/target through the
existing navigation pass, at its existing three-step minute budget. Free stand
points exclude doors, other residents and reserved goals. Target plans are kept.

The independent controller was implemented and tested first, then integrated
sequentially with the optional versioned `Town.following` extension, simulation,
attention and UI. No existing exported game function signature changed. An
in-memory town-scoped grant survives unrelated financial transaction cloning;
saved state alone cannot acquire movement. Keyboard, phone touch and a clicked
destination take control immediately. Stop releases its own path and attention;
Resume is explicit. A validated manual attention change supersedes the session's
listener revision and preserves that manual choice.

Observation requires the existing six-tile acoustic predicate in public outdoor
areas or the library. Once sight is lost, only the last observed public position
can guide movement. Five game minutes without progress or reacquiring the target
pause it. An unobservable doorway transition may require manual entry and Resume;
the feature does not locate a resident inside a private destination.

Listening uses the existing validated command for one specific discussion. It
requires the target's actual accepted arrival/listening and the player's existing
invitation/acceptance. It never accepts a declined/left invitation. Journal speech
is copied synchronously from committed utterances whose recipient receipts include
the player, with event/context IDs, attribution and a self-contained excerpt.
Transcript/camera viewing grants no knowledge. Earlier speech is not backfilled.
Existing shared reading records still require their actual player/target receipts.
There are no new skill rewards, rapport changes or follower inference calls.

The journal retains up to 128 entries per session, eight completed sessions and
one current session. Terminal fields remain available at capacity. It reserves
export headroom before starting, deduplicates source-event/recipient pairs, and
shows a truthful empty result for quiet or unsuccessful visits. Source references
are readable under **Source event**. Exporting the town retains the bounded history.

Reload/import/restore, replay, hiding/leaving the page, save failure/conflict and
relevant controls revoke automatic authority. Town pause advances neither movement
nor the game-time deadline. Old v1/v2 saves remain supported. Unsupported or corrupt
following extensions enter the existing raw-byte recovery flow. Recovery does not
automatically rewrite canonical bytes or resume a session.

## Acceptance evidence

| Acceptance                  | Evidence                                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary library visit       | Both browser sizes: start a 60-minute Arwyn session, advance ordinary 1× movement, arrive, receive one synthetic source-checking reply, exclude the earlier unheard line, take control, explicitly Resume, reload/export/import, inspect the same journal and Stop                |
| Second target / quiet visit | Both sizes: Sub, 30 minutes, no listening, real clock progression to duration completion; journal explicitly says no discussion words were received                                                                                                                               |
| Knowledge boundaries        | Source cases cover public/private access, walls, range, prior decline/leave/undelivered invitation, unseen target and no camera receipt. Journal consumes only exact discussion recipients                                                                                        |
| Pending reply               | Source: arrival after generation starts receives only the subsequent commit; physical departure excludes the player. Browser: Stop while the synthetic speaker transport remains pending excludes the player at commitment and adds no journal line                               |
| Navigation                  | Source: at most three adjacent steps per minute, unique occupied tiles, unchanged target plans, reachable non-door stand points, blocked neighbours, target loss and factual five-minute pause                                                                                    |
| Manual authority            | Browser: keyboard and clicked Go-to destination at both sizes; actual touch tap on phone; each requires explicit Resume. Source: a later manual listener revision survives Stop                                                                                                   |
| Earlier work / café         | Source: actual accepted café agreement rejects a competing follow start; suspended work retains its five-coin wage hold; actual service Resume ends following atomically. Financial facts and the existing economy audit remain intact. The inherited café full suite also passes |
| Persistence / recovery      | Both sizes: reload, ordinary export/import, visibility restoration without restart, canonical save conflict and malformed-extension recovery. Source: full losing backup bytes, identity/history retention, deduplication and old saves                                           |
| Duration / capacity         | Source: 30/60/120 validation, midnight, unchanged clock while paused, eight completed sessions, full 128-entry receipt including path/listener release, full paused journal refusing authority, and measured save headroom                                                        |
| Product layout              | Actual Chromium at 1280×800 and 390×844. Geometry checks cover all four existing interfaces; default-interface screenshots show setup, journal, pending Stop, quiet outcome and recovery. Screenshot review caught and fixed an unassigned desktop grid row                       |
| Compute                     | Browser counters survive reloads: four explicitly requested synthetic speaker decisions total, zero follower requests, zero unexpected server-function/provider requests. Quiet sessions make zero inference calls                                                                |

## Source and build checks

Node **24.22.1**, committed lockfile; `npm ci --offline --no-audit --no-fund` passed.
Final checks: typecheck, lint, **525 town tests**, **1,220 script + 55 typed tests**,
town diagnostics and credential-free `npm run build` passed. The 20 new focused
controller/runtime cases are included in both suites. Diagnostics report an empty
world audit. Lint retains the one inherited unused-disable warning in
`src/lib/auth/use-current-user.ts:59`; build retains its chunk-size advisory.

The build used an environment containing only `PATH`, with no dotenv files in
this checkout. The actual migration step printed:
`[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).`
No live database credentials reached that process. The final receipt records this
preflight and skip, plus hashes of the reviewed source files.

The initial full-suite attempt hit sandbox restrictions on existing localhost
server tests; rerunning with local port access and no credentials passed. An
initial lint finding in new validation code was fixed. Early browser failures
were harness navigation/authority assertions and the visual grid defect described
above; the final consolidated run has no failures or browser errors.

The F1 browser harness is added to the existing Verify development-server step;
its artifacts are included in the existing upload. Remote CI has not run for this
unpublished feature branch.

## Review and remaining limits

This is a **stacked local feature**. PR #71 remains unmerged and owns its
witnessed shared-history and café station-handover fixes. Review the F1 diff against
`2ee631f`; integrate #71 first, then rebase/requalify against main as needed.
`product/`, its branch, prior historical branch and its active PR are preserved.
The managed worktree tool rejected the nested product root because this chat is
registered against the empty wrapper; the clean historical checkout was reused.

The fixture's initial poses, schedule and willing discussion choices are labelled
synthetic test inputs, not production consent or authored production speech.
Automated Chromium checks establish neither human enjoyment nor live-provider
compatibility. Still needed: a short human session asking what the avatar actually
heard versus watched, a reason to repeat/change companion, physical phone and
screen-reader checks, broader browsers, and eventual deployed/PWA acceptance.
The browser journeys exercise a 60-minute selection interrupted by controls and a
complete 30-minute quiet visit; they do not claim a complete human-played 120-minute
journey or exhaustive tab/server races.

This packet runs only while the local game is open and active. It adds no F2–F4,
server migration, resident models, provider routing, hosting, secrets, quotas or
payment changes. No upload, PR creation, merge, publication or paid inference was
performed. [Proposed PR description](proposed-pr.md).
