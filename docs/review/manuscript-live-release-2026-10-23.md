# Manuscript continuation: published browser release

Published **24 October 2026 BST / 23 October 23:01 UTC** at **https://www.arwyn.party/thegame/**. The user asked to get the activity live and let it run rather than continue isolated model experiments. [PR #47](https://github.com/arwyn6969/the-game/pull/47) is merged.

| Item                              | Exact reference                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Qualified clean runtime           | `96a7f010070461a8b26345287137e282f2b9dc5d`                                             |
| Main squash merge; identical tree | `4aaf8bdd1eb4c7bd3fc12c7c27e07ae2e49d9a5d`                                             |
| Required Verify                   | [40035557618 — passed](https://github.com/arwyn6969/the-game/actions/runs/40035557618) |
| Worker                            | `the-game-production`                                                                  |
| Published version / tag           | `722e5658-356d-4c82-baf1-7e70f1c1163c` / `96a7f0100704`                                |
| Previous version / rollback       | `8852b4fc-0ca5-4217-8f71-6c7420cd0d72`                                                 |

## Available behavior

Open **Library** or **Inventory**, introduce the manuscript if needed, and invite Northern when he is beside or holding it using **Watch Northern try**. The activity starts town time at 1× and runs up to eight freely selected decisions. Speech permits another decision; wait, Stop, failure, repeated unchanged read and the cap retain their stops. No story, next action, reply or manuscript words are prescribed. Current-main opt-in hearing and manually requested meeting turns remain unchanged.

Physical request starts are at least **31 seconds apart** to respect the existing two-per-minute provider limit. The gate precedes request marking, counting, prompt creation and effects. The wait consumes no request, does not reset on another trial within the mounted tab, and cannot queue a burst while hidden. It adds no retry or automatic restart.

This remains an explicitly started, visible-browser activity. It does not run after the browser closes. Shared **24 calls/day, 12/player/day**, one concurrent request, existing interactive reserves, the same free-only model and disabled ordinary background AI remain. A continuous seven-resident world needs durable world authority, a server clock/worker and sufficient inference allocation; 24 shared calls/day supports sparse decisions rather than continuous responses.

## Verification and settings preservation

Full current-head Verify passed typecheck, lint, 418 town tests, 1,038 script + 55 typed tests, authority/recovery tests, diagnostics, normal build, browser/stamp/delayed-AI/meeting/accessibility/private-wallet checks and Cloudflare build. Lint retains one inherited auth-file warning. The former head hit the old 20-minute workflow limit late in browser checks; the final allowance is 35 minutes, with every check retained.

[Desktop/phone virtual-time cadence acceptance](manuscript-live-cadence-2026-10-23/README.md), evidence `fd39482`, passes using the actual 31,000ms production constant. At approximately 28 seconds only the greeting's request/decision/44 synthetic tokens exist; subsequent starts are at least 31 seconds apart. New-trial, hidden, pending, wait, cap, reload, duplicate-read, manual reading, attention and enabled-auth checks pass. Independent source/cadence review found no blocker.

The clean production build and pinned Wrangler 4.151.3 packaging passed. Generated account, Worker name, Hyperdrive, Images binding, public variables and compatibility settings match the prior production build. Publication used `--keep-vars --strict`, without a secrets file or secret mutation. [Deployment audit](manuscript-live-release-2026-10-23/deployment-audit.json) confirms all non-asset bindings are byte-equivalent to the prior version, including secret-binding definitions. No database migration, quota, tariff, provider, auth or route change was made. No human town was opened or reset.

[Public HTTP evidence](manuscript-live-release-2026-10-23/public-http.json), captured 23:02 UTC, verifies the new entry page and exact byte hashes for its principal CSS/JS against the clean build. Privacy and anonymous session return 200 (session null); manifest start/scope remain `/thegame/`; the existing homepage redirect remains intact. New bundles are `index-ZcFNSpn9.js` and `routes-oI68W82j.js`.

**This release made zero model requests.** The earlier [real trial](northern-speech-continuation-2026-10-23/README.md) remains tied to source `9574d5f` and its narrower findings; no new hosted AI behavior is claimed. Private packaging/configuration/HTTP source evidence remains under ignored `artifacts/manuscript-live-release-20261023/`.

## Recovery

Restore the recorded previous Worker version with the established Wrangler rollback procedure, checking preserved bindings and settings. This code release changed no database schema; retain all database contents and browser towns. Use a normal revert PR for source recovery. Refresh an existing game tab to load the new bundles; do not clear storage.
