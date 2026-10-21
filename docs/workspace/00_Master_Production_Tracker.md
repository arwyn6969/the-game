# The Freeman Show production tracker

**Historical assessment:** use [current project status](../CURRENT_STATUS.md) for later source, live-check evidence and current assignments. The dated observations below retain their original scope.

**GitHub snapshot — 21 October:** this preserves the local record and its dated observations. Repository links are normalized for this combined branch; private runtime evidence remains local. See the [synchronization record](../GITHUB_SYNC.md) for current source coverage and publication status.

**21 October game execution:** the [active game delivery tracker](../DELIVERY_TRACKER.md) now records the user-authorized parallel agents, blockers and integration queue. This file continues to own show production; no episode stage changed during game-lane setup.

**21 October 2026 planning update by Codex:** the game now has a separate [server production plan](../PRODUCTION_PLAN.md), linked to the [readiness checklist](01_Game_Readiness_Checklist.md). It distinguishes the hosted browser-local release, persistent server alpha, full shared town and future agent-built buildings/land/apps/external games. The game plan owns game scheduling; this tracker continues to own show production. The dated queue below is historical: the funded library and shared AI-budget implementation subsequently reached main, while human, operator and hosted acceptance remain open. No show stage or release gate changes in this update.

Updated 12 October 2026 by Codex. This is the local execution record for the hosting and content workstream. The existing game implementation remains in `arwyn6969/the-game`.

Production plan: [The Freeman Show launch and production plan](https://chatgpt.com/space/page_850de4b91fc481918aaa3afe6f7b7aa0).

Game implementation sequence: [shared roadmap](https://github.com/arwyn6969/the-game/blob/main/docs/ROADMAP.md). Trust repairs and source consolidation are complete; the funded library contribution and its next-day consequence come next. The show records real progress through those milestones.

12 October update by Codex: the user-approved [PR #19](https://github.com/arwyn6969/the-game/pull/19) merged the combined product into main at `8d15a722b61c09a7dca198ccf49ea8dd0b3f8125`. Use [product/](../../README.md) on main. [The consolidation record](../CONSOLIDATION.md) accounts for merged PRs #5, #6, #9, #13 and #14 and the 17 retired remote branches. Main CI passed; PR #16 is the sole remaining open draft, retargeted to main, with its inactive funded-economy foundation requiring v2/eight-actor reconciliation. Existing checkouts and uncommitted UI work are preserved. This is source integration, not hosted publication or an episode-stage transition.

## Working decisions

- Production identity: **The Freeman Show**, an openly documented, consent-based making-of and town-life series.
- Start with one existing recording computer, the existing host, and scheduled sessions. Neither Spark is required. Trial at most one assumed NVIDIA DGX Spark after measuring an actual bottleneck.
- Confirmed first-month cloud/content ceiling: **up to £100**, confirmed by Arwyn on 11 October 2026. Include applicable tax and payment/FX fees within that total. Check existing hosting charges before allocating the remainder. Billing controls are not yet configured; local electricity is tracked separately.
- Current town state is browser-local. A continuous shared show town is a separate engineering milestone; opening the hosted website does not implement it.
- One game build, one designated show save and one session log per recording. Preserve existing personal towns.

## Work queue

| ID   | Work                                                | State on 11 October                     | Proposed owner                     | Completion evidence                                                                                              |
| ---- | --------------------------------------------------- | --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| FS01 | Inspect hosting, persistence and AI gateway         | Complete                                | Codex                              | Browser simulation/localStorage; grok-4.5; Vercel preset; current limiter has no durable spend cap               |
| FS02 | Price pilot, archive and optional production        | Complete                                | Codex                              | Linked plan contains dated provider sources, explicit token assumptions and separate hardware costs              |
| FS03 | Prepare ethical production brief and pilot sequence | Complete                                | Codex                              | Saved Page includes participant agreement, interventions, credit/payment and recorded-pilot workflow             |
| FS04 | Reconcile actual hosted build and account bill      | Pending                                 | Producer and hosting account owner | Exact deployed source revision, hosting charge and runtime AI billing path recorded                              |
| FS05 | Record the first pilot                              | Ready for setup                         | Arwyn and editor                   | Sound/picture check; 20–30 minute session at 1×; before/after backup; session/intervention log                   |
| FS06 | Add AI cost accounting and enforce shared limits    | Specified, not implemented              | Backend owner                      | Durable billing records; atomic budget reservations; bounded retries; concurrent-limit tests; offline fallback   |
| FS07 | Finish existing transaction and recovery repairs    | In progress in existing game workstream | Existing implementation owner      | Reviewed changes and actual hosted verification; do not mark complete from this tracker                          |
| FS08 | Edit E01 and up to three short clips                | Pending footage                         | Editor                             | 5–10 minute episode with real choice/consequence, credit and publication agreement                               |
| FS09 | Deliver funded library project as next story        | Planned in game roadmap                 | Game team                          | Agreed work, funded payment, useful index and next-day memory through normal controls                            |
| FS10 | Build persistent shared show town                   | Later engineering milestone             | Backend and client owners          | World runs without viewers; restart recovery; read-only filtered spectator feed; no duplicate transactions       |
| FS11 | Evaluate one Spark                                  | Optional after measured bills           | Technical owner                    | Same-task quality, latency, throughput, power and operating-cost comparison                                      |
| FS12 | Give the new technical contributor a clear handoff  | Complete, draft PR #9                   | Codex                              | Repository guide and README link; current source status, setup, bounded AI metering task, tests and PR checklist |

No assignment above sends a message to another chat or starts a scheduled job.

New contributor starting point: [technical handoff](https://github.com/arwyn6969/the-game/blob/main/docs/handoffs/new-developer.md), originally delivered in [PR #9](https://github.com/arwyn6969/the-game/pull/9) and merged through the consolidation. Recommended first task: server-side AI usage accounting and a testable per-attempt guard, with mocked responses and no paid calls. This is a bounded first part of FS06; durable shared spending enforcement remains separate. The friend has not yet claimed the task. Use the refreshed main guide for the current gateway and provider-pool interfaces.

## Episode record

| Episode | Working story                                  | Phase    | Evidence                                                                 |
| ------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| E01     | Building The Freeman Show and meeting the town | Planning | Launch plan saved; live game opened; no recording or publication created |

Suggested recording: `E01_S001_SH0001_capture_v001.mkv`. Final episode: `E01_master_v001.mp4`.

Record build revision, source/host difference, session date and timezone, game day/time, AI mode, interruptions, manual interventions, clip timecodes, participant publication agreement, actual API spend and backup location. Never put keys, personal saves or private participant records in Git.

## Evidence and limits

- Runtime audit: `review/astra-source`, branch `codex/trust-repair-followup`, HEAD observed as `1d5cda5`, with pre-existing uncommitted implementation changes. Those files were not edited by this workstream.
- Offline scheduling observation: seven game days produced 91 background jobs. This is not a live billing measurement. At 1× one game day nominally takes 24 real minutes before AI delays.
- The live `https://thegame.grok.me/` game loaded in the browser; publication of the reviewed source is not established by that check.
- The Pause control was verified active. Starting-screen evidence: paused pilot screen (local-only evidence).
- The saved Page was read back and its content verified. Its independent web preview requires sign-in, so that preview's visual layout was not verified.
- Cloud prices and calculations are in the linked plan. Its GBP conversion is an assumed £0.80/USD, not a live currency quote. Current Grok hosting charges remain unknown.
- This workspace has no existing production framework contract or validation script at its root. No episode was advanced into recording, approval or publication, and no content was deleted.
