# THE GAME workspace

**GitHub snapshot — 21 October:** this preserves the local record and its dated observations. Repository links are normalized for this combined branch; private runtime evidence remains local. See the [synchronization record](../GITHUB_SYNC.md) for current source coverage and publication status.

**Current work and owners:** use the [active delivery tracker](../DELIVERY_TRACKER.md). It records Kevin's existing agent, the parallel player-acceptance and server-foundation lanes, blockers, evidence and integration order. The coordinator in **Review project scope and priorities** maintains this board.

For the route to a live server world, start with the [21 October production plan](../PRODUCTION_PLAN.md): release scopes, provisional engineering ranges, dependencies and completion evidence. The [agent-created-world notes](../implementation/agent-created-world.md) add future buildings, possible land buying/selling, sandboxed agent apps and external games such as chessbots.ai. The planning edits are on local branch `codex/production-roadmap-agent-world` in `product/`; the runtime baseline is unchanged.

For the 20 October review of what works, what remains to check and how to recover the AI provider flow, start with [the readiness checklist and recovery plan](01_Game_Readiness_Checklist.md). It distinguishes current main, the open playtest drafts, historical live AI success and the latest local failures.

The web game is `arwyn6969/the-game`. The consolidated product lives in **`product/`**, based on **`main`**. [PR #19](https://github.com/arwyn6969/the-game/pull/19) merged the tested source; the 17 incorporated remote branches are retired.

Start with [the game README](../../README.md) and [the consolidation record](../CONSOLIDATION.md). Use Node 24, then `npm ci` and `npm run dev` from `product/`. The live site remains a separate published build.

On 19 October 2026, [PR #30](https://github.com/arwyn6969/the-game/pull/30) → [#31](https://github.com/arwyn6969/the-game/pull/31) → [#32](https://github.com/arwyn6969/the-game/pull/32) → [#33](https://github.com/arwyn6969/the-game/pull/33) merged in order using merge commits. Implementation integration checkpoint `426b00bd` contains the gameplay/library and economy work, permanent identities, read-only stamp appearances, and private agent wallet/Wonder tooling. That checkpoint's source tree matches reviewed candidate `c84f69ed`. PRs #16 and #29 are closed as superseded/incorporated; their recovery sources remain preserved. Start new work from current main.

The [branch guide](../BRANCHES.md) and [dated verification receipt](../review/branch-organization-2026-10-19/README.md) record source and acceptance gates. Human playtesting, physical-device accessibility, genuine provider/extension acceptance, operator configuration and wallet/asset recovery checks remain open. Public funding stays disabled, and hosted publication needs its separate release instruction.

Other folders are preserved feature/review checkouts, including the histories in `character-social-ui/` and `intelligence-ui/`. Do not delete or move those directories to tidy the root.

[The Freeman Show tracker](00_Master_Production_Tracker.md) records the separate production workstream. No episode or hosted release was advanced by this source integration.
