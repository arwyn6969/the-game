# Current project status

Updated 22 October 2026 for the manuscript prototype assignment. This is the live entry point for the development baseline, tested candidates, deployed-version evidence and active ownership. Dated delivery boards, reviews and handoffs record their stated source and scope. Update this file in the same PR when work changes owner, completes, merges or deploys; a historical checkout is not a new assignment.

## Manuscript prototype — 22 October

Arwyn authorized the first [physical manuscript slice](design/physical-interaction-foundation.md) after a source audit and compute review. The current chat coordinates implementation on `codex/northern-community-evening-20261022` in `community-evening-plan/`. Current main was checked through GitHub at `dab257b` (documentation alignment); that exact committed revision is integrated locally without copying the hosting owner's working files. The shared additive item/action type contract is `dd50d26`, explicitly stacked over the planning commits and runtime checkpoint `7ddda79`.

| Owner | Checkout / branch | Scope and current state | Next evidence |
| --- | --- | --- | --- |
| Core subagent `identity_economy_inventory` | `manuscript-core/`, `codex/manuscript-core-20261022` | Implementing one communal manuscript, atomic validated custody, bounded bring intentions, existing navigation integration, pure save/recovery validation and focused regressions. | Scoped commit and `handoffs/manuscript-core.md`; save/reload, collision/commitment and duplicate/stale action evidence. |
| UI subagent `gameplay_inventory` | `manuscript-ui/`, `codex/manuscript-ui-20261022` | Implementing real ground/held/read art, all-direction walking attachments, accessible inventory/inspection and bounded trial UI. Owns TownApp integration. | Scoped commit and `handoffs/manuscript-ui.md`; local desktop/phone browser evidence with synthetic transport. |
| AI subagent `platform_inventory` | `manuscript-ai/`, `codex/manuscript-ai-20261022` | Implementing optional `act` routing/parser/envelope, compatibility-preserving budget migration source and call/usage diagnostics. Existing four routes remain valid. | Scoped commit and `handoffs/manuscript-ai.md`; parser, config, budget and unavailable-service regressions. |
| Current chat / integration | `community-evening-plan/`, `codex/northern-community-evening-20261022` | Frozen contract, isolated lane coordination, current-main alignment, independent source review and combined validation. | Integrate lane commits, run relevant/full checks and local UI journeys, leave reviewable source and honest remaining gates. |

No live provider requests, production migration, publication, spending-limit changes or hosting-secret edits are part of this prototype run. Real-provider compute measurements remain a separate bounded qualification; synthetic tests can establish mechanics and call cadence only. The new activity never invents local NPC decisions or speech when AI is unavailable. This scope does not implement the whole park performance or continuous shared-server life. Existing authored/offline behavior outside the opt-in prototype remains a separate release-wide migration.

The source/deployment and hosting-owner table below retains its 21 October observation. The later hosting handoff in the owner's checkout reports Cloudflare publication and Google login, with post-quota-reset AI acceptance still open; this implementation does not retest or supersede that receipt.

## Source and deployment

| Item                     | Recorded state                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development baseline     | Current `origin/main`. Implementation checkpoint `7ddda79a91784228586a6536ec9abd565175f79f` includes merged PRs [#38](https://github.com/arwyn6969/the-game/pull/38) and [#39](https://github.com/arwyn6969/the-game/pull/39). Later documentation commits do not change that implementation. |
| Verification             | The implementation checkpoint's [main Verify run](https://github.com/arwyn6969/the-game/actions/runs/39604362478) passed. Every new PR must pass its own `verify` check before merging.                                                                                                       |
| Preserved test candidate | Tag `candidate/2026-10-21-ai-quality`, source `0bd3e3b1401ebf6b460d9d71f287c4b474b2452b`. This is the historical browser/adapter pin; later AI changes are on main.                                                                                                                           |
| Existing deployed game   | <https://thegame.grok.me/>. The exact current deployed source was not reverified by this alignment pass; a main merge is not deployment evidence.                                                                                                                                             |
| Hosting work             | Cloudflare/Neon work for `www.arwyn.party/thegame` is in progress with the existing owner below. No completed deployment or hosted acceptance is claimed here.                                                                                                                                |
| Primary local checkout   | `product/` on `main`; fast-forward from current `origin/main` before starting a new feature branch in a separate checkout. Original planning files are preserved locally as recorded in the [alignment receipt](review/branch-alignment-2026-10-21/receipt.json).                             |

## Active work

| Owner                                                                     | Checkout / branch                                  | Baseline and action                                                                                                                           | PR / next evidence                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat **Diagnose live AI replies**, `01a15e71-f3c1-7ef1-ae85-a95b313f5ff4` | `hosted-ai-rollout/`, `codex/cloudflare-hosted-ai` | Started from `7ddda79`; hosting, standalone auth, database and path support are in progress. The checkout has owner-held uncommitted changes. | No PR observed at this checkpoint. Owner publishes the bounded source diff, configures the branch's own upstream, and records exact hosted source plus auth, AI, accounting, save/recovery and rollback evidence. Preserve its checkout and private configuration. |

The earlier player-acceptance and server-adapter round is complete within its bounded local scope. Its next packet is queued, not dispatched. The [delivery-round receipt](DELIVERY_TRACKER.md) preserves the assignments and observations as they stood. This status file does not message, wake or assign another chat.

## Evidence and remaining gates

The preserved candidate has [browser and source evidence](review/candidate-2026-10-21.json). Later main includes [successful narrow planning/reflection checks](review/ai-job-fixes-2026-10-21.md#timeout-recovery-and-completed-live-checks), [eight actual-game reply/interruption/save checks](review/ai-game-session-2026-10-21.md) and [small synthetic NVIDIA backup qualification](review/nvidia-ultra-backup-2026-10-21.md). Each receipt retains its source revision and limits; the older delivery board's two-timeout observation is historical.

Five actual human sessions, physical-device/assistive-technology acceptance, sustained/concurrent/background AI and the complete provider/job matrix remain open. NVIDIA Ultra actual-game UI acceptance remains open. Hosted auth, durable accounting, limits, deployed source, billing, recovery and rollback require operator evidence.

The local server adapter remains an experiment. Production storage, authentication/networking, navigation-state parity and stale-job policy are separate work. Actual Wonder extension, receiving/account recovery, retained-key restoration and asset reconciliation remain gates for their wallet scopes. Public funding remains disabled; outgoing transfers require owner approval.

## Branch lifecycle and history

Use one named owner, one bounded task, one isolated checkout and one short-lived `codex/` branch from current main. Record branch/PR, base/head, current action, blockers and the next acceptance evidence here. Explicitly record any stacked dependency. There is no permanent `develop` branch. See the [branch lifecycle](BRANCHES.md) and [collaboration rules](COLLABORATION.md).

The [21 October alignment receipt](review/branch-alignment-2026-10-21/README.md) records retired refs, archive tags, preserved originals and the repository protections. Existing feature/review folders are preservation copies unless listed as active above. Do not restart their historical prompts or delete their ignored/private files to tidy the workspace.

Plans and history: [production plan](PRODUCTION_PLAN.md), [roadmap](ROADMAP.md), [completed delivery round](DELIVERY_TRACKER.md), [GitHub synchronization receipt](GITHUB_SYNC.md), [19 October integration receipt](review/branch-organization-2026-10-19/README.md), [12 October consolidation](CONSOLIDATION.md).
