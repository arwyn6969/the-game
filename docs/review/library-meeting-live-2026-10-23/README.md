# One live Arwyn meeting — 23 October 2026

**Result: hearing remains inconclusive.** The user completed normal Google sign-in and authorized the prepared live meeting with Arwyn proposed as facilitator, under unchanged free AI limits. The normal live UI made four requests: three valid invitation choices, then an invalid attention response. The game paused before any speech. No retry, restart, alternate scheduler, authored response or replacement NPC choice followed.

| Request | Normal scheduled resident | Actual result |
| --- | --- | --- |
| 1 | Arwyn | Accepted the facilitator invitation and arrived; attention stayed off. |
| 2 | Northern | Declined; attention stayed off. |
| 3 | Sub | Accepted and arrived; attention stayed off. |
| 4 | Arwyn | Provider HTTP 200, `invalid` decision outcome; no attention choice applied. Meeting paused. |

The actor sequence was independently derived using `nextDiscussionJob` from the actual pre-request exports. There was no legal-floor probe or forced acceptance/listening. The ordinary live path did not retain the rejected raw output, so its exact invalid syntax is not diagnosed here. An HTTP 200 invalid decision is not described as a provider outage.

## Live source and setup

Target: <https://www.arwyn.party/thegame/>. Help showed **Build `2b2b8a4dbb7a`**, the published runtime from the [release receipt](../library-meeting-release-2026-10-23/README.md). The local audit/preparation source is main `f7d5ae561fd969a857a5a917a1c8bc2469bfeae8`; relevant runtime files byte-match the deployed source. No new deployment, production configuration change, auth bypass or session-token copying occurred.

The in-app browser initially had no town. A fresh test town was created there, separate from any pre-existing Chrome town. The user personally completed normal sign-in. No private town registration or wallet action was performed.

The live controls default to Northern, so the prepared file used the existing core API to propose Arwyn, then three real player invitation commands. All NPCs remained pending/off with zero AI usage before import. Arwyn, Northern, Sub, the player and nearby nonmember Baba were initially staged in the library. This qualifies neither travel nor ordinary invitation discovery.

The original prepared file mistakenly encoded `paused: false`. Its first import ran to 07:12 with local dialogue selected and zero AI calls. That export and original file were preserved. A derived file changed only `town.paused` to `true`; it was re-imported before request 1. The actual test baseline was independently exported from the live UI at day 1, 07:00. Every later comparison uses that real post-correction export. The test then remained paused with positions unchanged.

## Usage and unchanged limits

- **4 of at most 12 authorized requests**, with no unknown attempts or token samples.
- **4,927 tokens:** 3 valid responses used 3,687; the rejected response used 1,240.
- **12.141 seconds** of client-observed AI wait.
- **$0 recorded charge**, four settled budget rows and four settled provider rows; no outstanding reservation.
- Recorded UI start gaps were **112.394, 52.975 and 49.883 seconds**, all above the required 31-second spacing.

Read-only preflight verified the exact model's zero prompt/completion prices, available provider headroom, one normally signed-in account match and available shared/user headroom. Read-only postflight confirmed the provider's free counter rose by exactly four and monetary usage remained zero. SQL attribution uses the fixed request-time window, rather than a moving "last hour" filter after the audit delay.

The existing **24 shared calls/day, 12/player/day, 3/player/minute, one global request**, provider limits, interactive reserves, zero monetary ceiling and no-paid-fallback configuration were unchanged. All requests used the existing hosted `act` route; no generation was made directly through an operator provider endpoint. No remaining calls or automatic continuation are queued.

## Actual-state audit and limits

The [independent audit](audit-summary.json) checks each actual before/after export pair, then the actual baseline/final/reloaded exports. The [ledger summary](ledger-summary.json) contains anonymized production aggregates for the same request window.

All eight residents' received-turn projections are empty. Every NPC and the player remains in attention mode `off`. Resident memories, finances, permanent identities, positions and paused game time stayed unchanged from the corrected live baseline. The final save has zero utterances and no pending request. Its actual downloaded reload is byte-identical to the final export, with no resend. The live browser remains on the paused meeting.

Because nobody spoke, **positive delivery, exclusion during actual speech, late joining and post-stop hearing are unqualified**. Empty memories alone cannot establish those behaviors. The previous local targeted probe retains its separate, narrower evidence; it is not substituted for this live result. No actual outgoing prompt capture was obtained; knowledge projections were checked from the exported state using the exact core helper.

Private screenshots, original/corrected fixtures, all actual town exports, execution timestamps, preparation/audit scripts and original per-step audits remain under ignored `artifacts/library-meeting-live-20261023-once/`. Only sanitized summaries and hashes are committed. No production credentials, browser session data or raw resident profiles are included.
