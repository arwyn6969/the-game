# Implementation plan: funded work and a consequential first week

Proposed work, 12 October 2026. Read the [roadmap](../ROADMAP.md), [experience](../design/consequential-first-week.md), [economy](../design/economy-and-fair-contribution.md) and [release evidence](../RELEASE.md). Main at planning: `900015b`; published runtime: `4e7786c`. No feature in S1–S5 is implemented by this document.

## Ownership and rollout

Sol owns `src/game/**` excluding concurrent render work, the save/action contracts and regression tests. Inspect PR #11 before UI work: it changes TownApp, render, styles and root assets. Define additive UI contracts during S1; name one integration owner on a stable visual baseline for S2. Preserve auth, PWA, the provider and the host.

S1 is a reviewable foundation with migration and command tests. It may land unused helpers; it must not activate half a ledger or change a player's financial terms before the matching UI exists. S2 activates the coherent account/work/project rules and player-facing terms together. Use one explicit initialization/migration boundary, not independently enabled fragments. Publication remains a separate release action.

## S1 — Accounts, work contracts and compatible state

**Outcome:** one authority can explain where every coin came from, what is reserved and what is owed. Stop before authored project UI and ordinary-play activation.

Add one optional, validated extension to `Town.version === 1` for opening balances, transactions, holds, agreements, work receipts, command receipts and eventual project/event state. Choose names in code and document them in the handoff. Existing personal purses and business tills remain the authoritative balances behind account IDs; project custody adds its own balance. Do not keep two independently mutable copies of money.

A legacy import records valid existing balances as migration opening balances, not historical earnings or new issuance. Preserve names, memories, debts, creditors, projects, pause and recorded shift progress. Missing extension migrates once. A malformed extension, contradictory account total or edit by an older runtime must retain raw recovery data and fail with an explanation; do not silently rebuild books, rename financial IDs or fabricate a balancing entry. No downgrade round-trip is promised to an older runtime that cannot maintain the ledger.

A command validates issuer/authority, actor, target, terms/revision/expiry, eligibility, funds and completion evidence. Commit its balances, holds, work state and receipt together or not at all. Stable command IDs make retries return the original result without repeating effects. UI memories derive from the receipt. Model text cannot authorize the player's obligation or declare completion. Corrections append an authorized reversal/adjustment with a reason.

### Accounting invariants

- Integer nonnegative cash; available cash = balance minus active holds. Hold totals cannot exceed cash. A hold earmarks money and does not spend or create it.
- Each transfer has a stable ID, source, destination, amount, game time, purpose, agreement and authority. Issuance/retirement are separate, explicitly authorized event types.
- Closing total = opening total + recorded issuance − recorded retirement. Ordinary transfers, fees, grants between town accounts, holds and refunds preserve total money.
- On S2 activation, all balance mutations must use this authority, including existing wage and debt paths. Remove unexplained midnight top-ups and destructive absolute till caps together with that activation. The bounded demonstration has no recurring external issuance. Fresh opening money is 77; imports keep their own valid total.
- Legacy bread tabs retain Baba personally as creditor. Paying them credits her purse. Future business sales need a new disclosed business-creditor agreement; do not reinterpret an old debt as grocery revenue.
- Earned payables, active holds and command receipts survive midnight, cancellation, reload and memory compression. A full recipient purse delays settlement without deleting the payable.

### Funded work and legacy shifts

A new library offer names worker, payer, task, evidence, integer fee, expiry and cancellation terms. Acceptance atomically holds the whole fee. Each paid unit is one bounded check/report defined in S2, worth 2 coins. A completed check can report failure or uncertainty and still earn its fee. Interruption saves progress. Cancellation pays completed units, releases only unearned holds and creates no new obligation; an incomplete unit earns no fee, stated before acceptance. A subsequent correction is a separate paid unit.

Protect existing payroll before project funding. Identify valid active workplace agreements and reserve their disclosed full wage. An account with any unresolved or underfunded prior wage claim is ineligible to contribute, even if its cash balance is positive. Resolve/classify the claim and fund its hold before re-evaluating a grant. Show unavailable funding before more work is offered. Existing tracked work must not be erased to release cash for the library.

The old `shiftHours` aggregate cannot prove every minute's employer. Preserve it, `paidToday`, old terms and date as labelled legacy evidence. Unambiguous completed unpaid work can be recognised as an outstanding claim using those records; ambiguous progress remains visible for an explicit funded recognition agreement. Never invent earnings already lost by an older build. Never pay an already-paid shift twice. An unfunded claim is a liability, not spendable cash.

**Bounded shift default:** do not introduce fractional-coin proration or redesign general jobs in this packet. A newly funded replacement café agreement keeps 5 for 180 employer-bound eligible minutes; interruption suspends it with progress and its hold intact. Cancelling future attendance does not erase accrued progress or a completed payable. Partial progress remains a resumable, visible claim until the worker accepts a disclosed settlement/replacement; no automatic cash proration or silent release of its hold. If this adapter cannot safely classify a legacy agreement, preserve it and show that funding is pending rather than pretending the whole economy is fair. New project units can be paid from eligible, already-funded project custody; this does not waive the donor-account payroll gate. Update any old UI text promising midnight erasure before activating these rules.

**Acceptance:** fresh/imported reconciliation; balances above old till caps survive a day boundary; exact old-creditor payment; competing payroll/project holds, including rejection of a 4-coin donor till with an unresolved 5-coin wage claim; duplicate/stale/wrong-person/insufficient-fund commands; rollback on partial failure; recipient-capacity failure; existing paid/part-worked/unpaid/ambiguous shifts; repeated migration/import; corrupt extension recovery. Use engine fixtures without a provider. Audit every direct `.money` and till mutation for the activation handoff.

## S2 — Three records, one funded project

**Outcome:** normal controls let a player do useful paid work, inspect its receipt and use the resulting library index without an API key. Depends on reviewed S1 plus a stable UI baseline.

### Discovery and deterministic session

At the paused 07:00 fresh start, the existing guide points to Kevin's nonbinding “Library project” choice and the same public offer on an interactable board at the library entrance. The board is usable without a nearby resident. Reading either creates no obligation, spends nothing and does not start the clock. The offer names Northern's missing record, the two paid preparation roles, budget and next action.

After an explicit funded acceptance, evidence cards and box inspections are available directly at the library. NPC advice and the other preparation report are authored, sourced task-card interactions; they need no model call or chance conversation. A separate “Request the other check” action assigns its funded unit to Arwyn (source) or Kevin (reference), records that resident's acceptance, and makes the completed report available as a written response. This bounded off-site check uses the supplied public records and the player's recorded box observations. Require those observation IDs before Kevin can complete the reference report; Arwyn checks the authored source cards. Do not claim the resident physically witnessed the player's inspection. An unavailable worker leaves that unit visibly pending instead of silently working for free.

“Test this index” freezes a submitted revision and books Northern's funded lookup. For this authored session, route him to the library using the normal pathfinder and a temporary project appointment, then visibly search the submitted box. Do not depend on his ambient destination or teleport him. Show the route/arrival estimate and offer an explicit “Wait for the lookup” time advance; show the game minutes and existing time-sensitive agreements before confirmation, advance ordinary simulation rules, and allow normal walking/time controls instead. Never displace an active paid commitment without its agreement. A blocked route or ineligible worker keeps the test pending with a reason; it consumes no fee until the search/report is completed. The fresh fixture must guarantee an eligible Northern and a reachable route. Imported towns may truthfully remain pending.

Acceptance includes an uncoached, no-key journey from the actual paused 07:00 fresh state to payment and visible lookup inside the 10–15 real-minute target. The existing guide, board and task cards must make each next step discoverable. Test the wait preview, cancellation, pause and save/reload while Northern is en route. No generic scheduler or instant background completion of arbitrary jobs is required.

### Authored fixture and completion evidence

These are fictional public records, unrelated to private character seeds. Store their immutable IDs separately from editable labels; add deterministic fixture tests before UI integration.

| Record                                       | Correct box | Initial problem                                   | Evidence                                                                                               |
| -------------------------------------------- | ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `hobbs-equipment` — Hobbs equipment register | Birch       | Old shelf number no longer identifies the box     | Kevin's public reference card identifies the stable box ID                                             |
| `dorm-repair` — Dormitory repair request     | Alder       | Two labels use the same short title               | Arwyn's dated source card distinguishes the records                                                    |
| `room-access` — Community room access note   | Cedar       | Loose card points to Birch; its date is uncertain | Day-one box inspection proves Cedar; Baba's later delivery note resolves the uncertain historical date |

Pin these IDs, facts and expected lookup results in tests. All three boxes and the Kevin/Arwyn reference cards are available on day one. Direct inspection can verify the current Cedar mapping while the historical date remains unknown; these are separate fields. Baba's day-3 evidence is not required for a successful first-session lookup or earned payment. Wording can change without changing the oracle. No live external research or generated evidence is required.

The player chooses source checking with Arwyn or reference testing with Kevin. One unit covers the three displayed records, an interaction with each relevant evidence card/box and a structured report of verified/unresolved mappings. Fee 2 covers that bounded scope and report. Completion checks that the required observations and report exist, not whether the player guessed a preferred answer. Selecting an unsupported mapping must keep it provisional; it cannot become verified by prose. The other preparation unit goes to the named eligible resident through the explicit request above, using the same funded rules. Northern performs the independent lookup and receives 2 for a recorded search/result, including a failed lookup; he cannot verify his own preparation.

### Reports and the tested revision

Keep source and reference reports as attributed evidence. They do not silently overwrite each other or the player's draft. After both reports exist, show any disagreement and let the player submit a draft mapping for each record, including “unresolved”; declining authorship delegates that explicit submission to Arwyn with NPC attribution. The authored NPC draft uses supported mappings and preserves unknown dates. NPC reports may point out the right box but cannot automatically repair a player's submitted draft.

A mapping is **verified** only when cited observed evidence supports the actual box; a selected unsupported/contradictory box is **provisional**; no selected box is **unresolved**. Historical-date confidence is separate. Explain these labels before submission. A deliberate unsupported selection is allowed for the prototype test, earns no accuracy bonus and cannot be published as verified. Northern tests the exact frozen revision/record ID; an intervening edit creates a new revision and requires a new explicitly funded test. Record the revision used in the result. A single lookup cannot make all other records verified.

### Budget and result

Kevin and Baba each make a distinct authored funding decision: 4 available café coins and 4 available grocery coins. Apply both contributions atomically after protecting payroll; otherwise leave the offer pending with a reason. Funding transfers existing money into project custody. Acceptance reserves the three fees of 2; 2 remains for a separately offered correction. A worker can perform both preparation units when explicitly assigned, but lookup requires a different worker. Bounded advice from residents is explicitly voluntary; the actual required preparation, lookup and correction are paid. Do not add hidden mandatory unpaid coordination.

Northern visibly tries the submitted `room-access` reference. A verified mapping reaches Cedar; a wrong or unresolved mapping visibly fails and remains provisional. The player can also use a persistent library “Find a record” interaction that shows the recorded source and route/box. A successful project changes access to this useful interaction, not merely a congratulatory line.

Sub's public notice can show verified entries only or include clearly marked provisional entries. It cannot overrule the index state. Credit records the actual workers. The index is a common resource: no shareholding, automatic voting power, wealth gate or exclusive access.

Refusal creates no debt or trust penalty; offer the same paid work to NPCs or leave it pending. Withdrawal retains actual completed receipts and earned money. Pay honestly completed checks even when the index fails. Any necessary correction uses a new funded task; no wage confiscation. Closure first settles earned liabilities and cancels/releases unearned units under their disclosed terms, then refunds **all** remaining unencumbered custody equally to the two equal contributors. This means 4 each before any work, 3 each after one 2-coin payment, 1 each after the three fees, and zero after all three fees plus the correction. An unsettled payable blocks final closure; it is never refunded to funders. All prototype transfers use 2-coin units, so these equal refunds are integers. Reinvestment requires a new decision.

**Acceptance:** offline normal-control paths for verified/provisional/failed lookup, refusal, withdrawal, correction and closure; duplicate evidence/commands cannot earn twice; no worker verifies their own preparation; low personal wealth blocks neither work nor use. Reconcile all 8 coins through holds, actual fees and refunds, including closure before work, after one fee, after three fees and after correction. Show payment correctness and usefulness as separate outcomes. Reload midway and after every settled task; preserve older v1 towns.

## S3 — A different tomorrow, with responsive controls

**Outcome:** the player can recognise their own consequence on later game days.

Persist index revisions, attribution, unresolved mappings, receipts and witnessed public events as structured state. Day 2: Northern names the actual entry used or the specific failed lookup; Arwyn uses the verified result or visibly retains a provisional version. Days 3–4: Baba's public delivery note resolves the historical date and can support a separately funded correction of a provisional mapping or attribution. A correct day-one mapping remains correct. Days 5–7: show the final credited revision or honest unfinished status; never close with unpaid liabilities. A day change reveals follow-up; real-world absence does not create failure.

Project/public meal events have separate participant and witness projections based on place, range and presence at event time. Reading a notice is a source of knowledge. Distant residents do not magically know a conversation. Never publish private prompts, reflections or hidden identity material. A character's acknowledgment cannot assert the player's feelings or unchosen promise.

Use a separate commit/PR for background-job changes. Replace ambient-request movement freezes while preserving town identity, job/revision tokens, stale-result checks, replay boundaries, draft preservation and one-time fallback/application. Deterministic choices stay usable. If a relevant event changes during a delayed reply, revalidate or discard its effects. A late job must neither mutate an imported town nor clear a newer job's busy state.

**Acceptance:** correct and provisional week paths, declined/withdrawn attribution, midweek reload, no distant/private knowledge leakage, day-5/day-30 state growth and round trips. Test slow/missing/reordered/duplicate model results without paid calls and perform desktop/phone journeys.

## S4 — Bread and one optional shared meal

After the library is useful, add a visible carrying/inventory action for eating. Keep the current honest rule: no health/energy bonus is implemented by eating. Add one explicitly confirmed shared meal with Baba or Northern around the project's public result. Show invitees/acceptance before consuming the held loaf; a declined invitation keeps it. The loaf is consumed once, its old debt remains payable, and attendees receive a sourced meal memory and one optional next-activity invitation. No automatic affection purchase, hunger timer, progress gate or compulsory food expense.

This packet does not build a general food-production economy. Preserve the existing loaf/debt migration. Any new sale must state its creditor and item source. Test eat-versus-share exclusivity, stale invitation, absent resident, debt preservation, repetition, reload and declined invitations. Test whether players can explain a reason to share; if it adds only decorative prose, revise the encounter before expanding items.

## S5 — Evidence and delivery

Run the [five-player diagnostic](../design/consequential-first-week.md#five-player-diagnostic-gate), including optional further visits and separate questions about funding, payment, usefulness and ownership. Keep prototype measures distinct from retention or fairness claims.

For each packet, run relevant regressions. For an integrated runtime candidate run Node 24 typecheck, lint, `npm run test:town`, `npm test`, `npm run diagnose:town`, and `env -u DATABASE_URL -u XAI_API_KEY npm run build`. Keep production credentials out. Check actual UI at 1280×800 and 390×844: movement, nearby choices, reading replies, pause/speed, reload, imports/exports and recovery. Record physical-phone and provider coverage honestly.

Each PR/handoff records packet, exact base/head, included UI baseline, behavior, commands/results, migration, remaining limitations and next packet. Update status only when that gate passes. Runtime completion is not a hosted release: publication needs the current user's release instruction, a restorable source, supported deployment and direct verification of the actual live version.
