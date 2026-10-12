# Sol handoff — S1 funded accounts and work contracts

Updated 12 October 2026. **S1 is implemented, awaiting review, integration and release.** The next packet is **S2 only — the three-record library project plus complete economy/UI activation**. No S2–S5 gameplay, merge to main or publication was performed.

## Source and isolation

- Repository: `https://github.com/arwyn6969/the-game.git`.
- Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/funded-accounts`.
- Branch: `codex/funded-project-accounts`.
- PR base: `codex/playability-review`, planning head `a8e9098c4d0be76e96138fc0db7f34b662661d01`; PR #5 was still open at the final source recheck.
- Current main incorporated: `65d93a905f256abdcdddc21d7612e7d4b8b07d53`.
- Own integration base: `0a2b51d0ddc56866810d8072fb2bf54a16eae05d`. It contains both planning and current main; the sole README conflict retained the current explicit-choice description.
- Implementation head: `8e151503bfb0017c6c3d15630610189149ff5457`. Subsequent documentation commits record these results; the PR exposes its final head. Compare S1 code against the integration base to exclude already-merged main changes.
- PR #11 merged before this checkout was created. Its visual files and the newer resident changes are preserved through the main merge. No other checkout or lane was reset, edited or force-pushed.
- The historical reviewed main `900015b` and last documented published runtime `4e7786c` were not used to replace newer work. Hosted runtime source was not reverified in this engine packet.

## Changed behavior and stopping point

The optional `Town.economy` version-1 extension records immutable opening snapshots, project custody, append-only transactions, holds and releases, issued quotes, command receipts, funded work, payroll approvals and future project/event state. `agent:<id>` addresses the actual resident purse; `till:cafe` and `till:grocery` address existing tills. There is no second mutable copy of their cash.

Commands clone the whole town, validate authority/actor/terms/revision/expiry/current eligibility, apply all effects on the draft and commit only after reconciliation. Stable command IDs replay their original receipts; different terms or actors with the same ID fail. Trusted contexts cannot be reused outside a command. Player commands cannot debit somebody else without recorded payer approval. Models cannot authorize spending, commitments or evidence. Failed commands leave money, items, holds, work and receipts unchanged. Old openings, transfers, receipts, approvals and evidence cannot be rewritten by a command; an authorized correction appends a reversal. Earned fees cannot be clawed back through the reversal helper.

A bounded project check has an issuer-approved offer, a full 2-coin hold, trusted observations and a worker report. Completing the required evidence and report earns the fee for success, failure or uncertainty. Cancellation and closure recognize already-completed reports before releasing anything. Incomplete check units receive no fee; their evidence remains recorded. Interruption suspends progress with the hold intact. A full recipient purse preserves the earned payable and reserved cash until settlement succeeds.

Payroll classification preserves dated aggregate hours, the payment flag, projects, old terms and the plan as labelled evidence. Already-paid work creates no new pay. Valid sole-employer completed unpaid work becomes a protected full-wage payable when funds exist. Valid active unworked agreements reserve the disclosed full wage. Partial/mixed/uncertain records remain unresolved and visible; unresolved or underfunded prior claims block donor funding. Recognition and replacement need a recorded employer approval plus the worker’s acceptance, cannot invent minutes, and never prorate coins. A protected unworked agreement can be replaced atomically without reserving its wage twice. The new café adapter tracks its own employer-bound 180 eligible minutes for 5; cancellation of accrued attendance suspends progress and retains the full hold.

Two distinct donor approvals fund project custody with 4 café + 4 grocery coins after payroll protection. Closure settles earned work first, cancels only incomplete units and refunds all remaining unencumbered custody equally. An unpaid liability blocks closure. Money movement, work performed and the reported result remain separate records.

**Ordinary play does not call the new initialization boundary or work helpers.** It retains the released wage/debt/time behavior and current player terms. S2 must switch every old mutation path and matching UI together. The standalone funded day hook preserves cash, progress, liabilities and legacy evidence; it is a bookkeeping boundary, not a replacement for movement, schedules or ordinary time simulation.

## Invariant evidence

The 36 new outcome tests prove:

- Fresh opening money is 77; migration, holds, 4+4 funding, fees and refunds conserve it. Imports retain their own unequal valid totals, including above legacy till/purse caps.
- Accounts reconcile individually and in total; unrecorded balanced transfers and old-runtime midnight edits fail the audit. Holds cannot compete for the same available funds or consume prior payroll.
- A café till with 4 and an unresolved 5-coin wage cannot donate. Both contributions fail atomically if either donor is ineligible or short of funds.
- Duplicate, stale, altered, expired, disabled, wrong-person, model-authorized and insufficient-fund requests fail or replay safely. Forced failures after an initial debit roll back the complete town. Forged contexts, unapproved source spending and history rewrites fail.
- Legacy Baba tabs pay Baba’s personal purse exactly. An authorized reversal appends history, restores that same creditor’s debt and cannot reverse twice or claw back earned wages.
- Completed successful, failed and uncertain checks earn their fee once. Incomplete evidence/report cannot earn it. Cancellation/closure cannot erase a completed fee.
- Full-purse payables survive interruption/cancellation, day changes, memory compression, reload and later settlement. Closure never refunds earned liabilities.
- Legacy paid, partial, completed unpaid, mixed-employer and protected unworked cases remain distinct. Recognition does not invent progress; replacement preserves the old records and avoids duplicate reservations. The café contract pays only after 180 physically attended, planned employer-bound minutes.
- Repeated initialization/import is idempotent. Completing a valid core-only snapshot adds payroll protection without a second opening. Invalid legacy work/payment fields and malformed/contradictory extensions fail without changing the input; failed imports retain every original byte. Bad saves cannot overwrite a recoverable stored town.

## Migration, compatibility and recovery

`initializeFundedEconomy(town)` is the single explicit funded boundary. It validates original balances/work/payment fields, works on a clone, records migration openings without income and classifies/protects payroll. A present valid core-only snapshot gets payroll classification atomically; a complete extension is validated without being rebuilt. `importFundedTown(text)` provides opt-in raw/wrapped-v1 import with complete raw recovery data. Neither is connected to ordinary play in S1.

Existing save/action signatures remain available. `readTownFile(text)` is an additive detailed import result; `parseTownFile` keeps returning a town or null. Present books are checked before legacy normalization can clamp money or rename debt/work IDs, and checked again afterward. `readTownSave` preserves the raw stored text on failure with an account explanation; `saveTownWithStatus` rejects inconsistent books with a serialization failure and explanation. Export still permits a raw recovery backup. Names, memories, debts, creditors, projects, pause and valid recorded work survive valid migration; only existing disposable path/replay and non-financial normalization rules apply.

An older runtime that retains books but changes cash is detected by per-account reconstruction and hold history. A runtime that strips the extension altogether destroys evidence that S1 cannot recover. No downgrade round trip or reconstruction of lost earnings/obligations is promised. Keep the funded backup; do not present a stripped file as a verified ledger continuation.

## Commands and actual results

Bundled Node **24.19.0**, npm **10.9.2**, committed lockfile; `npm ci` installed 425 packages and reported zero vulnerabilities. No database/provider credentials or paid requests were used.

| Command                                            | Result                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                | Passed                                                                                                                              |
| `npm run lint`                                     | Passed; one inherited unused-disable warning in `src/lib/auth/use-current-user.ts:59`; no new warnings                              |
| `npm run test:town`                                | **101 passed**, zero failures/skips: 65 existing town tests + 36 S1 tests                                                           |
| `npm test`                                         | **354 passed**, zero failures/skips: 299 script tests + 55 app/auth tests                                                           |
| `npm run diagnose:town`                            | Exit 0; no world-audit issues; six longevity snapshots imported their exports; day-30 export 819,477 UTF-8 bytes, 29 Northern wages |
| `env -u DATABASE_URL -u XAI_API_KEY npm run build` | Passed; database migration explicitly skipped; existing dependency/bundler warnings retained                                        |
| `git diff --check`                                 | Passed                                                                                                                              |

The released 317/64 baseline counts are historical: newer main includes the additional resident regression. Diagnostic observations concern the still-unactivated legacy runtime and do not establish fairness. Raw local command output is under `/private/tmp/s1-final-{town,full,build}.log` and `/private/tmp/s1-diagnose.log`; these machine-local logs are not committed or durable release artifacts.

## Additive S2 query/action contract

- `accountSummary(town, account)` returns a cloned opening/balance/available/holds/transactions projection. `availableFunds` and `accountBalance` address actual balances.
- `projectFundingSummary(town, id)` returns custody balance, available budget, holds, paid expenditure, earned payables, donor approvals and blockers. `payrollFundingReasons` explains ineligible donors.
- `fundedWorkSummary(town, worker)` returns cloned offers, terms, agreements, progress, evidence, holds, completion receipts, payables, legacy claims, employer approvals and funding reasons. Filter to the relevant worker; expose public project totals without revealing unrelated private records.
- Use `createEconomyQuote` for issuer-supplied terms and an eligibility key; `assertQuoteEligibility` checks freshly computed eligibility in the trusted adapter. Commands also support an expected revision. Do not read authorization from model prose.
- Work entry points are `createWorkOffer`, `acceptWorkOffer`, `recordWorkEvidence`, `submitWorkReport`, `completeWorkUnit`, `suspendWorkAgreement`, `cancelWorkAgreement` and `settleWorkPayable`. Only trusted interactions can record evidence or complete a unit; report outcome does not determine whether honest completed work is paid.
- Payroll uses `approvePayrollAgreement`, `recogniseLegacyClaim`, `createFundedCafeAgreement` and `recordCafeAttendance`. `protectPayroll` classifies/reserves before grants. Funding uses `approveLibraryContribution`, `fundLibraryProject` and `closeFundedProject`.
- Commands return `{ok:true,replayed,value,receipt}` or `{ok:false,code,reason}`. Receipts contain stable IDs, actor/authority, time, revision and effected transaction/hold/release IDs. Build player memories and journal entries from these receipts; translate engine reasons into ordinary player copy.

The [complete mutation adapter audit](../implementation/s1-economy-integration.md) identifies every existing purse/till mutation and the exact activation handoff. It covers seeds, import normalization, personal debt settlement, item/shift actions, wages, missing-till repairs and midnight reset/top-ups/caps.

## Remaining limitations and exact next packet

S1 is a helper foundation. The current live economy still has unexplained midnight funding/caps and old shift-erasure terms; the ledger must not be enabled under those paths. The café adapter is bounded; there is no new general grocery attendance system, recurring-job scheduler, automatic partial settlement or fractional wage scale. Grocery/other ambiguous progress remains preserved pending explicitly funded recognition and the assigned integration; no lost historic wage is invented. Authored task-oracle IDs and Northern’s independent-worker rule belong to S2, not generic S1 evidence strings.

There was no new browser journey, physical phone test, real-provider call, hosted import/recovery test, deployment verification or player retention/fairness study. S1 does not provide cross-device storage, library UI, shared meals, extra residents, broader banking, provider changes or visual redesign.

**Next: S2 — Three records, one funded project.** Name one integration owner, recheck planning/main/visual heads, and retarget this implementation PR after PR #5 merges. Activate the full ledger/wage/debt/midnight adapters and matching player terms together, then build the specified offline ordinary-control project discovery, observations/reports, common index, routed independent lookup, funded correction and closure journeys. Test desktop 1280×800 and phone 390×844, imports/recovery and reload on that integrated candidate. S3–S5 and publication require their own assignments.
