# Relationship feedback and mixed-week qualification — 4 November 2026

Owner: this Codex chat, branch `codex/relationship-feedback`, fetched main base
`49cf76f`. Runtime fix `ea55743`; mixed-week regression `f9005ac`.

## Three reproduced findings fixed

- **LIVE-01:** Overview recognizes a completed, attended reading as shared history.
  Together lists the witnessed activity separately from direct conversation.
  Recorded participant receipts and actual heard discussion speech determine what
  appears. Invitations, offscreen events, private speech and hidden listeners do
  not establish shared history. No chat or rapport is invented.
- **LIVE-02:** Together shows only open player commitments with an identified
  counterparty: café shifts with Kevin, grocery shifts and Baba's loaf with Baba.
  Unbound personal work stays in the player's journal. No save schema changes.
- **LIVE-03:** Café activation describes starting the trial and keeping existing
  orders/agreements, rather than denying an already accepted shift.

[Desktop history](desktop-arwyn-shared-history.png),
[phone history](phone-arwyn-shared-history.png),
[desktop activation](desktop-activation-existing-shift.png) and
[phone activation](phone-activation-existing-shift.png) were visually inspected.
The focused browser regression now runs in Verify.

## Follow-on: one actual mixed simulation week

The new two-test packet uses the actual simulation, commands and quotes for paid
library work, Northern's independent lookup, manuscript carry/write, a witnessed
reading, café purchases, refunds, wage earning and voluntary commitments. Seven
daily reloads retain the same identities, item ownership and financial records.

The first human shift earns its full 180-minute wage once. A real 12-minute brew
is refunded once; replay cannot refund or consume twice. A cup survives two
reloads before drinking. Meeting/manuscript commitments refuse conflicting
service without mutation. Core Stop/resume retains attendance. Day eight closes
new admission while retaining an owned ready cup and the interrupted human's
full five-coin reservation. All actor, till and project balances total the
original 90 coins at every checked transition. No income or progress is injected.

[Seven-day checkpoints](mixed-week.json). This advances representative core
cases for #65 L01/I02/W08 and parts of F06/W03/R05/R08; it does not close #65.
Player movement is synthetic adjacent input and does not qualify UI collision
handling. Core pause is not pending-AI/UI Stop. Day-eight retention does not prove
postclosure collection or wage drainage. Spontaneous NPC purchases mean the
first shift is not evidence for zero-order quiet work. Human value, physical
devices, concurrency, rollback recovery and hosted acceptance remain open.

## Validation

Node 24.22.1 and committed-lockfile installation. Typecheck passes; lint has zero
errors and its existing unused-disable warning. The final full suite passes
**1,189 script tests and 55 typed tests**. Six focused history tests, two
commitment tests and two mixed-week tests pass. The earlier town gate passes
486/486; the final full suite includes all subsequently added town tests.
Diagnostics report no world-audit errors. [Machine-readable checks](checks.json).

The credential-free build passes and explicitly skips database migration.
Disposable Chromium checks pass at 1280×800 and 390×844: witnessed/unattended
history, commitment scope, activation with an existing full reservation, exact
financial preservation, export/import and reload. General journeys also cover
movement, conversation entry, pause, competing tabs, old-save import, explicit
forks and corrupt-import rejection.
[Focused results](browser.json) · [general results](general-browser.json).

Initial localhost tests were sandbox-blocked; the permitted loopback rerun and
final full suite pass. Test-fixture corrections (reading interaction position,
activation receipt metadata and loader-normalized `seed: false`) preserve the
actual financial/history assertions. No runtime bug was concealed by those
corrections. The mixed-week packet reproduced no additional runtime defect.

No live model calls, budget/secret changes, wallet actions or production changes
were made. The 3 November publication receipt remains the deployment baseline.
