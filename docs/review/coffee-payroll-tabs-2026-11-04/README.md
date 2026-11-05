# Café payroll, refunds and concurrent tabs

5 November extension: both actual-tab ready-versus-cancel save orders now pass
at desktop and phone sizes, using the existing harness. Ready-first retains one
cup and no refund; cancel-first retains one refund and no cup. Each keeps one
sale, the original five-coin wage hold, identities and all 90 coins. Both writers
queue behind a real Web Lock before release; stale retry/recovery preserves the
winner's exact saved bytes. Prepared fixtures use 29 actual source work minutes;
the competing actions are ordinary Hour/Cancel controls. Reload may revoke an
unfinished NPC equipment assignment; financial and preparation records stay exact.
[Results](ready-cancel-results-2026-11-05.json): 36 focused source tests and all
eight existing/new browser journeys pass. No runtime defect was found and no
runtime change was needed. New checks run in the existing Verify step. This closes
the named controlled browser race gap; broader browser/server races remain separate.

4 November 2026. Code `9549a901c83aa09c9f8d7e2a104ba74bc5f1b790` on
`codex/relationship-feedback`, continuing draft [PR #71](https://github.com/arwyn6969/the-game/pull/71)
from `0f25093` and main base `49cf76f`. The user authorized CI follow-up,
these acceptance checks, fixes for reproduced failures and the PR update.

## Result

[Verify 41833236897](https://github.com/arwyn6969/the-game/actions/runs/41833236897)
passed every step at the starting head `0f25093`; no CI failure required a fix.
[Prior-head receipt](prior-head-ci.json). This is separate from CI on the new head.

Four source cases and four actual Chromium two-tab journeys pass. No additional
runtime defect was reproduced; this packet adds regression coverage and wires
the new tab journeys into Verify. The café station fix remains `54e39e6`.

| Contract | New targeted evidence |
| --- | --- |
| F04: earlier troubled payroll | An older completed/unpaid Kevin wage remains protected while Northern works. A library contribution is refused with only three free café coins, then admitted after ready releases the two-coin coffee hold. Both five-coin wages and the original claim survive. A separate underfunded old claim blocks new staffing/purchases and receives contributed existing cash first. |
| F08: wage and refund recovery | Actual 180-minute work and a cancellation after 12 actual brewing minutes produce independent five-coin wage and two-coin refund liabilities. Full purses postpone settlement. Reload before, between and after settlements preserves both. Each settlement order pays its original recipient once, including replay and wrong-target/issuer rejection. |
| R03: interleaved financial commit | Split the real API interval: coffee ready → approved library funding → funded payroll → coffee reconciliation → normal tick. Keep one final attendance timestamp, one cup, 20/10 preparation minutes, old claim/holds and the eight-coin library project. |
| R04: actual conflicting tabs | Two tabs share browser storage and real Web Locks. Stale refund/staffing writes and retries preserve the winner's exact bytes. Two service starts queued behind a deliberately held Web Lock yield one receipt and one conflict. Complete valid backups and downloads retain the losing town; explicit recovery preserves the owned cup, refund, wage hold, attendance and identities while revoking automatic service. |

The tab cases run at 1280×800 and 390×844, with ordinary controls after a labelled
time/position fixture. They preserve the ordinary 90-coin opening. The source
full-purse stress fixture deliberately opens with **2,082 coins** before the
immutable ledger snapshot; subsequent lawful transfers conserve that total.
These balances are test conditions, not a subsidy or an ordinary-play claim.

An initial harness assertion counted every five-coin café hold and failed when
ordinary play legitimately funded another worker. The final oracle tracks the
original Northern agreement and its unique hold, verifies it still reserves five,
and audits total funds. No runtime rule was changed to satisfy the harness.

## Validation

[Machine receipt](checks.json), [browser report](browser-results.json),
[diagnostics](diagnostics.json) and [screenshots](screenshots/).

Node 24.22.1: 1,195 script + 55 typed tests (1,250 total), including 500 town tests
and four new targeted payroll cases, pass. Typecheck, lint (zero errors and one
inherited warning), targeted formatting/lint and diagnostics (`worldAudit: []`)
pass. Three preview tests initially hit sandbox loopback `EPERM`; the complete
suite passed with loopback access enabled.

A fresh credential-free stage built successfully with `DATABASE_URL` blank,
migration skipped, no private environment files or provider credentials.
All 185 tracked runtime/public/migration/config files match the working source.
The four final browser journeys use that built preview, have no page/console
errors, and attempt no provider calls. `previewManagedByHarness: false` records
that the caller supplied this preview. Desktop and phone conflict screenshots
were visually inspected. Raw synthetic town exports remain local artifacts;
they are not included in this review packet.

## Limits and next acceptance

This fills the named targeted F04/F08/R03 and actual-tab R04 gaps in the
[dated coverage matrix](../a02-cafe-2026-11-02/acceptance-coverage.md); that
historical matrix remains unchanged. It does not prove every interleaving,
simultaneous ready-versus-cancel, other browsers, the no-Web-Locks path,
multi-process crashes or quota faults in these new journeys. Existing quota/save
tests retain their separate evidence.

Downgrade/rollback protection remains unqualified. Physical devices, screen
readers, participant control/wage/cup comprehension, enjoyment/repeat choice and
actual hosted/personal-model compatibility retain their acceptance gates.
No merge, publication, live inference, production migration, wallet transaction,
secret or budget change occurred. Production remains at the 3 November receipt;
Grok and historical automations stay paused.
