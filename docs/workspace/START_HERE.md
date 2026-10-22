# THE GAME workspace guide

[Current project status](../CURRENT_STATUS.md) is the shared entry point for main, the preserved candidate, deployed-version evidence and active ownership. Use [AGENTS.md](../../AGENTS.md), the [branch lifecycle](../BRANCHES.md) and [collaboration workflow](../COLLABORATION.md) before starting new work.

In the local studio workspace, `product/` is the primary checkout on main. The active hosting owner **Diagnose live AI replies** works separately in `hosted-ai-rollout/` on `codex/cloudflare-hosted-ai`. Historical feature/review folders retain their histories, ignored evidence and private files; do not delete or move them to tidy the root. The workspace root's empty repository is a wrapper, not the product source repository.

The [alignment receipt](../review/branch-alignment-2026-10-21/README.md) records retired remote refs, archive tags, primary-checkout recovery and repository protections. The [delivery-round receipt](../DELIVERY_TRACKER.md), [synchronization receipt](../GITHUB_SYNC.md) and [original document hash manifest](../review/github-sync-2026-10-21-sources.json) preserve earlier checkpoints. Source integration is separate from hosted publication.

Plans: [production plan](../PRODUCTION_PLAN.md), [roadmap](../ROADMAP.md), [agent-created world](../implementation/agent-created-world.md). [The Freeman Show tracker](00_Master_Production_Tracker.md) remains a separate historical production record; no show stage changed in this alignment.
