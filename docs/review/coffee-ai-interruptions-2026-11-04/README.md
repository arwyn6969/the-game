# Café Stop during pending AI — 4 November 2026

Owner: this Codex chat. Branch `codex/relationship-feedback`, draft PR #71;
qualification code `648f697`, production runtime unchanged from the 3 November
receipt. This packet adds regression coverage and reproduces no runtime defect.

Eight fresh browser journeys pass: four cases at 1280×800 and 390×844, using
synthetic localhost session responses and an intercepted development transport.
Auth modules, provider settings and product runtime are unchanged. No live
inference, production operation, secret/budget change or wallet action occurs.

## Verified behavior

The fixture uses real funded quotes, Start, three simulation minutes and Stop
to produce a saved partial shift. It invents no money or attendance. The browser
imports that town normally and explicitly resumes service before each request.

1. **Stop and a valid late reply:** selecting 4× during a held player request
   advances no town minutes or wages. The ordinary header Stop works before the
   request settles. A valid unrelated Kevin reply then lands exactly once while
   service remains paused, the agreement suspended and the full wage reserved.
2. **Stop and an unavailable reply:** no substitute chat, changed personal facts
   or renewed service appears. The unsent player draft remains intact.
3. **Restore during a request:** normal checkpoint import replaces the live town,
   revokes service and rejects the old callback. The surviving personal,
   financial and service facts remain exact.
4. **Manual takeover:** ordinary keyboard movement leaves Kevin's hearing range,
   revokes service and rejects the obsolete reply without changing surviving
   personal facts or accounts.

Explicit Resume advances each attended minute once. Reload shows no active Stop
control and requires Resume; an ordinary Pause saves the recovered live state
with its earned minutes and complete five-coin reservation. Economy and café
validators report no errors; no request is replayed after reload.

The first harness run incorrectly read pre-recovery localStorage bytes as live
authority. The loader deliberately preserves those source bytes while revoking
control in memory. The corrected oracle checks live Stop/Resume controls first,
then persists through an ordinary UI action before comparing stored facts. No
runtime change or weakened financial assertion was needed.

[All eight results](browser.json) · [desktop pending Stop](desktop-stop-valid-pending-stop.png)
· [phone pending Stop](phone-stop-valid-pending-stop.png)
· [restore](desktop-restore-stale-final.png)
· [manual takeover](phone-movement-stale-final.png). Screenshots were visually inspected.

## Acceptance scope and remaining work

This qualifies the pending-player-AI part of W03 and actual stale callbacks after
Stop, manual takeover and checkpoint restore in A02. It does not establish
two-worker/order reassignment, real provider/auth compatibility or physical
device acceptance. Cups, orders and favors are empty in this fixture: equality
checks prevent spurious creation, while preservation of existing nonempty cups
and obligations remains the separate mixed-week/core/browser evidence.

The representative [mixed week](../relationship-feedback-2026-11-04/README.md)
continues to support L01/I02/W08 and related core rows. Full human shift earning
through normal UI, two-worker handover/capacity, troubled payroll/concurrency,
downgrade recovery and the participant/screen-reader diagnostics remain open.

Node 24.22.1, syntax, targeted ESLint (zero warnings/errors), formatting and
whitespace checks pass. No runtime changed, so the previous 1,189 script + 55
typed test qualification remains applicable. The new eight-journey harness is
wired into Verify's synthetic development-browser step and artifact upload.

Subsequent packet: [full UI shifts and two-worker handover](../coffee-shift-handover-2026-11-04/README.md)
are now locally qualified, including a station-deadlock fix. The limitations
above retain this earlier pending-AI fixture's scope.
