# Full café shifts and two-worker handover — 4 November 2026

Owner: this Codex chat, `codex/relationship-feedback`, draft PR #71.
Starting PR head `05be3ab`; freshly fetched main `49cf76f`. Fix and regression
code: `54e39e6`. Production remains at the 3 November receipt.

## Reproduced station deadlock and fix

The matched two-ticket runtime test reproduced a permanent station exchange:
Northern finished brewing at `(5,18)` and needed placement `(6,18)`; the incoming
human brewer occupied `(6,18)` and needed `(5,18)`. Navigation correctly refused
to overlap or swap actors, leaving both cups unfinished after 100 minutes while
the funded attendance continued. [Pre-fix reproduction summary](before-fix.json).

The fix changes café movement goals only. An incoming brewer waits at a free
adjacent café position while the previous worker moves to placement. An idle
authorized worker also makes room if another active worker needs that station.
The existing single navigation pass still owns movement, collision checks and
step budgets; an interval that prepared coffee cannot also move its worker.
Paused/manual actors and earlier appointments receive no new service authority.
There is no teleport, save/API migration, payroll change or invented income.

Both worker-role orientations now complete. Crowded staging can still wait;
this does not claim universal crowd resolution or fairness/tie rotation.

## Full earning through ordinary UI

Desktop 1280×800 and phone 390×844 start from a new paused 15:59 town with initial
poses only. Enable, Kevin's quote, wage funding, Start serving and all time
advancement use ordinary controls. Browser clock control advances wall time;
no game hook or injected attendance advances the shift.

- At zero minutes: no advance pay; all five wage coins reserved.
- At 179: no payable or payment, original player balance, full reservation.
- At 180: exactly the 180 distinct `16:00–18:59` intervals, one five-coin payable
  and settlement, player balance 4 → 9, wage hold exhausted, routine ended.
- After 19:00, export/import and reload: no overtime, second payment or changed
  financial/identity facts. All actor, till and project balances still total 90.

[Full-shift results](coffee-full-shift-browser.json) ·
[desktop 179](desktop-179-unpaid.png) · [desktop paid](desktop-180-paid-ended.png) ·
[phone 179](phone-179-unpaid.png) · [phone paid](phone-180-paid-ended.png).

## Handover and retained rights

Two further browser journeys use normal UI to accept a shift, serve Sub, Stop a
partially brewed order, step aside with keyboard/emulated touch, and request
Northern's own funded consent. Northern continues the same order. Resuming the
old worker does not steal Northern's assignment. The original buyer, hold, sale,
pickup slot and partial work remain; one cup completes with 20 brewing and 10
placement minutes contributed by both named agreements. Only the customer hold
releases; both independent five-coin wage reservations remain protected.

Reload revokes service grants and unfinished assignments while preserving
contributions, cup ownership, balances and holds. The source regression also
rejects stale completion without any mutation and verifies each contribution
against its worker's actual attendance.
[Handover results](coffee-handover-browser.json) ·
[desktop](desktop-handover-complete.png) · [phone](phone-handover-complete.png).

## Matched demand and equipment bounds

The source benchmark branches one valid paused town with two guarded, paid
orders. Initial poses and adjacent customer arrivals are controlled synthetic
inputs; no progress, money, receipt or completion is injected. One branch uses
Northern; another adds the human's funded shift. A third reverses the valid
routine iteration order to test the opposite station exchange.

| Workers / routine order | Player's cup ready after | Sub's cup ready after | Wage promised and protected | Parallel preparation intervals |
| --- | --- | --- | --- | --- |
| Northern | 32 minutes | 64 minutes | 5 coins | 0 |
| Northern, player | 32 minutes | 55 minutes | 10 coins | 8 |
| Player, Northern | 56 minutes | 33 minutes | 10 coins | 8 |

All variants complete two cups within the same 100-minute window, retain 90
coins, and have paid no full wage yet. Work never overlaps on the same station
or worker; there remains one brewer and two pickup slots. More staff do not
imply twice the throughput or an indefinitely sustainable economy.
[Exact comparison](capacity.json).

## Qualification and remaining scope

Node 24.22.1: **1,191 script + 55 typed tests pass**, including **496 town tests**.
The focused handover suite passes two tests containing three capacity variants;
all 45 café tests passed before the reverse-order variant was added. Typecheck,
lint (zero errors, one inherited warning), formatting, diagnostics and the
credential-free build pass. Migration explicitly skips without `DATABASE_URL`.
The runtime file matches the final browser build. [Checks](checks.json).

All four final desktop/phone journeys pass without browser errors or live
inference; their screenshots were visually inspected. Both new browser checks
and the source regressions are included in Verify. CI must qualify the updated
PR head separately; a local result is not deployment or remote CI evidence.

This advances full UI earning, W05 handover and F05's bounded runtime comparison.
Real auth/providers, troubled payroll/refund interleavings, two-tab concurrency,+downgrade/recovery, physical devices/screen readers and participant comprehension
or enjoyment remain separate acceptance. No production, secret/budget, wallet,
model selection or hosting change occurred.
