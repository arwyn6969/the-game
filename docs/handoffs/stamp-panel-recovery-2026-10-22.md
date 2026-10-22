# Stamp appearance recovery — 22 October 2026

Owner: chat **Fix stamp profile image freeze**, `01a16380-1daf-71a0-9fb1-08d0c512d7cc`.
Branch: `codex/stamp-panel-recovery`, stacked on hosting PR #41 at `7156634`.

The live Chrome stamp panel became greyed out after using Leather. Its one-minute polling callback retained the initial Wonder wallet value. A refresh then acquired the global busy lock with the wrong wallet ID; both its response and its cleanup were rejected as stale, leaving editing disabled. Even a correctly identified background refresh unnecessarily locked mode, crop, stamp selection and Apply while waiting for remote holdings.

Operations now capture the current wallet ref. Background renewals leave controls and draft/status intact; an explicit action aborts and supersedes a pending background read, whose late result cannot replace the new appearance. Foreground server requests recover after 30 seconds, and wallet verification has a two-minute deadline. Cancellation reaches the server-function fetch signal and the existing wallet adapter. An expired proof still disables editing and explicitly asks for a new verification. No save-schema, authentication, asset ownership or wallet signing checks changed.

Validation:

- Node 24: 951 application tests passed (896 script tests plus 55 TypeScript tests), including six new operation-lifecycle regressions. The first sandboxed run hit loopback-listener denials; the complete rerun with listener permission passed.
- `typecheck` passed; lint passed with the inherited unused auth-directive warning. `test:town` passed 349 tests; `diagnose:town` completed as an observation report.
- Both Node and Cloudflare builds passed without a production database connection; the Node migration step explicitly skipped.
- Chrome used the real component with local synthetic wallet/service fixtures. Selecting Leather and several completed periodic renewals kept controls enabled. During a held refresh, mode/zoom/position edits applied successfully; releasing the stale response retained the new portrait/crop. A held Apply recovered after the actual 30-second deadline, retained the draft, and ignored the late response. Phone selection of a different stamp and Apply succeeded. A background proof expiry displayed the reconnect instruction.
- Desktop 1280×800 and phone 390×844 were exercised. In a separate local synthetic full-game town, movement changed tile 26,22 to 27,22, destination travel reached Hobbs Cafe, conversation entry worked, and pause controls responded. Browser export/reload verification was interrupted by the browser download-event timeout; this pass does not claim import/export acceptance.
- Browser regressions were added to the existing disposable-context stamp suite for both wallets and viewports; their execution is tracked separately by the PR's CI result.

Runtime `f48b38ddaead` is deployed on existing Worker `the-game-production`, version `44dd0b7e-0729-4819-910a-af25f8f480c8`, and is proposed in [PR #43](https://github.com/arwyn6969/the-game/pull/43), stacked on #41. The production build and Wrangler 4.151.3 packaging dry run passed. Deployment used `--keep-vars` and retained remote variables, secrets, Hyperdrive/Images bindings and the existing game routes. No migration or secret upload occurred. The preceding production rollback version remains `72863242-780e-4738-a379-50fb5ddc1814`.

The live entry returned HTTP 200 with the new asset bundle, and Chrome's Help panel displayed **Build f48b38ddaead**. The human approved a new real Leather proof; holdings loaded and the selected Stamp #301284 was active. After the periodic refresh window, the live controls remained enabled; zoom changed from 1.0× to 1.1× and back, and Apply remained enabled. No appearance change was submitted during this crop check. The screenshot is retained outside Git in this chat's outputs. The PR's expanded CI browser run is tracked separately.

The original Chrome tab could no longer attach to browser inspection; a fresh versioned www game entry was opened and left available for the user. Its town was paused for the check; browser storage was not cleared or imported. Later receipt-only commits do not change the deployed runtime above.

The user also reported excessive Leather approval clicks. The unchanged adapter currently makes three `getAddresses` requests (initial selection, before signing, after signing) and one `signMessage` request. Repeated address approvals are a separate usability issue; account/provider change detection and signed-address verification were preserved in this freeze fix.
