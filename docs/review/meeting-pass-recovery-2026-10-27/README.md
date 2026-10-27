# Meeting pass recovery — 27 October 2026

At application source `bb66aa83cd4075addcf9cb80fac0bbba37ef9b37`, a fresh
real-provider meeting completed in sixteen free calls, four spoken turns and
$0. All sixteen responses succeeded (29,274 known tokens, zero new timeouts).
Arwyn opened without player-authored speech; Northern answered with a concrete
reading suggestion; Arwyn followed up and Northern volunteered to read it.
Sub chose to keep listening. Arwyn then passed, followed by Northern passing;
the ordinary sixteen-decision boundary closed the record. These voluntary
choices are preserved in the [sanitized receipt](summary.json), not rewritten
into six spoken turns or a third speaker.

One explicit Start used the ordinary scheduler, real prompt/parser/router,
automatic lifecycle and local SQL stores. No chosen floor, paid fallback, retry
or fabricated user was used. All thirty prior ledger identities, timestamps
and charges remain; forty-six cumulative attempts settled (45 ok, one inherited
timeout). Physical starts were at least 31,080 ms apart. Maximum reservation
was 11,033 units; all retained reservations total 417,596, below the free profile.
Independent offline replay exactly reproduced the full canonical town, every
prompt and choice, all four attributed speech deliveries and all eight scoped
knowledge projections. Finance, identity and save/reload checks pass.

The earlier PR #58 full headless meeting passed with six utterances in fourteen
calls. Its subsequent hosted browser attempt did not pass social acceptance:
sixteen charges (one thirty-second upstream timeout) produced only Sub's one
line. Two explicit Starts retained its cap. Normal terminal closure and reload
preserved Day 1 19:37, four coins and the record. The pass/requeue loop was then
reproduced with a red engine regression. Raw hosted town export was unavailable
through the browser download bridge; no exact raw-town replay is claimed for it.

The fix parks a passed resident until new actually heard speech or a deliberate
turn request. Participating attention and every offered opt-out remain.
Facilitator guidance asks for a follow-up rather than another opening. Player
allocation is 48 within the unchanged shared rolling-day 48 ceiling; the provider
reports 50 free requests per UTC day. One direct reply is reserved; all previous
charges, zero spend, exact free model, single concurrent attempt, 31-second
spacing, output cap, six-turn and sixteen-decision caps and deadlines remain.

Local checks: 1,100 script + 55 typed tests, 428 town tests, typecheck, lint
(one inherited warning), diagnostics and both credential-free builds pass.
Current-head Verify and a new hosted acceptance test remain gates. The first CI
run found a browser fixture still assuming a passed resident becomes a listener.
Its cancellation scenario now cancels a legal request-turn and asserts unchanged
queue/member/draft, leaving actual late-speech rejection in the automatic
journey. This keeps both cases within the unchanged decision cap.

Publication and the new authenticated hosted result will be recorded in current
status and the PR. Staged code receives no traffic before current Verify passes.
Mobile remains on hold; the prior one-shot automation is PAUSED. Private raw
synthetic towns, prompts and SQL stay ignored under
`artifacts/pass-recovery-20261027/` and its runner; release metadata stays under
`artifacts/pass-recovery-release-20261027/`.
