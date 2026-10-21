# Branch lifecycle

[CURRENT_STATUS.md](CURRENT_STATUS.md) is the single live record of source, deployed-version evidence and active ownership. `main` is the shared development baseline. The 21 October alignment retired incorporated remote refs and preserved recovery history; the [receipt](review/branch-alignment-2026-10-21/README.md) and [exact-head manifest](review/branch-alignment-2026-10-21/receipt.json) record the outcome.

## Start, review and finish

1. Fetch current main. Use one short-lived `codex/` branch and an isolated checkout for one bounded task; record its named owner, base/head, write boundary, PR and next evidence in CURRENT_STATUS. Existing historical checkout names are not assignments. There is no permanent `develop` branch.
2. Open a PR against main. Stack only for a named dependency; record the parent and merge order. Avoid continuing implementation on already-merged branches. Preserve the user's changes; do not reset or force-push another owner's work.
3. Run checks appropriate to the change. Main requires the GitHub Actions `verify` check against the current base, a PR and resolved review conversations. Protection applies to admins; force pushes and deletion are blocked. The repository does not require another person's approval count, so a solo maintainer can still integrate a verified PR.
4. Integrate only within the user's authorization. Merge commits remain appropriate for preserving a dependent stack's ancestry; do not merge obsolete implementations simply to remove an ahead/behind count. Source integration and hosted publication are separate decisions.
5. Update CURRENT_STATUS after integration. Merged PR head branches are deleted automatically. Before manual retirement, check exact heads, ancestry/content, open PR head/base dependencies and active ownership. Use explicit expected-head leases. Preserve divergent recovery sources with verified archive tags and a dated manifest; a Git bundle preserves committed refs but does not preserve ignored/private files or working changes.
6. Keep local folders and private artifacts separate from remote retirement. `product/` is the primary checkout on main. Other feature/review folders remain preservation copies unless CURRENT_STATUS names an active owner. Do not delete or move them to tidy the root. Original planning files were copied and stashed before product was fast-forwarded; the alignment receipt records recovery paths.

## Preserved checkpoints

The candidate tag `candidate/2026-10-21-ai-quality` retains source `0bd3e3b` for the original browser/adapter evidence. New work starts from current main, not that older test pin.

| Archive tag                                     | Original source | Purpose                                                                                                                                   |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `archive/2026-10-21/funded-project-accounts`    | `53bd9ac`       | Experimental version-1 ledger recovery; three original commits are outside main ancestry. Do not merge this old implementation wholesale. |
| `archive/2026-10-21/offline-avatar-plan`        | `db17ee8`       | Original planning source represented by the later avatar roadmap.                                                                         |
| `archive/2026-10-21/offline-avatar-roadmap`     | `217c354`       | Original PR #34 source; squash-merged and subsequently revised on main.                                                                   |
| `archive/2026-10-21/server-foundation-20261021` | `07cdb53`       | Original prototype/contract commits; their patches are represented in the integrated experiments.                                         |

The alignment receipt distinguishes retired refs from retained preservation refs. Retaining a branch or tag does not make it an active merge candidate. Restore only the specifically needed recovery source after checking that a proposed branch name has not been reused.

## 19 October integration receipt

The reviewed gameplay → identity → stamp appearance → private-wallet stack merged into main in order with merge commits after explicit user approval. Implementation checkpoint `426b00b` includes the avatar-continuity plan previously squash-merged at `093a4a6`.

| Order | Merged PR                                            | Source branch                    | Merge commit                               | Scope                                                              |
| ----- | ---------------------------------------------------- | -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| 1     | [#30](https://github.com/arwyn6969/the-game/pull/30) | `codex/game-quality-review`      | `6dbcef88dfaa4627ac437933a777e288d896680e` | Current gameplay, library, save/economy fixes and caption controls |
| 2     | [#31](https://github.com/arwyn6969/the-game/pull/31) | `codex/stamp-identity-tooling`   | `b1b8afc03ecaee475cfa73057f1ed7c47996a896` | Permanent world/resident IDs and restore/fork imports              |
| 3     | [#32](https://github.com/arwyn6969/the-game/pull/32) | `codex/stamp-wallet-selection`   | `a43b1cdb08b841d4289546e932c1155a85e9a9ae` | Verified read-only stamp appearance and optional heads             |
| 4     | [#33](https://github.com/arwyn6969/the-game/pull/33) | `codex/agent-receiving-registry` | `426b00bdadd656b8f3d2ae9abb61c6e45f1e5170` | Private ownership/receiving drafts, observations and Wonder Wallet |

Implementation integration checkpoint `426b00bdadd656b8f3d2ae9abb61c6e45f1e5170` has the same tree as verified stack head `c84f69ed851b57843aa47387ab084572d3b1d20c`. The [main CI run](https://github.com/arwyn6969/the-game/actions/runs/39254628213) records verification of that checkpoint; consult its result alongside the branch checks and earlier local receipt.

PR #16 closed as superseded by the reconciled eight-actor accounting through #30; its original implementation remains under the archive tag above. PR #29 closed because its caption change was incorporated with original ancestry. [The dated organization receipt](review/branch-organization-2026-10-19/README.md) retains the exact sources, checks, earlier bundle and integration evidence. Its earlier preservation/no-cleanup statements describe that session and are superseded by the 21 October alignment.

Human/accessibility, hosted provider/operator, wallet/recovery and asset acceptance remain scoped gates described in CURRENT_STATUS. Public funding remains disabled; every eventual outgoing transfer requires owner approval.
