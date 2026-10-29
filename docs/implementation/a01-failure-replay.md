# A01.1 Synthetic action/completion failure replay

29 October 2026. Owner: GPT-6.1 Sol, chat `01a18874-463c-7be1-80a3-ed7eefdace15`.
State: Locally verified; A01.1 acceptance complete. Checkout `a01-replay/`, branch `codex/a01-replay`, base
`a26714e03192a17acaa963d7d2681e74a1ac425b` (current main). No PR dependency.

Outcome: one deterministic local replay register covering unavailable actions,
malformed/empty completions, repeated passes, timeout, exhausted allowances,
cancellation/late completion and failure on the final permitted decision.
Each case records observed behaviour separately from the required A01.2 outcome.

Scope: synthetic fixtures, a replay driver, regression tests, and evidence/docs.
Use actual engine/parser/save, scheduler and SQL budget/provider-store seams.
No runtime, schema, financial policy, auth, provider or hosting changes.
Existing partial tests are retained. Grok remains paused; no other chat is woken.

Invariants: eight identities, prior memories/history/audiences, balances, debts,
accounts, timestamps and prior SQL charges survive each case and reload. A
rejected or late proposal adds no dialogue or payment. Never retry automatically,
refund unknown attempts or create headroom. All test SQL is disposable PGlite;
all inference is an injected fake fetcher with no network implementation.

Acceptance: replay cases assert exact outcomes and invariants, retain known gaps
as explicit evidence, pass required checks, and leave a reviewable local branch.
Hosted/CI/merge/deployment/human acceptance are separate stages. Zero live calls,
zero spend, no production migration. Rollback is reverting test/docs commits;
no town or database compatibility changes exist.

Implementation/test revision: `922dbcedf7151e9a6a6a351804a4d142b347b4cf`. All ten cases and
required local checks pass: 1,101 script + 55 typed / 428 town tests, typecheck,
lint (one inherited warning), diagnostics and credential-free build. The new
regression also blocks global fetch; all inference is fake. See
[review matrix and limitations](../review/a01-failure-replay-2026-10-29/README.md),
[check receipt](../review/a01-failure-replay-2026-10-29/checks.json), and
[handoff](../handoffs/a01-failure-replay-sol-2026-10-29.md).

Observed gap: an invalid sixteenth completion leaves an exhausted paused
meeting. Resume is denied, but player Close preserves the full record and reload.
A01.1 captures that baseline without a runtime fix; A01.2 remains unassigned.
Cancellation and a denied budget retain unknown town-attempt diagnostics;
provider-cap denial retains a conservative budget charge without a transmission.

Next action: scope A01.2 from `final-empty-completion`, compare the engine's valid
last-result closure with its pause/resume path and actual UI failure/finally path,
then implement and browser-qualify a bounded honest terminal outcome. No new
live-provider, PR, CI, merge, deployment or human acceptance is claimed.
