# Branch and PR organization

Updated 19 October 2026. The reviewed gameplay → identity → stamp appearance → private-wallet stack is merged into `main` in order, using merge commits after explicit user approval. New work starts from current `origin/main`. The implementation integration checkpoint is `426b00b`, including the avatar-continuity plan previously merged at `093a4a6`.

| Order | Merged PR                                             | Source branch                    | Merge commit                                 | Scope                                                              |
| ----- | ----------------------------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| 1     | [#30](https://github.com/arwyn6969/the-game/pull/30) | `codex/game-quality-review`      | `6dbcef88dfaa4627ac437933a777e288d896680e` | Current gameplay, library, save/economy fixes and caption controls |
| 2     | [#31](https://github.com/arwyn6969/the-game/pull/31) | `codex/stamp-identity-tooling`   | `b1b8afc03ecaee475cfa73057f1ed7c47996a896` | Permanent world/resident IDs and restore/fork imports              |
| 3     | [#32](https://github.com/arwyn6969/the-game/pull/32) | `codex/stamp-wallet-selection`   | `a43b1cdb08b841d4289546e932c1155a85e9a9ae` | Verified read-only stamp appearance and optional heads             |
| 4     | [#33](https://github.com/arwyn6969/the-game/pull/33) | `codex/agent-receiving-registry` | `426b00bdadd656b8f3d2ae9abb61c6e45f1e5170` | Private ownership/receiving drafts, observations and Wonder Wallet |

Implementation integration checkpoint `426b00bdadd656b8f3d2ae9abb61c6e45f1e5170` has the same tree as verified stack head `c84f69ed851b57843aa47387ab084572d3b1d20c`. The [main CI run](https://github.com/arwyn6969/the-game/actions/runs/39254628213) records verification of that checkpoint; consult its result alongside the branch checks and earlier local receipt.

PR #16 is closed as superseded by the reconciled eight-actor accounting now on main through #30. Keep `codex/funded-project-accounts` at `53bd9ac` for experimental version-1 ledger recovery. PR #29 is closed because its caption change is incorporated into #30 with original ancestry. Its source ref, all four merged source refs and their checkouts remain preserved; this integration performs no further cleanup.

The already-merged `codex/product-consolidation` and `codex/character-social-release-evidence` branches were retired with expected-head leases after checking ancestry, protection and PR dependencies. Local main was fast-forwarded and the merged local consolidation ref removed. Every checkout folder and its ignored/private files was preserved. The [dated receipt](review/branch-organization-2026-10-19/README.md) records exact sources, validation, manifests and recovery.

## New work and retained sources

`product/` is clean on merged main. Create follow-on feature branches from current `origin/main` in an appropriate isolated checkout; the earlier stacked branches are retained source history, not required parents for new work. Keep source/recovery refs, checkout folders and ignored/private files until a separately authorized cleanup.

Integration is complete: #30, #31, #32 and #33 were merged in order with source ancestry retained. Each child was retargeted to main and its diff/checks inspected after its parent merged. The [integration checkpoint](review/branch-organization-2026-10-19/README.md#integration-checkpoint) supplements the dated organization receipt; its historical draft/branch statements describe the earlier pass.

[AGENTS.md](../AGENTS.md) keeps feature branches/draft PRs as the handoff for new work. The user separately approved this main integration; hosted publication remains pending. Human playtesting, physical-device accessibility, live provider/operator checks, actual Wonder extension acceptance, receiving/account recovery and asset reconciliation remain gates for their respective release scopes. Public funding stays disabled and every eventual outgoing transfer requires owner approval.
