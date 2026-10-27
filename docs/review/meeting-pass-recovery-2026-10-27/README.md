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
Current-head Verify and scoped publication passed. The fresh hosted test failed the unattended social gate; its result is below. The first CI
run found a browser fixture still assuming a passed resident becomes a listener.
Its cancellation scenario now cancels a legal request-turn and asserts unchanged
queue/member/draft, leaving actual late-speech rejection in the automatic
journey. This keeps both cases within the unchanged decision cap.

[PR #60](https://github.com/arwyn6969/the-game/pull/60) passed all current
[Verify steps](https://github.com/arwyn6969/the-game/actions/runs/40432562897) at
`01470e2910657cbf9650adb0a2291ab5da89b056`, then merged as `a26714e` with an
identical full tree. Existing production Worker version
`c4b89bfc-d9e4-48d1-ba1d-930280eaa8f5` now serves runtime `01470e291065`.
[Public release verification](release.json) confirms four matching client
assets, all 18 bindings/seven secret definitions, all 52 routes and unchanged
runtime settings. Only the two intended policy values changed. No model call
or database migration during publication. Rollback is the previous live version
`c13e181a-8360-4559-aed9-0b10c66be579`. The first metadata read timed out, then
the existing Wrangler session was refreshed; the read-only rerun passed.
An initial receipt source-string typo was corrected to the verified package
SHA; its original is preserved privately and no deployed content changed.

The [fresh authenticated hosted result](hosted-summary.json) **does not pass the
unattended social gate**. It used sixteen actual free calls and 31,200 known
tokens, $0, with five spoken turns by Arwyn and Sub. All sixteen charges settled;
provider outcomes were fifteen ok and one invalid HTTP 200 completion. No new
request timed out (maximum recorded provider latency 5,170 ms). At decision 11,
a decoded proposal selected an unavailable action; the engine rejected it and
paused. One explicit same-meeting resume retained every charge and left five
decisions. Decision 16 returned the invalid completion, leaving an exhausted,
unresumable pause at five of six spoken turns. The UI's generic failure message
mentions timeouts; SQL establishes this final outcome was invalid, not timeout.
The precise rejected action and invalid-completion subtype are not available
from the saved metadata; do not infer them.

The operator then closed the exhausted meeting through the ordinary Close
meeting button, without a new AI call. This is **manual closure**, not automatic
completion. Reload preserved all five actual lines, the closed record, Day 2
23:08 paused, and four player coins. Earlier records and three browser recovery
copies were retained. No town, identity, ledger or usage timestamp was reset.
Public location/follow and normal walking delivered invitations; the inspector
was turned off after automatic review rejected further private inspection.
No private notes are included in this receipt.

Player listening was explicit before Start. Stop listening happened between
observations of turn two and turn three; turn three is excluded from the
post-opt-out assertion. Later actual turns four and five appeared while the
player remained opted out. The public transcript remains visible independently
of attention. The player-journal UI does not expose those meeting recipient
records, and the browser download bridge did not yield a raw town export.
Therefore exact post-opt-out recipients/all-eight knowledge replay are proved
by the headless and regression receipts, **not claimed for this hosted run**.

Provider preflight reported 32/50 used, 18 remaining; after the test it reported
48/50 used, two remaining, $0. Production's rolling ledger increased from 22
to 38 settled calls, all $0. Backend starts had a minimum interval of 29,948 ms
(network timing differs from the client's 31-second pacing); no rolling minute
contained more than two starts. No further inference was attempted. Two free
calls cannot support another sixteen-decision qualification run.

Next focus: obtain a narrow, non-content diagnostic for invalid completions,
constrain proposals to the offered action contract, and make a failed final
request terminate the exhausted meeting coherently without showing an unusable
Resume. Preserve every NPC opt-out and actual word. Run a new hosted meeting
only with existing free headroom; do not schedule or buy calls implicitly.

Mobile remains on hold; the prior one-shot automation is PAUSED. Private raw
synthetic towns, prompts and SQL stay ignored under
`artifacts/pass-recovery-20261027/` and its runner; release metadata stays under
`artifacts/pass-recovery-release-final-20261027/` (earlier unserved stages are
preserved in `artifacts/pass-recovery-release-20261027/`).
