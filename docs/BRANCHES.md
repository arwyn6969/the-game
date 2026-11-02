# Branch lifecycle

Updated 2 November 2026. Use `main` as the development baseline and [CURRENT_STATUS.md](CURRENT_STATUS.md) for the deployed revision.

## Consolidation

PRs #61, #62 and #63 merged in order with original ancestry preserved. The follow-on consolidation combines the café, personal-model controls, current documentation and CI coverage in one development baseline. Superseded receipt PRs are retired only after their source is preserved.

The [source manifest](review/consolidation-2026-11-02/source-manifest.json) records every pre-consolidation remote branch and recovery tag. Tags under `archive/2026-11-02/` preserve the exact former heads. Historical receipt branches should not stay in the active feature queue merely to keep their evidence accessible.

The root workspace's `review/consolidation-2026-11-02/source-before.bundle` preserves all original local refs and history. Existing worktree folders, ignored configuration and private evidence are retained. Historical local branches and folders are recovery material, not active assignments. No reset or forced update of another checkout is needed.

## Normal workflow

1. Fetch and inspect current `origin/main`; use a clean suitable checkout.
2. Create one short `codex/` branch for one bounded issue.
3. Keep one PR per implementation. Update its evidence in place.
4. Require passing checks on the proposed integration and resolve review blockers before merging.
5. Once incorporated, close/supersede duplicate PRs, preserve any unique history, and remove the obsolete remote branch with an expected-head lease.
6. Keep hosted publication and actual acceptance receipts in the same release task. Never infer a deployment from a source merge.

[Earlier branch records](BRANCHES_HISTORY_2026-11-02.md) remain available for recovery and chronology.
