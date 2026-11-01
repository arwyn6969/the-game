# A02 readiness: human work, controls and service lifecycle

Review input and independent findings are retained below. Final selected decisions and dispositions are in the [canonical readiness plan](../a02-cafe-readiness-astra-2026-11-01.md).

Independent source/product review · 1 November 2026 · No runtime changes

Reviewed the coffee specification and handoff at lane head `7105913`, with
runtime source inherited from `a26714e03192a17acaa963d7d2681e74a1ac425b`.
The author wrote only this report. No browser trial, live model call, production
test, external communication or gameplay implementation was performed.

## Verdict

The intended experience is coherent: a human voluntarily accepts funded café
work once; their character performs routine service; customers receive real
owned coffee; receipts distinguish preparation, collection and consumption.
The current documentation was **not yet a complete human-worker implementation
contract**. Most missing decisions are control, scheduling and recovery rules,
not a need for more recipes, NFTs, agents or a new economy system. The payment
choice remains for the root audit to reconcile; controls can support either
shift or per-order pay, but must not imply the contracts are interchangeable.

The decisive human test is whether this feels like participating in an amusing
living café, with understandable consequences. Accounting and path probes do
not establish that. No amount of synthetic review warrants a claim that every
possible defect is excluded or that retention is proven.

## Material findings and dispositions to put in the final contract

| Priority | Finding and source | Required decision / acceptance |
| --- | --- | --- |
| P1 | **Player automatic movement does not exist in the NPC movement pass.** `navigation.ts:108–115` iterates `NPC_IDS`; the player's manual/route movement is a separate animation-frame path in `TownApp.tsx:1834–1937`, with a real-time movement cooldown. Merely adding a coffee goal does not move the player. | Add an explicitly authorized player-service movement path driven by the same core game ticks as coffee work, or a carefully defined shared movement arbiter. Never run manual route and automatic service movement concurrently. Human/AI work should receive the same declared movement budget; render speed must not award extra work. |
| P1 | **The existing manual route can move while the game is paused.** `stepPlayer()` runs before the clock guard (`TownApp.tsx:1952–1971`); the help explicitly permits paused walking (`PlayerTools.tsx:186`, `:456`). Reusing `routeRef` unmodified would let “paused work” travel without town time. | Preserve ordinary paused manual walking, but stop automatic coffee travel and preparation when town time is paused. Manual movement interrupts the service routine before displacement/eligibility calculations, including an attempted move into an obstruction. |
| P1 | **+Hour bypasses animation-frame movement and advances core ticks even while the ordinary clock is paused.** `TownApp.tsx:2180–2217` runs up to 60 `stepMinute` calls; debug `advanceTown` also loops core ticks (`sim.ts:247`). | Define +Hour as explicit simulation advancement. The same preconditions, moves and work transitions must execute per tick. Given identical decisions, 1×, 4× and +Hour must produce equivalent state at the same game time; only rendering and possible existing dialogue interruption differ. Never bulk-credit an hour from a timer. |
| P1 | **Foreground conversation freezes the clock.** `foregroundPendingRef` gates town advancement (`TownApp.tsx:1966–1970`); player AI dialogue sets it (`:1611`). Local dialogue applies synchronously (`:2378+`). | Say “You can use compatible panels or conversation; work advances only when town time advances.” Do not promise simultaneous progress during every AI reply. Never make paid model calls a requirement for serving. If AI is unavailable, ordinary local coffee controls continue to work. |
| P1 | **Payroll and service need one precise minute convention.** `sim.ts:188–193` credits payroll before incrementing time and moving residents; new service work added after movement could otherwise be credited in a different interval. Existing player shifts use `[16:00,19:00)` (`funded-work.ts:1079–1094`). | Freeze one tick's start/end eligibility and attendance/service attribution. Test 15:59→16:00, 18:59→19:00, the 180th eligible minute, service completion at the boundary, manual departure, pause and midnight. No order may acquire unpaid out-of-shift labor from ordering alone. |
| P1 | **“Finish this order, then stop” does not settle a partial 5-coin shift.** The current agreement preserves progress and owes the full fee only at 180 eligible minutes. A prepared cup can finish much sooner. | Show separate service progress and wage progress. Finish-current disables new orders, completes only the accepted coffee if within the allowed work interval, then suspends work. It never promises a fractional wage, cancels earned wages or forces work beyond the shift. “Pause now” is always available. |
| P1 | **Shift end during preparation is unspecified.** A paused cup can hold the brewer indefinitely, and a next worker cannot safely inherit it without a custody/progress rule. | Root must choose carry-over, explicit reassignment with persisted progress, or cancellation/refund before ready. Whichever is chosen, keep wages earned under their own terms, retain the buyer's liability until a valid ready/refund outcome, and show who/what is waiting. Do not silently complete the cup at 19:00. |
| P1 | **Saved automatic authority must not revive unexpectedly.** Imports clear transient routes, requests and automatic meetings (`TownApp.tsx:655–703`), but a new saved coffee routine could restart on mount because saved `paused=false` resumes clock at 1× (`:326`). | Persist order/progress and bounded consent separately from active control. Reload/import/replay exit should show a resumable work state and require explicit Resume before automatic player control or another assignment. A completed/expired grant cannot start a new shift. Include cloned/forked towns and stale callbacks. |
| P1 | **Hidden-tab behavior is not a reliable offline simulation contract.** The RAF delta is capped (`TownApp.tsx:1947–1950`); `onHide` saves but does not generally stop the clock (`:2061–2073`). Browsers may throttle frames. | Adopt an explicit local policy: suspend automatic player service on hide/pagehide, preserve progress and resume explicitly. If the design also pauses town time, say so and use existing pause machinery. Do not claim exact background productivity, wall-clock catch-up or progress while closed. Preserve already-valid legacy attendance rules rather than retroactively rewriting their wage history. |
| P1 | **Non-conflict save failures do not stop all town activity today.** `persistTown` stops automatic meetings for any failed save, but pauses the clock only for conflict (`TownApp.tsx:603–623`). | A new coffee automation session must stop accepting/processing further work after quota/storage/serialization/conflict failure and show a retained-unsaved-state warning/recovery action. Persist financial/custody boundaries and recover the existing result; don't say “saved” before persistence succeeds. Preserve live state/raw recovery bytes. |
| P1 | **A repeatable activity grows durable evidence indefinitely.** Save files have an 8 MiB import/export limit (`save.ts:19`, `:774–786`, `:852–857`); quota fallback drops replay only, preserving story/economy. Per-tick work records plus completed-order/cup tombstones can become a practical limit. | Bound pilot admissions and measure serialized growth. Stop new orders before exhausting the recovery margin; continue settling existing obligations. Define later compaction/archive rules separately, with replay/receipt verification and no deletion of live liabilities or identities. A few seven-day tests cannot qualify unlimited duration. |
| P2 | **Start and manual override can race.** Keys, touch steps and route destination are held separately (`TownApp.tsx:325–342`, `:1741–1799`, `:1837–1847`). Existing keyboard focus guards distinguish controls from game input. | Start clears stale movement intent. Only genuine player movement commands suspend service; typing or arrowing in a form must not. Suspend before any next auto move/work tick. Touch pad, keyboard, click-to-walk and destination controls share this behavior; inspecting a cup/person should not unexpectedly cancel work. |
| P2 | **Stop must remain usable during AI/busy states.** `chooseAction` rejects foreground-pending calls (`TownApp.tsx:722–734`); generic `ActionCards` disable all buttons when busy (`ActionCards.tsx:15–31`). | Provide local Pause/Stop control independent of a model request or ordinary action-card busy state. It cancels the routine grant, not already-completed ledger entries. Revoke/ignore a late callback that tries to restore the old routine. |
| P2 | **A financial ticket queue is not yet an implemented physical queue.** Six simultaneous modeled buyers are abstract decisions; actual single-tile counter presence cannot occur simultaneously. Existing resident movement has one pass, real occupancy and prior commitments. | Define first slice as ordered tickets with one reachable pickup interaction, plus honest waiting characters where possible. Do not promise a choreographed line until positions and movement priorities are specified. Never teleport, overlap residents or make them abandon a prior meeting/library agreement. Reconcile measured actual arrival times with synthetic timings. |
| P2 | **Blocked, paused and quiet are different paid states.** A funded attendance shift pays for eligible attendance even when no order arrives; machine wait, shelf wait and player routine pause have different implications. | Show “Waiting for orders”, “Brewer occupied”, “Pickup counter full”, “Work paused” and “Shift complete” distinctly. A quiet funded shift must honor its quoted wage. Do not secretly make wages depend on sales after acceptance. Any new readiness-to-work condition must be disclosed for a new contract rather than applied retrospectively. |
| P2 | **Persistent uncollected cups can intentionally stop service.** Two ready cups fill the proposed shelf; four kept cups fill one buyer's bag. This is legitimate under no-expiry terms, but can make the loop appear broken. | Keep the no-silent-deletion policy and expose the next lawful actions. Do not pressure/force another actor to drink, confiscate an item, fake pickup, or reverse a worker's wage. Measure blockage in playtests; a later storage/disposal policy is a product choice, not a bug fix. |
| P2 | **The player's usable inventory summary is currently loaf/manuscript-specific.** `PlayerTools.tsx:88–94`, `:417–445` can say “Your bag is empty” despite a future coffee extension. | Extend summary, keyboard focus recovery and available actions together. Each cup must identify maker/order/owner and its actual state. A consumed cup may remain in history but cannot look usable. The visible scenery cup must not be mistaken for inventory. |
| P2 | **One-use actions can remove focus; progress may flood announcements.** Existing inventory feedback/focus recovery is at `PlayerTools.tsx:79–85`, `:403–414`. | Keep native labels, visible disabled reasons and focus recovery for Collect/Drink. Announce phase changes/blocked reasons, not every simulated minute. Provide progress as text, not color or animation alone. Test desktop, phone, keyboard, touch and screen-reader order. |
| P2 | **The existing source must not receive new UI promises through dialogue alone.** Current financial/actions use exact command guards; appearance/status is not proof of coffee. | The single source of truth is engine order/work/cup state. Dialogue can explain or propose actions but cannot purchase, accept a shift, place, collect or drink. Public callouts/receipts need ordinary knowledge/audience rules; private financial details do not become universal NPC knowledge. |
| P2 | **Demand and enjoyment are hypotheses.** Buying another coffee has no survival/stat bonus in this slice, NPCs may hoard, and collectibles are deferred. | Test voluntary repeat choice and café social legibility separately from conservation/throughput. Do not add forced hunger, compulsory spending or fresh purse grants merely to make a stress model stay active. A quiet café can be correct. |

These are contract gaps for the new feature, not claims that the unchanged
source currently violates a coffee contract that it does not implement.

## Recommended bounded human flow

The human-facing entry should disclose one work commitment, not expose several
implementation agreements as indistinguishable “shift” buttons. For the root's
likely shift candidate:

1. At Kevin, **Accept café shift — 5 coins** shows the exact scheduled window,
   180 eligible game minutes, full reservation, quiet-period pay and preserved
   partial progress. Already-accepted shifts retain their old terms. An optional
   service-control grant is distinct from accepting/altering a wage obligation.
2. **Start serving** (or the clearly disclosed final acceptance action) grants
   automatic movement and service only for this agreement's remaining allowed
   interval. It uses no model calls for routine steps. Staff, brewer and shelf
   constraints remain real. The game should not demand manual clicks per cup.
3. The status remains reachable without hunting Kevin: **On shift · 45/180
   eligible minutes · brewing Arwyn's coffee · 5 coins reserved**. This is a
   suggested UI string, not a promise of its final visual design. A separate
   customer ticket shows paid/queued/brewing/ready/collected/consumed honestly.
4. **Pause now** revokes active routine control immediately. **Finish current,
   then pause** prevents assignment of another order; it ends at ready placement,
   not at the customer's eventual collection. If the shift window ends first,
   follow the chosen unfinished-cup policy without forced overtime. Resuming
   does not create a second wage agreement.
5. At the work boundary, the engine settles or retains the correctly earned
   wage and displays a short factual result: attendance, coffee outcomes, pay
   and outstanding cups. A full purse means payable pending, not unpaid labor
   erased. The next shift needs separate funding and explicit consent.

At 1× the current clock nominally advances one game minute per real second
(`TownApp.tsx:1972–1975`), making 180 game minutes about three real minutes;
4× is about 45 seconds, excluding pauses, dialogue and interruptions. This is
source arithmetic, not a measured browser benchmark or a speed guarantee. Use
game-minute terms in agreements, and plain real-time guidance only if measured
in the actual integrated controls. Do not confuse a three-hour game shift with
three hours of human labor.

## Minimum persisted control state

Keep the design small but explicit. The future routine needs a reference to its
worker and existing work agreement; exact terms/control grant version; active,
paused or ended status; stop-after-current flag; bound order ID if any; permitted
shift interval/order ceiling; last processed game tick; and an interruption
reason. Derive route destinations from the current phase and world geometry;
do not persist arbitrary unvalidated UI callbacks or trust stale route arrays.

Ownership/financial work state outlives control state. Revoking the routine must
not cancel a paid order, erase its progress or move its held funds by implication.
Rendering changes, opening a panel or swapping controllers must not silently
grant another work period. Resume rechecks identity, location, current agreement,
saved limits, outstanding order, destination occupancy and funds/obligations.
Changes to imported/forked identity scope must be honored by stale callback guards.

## Sequencing recommendation

For each game-minute transition, use an explicit shared scheduling contract:

1. Observe cancellation/manual-override and session validity first.
2. Determine eligibility for the interval using the established payroll convention.
3. Allocate at most the declared movement budget per actor, under one arbitration
   rule; no independent coffee movement pass after ordinary movement.
4. Credit coffee work only when physical presence, resource lease, phase and the
   interval's work eligibility actually hold. Walking does not also brew.
5. Commit readiness/custody/payment facts atomically; release/reassign resources
   under their declared rules; prevent another acceptance after a stop boundary.
6. Persist relevant boundaries; on failure stop further automatic mutations and
   expose recovery. Rendering/animation follows state and cannot create evidence.

The implementer must reconcile the exact ordering with existing payroll before
adopting it; this is a required contract, not an instruction to reorder all
simulation indiscriminately. Existing legacy attendance evidence and NPC
movement budgets must remain valid.

## Acceptance matrix for this product/control audit

| Case | Expected evidence |
| --- | --- |
| One Start, one funded shift | Multiple real accepted orders progress without further clicks; no extra wage per cup when shift pay applies |
| Normal/quiet shift | Correct attendance pay with zero, one and many customers; new offers require real available funding |
| Mid-task pause | Zero subsequent automatic moves or work ticks; preserved order/progress/funds; immediate accessible Resume/Pause control |
| Keyboard/touch/destination override | Override wins before next tick, including blocked movement; no input “tug of war”; form arrow keys do not cancel work |
| Stop-after-current | No second assignment; ready placement completes current unit; absence of customer does not trap worker |
| Shift-end boundaries | No new order outside allowed interval; exact final attendance tick; declared handling of partial brew/placement and next-day continuation |
| Simultaneous worker/collision | No overlapping avatars, unavailable station claimed once, player obstruction respected, path detour/wait truthful |
| 1× /4× /+Hour | Equivalent engine state at matching times under identical fake decisions; no extra player travel or bulk progress |
| Paused walking | Human can still move while paused; automatic work cannot move/brew; manual action suspends active routine |
| AI/local conversation | Foreground pending status explains stopped clock; local dialogue is optional; no AI dependency for coffee |
| Hide/close/reload/import/replay | Explicit local policy, no wall-clock catch-up; records survive; automatic player control resumes only by current consent |
| Save failure /two tabs | Stop automated work on any persistence failure; preserve raw/live state; no duplicate accepted job, cup, wage or receipt |
| Shelf/bag full | Truthful reason; existing ownership and wages survive; no forced drink/destruction; resumed capacity works after lawful collection/use |
| Long-lived repeated town | Save-growth measurement, usable export, admission stop before unrecoverable size; existing liabilities drain without deletion |
| Accessible completion | Focus retained after Collect/Drink; labelled status/terms; keyboard/touch controls; no every-tick screen-reader chatter |
| Knowledge | Ready does not imply received or drunk; factual private/public receipt visibility; late dialogue cannot complete service |

All of these are **future integrated acceptance requirements**. Prior model
tests, source review and static geometry support only their explicitly stated
scopes.

## Human diagnostic before claiming readiness for general use

Use three to five people, including someone unfamiliar with the project. First
observe a paper/interactive walkthrough, then an integrated local slice. Ask
them to accept work, start it, talk/read, interrupt, resume, stop after the
current order, see a quiet shift, buy coffee, leave, return, collect and keep or
drink it. Introduce a full counter and an unfinished order at shift end.

Before explaining, ask: Who controls your character now? Can you stop? What is
already earned? Where is your coffee? Where did the price go? Why is the café
waiting? What continues when the tab closes? What would bring you back tomorrow?
Observe incorrect expectations, hesitation, unwanted movement and repeat
purchase choices. Record comprehension separately from enjoyment and purchase
intent; do not treat a participant's politeness as evidence of retention.

Recommend a threshold for the initial pilot: no participant needs repeated
serving clicks; everyone can stop without help; everyone can distinguish ready
from collected and explain the wage basis after one encounter; no unresolved
blocking accessibility or lost-progress issue. Enjoyment remains qualitative
feedback and may lead to a direct-handoff comparison. Passing this diagnostic
does not authorize real payments, public minting or deployment.
