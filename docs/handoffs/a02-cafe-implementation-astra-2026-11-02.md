# A02 café implementation handoff — Astra, 2 November 2026

**The audited café is implemented locally and ready for a supervised human
diagnostic.** Review [implementation evidence and limits](../review/a02-cafe-2026-11-02/README.md)
alongside the [canonical contract](../implementation/a02-cafe-readiness-astra-2026-11-01.md).
This follows Arwyn's “ok go on”; it does not publish or merge the feature.

## Where to continue

- Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a02-economy`
- Branch: `codex/a02-loop`
- Implementation start: `259ac8ac510b12356a723723f3f2afaf0dd1d0be`
- Runtime base: main `a26714e03192a17acaa963d7d2681e74a1ac425b`
- Exact delivery revision: the commit containing this handoff; run
  `git log -1 --format=%H -- docs/handoffs/a02-cafe-implementation-astra-2026-11-02.md`.
- Sol's draft #63/#62 stack was inspected read-only, not imported. Reconcile
  overlapping simulation/save/UI changes during Sol's integration pass and
  rerun qualification on the integrated revision.

No other checkout or shared status/framework was modified. No message was sent
to another chat or Grok. This is a handoff file, not a dispatch. Sol owns the
subsequent integration and shared-status update.

## Product contract now in source

Coffee costs 2 existing coins, refundable in full before ready. The separate
hold prevents preorders funding wages. Real preparation creates one owned cup
and releases the sale; collection and drinking are later separate actions.
Kevin's existing 5/180 funded wage remains unchanged, including eligible quiet
time. Sales support later shifts, never an additional per-cup wage.

One explicit Start authorizes automatic walking, brewing and placement. Manual
movement/Stop suspends immediately; finish-current stops after final payroll.
Reload, import, fork and hide require explicit control resumption. The active
player uses one core movement budget. Partial work, full wages and refund
liabilities survive interruption. Authored NPC participation is bounded and
voluntary; arbitrary hoarding/refusal can end demand.

Start a local visit through **Café → Start café trial**. A customer can ask
Kevin for funded staffing in the service window. A worker first accepts the
existing shift through Kevin's Choices, then uses **Start serving**. The trial
does not automatically purchase, enroll the player or create money.

## Integration map

| Source | Interface / sensitive ordering |
| --- | --- |
| `coffee.ts`, `coffee-types.ts`, `coffee-validation.ts` | `makeCoffeeCommand`, `applyCoffeeAction`, `coffeeActionReason`, `coffeeView`; raw validation crosslinks ledger, holds, work and custody |
| `coffee-runtime.ts` | `startCoffeeRoutine`, `pauseCoffeeRoutine`, suspend/recover helpers, `beforeCoffeePayroll`, `afterCoffeePayroll`, `coffeeMovementGoals`, `coffeeWorkView` |
| `coffee-residents.ts` | Explicit `requestCoffeeStaff`, authored choices, customer movement and closure; no daily automatic hiring |
| `sim.ts` | Coffee work → existing payroll → finish-current suspension → time/movement → authored choices/status; reacquire records after ledger commits |
| `navigation.ts` | Optional fourth service argument adds authorized player goal and stationary workers without changing old call sites |
| `save.ts`, `identity.ts` | Validate raw optional state and orphan effects before normalization; recover only already-proven pending attendance, then pause grants before load/fork |
| `economy.ts` | Full-price reservation/refund authority only for the exact buyer/order/transaction; no generic till access |
| `funded-work.ts` | Narrow generated-ID fix for valid 120-character parent agreement/claim; tests reject arbitrary long/wrong-prefix/duplicate IDs |
| `TownApp.tsx`, `CoffeePanel.tsx`, `PlayerTools.tsx`, `render.ts` | Normal controls, separate Stop, manual/late-callback guards, persistence barrier/retry, inventory and actual pixel cups |

Preserve the one movement pass, work-before-payroll and pause-after-payroll
ordering. Never restore an old player grant automatically. A storage success
can clear a pending failure only for the matching complete snapshot/generation.
Do not drop coffee fields/ledger receipts to make an older build accept a save.

## Reproduction

Use Node **24.22.1** and the committed dependency lock. Local setup already
exists; no dependency change was made. Commands from this checkout:

```sh
node --test scripts/town-coffee-domain.test.mjs scripts/town-coffee-runtime.test.mjs scripts/town-coffee-integration.test.mjs
npm run typecheck
npm run lint
npm test
npm run diagnose:town
DATABASE_URL= XAI_API_KEY= npm run build
```

The build runs the migration entry point, which skips with no database URL.
Do not supply production credentials. Built browser qualification:

```sh
DATABASE_URL= XAI_API_KEY= node scripts/with-app-env.mjs node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8199
GAME_COFFEE_QA_URL=http://127.0.0.1:8199/ node scripts/town-coffee-browser.mjs
```

The browser script only accepts localhost, uses disposable synthetic towns,
and blocks external/server-function requests. It retains reports/screenshots
under `artifacts/a02-cafe/browser/`. The ordinary sandbox blocks some existing
local-listener tests; successful qualification ran with approved local process
permissions. This is not hosted/Cloudflare verification or live AI testing.

## Next bounded pass

1. Review the source and [acceptance coverage](../review/a02-cafe-2026-11-02/acceptance-coverage.md),
   reconcile with Sol's active stack, then run the same checks on that revision.
2. Close the specific pending-AI Stop and accessibility/device gaps without
   changing auth or calling paid inference. Add mixed-week and interleaving
   qualification where the coverage table remains partial.
3. Run the existing three-to-five-person protocol and retain observations of
   comprehension and enjoyment separately from accounting results. Decide
   whether to tune wait length, pickup interaction or voluntary demand.
4. Only after these gates consider ordinary release. Preserve QR/campaign,
   Emblem/eCash/E-stamp and souvenir research as a separate integration; no
   local cup or receipt currently promises withdrawal, minting or redemption.

Proposed shared-record update for Sol, when integrating: “A02 café locally
implemented on `codex/a02-loop`; automated accounting/control/recovery and
built-browser evidence available; human diagnostic and named integration gates
remain open.” Do not mark retention, production or external-payment readiness.
