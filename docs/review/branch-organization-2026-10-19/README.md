# Branch organization receipt — 19 October 2026

The original organization pass below is historical. The [later integration checkpoint](#integration-checkpoint) supersedes its draft status and records the completed main merges.

The review chain is **#30 gameplay → #31 identities → #32 stamp appearance → #33 private wallets/Wonder**. All dependencies have been refreshed using ordinary merges. During verification, separate PR #34 added the avatar-continuity plan to main at `093a4a6`. That documentation is now merged through this feature stack; this organization pass did not merge gameplay/wallet code into main or publish the game. The [current branch guide](../../BRANCHES.md) explains the bases and eventual merge procedure.

## Source and integration

The [source manifest](organization.json) pins each branch before the final documentation commit; GitHub's PR heads and Checks identify the delivery revisions. The original [remote/PR inventory](before.json) and [13-checkout inventory](local-before.json) preserve the starting state.

The wallet chain forked from gameplay `80ee299` and lacked 11 later gameplay commits. Merges preserve those work, reading, save, menu and financial fixes alongside permanent IDs, opt-in appearance, private wallet ownership, observations and nearest-neighbour heads. PR #29's original `0f28226` is retained in gameplay ancestry through merge `babd718`. Caption Close/Escape preserve import-dialog priority and return focus to the town. The combined identity review also found and fixed an inaccessible restore/fork radio group inside the newer import focus trap; real Tab/arrow/reverse-wrap browser checks cover it.

Fresh verification exposed a disposable-fixture bug: Node's ECDH scalar can omit leading zeros, but compressed WIF requires 32 bytes. Four test/browser helpers now pad to 32 bytes. A deterministic scalar-one regression verifies the real server accepts the resulting proof and rejects another address. The two shared helpers/regression are also on PR #32. Production signature validation is unchanged. CI additionally caught a browser shortcut racing import focus restoration; the harness now waits for the queued frames, focuses the canvas and asserts focus before Enter, preserving its dialogue assertions.

The runtime and build inputs are byte-identical to tested source `039faf4ffb23406163b145ae9452bac3be32b6a6`; later source commits update that browser harness and record integration ancestry. The final documentation commit does not alter runtime behavior. Wallet adapters/panels, opt-in flags, private services and media normalization are unchanged from `ea21643`. Independent integration review found no lost wallet scope, privacy, rendering or gameplay protections.

## Verification

Node 24; a fresh locked offline install added 453 packages. **882 tests pass: 827 script tests and 55 app/auth tests**, zero failures/skips. Typecheck and lint pass, with the existing single auth unused-disable warning. Day-30 diagnostics have no world-audit issues and preserve all six measured import/export cases. Normal and auth-enabled production builds pass with empty database/provider credentials and migration explicitly skipped. The running dev server and build wrapper agree that sign-in is enabled.

The browser reports below use isolated synthetic towns, genuine disposable signatures/SQL/account sessions and fixture extension/indexer responses. They do not attach to a personal wallet or call a paid model. GitHub repeats the full checks on the published branch heads, including both wallet variants; exact CI receipts are linked in the PR descriptions.

| Gate | Desktop and phone evidence |
| --- | --- |
| Gameplay and identity imports | [Journeys](gameplay.json), [UI edge cases](ui-edges.json), [interruptions](ui-interruptions.json), [reading outcomes](readings.json) |
| Delayed AI and privacy | [Report](delayed-ai.json); zero real provider calls |
| Wonder stamp appearance | [Report](stamps.json); 17 checks per viewport |
| Wonder private wallets | [Report](private-wallets.json); 22 desktop / 18 phone checks |

Both wallet variants are also exercised by the final PR #33 CI workflow. The local integration reports above use Wonder; the earlier dated receipts retain their Leather checks.

The initial local full test run hit the now-fixed short-scalar fixture failure. The first auth probe had no dev server to inspect; the explicit comparison against the isolated dev server passed. The first identity CI browser run exposed the conversation focus race described above. Duplicate runs on the next heads then exposed a second test race: cancelling import could restore focus after the separate caption Escape test had begun. Both CI artifacts identify that same caption-focus assertion. The harness now waits for Import focus before starting the caption case; its focused desktop/phone rerun passes with every assertion retained ([report](caption-focus.json)). These failed attempts are not counted as successful verification.

## Closed drafts and retired refs

- PR #16 is closed as superseded by the reconciled eight-actor implementation in #30. Keep `codex/funded-project-accounts` at `53bd9ac`, including its three ancestry-unique commits, for experimental version-1 ledger recovery. It is not an independent merge candidate.
- PR #29 is closed as incorporated into #30, retaining its source branch until the candidate merges. Neither closure means the replacement has reached main.
- `codex/product-consolidation` (`1461148`) and `codex/character-social-release-evidence` (`940cd70`) were already reachable from main, unprotected and unused by open PR heads/bases. One atomic deletion used an expected-head lease for each ref. The merged local consolidation ref was removed and local main fast-forwarded, first to `4a39cdf` and then to the separately updated main `093a4a6`.

The verified complete Git bundle is stored locally at `artifacts/branch-organization-2026-10-19/pre-organization.bundle` (SHA-256 `036bf2b1283dcd880c1b2422a80d7dc30769e367bb4b2ec8fe08af14eee47fc4`). It is intentionally ignored, preserves tracked history/refs, and does not include private files or uncommitted work. Deleted remote heads also remain reachable from main; recreate a ref only after checking that its name has not since been reused.

## Preserved parallel and historical work

All 13 initially audited checkouts were clean, with no merges or stashes. Every folder and ignored/private file was preserved. The old `character-social-ui/` conflict is no longer present; the three coherence folders are separate clones, not intelligence worktrees. Their unique/adapted source histories remain intact. The wrapper is an unborn workspace repository, not the product repository; its untracked material and non-Git review exports remain untouched.

Separate work created `codex/offline-avatar-plan` and `codex/offline-avatar-roadmap` during this pass. PR #34 merged the latter plan into main while checks were running. Its complete planning document and the current implemented gameplay roadmap are both preserved in the feature stack. The local planning source and merged roadmap source refs/checkouts remain intact. No other task was messaged or repurposed.

All four implementation PRs remain drafts. Human playtesting/accessibility and hosted operator acceptance remain release evidence. Actual Wonder extension signing, receiving/account/key/server recovery, asset classification and protected-output reconciliation remain gates before public funding. Funding remains unpublished; outgoing transfers, trading and server PvP remain later packets, with owner approval required for every outgoing transfer.

## Integration checkpoint

Later on 19 October 2026, the user explicitly approved main integration. PRs [#30](https://github.com/arwyn6969/the-game/pull/30), [#31](https://github.com/arwyn6969/the-game/pull/31), [#32](https://github.com/arwyn6969/the-game/pull/32) and [#33](https://github.com/arwyn6969/the-game/pull/33) merged in that order with merge commits, with each child retargeted to main and its diff/checks inspected after the parent merged. The [branch record](../../BRANCHES.md) pins all four merge hashes. Implementation integration checkpoint `426b00bdadd656b8f3d2ae9abb61c6e45f1e5170` has tree `39cc276dee5c8b6e9834826ebcdab2531babeea8`, identical to verified stack head `c84f69ed851b57843aa47387ab084572d3b1d20c`. Source review found no blocker. A Node 24 focused run passed 153 tests with zero failures, cancellations or skips: `node --test scripts/agent-auth.test.mjs scripts/agent-identity-policy.test.mjs scripts/agent-registry.test.mjs scripts/agent-registry-store.test.mjs scripts/agent-esplora-observer.test.mjs scripts/agent-counterparty-observer.test.mjs scripts/agent-observation-store.test.mjs scripts/agent-observation-service.test.mjs scripts/wonder-wallet-client.test.mjs`. That result is recorded in review-session output only; no separate raw log was saved. The [fresh main CI run](https://github.com/arwyn6969/the-game/actions/runs/39254628213) records verification of that checkpoint; consult the linked workflow result for its outcome.

`product/` is clean on main; new work starts from current `origin/main` in a feature branch. Source/recovery refs and all checkouts remain preserved. The draft and branch statements above retain the earlier organization-pass status. Main integration does not satisfy human playtesting/accessibility, live provider/operator acceptance, hosted publication, actual Wonder extension signing, receiving/account/key/server recovery, asset classification or protected-output reconciliation. Those gates remain pending. Public funding stays unpublished (`fundingPublished: false`), and every eventual outgoing transfer still requires owner approval.
