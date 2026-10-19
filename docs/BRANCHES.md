# Branch and PR organization

Updated 19 October 2026. Review the candidate in this order; every child contains the current parent through ordinary merge commits. Main now includes the separately merged avatar-continuity plan at `093a4a6`; the gameplay/identity/wallet implementation remains in this stack.

| Order | Draft PR                                             | Branch                           | Review base                    | Scope                                                              |
| ----- | ---------------------------------------------------- | -------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| 1     | [#30](https://github.com/arwyn6969/the-game/pull/30) | `codex/game-quality-review`      | `main`                         | Current gameplay, library, save/economy fixes and caption controls |
| 2     | [#31](https://github.com/arwyn6969/the-game/pull/31) | `codex/stamp-identity-tooling`   | `codex/game-quality-review`    | Permanent world/resident IDs and restore/fork imports              |
| 3     | [#32](https://github.com/arwyn6969/the-game/pull/32) | `codex/stamp-wallet-selection`   | `codex/stamp-identity-tooling` | Verified read-only stamp appearance and optional heads             |
| 4     | [#33](https://github.com/arwyn6969/the-game/pull/33) | `codex/agent-receiving-registry` | `codex/stamp-wallet-selection` | Private ownership/receiving drafts, observations and Wonder Wallet |

PR #16 is closed as superseded by the reconciled eight-actor accounting in #30. Keep `codex/funded-project-accounts` at `53bd9ac` for experimental version-1 ledger recovery. PR #29 is closed because its caption change is incorporated into #30 with original ancestry; keep its branch until #30 merges. These closures do not claim either replacement is on main.

The already-merged `codex/product-consolidation` and `codex/character-social-release-evidence` branches were retired with expected-head leases after checking ancestry, protection and PR dependencies. Local main was fast-forwarded and the merged local consolidation ref removed. Every checkout folder and its ignored/private files was preserved. The [dated receipt](review/branch-organization-2026-10-19/README.md) records exact sources, validation, manifests and recovery.

## Working and merging

Use `product/` for the gameplay candidate and `stamp-identity-tooling/` for the complete wallet candidate. Follow-on work must choose the appropriate reviewed parent above; starting from main alone omits this entire stack. Older checkouts are preserved history, not the current development baseline.

If the user authorizes integration into main, merge #30, #31, #32 and #33 in order **using merge commits**. After each parent merges, retarget its child to main and inspect the new diff and checks before proceeding. Preserve descendant branches until their PRs are integrated. Squash/rebase merging would discard the ancestry on which these stacked diffs rely and requires a separately planned restack.

[AGENTS.md](../AGENTS.md) keeps feature branches/draft PRs as the handoff. No main merge or hosted publication is part of this organization pass. Human playtesting, physical-device accessibility, live operator checks, actual Wonder extension acceptance, receiving/account recovery and asset reconciliation remain gates for their respective release scopes. Public funding stays disabled and every eventual outgoing transfer requires owner approval.
