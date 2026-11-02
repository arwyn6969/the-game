# A02 café: local implementation review, 2 November 2026

The audited café now runs in this isolated checkout. It is ready for a
supervised human diagnostic, with the open acceptance gates below. It is not
qualified for ordinary release, real payments or transferable assets.

The [1 November audited specification](../../implementation/a02-cafe-readiness-astra-2026-11-01.md)
remains the policy contract. This review records what was actually built and
tested after Arwyn's “ok go on.” The earlier seven-day traces and alternative
cycle comparisons remain linked from that specification; their model results
are not relabelled as implemented game results.

## The implemented human loop

1. Open **Café → Start café trial**. Opting in neither buys anything nor hires
   anyone. The town retains its existing 90 coins in the ordinary fixture.
2. As a customer, ask Kevin for staffed service during the café window when
   another willing, eligible resident and five unreserved café coins exist.
   At the counter, buy for **2 coins**. Leave while it is prepared if desired.
3. As a worker, accept Kevin's existing funded agreement through his Choices,
   then press **Start serving** once. The character walks, brews and places
   orders automatically as town time advances. Quiet eligible time still
   counts toward **5 coins for 180 eligible minutes**, normally 16:00–19:00.
4. Move manually or press **Pause café shift now** to stop immediately. Resume
   is explicit. Finish-current credits its last eligible interval before
   stopping; it never requires overtime. Reloading does not resume control.
5. A customer collects their own ready cup at the counter, then may keep it
   or drink it once. Ready, collected and consumed are separate durable facts.

The full purchase price remains reserved for refund until ready, including
after partial preparation. Ready releases that reservation into available
business cash; it does not issue money or pay a second wage. Completed sales
can fund later shifts. Refunds and wages remain separate obligations. The
counter shows ordinary pixel cups derived from actual ready inventory.

Sub and Northern may voluntarily buy from existing money, with an initial
two-coin discretion allowance plus settled café wages minus net coffee spend.
There is no daily allowance reset, automatic daily hiring, self-service sale
or forced drinking. Two uncollected cups can fill the shelf. Four held/future
cups, six unresolved tickets, one unresolved ticket per buyer, one brewer and
two active service staff bound the pilot. Hoarding and refusal can stop it.

## What was changed

- `coffee-types.ts`, `coffee.ts`, `coffee-validation.ts`: optional versioned
  state, narrow actor-bound commands, refund holds, custody/use and raw
  ledger-to-item validation. Missing or altered coffee effects reject import
  while retaining the supplied bytes.
- `coffee-runtime.ts`, `coffee-residents.ts`: revocable service routines,
  contribution accounting, funded authored staffing, voluntary purchases,
  pickup routing and closure settlement.
- `sim.ts`, `navigation.ts`: interval-start work, existing payroll, then one
  movement pass. Service cannot brew and walk in the same interval. Existing
  library, manuscript and meeting reservations take precedence.
- `economy.ts`, `save.ts`, `identity.ts`, `types.ts`: narrow money authority,
  additive optional state, validation and recovery on load/fork. All eight
  identities and old financial records remain subject to existing checks.
- `CoffeePanel.tsx`, `PlayerTools.tsx`, `TownApp.tsx`, `render.ts`: normal
  customer/worker controls, explicit Stop, tickets/inventory, actual cup
  pixels, persistence barriers and recovery. Auth and provider routing stay
  unchanged.
- `funded-work.ts`: a reproduced existing boundary bug prevented a valid
  120-character agreement from earning because generated payable/receipt IDs
  exceeded the same length limit. Only exact derived IDs from valid parent
  agreements/legacy claims are now accepted; arbitrary long IDs, wrong
  prefixes and duplicates still reject.

## Evidence and limits

See [validation.json](validation.json), the retained logs and
[browser-results.json](browser-results.json) for exact runs and hashes.

| Evidence | Result and scope |
| --- | --- |
| Full repository tests | 1,141 script tests and 55 typed tests pass; includes 41 new café cases |
| Café domain / runtime / integration | 19 / 17 / 5 cases; real ledger, navigation, payroll, save and fork APIs |
| Three-day circulation | Northern spends initial 2, earns a real 5-coin shift, then buys a later 2-coin coffee served by the human; 90 coins conserved |
| Thirty-day source run | Actual offline core ticks and daily save/load; identities and 90 coins conserved; new admission closes after seven days. Mostly quiet, not a maximum-throughput stress test |
| Built browser | Eight check groups each at 1280×800 and 390×844; actual UI buy/leave/return/collect/drink, one-Start serving, manual interruption, Stop during held save, reload, simulated hiding and quota recovery |
| Browser fixture boundary | Source-created 15:59 towns with synthetic starting positions imported normally; later actions use normal UI. Headless viewports, not physical devices |
| Targeted accessibility | Four café scans, zero violations and zero incomplete results; this does not certify screen-reader experience or the entire app |
| Static/build | Typecheck passes; lint has zero errors and one inherited unused-disable warning in `use-current-user.ts:59`; credential-free Node/Nitro build passes and migration script explicitly skips without `DATABASE_URL` |
| Existing diagnostic | `diagnose-town.mjs` exits successfully; its observations are not a release verdict |

The browser checks block external requests and server function calls; they do
not weaken auth. No live inference, credentials, wallet operations or user
towns were used. The quota and hidden-page events are deliberately injected
faults, not physical browser eviction or mobile operating-system testing.

### Storage and recovery

New café commitments stop at 3 MiB, 50 orders, 14 service shifts or the
seven-day admission window. Existing liabilities are preserved. A single
disclosed final resume of an existing partial shift can be allowed above the
storage admission threshold only when current location, remaining service
window and conservative export headroom suffice. Stop always remains possible;
an interrupted final grant may leave a suspended obligation needing recovery.
There is no unlimited resume allowance or promise of offline completion.

The headroom calculation includes remaining funded attendance, unresolved
orders and unsettled payables, plus a fixed reserve, against the 8 MiB export
ceiling. The measured longest legal work IDs grew ordinary attendance by at
most **987 bytes** and final earning/settlement by **4,608 bytes**. A synthetic
valid town with **3,220,628 bytes** of retained history completed an existing
partial shift through **168 real core intervals**: one ready cup, full wage
paid, **3,397,709-byte** valid export, unchanged money and identities. These
measurements support this finite path; they do not guarantee browser quota or
unbounded future history.

Save failure pauses automation and preserves the complete unsaved live state.
**Retry saving this town** explicitly retries the existing persistence
protocol; it does not clear storage or resume service. A saved interval between
coffee progress and payroll settles only its already-proven attendance before
recovery pauses control. No new work or time is created during recovery.

### Retained failures

1. A sandboxed full run passed 1,131/1,134 tests; three existing local-listener
   tests failed with `EPERM`. The approved local-process rerun removed that
   environment restriction.
2. The next full run passed 1,138/1,139; the new longest-ID fixture exposed the
   real existing payroll bug described above. The fix and negative assertions
   are retained, and the subsequent full run passes.
3. The first phone browser run attempted Download beneath an open café modal
   and mishandled the asynchronous download wait. The harness now closes its
   panel and awaits the download concurrently with the click. Subsequent full
   desktop/phone journeys pass. This was not attributed to the game.

Original local logs and failed browser artifacts remain under
`artifacts/a02-cafe/`; selected synthetic evidence is retained here. No failed
financial assertion was removed or repaired by inventing money.

## Gates still open

The full 39-row specification is an acceptance contract, not 39 claimed green
checks. See [acceptance-coverage.md](acceptance-coverage.md) for partial coverage.
In particular, AI-request-pending Stop is unqualified: Stop during a pending
save is proven, and the local button is independent of AI-busy action cards,
but the authenticated pending-AI journey has not been exercised. Screen-reader
use, physical devices, a fully mixed seven-day human journey and the production
integration with Sol's current stack remain to be tested.

Run the specified **three-to-five-person diagnostic** next: quiet/busy shift,
interruption/resume, buy/leave/return/collect, keep/drink and full counter. Record
whether participants can stop unaided, understand the wage and locate their
cup. Record enjoyment and voluntary repeat purchase separately. No automated
trace establishes either.

Proof of Coffee can share this ordinary order → work → ready → collection
receipt chain. Keep campaign QR links, Emblem/eCash/E-stamps and optional
souvenirs as a later boundary: this implementation issues no NFT and treats
no editable local receipt as a redeemable asset. The shared service concept is
implemented; external settlement and asset export still need their own spec.

## Ownership and handoff

Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a02-economy`.
Branch: `codex/a02-loop`. Implementation started at
`259ac8ac510b12356a723723f3f2afaf0dd1d0be`; runtime source base is main
`a26714e03192a17acaa963d7d2681e74a1ac425b`. Read-only GitHub inspection on
2 November found draft #63 at `46bbe821341448b9c68000572c093b9471b4a9af`,
stacked on #62. That stack was not merged into this checkout.

The [implementation handoff](../../handoffs/a02-cafe-implementation-astra-2026-11-02.md)
records reproduction and integration boundaries. No change was made to
`a01-replay/`, root `START_HERE.md`, shared status/framework/Page, auth, hosting,
dependencies or another checkout. No external chat, push, PR, merge or
deployment was performed. Sol retains integration and shared-record ownership.
