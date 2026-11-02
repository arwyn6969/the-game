# Café acceptance evidence, 2 November 2026

This is a conservative mapping to the 39 requirements in the
[audited contract](../../implementation/a02-cafe-readiness-astra-2026-11-01.md).
“Covered” describes the named automated case, not every possible interleaving.
“Partial” identifies useful evidence and the untested remainder. No confirmed
implementation blocker emerged from the final read-only product review;
unqualified requirements remain gates before ordinary release.

Evidence: **D** = `town-coffee-domain.test.mjs` (19 tests), **R** =
`town-coffee-runtime.test.mjs` (17), **I** = `town-coffee-integration.test.mjs`
(5), **B** = [built browser report](browser-results.json). Domain fixtures
sometimes construct preparation progress directly; actual service/navigation
comes from R/I/B. Full suite and final build details are in
[validation.json](validation.json).

| ID | Evidence / remaining qualification |
| --- | --- |
| F01 | Partial: real shift completion and quiet attendance in source; exact full zero-order café journey not explicitly asserted |
| F02 | Covered D/R: separate 2-coin refund and 5-coin wage holds, conserved balances |
| F03 | Partial: funded admission and independent holds tested; exact multiple-preorder/insufficient-till case absent |
| F04 | Open targeted case: ready release competing with earlier troubled payroll |
| F05 | Open production-runtime comparison: matched demand with one versus two workers. The earlier independent model is not this evidence |
| F06 | Partial: full refund after 12 work minutes; exact 0- and 29-minute cases absent |
| F07 | Covered as sequential stale-command races: ready wins; cancellation prevents later completion. No browser concurrency claim |
| F08 | Partial: refund later settles once after purse space changes. Earned full-purse wage survives import and keeps settlement headroom; eventual wage settlement and refund reload not jointly demonstrated |
| F09 | Substantial D/R coverage of refusal, suspension, holds, hoarding and closed admission; no combined long mixed-play scenario |
| W01 | Covered R/B: one Start does actual work; NPC buys/collects without human cup clicks or live inference |
| W02 | Partial: actual keyboard/emulated-touch overrides pass. Blocked move, destination override and form-input exclusion lack equivalent browser qualification |
| W03 | Partial: Pause during held save passes B; finish-current preserves final payroll R. **AI-pending Stop unqualified** |
| W04 | Strong source coverage of final interval, 180th minute and no overtime; browser crosses opening. Full exact-boundary matrix not independently compared |
| W05 | Partial: interrupted/late work and resources survive; actual two-worker handover remains unproven |
| W06 | Partial: authoritative ticks, bounded movement and duplicate intervals covered; B uses 4×/+Hour. Matching-state 1×/4×/+Hour/direct equivalence absent |
| W07 | Partial: shelf full, quiet and paused states covered; accepted payroll across every blocked status not exhaustively demonstrated |
| W08 | Partial: conflicting Northern library commitment rejects staffing. Meeting/manuscript combinations untested |
| I01 | Covered D/B: owner, exact cup, custody, proximity/occupancy and actual collection |
| I02 | Partial: kept cups/import/one-use drink/no duplicate consumption pass; continuous multi-day retention/use journey is narrower than contract |
| I03 | Covered: two shelf cups/four carried cups stop admission without deletion; one drink frees one slot |
| I04 | Substantial R/B routing and counter-clearing, including stationary-human obstruction. Multiple ready-customer ordering and blocked-route combinations partial |
| R01 | Partial: many same-ID, payload, revision and wrong-world cases pass; not every transition's complete retry matrix |
| R02 | Covered specified crash cut: export/import after coffee work before payroll recovers exactly one attendance interval |
| R03 | Partial: integrated financial commits/audits exercise references; explicit payroll/library interleaving between coffee reads absent |
| R04 | Partial: held save lock, quota failure, complete live export and successful retry B. Actual two-tab café conflict absent |
| R05 | Partial: synthetic hide/reload/import/paused recovery pass. Actual close and replay-entry/exit browser journey absent |
| R06 | Covered: malformed/deleted coffee projection rejects with original raw import retained |
| R07 | Partial: modern restore/fork preserve claims and reject original envelope. Existing suite covers legacy saves separately; combined café-enabled migration not established |
| R08 | Partial: closure refunds, ready cups and wage obligations covered. Executed downgrade/rollback protection unqualified |
| A01 | Covered: forged actor/authority/price/recipient/hold/identity/contribution rejected |
| A02 | Partial: stale control and wrong-world guards; actual delayed AI callback after pause/reassignment/restore absent |
| A03 | Partial: scoped coffee views and separate factual states; not complete dialogue/prompt privacy qualification |
| L01 | **Open:** seven-day normal mixed café play. Earlier baseline trace/model is separate evidence |
| L02 | Partial: 30 actual days with daily restore prove continuity/admission stop, with sparse activity. Separate synthetic pressure tests prove bounded drain/receipt measurements, not maximum active history |
| L03 | Covered local snapshot: 1,141 script + 55 typed tests; typecheck/build pass; lint zero errors and one inherited warning. Hosted integration remains separate |
| U01 | Substantial B at 1280×800 and 390×844, keyboard/emulated touch, Stop and focus. Physical device acceptance open |
| U02 | Partial: four targeted axe scans have zero violations/incomplete; reduced-motion emulation used. Disabled explanations now have `aria-describedby`. Actual screen reader and complete announcement audit open |
| H01 | **Open:** participant control/comprehension diagnostic |
| H02 | **Open:** enjoyment and voluntary repeat choice |

The browser worker journey ends at **61 eligible minutes**. It proves automatic
service and interruption, not full human 180-minute earning through the UI.
Full attendance/earning is source-test evidence. Deliberate large-purse and
history-pressure fixtures are synthetic and conserve their own explicit
opening balances; they are not game subsidies or ordinary gameplay evidence.

The immediate next step is source/integration review and a supervised
diagnostic using the bounded local prototype. Keep these gaps visible; do not
translate a green full suite into every row being green or a retention claim.
