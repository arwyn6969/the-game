# Manuscript continuation: browser release preparation

The user asked to get the current behavior live and let it run unless there are major problems, rather than continue isolated real-AI experiments. This release keeps the existing free model, budgets, auth, saves and published meeting controls.

PR #47 adds speech continuation within an explicitly started eight-request manuscript session. Release review identified immediate successive requests as a practical problem under the production provider's two-per-minute limit. Runtime `b002e36` adds at least 31 seconds between physical request starts, before marking or counting the next request. Waiting spends no request. It does not retry failed responses, restart stopped trials, prescribe a next move or change discussion scheduling.

The required Verify run at `65d8433`, [39997430551](https://github.com/arwyn6969/the-game/actions/runs/39997430551), reached the authenticated-wallet browser step and was cancelled at the workflow's 20-minute limit. Typecheck, lint, town/full tests, diagnostics, standard/browser/stamp/delayed-AI/meeting/accessibility checks had passed. The job allowance is increased to 35 minutes with all checks retained. The final head must pass the required check before merge.

Before release, the public assets and Wrangler deployment history match the existing library-meeting release, Worker version `8852b4fc-0ca5-4217-8f71-6c7420cd0d72`, runtime `2b2b8a4`. This is the rollback reference. Production target is existing Worker `the-game-production` in account `dcde0fefc3f48090702893970a1b9145`, using existing Hyperdrive `5992f69d7a4d41c1b5dcacd6f2b92887` and mount `/thegame/`. No database migration or private configuration change is required for this code release. Preserve remote vars, secrets, bindings and routes.

The scope is browser-run behavior. The game must remain open and visible; the session stops at eight requests, wait, failure, unchanged reread or explicit Stop. Existing shared 24/day, per-player 12/day, free-only routing and disabled ordinary background inference remain. Continuous simulation after closing the browser requires separate persistent-server work and sufficient model capacity.

The earlier [real trial](northern-speech-continuation-2026-10-23/README.md) is complete and remains tied to its exact source. This release adds no real-model experiment. Final browser cadence, CI, packaging, deployment and public-asset evidence are recorded below when complete.

## Local cadence acceptance

At runtime `b002e36`, tested head `a3a34af`, [desktop 1280×800 and phone 390×844 acceptance](manuscript-live-cadence-2026-10-23/README.md) passes with synthetic responses and Playwright virtual time, evidence `fd39482`. The actual fixed 31,000ms production interval is unchanged by the harness. At approximately 28 seconds, only the greeting's one request, one decision and 44 synthetic tokens are counted. Every later start is at least 31 seconds apart. Stop/new-trial cannot reset the interval; a hidden tab cannot dispatch after the deadline. Wait, cap, pending reload, stop, unchanged-read pause, manual reading, attention, meeting isolation and auth remain checked. No live request or runtime timing override was used. Typecheck, scoped lint/format, 45 focused regressions and independent cadence review also pass.
