# Coffee service: interaction research

Research date: 2026-11-01. Design evidence for A02; no production behavior changed.

## Recommendation

Prototype **named counter pickup** first. The worker prepares a specific cup owned by the buyer and puts it at the pickup counter under café custody; the named customer chooses **Collect coffee**. The cup then appears in that customer's held inventory, where **Keep** and **Drink** are meaningful. Gifting is a later option, outside the selected first slice. A short callout and cup animation can make this feel like a personal encounter without requiring both characters to remain available throughout a multi-step handoff.

This is a proposed interaction contract, not a finding that the current game already supports it. The controlling local context is the latest clarification in `docs/handoffs/a02-economy-astra-2026-11-01.md`: purchases fund real café work; the customer receives an ordinary coffee item; further paid demand can support more staff. Existing shifts, debts and earned wages remain intact. Exact prices, times and capacities still need a bounded model and human playthrough.

The essential distinction is **prepared ≠ received ≠ drunk**. Each is observable, useful and independently recorded. A cup placed on a counter is ready; a cup transferred to its customer is received; drinking consumes it. Calling all three “served” would hide the very interaction being designed.

## Three options

| Model | What the customer actually does | Custody and consent | Worker and capacity consequences | Assessment |
|---|---|---|---|---|
| Direct person-to-person handoff | Stands near the worker; accepts the named offered cup | Cup stays with worker until engine validates the customer's acceptance and atomically transfers it. Offer identifies order, cup and recipient; refusal or departure leaves custody unchanged. Payment consent does not authorize every later gift. | Requires both characters present at commit. A worker carrying an unaccepted cup needs a safe put-down path; waiting for an absent customer must not reverse earned preparation pay. | Warmest encounter, but interruption and scheduling rules are materially larger. Useful second prototype if pickup feels impersonal. |
| Named pickup counter | Reads their ready ticket; approaches counter; chooses Collect | Buyer owns the cup as soon as it becomes ready; café counter retains custody. A valid collect moves that exact cup to its owner's held inventory once without changing ownership. Other customers cannot collect it. No worker co-presence is required. | Preparation work can end at ready placement. Counter space and customer collection remain separate limits; an absent customer can fill a slot without tying up a worker. | Smallest legible first implementation. Preserve worker identity on the ticket and cup so the human connection remains visible. |
| Table delivery | Chooses a table/seat, orders, waits; accepts or takes the cup placed there | Needs a reservation tying customer, table/seat and order. Placing at a table does not by itself prove the intended customer received it. Moving tables, leaving and another customer sitting down need explicit rules. | Adds travel, route availability, seating and delivery labor; a second worker may help as a runner only if that work is separately funded and scheduled. | Attractive café scene, but expands the first slice into seating and delivery management. Defer until walking, presence and pickup are understandable. |

These comparisons are design deductions, not empirical claims about which option players will enjoy.

## What the sources establish

All URLs were checked on 2026-11-01. Dates below distinguish publication information from retrieval date. No source establishes that THE GAME's proposed economy will generate demand or become self-sustaining.

| Source | Documented observation | Application and limit |
|---|---|---|
| [PlateUp! The Buffet Update](https://www.plateupgame.com/updates/1-4-0-buffet/), official game website, page identifies version 1.4 and December 2025 | Customers approach a buffet and collect food after it is placed. The same article describes serving at a hatch or table as other arrangements. | Preparation and customer collection can be distinct visible actions. These are interaction references, not evidence for named-cup authorization, wages, ownership or player enjoyment. Full article text was independently readable. It replaces the earlier wiki reproduction and its unnecessary exact patch dates. |
| [Coffee Talk Devlog #4, Toge Productions](https://togeproductions.itch.io/coffee-talk-demo/devlog/91110/coffee-talk-devlog-4-brewing-the-gameplay-mechanics-and-latte-artfeature), developer-authored, published 2019-07-22 according to the [developer's devlog index](https://togeproductions.itch.io/coffee-talk-demo/devlog) | The team changed brewing to show drink name, appearance and statistics before serving. The article describes an iterated latte-art feature and dialogue consequences. | Make the prepared result and intended recipient inspectable before committing delivery. A named cup and a brief social response may do more for this prototype than a large recipe system. This is historical design commentary, not evidence about autonomous workers, conserved money or commercial demand. |
| [SimPy shared resources](https://simpy.readthedocs.io/en/latest/topical_guides/resources.html), primary project documentation; retrieved version `4.1.2.dev16+gf43816490`, undated | Resources have finite concurrent capacity and waiting requests. Stores contain distinct objects; FilterStore supports selective retrieval. Interrupted requests require cancellation or continued waiting, and resources must be released. | Model workers, brewing equipment and pickup slots separately; match a customer to their own cup and clean up interrupted reservations. This is modeling vocabulary, not a proposal to introduce Python/SimPy into the game or proof that any chosen timings are realistic. |

The selected evidence now consists of the official PlateUp! announcement, the developer-authored Coffee Talk article and primary SimPy documentation. Their relevant text was independently rechecked on 2026-11-01. Earlier wiki search excerpts are no longer needed to support the recommendation. No player forum, guide-site claim or video impression is used as economic evidence.

## Smallest complete pickup contract

1. **Quote.** Customer sees coffee, price, pickup location, worker scope, cancellation boundary and expected availability. Declining changes neither money nor demand. Choosing Buy is a real voluntary order; a model-generated suggestion is not a purchase.
2. **Fund and reserve.** Engine admits an affordable order only when its promised labor and required capacity can be protected. Record one order ID throughout. Separate a queue ticket from a prepared cup. An unavailable counter or workforce produces an honest unavailable/wait state, not an invisible successful order.
3. **Worker accepts.** Worker sees scope, protected compensation and time commitment. Acceptance is distinct from the customer's purchase. Preserve existing wages and work contracts; this research does not replace them with a new fee.
4. **Prepare.** Validated work occupies the required worker and equipment for the chosen time. A successful ready transition creates exactly one cup for that order, assigns ownership to the buyer and places it under café custody in its reserved pickup location. It records who prepared it. A claimed action without the required work, time or place cannot complete it.
5. **Ready.** The named buyer owns the cup; the café holds it pending collection. If the agreed job is preparation plus placement, that work is now earned; customer absence or later refusal to drink cannot revoke it. Ready is not a collection receipt. Show “Coffee ready for [name], prepared by [worker]”.
6. **Collect.** Customer deliberately collects at the pickup point. Engine rechecks order, actor, location, cup, ownership, current custody and destination capacity, then commits one custody transition to the owner's held inventory. Ownership stays with the buyer. Retried requests return the original outcome. This is the first **received** receipt.
7. **Use later.** Keeping is allowed indefinitely in the first prototype. Drink validates ownership and collected customer custody, then consumes the cup once; the history remains. Owning an uncollected cup does not permit drinking it remotely. Gifting is excluded from this slice; a later version would require a separate accepted transfer of that same cup. No stamp, wallet or QR code is required.

The selected contract is therefore **buy → claim to promised coffee; ready → buyer owns cup, café has custody; collect → buyer has custody too**. The earlier research alternative of assigning ownership only at collection is superseded, not a second implementation option. The interface should answer “Where is my coffee?” clearly: the ready cup is yours, and it is waiting at the café.

Do not silently discard uncollected paid cups or call them received at closing time. For the first bounded test, preserve buyer ownership, café custody and occupied slots across days/reload, show unavailable when full, and measure how often this blocks service. Storage relocation, expiry or refunds are later explicit product choices. Preparation payment cannot be clawed back to finance an unpromised refund. If customer refunds after preparation are desired, fund that policy before accepting such orders.

## Staffing and repeatability

Represent at least four independent constraints: willing funded customers, consenting worker time, brewing capacity and pickup capacity. More workers can reduce the labor queue only while labor is the limiting constraint. With one saturated brewer, additional workers may help carry or deliver cups, or may remain idle. With a full pickup shelf, faster preparation may simply fill it sooner. Those are valid model outcomes.

Compare one and two workers using the same arrival decisions, prices, starting accounts and equipment. Also test the second worker with a second brewing position, stated explicitly as extra capacity; do not attribute that combined change entirely to hiring. Show order-arrival, preparation-start, ready and collected times, unfinished work, worker earnings, protected obligations and end balances. Record separate waits for preparation and collection. A shorter preparation queue cannot stand in for more customers receiving coffee.

If a recipe includes unattended brewing, specify whether the worker is released while the machine runs; otherwise the model can accidentally count one worker in two places. A ready cup frees brewing equipment but not its pickup slot. A collected cup frees the slot even if the customer never drinks it. New demand must come from explicit customer decisions and existing funds, not from the mere existence of staff, stamps or receipts.

## Checks worth carrying into acceptance tests

- Two customers' cups become ready together: each can collect only their own named cup; a failed attempt changes no balance, custody or receipt.
- Customer walks away before preparation, during preparation or after ready: the corresponding cancellation terms apply; completed labor remains earned; no fake collection appears.
- Worker is interrupted or stops consenting: pending reservations are retained or cancelled by a declared transition; no resource is leaked and no successor is paid for work not done.
- Pickup shelf fills with uncollected cups: additional admissions obey the declared capacity policy and do not charge for unavailable service; reload preserves the block honestly.
- Duplicate or stale ready/collect/drink requests: one cup, one valid owner/custodian, one earned payment and at most one consumption survive retries and reload.
- A ready but uncollected cup already belongs to its buyer: reload preserves that ownership and café custody; remote drink and attempted gifts are unavailable in this slice.
- Customer keeps coffee for several days, then drinks it: no expiry, forced consumption, bonus wage or second item appears.
- Two workers share one fully occupied brewer: the model is allowed to show no throughput gain. Two workers and two brewers must still respect pickup and demand limits.

## Human playthrough before adopting the rules

Use an unpriced paper/UI walkthrough first, then the same seven-day synthetic numbers. Ask the participant to buy, leave while it brews, return, identify their cup, collect, keep one cup and drink another. Ask them to explain where the money went, when the worker earned it and whether their cup still exists. Observe confusion rather than explaining the intended answer first.

Useful prompts for the next session: Does collecting feel like receiving a coffee? Is seeing the worker's name enough, or is an actual shared handoff the enjoyable moment? Would you buy a second coffee without a collectible reward? Does keeping a cup feel playful or cluttered? Is a busy café readable and amusing when a second worker joins? If all pickup slots are occupied, does the offered next action feel fair? These require human answers; the queue model cannot answer them.
