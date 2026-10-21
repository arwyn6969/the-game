# Branch alignment receipt — 21 October 2026

Arwyn approved the review recommendations in **Review GitHub branch strategy**. Implementation checkpoint `7ddda79a91784228586a6536ec9abd565175f79f` already contains the integrated gameplay, identities, wallets, player review, local server experiments, planning and latest qualified AI settings. This alignment changes guidance and repository governance; it does not deploy the game or modify runtime source.

## Outcome

- PR [#37](https://github.com/arwyn6969/the-game/pull/37) closed as incorporated through merged #38. Its original head is an ancestor of the implementation checkpoint. Original discussion, commits and the candidate tag remain accessible.
- **18 old remote branch references retired** in two atomic pushes: 13 incorporated refs first, followed by the five named refs after the user explicitly authorized their deletion. Every deletion used the exact expected-head lease in the [manifest](receipt.json). Four divergent original histories remain preserved by archive tags; the other 14 heads are reachable from main. No open PR depended on the deleted refs at deletion time.
- Four annotated `archive/2026-10-21/*` tags were published and independently read back to verify their peeled commit IDs before retirement. They preserve funded-account recovery, original avatar planning/roadmap and the original server prototype.
- The final five retired refs were `codex/funded-project-accounts`, `codex/offline-avatar-plan`, `codex/offline-avatar-roadmap`, `codex/server-foundation-20261021` and `codex/hosted-ai-rollout-20261021`. Automatic approval review initially declined the broader deletion; the user subsequently explicitly approved these exact five remote references while preserving tags and local folders. The old hosted source is contained in main and is separate from active local `codex/cloudflare-hosted-ai`.
- Main now requires a PR, an up-to-date GitHub Actions `verify` check (app ID 15368), and resolved review conversations. Rules apply to admins. Force pushes and deletion are blocked. Required approval count is zero to retain the solo maintainer's verified PR path. Merge commits remain allowed.
- Automatic deletion of merged PR head branches is enabled. Native auto-merge support was also enabled for the authorized documentation PR #40 to integrate after required verification, without an open chat waiting for a GitHub runner.
- `product/` was restored to main with a fast-forward only after five original planning files were hash-verified, copied and stashed. No source file was discarded.
- All historical checkout folders, ignored/private files and the active Cloudflare checkout remain preserved. Separate historical clones retain original/adapted commits; none was revived as a merge candidate.

## Recoverable sources

The full shared-product Git bundle is local and ignored at `github-sync-20261021/artifacts/branch-alignment-2026-10-21/pre-cleanup.bundle` (relative to the studio workspace), SHA-256 `672518562b7ee1f7af88ac863647d1e6bedf5cb30e661c4ca21ec0938fa26a69`. `git bundle verify` passed. It contains committed refs before remote retirement; it does not contain private files or working changes.

The four remote archive tags and original heads are listed in [BRANCHES.md](../../BRANCHES.md) and the exact-head manifest. Incorporated refs are recoverable from main ancestry. The existing tag `candidate/2026-10-21-ai-quality` retains `0bd3e3b`; its browser/adapter evidence remains tied to that old pin.

Original planning copies are local at `product/artifacts/branch-alignment-2026-10-21/original-planning/`. Each SHA-256 matches the original-source entry already committed in [the synchronization manifest](../github-sync-2026-10-21-sources.json). Stash `59a34104a2e55edac836b491b8e004c12127cb48` is additionally protected by local ref `refs/archive/2026-10-21/product-original-planning`. Recover originals into a separate checkout or copy from the backup; applying the old stash onto current main can conflict with the later formatted documents. These local snapshots were not pushed.

## Current workflow

[CURRENT_STATUS.md](../../CURRENT_STATUS.md) is the single live entry point. README, AGENTS, branch/collaboration guidance and the workspace guide point there. The old delivery board, source-synchronization record and consolidation records are clearly historical. Later narrow live AI successes are distinguished from open sustained/human/hosted acceptance. No new task, service purchase, production migration, secret change, funding activation or Freeman Show stage is authorized by this receipt.
