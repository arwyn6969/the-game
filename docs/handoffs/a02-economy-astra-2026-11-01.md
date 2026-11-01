# A02 economy handoff — Astra design lane, 1 November 2026

## Current delivery: comprehensive readiness audit

**Use the [audited café implementation plan](../implementation/a02-cafe-readiness-astra-2026-11-01.md) as the single current brief.**
The user's latest request was a comprehensive audit before implementation.
Independent product/control and financial/integrity reviews found material
omissions in the earlier proposal. The revised contract resolves them as
explicit decisions and integrated acceptance tests. Earlier evidence below
remains historical; the old 2-coin per-cup wage is not the selected plan.

**Recommendation:** proceed with a bounded local implementation and test it.
The design is not yet qualified for ordinary play, production or external
payments. This audit made no runtime/schema changes and did not run live AI,
wallet operations, deployments or other chats. Sol retains A01/runtime and
shared status/framework ownership; the UI lane must coordinate its changes.

### Selected loop and human experience

- Keep Kevin's existing **5 coins / 180 eligible game minutes**, fully funded
  before acceptance. Quiet periods still count under the agreed attendance
  rules; no extra per-cup payment and no retroactive new conditions.
- Coffee costs a proposed **2 town coins**. Hold its full price separately
  until the cup is ready. Ready releases that receipt as business money for
  later obligations/payroll; it does not create another transfer. A buyer may
  receive a full refund before ready, including partial work. Staff wages and
  accrued attendance remain independent.
- One explicit Start permits automatic legal walking, brewing and counter
  placement. Immediate manual/Pause override suspends the shift and releases
  its task assignment; retained work can pass to another funded consenting
  worker. Finish-current must credit the final attendance interval before
  suspending. No forced overtime or automatic new-shift acceptance.
- Named pickup transfers the actual buyer-owned cup into inventory; keeping
  and drinking are separate. Uncollected cups retain ownership and occupy the
  two pickup slots. No forced expiry/disposal; full counter is an intentional
  pilot stop with truthful UI, not permission to erase cups or wages.
- Preserve finite money, existing debts/library commitments and all eight
  identities. Human purchases and authored NPC choices remain voluntary. Extra
  staff require real funding and usable demand/capacity; faster service is not
  evidence of more sales. QR, Emblem/ECX and stamps remain later integrations.

### New evidence

[Evidence directory](../implementation/a02-readiness-2026-11-01-evidence/):

- `shift-model.mjs` / report / JSON: **22 scenarios**, including seven-day
  traces, conditional 28-day circulation, full recipient purses, partial refunds,
  reassignment and 12 seeded mixed schedules with exact JSON-reload equivalence.
  Same 6 purchases/one brewer: one worker finishes at 180 / pays 5 / café 29; two finish at 130 /
  pay 10 / café 24. These are hypothetical game timings without physical travel.
- `current-regressions.tap`: **114 existing engine tests pass** across economy,
  commerce, identity, save, player actions and physical items. These do not
  claim coverage of unimplemented coffee behavior.
- `source-probes.mjs/json`: three actual source shifts, 540 eligible minutes and
  540 duplicate attempts; no serving required; money/identities/save-load remain
  correct. Generic additive projections become detached after finance commits.
  Source saves grew 69,049→209,565→358,329→506,865 bytes at the measured checkpoints;
  these are synthetic direct-payroll observations, not a 30-day browser result.
- `product-audit.md` and `integrity-audit.md`: independent reviewed findings
  and required tests. Final review corrected finish-current/payroll ordering,
  counter clearing after buying, ready-only pickup ordering, fork replay scope,
  missing-state validation and unbounded control-receipt growth.
- `validation.json`: exact baselines, commands, scopes, checks and retained
  harness correction. The first source-probe draft changed day without running
  midnight; corrected to exercise actual midnight, not a game defect.

All ordinary money fixtures start at 90. The deliberately unfunded café fixture
starts at 73, and full-purse fixtures at 1,084; each conserves its own explicit opening.
No fixture transfer is a proposed money source or hidden production subsidy.
The hoarding week still funds seven shifts while customer spending runs out;
no/low-demand tests demonstrate stopped future offers. Do not overstate those
separate results or claim voluntary demand/enjoyment from scripts.

### What must pass during implementation

The canonical plan includes 39 integrated acceptance rows, exact source modules,
state/money/clock/control rules, a four-step implementation sequence and human
acceptance. Important gates include actual player movement (currently separate
from NPC ticks), 1×/4×/+Hour equivalence, foreground dialogue pauses, final-minute
work/payroll, stale references, input revocation, concurrency, v1/v2 restore/fork,
full-purse claims, save failures/two tabs and knowledge visibility.

Limit the initial pilot to seven game days, 50 new orders / 14 new shifts and two
active service workers. New admissions stop at a proposed 3 MiB town size, with
measured headroom reserved for a finite uninterrupted drain of existing
obligations below the 8 MiB export limit. This is not an unlimited-control-history
or browser-quota guarantee. Byte-budget checks must include control receipts;
local Stop remains usable without another persisted record. Seven/30-day actual
integration stress and a three-to-five-person diagnostic remain required.
At pilot closure, unready orders without usable funded service receive an
idempotent full refund; ready cups and wages remain protected. Full-purse and
indefinitely paused claims may remain held: draining them is conditional on
recipient capacity and voluntary participation, never forced spending/work.

The right sign-off is **ready to build/test this bounded contract**, not
“every possible issue has been excluded” or “ready to deploy.” A quiet café,
hoarded money or retained cups can correctly leave no new work. Human play must
establish whether the social encounter is understandable and worth repeating.

### Baseline and next session

Checkout `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a02-economy`, branch
`codex/a02-loop`; audit began at `7105913`. Fresh read-only GitHub checks on
1 November still show main `a26714e03192a17acaa963d7d2681e74a1ac425b` and open
A01 draft #63 at `46bbe821341448b9c68000572c093b9471b4a9af`, stacked on #62.
The final chat names the local delivery commit. No remote publication is made.
Original seven-day and three-cycle evidence remains linked in historical
sections below; earlier coffee contracts are explicitly marked superseded.

**Current resume prompt:** “Read the canonical A02 café readiness plan and its
validation/evidence. The selected design is upfront funded 5-coin shifts plus
2-coin coffee payments held until ready, with automatic routine service and
explicit pickup. Preserve prior wages/debts, identities/saves and owner lanes.
Start the bounded local implementation in an authorized owner checkout using
its domain/money/clock interfaces and 39 acceptance rows; do not reintroduce
2-per-cup wages or spend refundable preorders on payroll. Complete source/UI,
storage/recovery and human gates before calling it playable-ready. No live
inference, external payments/tokenisation or deployment follows from this
handoff.”

## Historical original delivery and subsequent clarifications

**Verdict:** current accounting is conserved, but current demand does not fund
repeatable work. Recommend one optional **2-coin preordered café preparation**
with its entire 2-coin fee reserved for the worker. Keep existing 5-coin shifts,
earned wages, debts and library rules. Honest idle days are part of the design.

The deliverable is the [implementable specification and acceptance cases](../implementation/a02-cafe-loop-astra-2026-11-01.md).
It defines demand, consent, exact state transitions, quote/reservation/payment
timing, interruption/refund terms, useful public consequences, UI, compatibility,
rollback, code boundaries and a five-person diagnostic. **No production behavior
is implemented or authorized by this handoff.**

## Checkout, baseline and ownership

- Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/a02-economy`.
- Branch: `codex/a02-loop`; fetched main/source revision:
  `a26714e03192a17acaa963d7d2681e74a1ac425b`.
- Local delivery consists only of this uniquely named handoff, the uniquely
  named specification and its evidence directory. The final chat gives the
  delivery commit; `git log -1 --format=%H` in this checkout resolves it.
- The workspace wrapper is an empty Git repository, while the actual product
  repository is the linked-worktree group. Created this separate checkout with
  `git worktree add -b codex/a02-loop ... origin/main` from `town-work-polish/`.
  No existing checkout was reset, copied over or cleaned.
- Root START_HERE and the handover assign Sol `a01-replay/`, production runtime
  and shared status/framework updates. Those files and the shared Page were
  not edited. Read-only inspection of preserved source was used. No other chat
  or Grokbot was awakened or messaged; internal subtasks reviewed this packet.
- Read the complete supplied handover, START_HERE, applicable AGENTS, current
  handoffs, economic/first-week/community-project designs, branch/collaboration
  records and relevant engine/tests. User's explicit boundary overrides the
  generic instruction to update CURRENT_STATUS: proposed wording is below.

Read-only GitHub checks on 1 November confirm [#61](https://github.com/arwyn6969/the-game/pull/61)
open, ready at `cd44d165002ddd75b6c92e5ce0efb9ac4fecd568`, and
[#62](https://github.com/arwyn6969/the-game/pull/62) open/draft at
`44745f42719b66230e6ee99d248c8bbe79c2359c`, stacked on #61. Exact-head Verify
runs [40506547367](https://github.com/arwyn6969/the-game/actions/runs/40506547367)
and [40865099031](https://github.com/arwyn6969/the-game/actions/runs/40865099031)
are successful. #59 remains a separate open draft, not a dependency.
[Baseline receipt](../implementation/a02-economy-2026-11-01-evidence/baseline.json).
No new deployment/hosted qualification or live-provider state is claimed.

Main and #62 have identical `economy.ts`, `funded-work.ts`, `payroll-runtime.ts`,
`commerce.ts`, `reading-evening.ts`, `sim.ts` and `town.ts`. The inspected
`community.ts` diff adds budget/payment projections; the café `effects.ts`
diff clarifies funding text. Thus the trace uses fresh main accounting rather
than the stale `product/` working tree or another owner's candidate.

## Seven days, reconciled

[Current-rule report](../implementation/a02-economy-2026-11-01-evidence/current-trace.md)
and [full journal](../implementation/a02-economy-2026-11-01-evidence/current-trace.json).
Actual engine progression from Day1 07:00 through Day7 23:59, authored local
fallback, actual action validation; synthetic player positioning excludes
travel/discovery effort. No clock skipping or NPC teleportation. This is
core-only evidence, not normal-controls UI or human play.

| Path                                                             | Player 5-coin shifts paid | First unavailable | Day7 café / grocery / player | Day7 library          |
| ---------------------------------------------------------------- | ------------------------- | ----------------- | ---------------------------- | --------------------- |
| No library                                                       | Days1–3                   | Day4              | 2 / 12 / 19                  | None                  |
| Funded library left unfinished                                   | Days1–2                   | Day3              | 3 / 8 / 14                   | 8 custody, 6 reserved |
| Completed library, both reading trays, personal tab paid, refund | Days1–3                   | Day4              | 1 / 11 / 15                  | 0; 6 paid, 2 refunded |

Every path retains **90 coins**, eight identities, valid accounts and daily
save/import. The full journal includes every account, receipt, hold, release,
payable, debt and rejected attempt; totals alone are not the evidence.
Existing Kevin5 and Baba4 payroll are protected and lawfully paid on Day1,
not replenished every day. The grocery has no new player shift offer. The
completed path sends bread2 to grocery, tea2 to café, personal tab2 to Baba,
and library refunds1 to each till. Consumption does not erase the bread debt.

**221 explicit health-check checkpoints pass.** Supplementary actual-engine
work interrupts after60 eligible minutes, suspends/saves/crosses midnight,
resumes120 and pays exactly5 once. Duplicate acceptance, premature completion,
stale actions and duplicate sales remain in evidence. Reload compares financial
state/identities exactly and memories/projects under documented loader
normalization. Harness mistakes and their corrections are retained, not passed
off as product failures or silently discarded.

The source's dated note can arrive30 minutes after lookup (this trace Day1
07:50), not only Day3. Arwyn's report use appears on Day2. Those consequences
are real bounded content, but neither generates another reading sale or wage.

## Recommendation, alternatives and limits

The [reference-model report](../implementation/a02-economy-2026-11-01-evidence/cycle-model.md)
compares daily2-coin café receipts with5-coin shifts, two repeat-reading sales,
and a new2-price/2-fee service. The first two consume old till cash or leave
intermittent work. Three2-coin sales could cover an old5-coin wage, but require
broader demand and retain a surplus whose circulation needs explanation.

Use only Sub, Northern and the player for the new service. One active order,
one preparation/day maximum, no player autopurchase. Residents may make one
initial2-coin purchase from existing purses; subsequent spending permission
comes from actual earned service fees, not a daily allowance. Existing café
payroll must be clear before taking any prepayment. The complete2 is held
atomically for either the agreed worker or an unearned refund.

Sub→player, player voluntarily→Northern, Northern→Sub circulates the same
coins through a prepared public activity. A ready table/public source card and
next-day outcome distinguish service from mere attendance. Earnings remain if
the customer does not use the result. No affection purchase, hunger gate or
mandatory participation is promised.

**15 independent model scenarios pass**, plus64 deterministic30-day schedules
with466 completed and494 rejected/refused attempts. A stipulated voluntary
ring repeats300 days with unchanged balances. If the player keeps both NPCs'
initial purchases and never spends, they fund only2 player tasks, then stop.
Hoarding cannot be solved by claiming stronger guarantees from bookkeeping.

The model checks debt, library participation/refund, protected and unresolved
payroll, no/low demand, refusal, concentration, interrupted work, actor/stage
validation, stale/duplicate requests, JSON reload, worker abandonment and
payment/refund capacity. It does not test production routing, automatic demand
selection/timing, browser controls, production extension validation, content
quality or enjoyment. The specification explicitly lists those acceptance
cases. Initial Sub/Northern fixture balances were swapped during model
development; corrected to **Sub5/Northern2**, source-bound and regenerated.
Actual-engine traces were never affected.

## Decisions for Arwyn

1. Adopt the separate bounded preparation unit at price2/fee2, with zero retained
   margin and existing abstract tray supplies. This is a new scope, not repricing
   or cancellation of a5/180 agreement. No extra coin source is proposed.
2. Adopt the small authored demand/worker roster, receipt-derived NPC spending
   limits, voluntary participation and visible inactivity. Automatic daily
   player income is deliberately not the objective.
3. Treat the public table activity and tomorrow's card as a hypothesis requiring
   human evaluation. Do not expand the economy if people understand it but do
   not value the result.

No confirmation was needed to finish this authorized local specification.
Implementation, integration/publication, production migrations and any paid
services remain outside this assignment.

## Verification and next implementation handoff

Node24.22.1 at
`/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.
Dependencies installed from committed lockfile via `npm ci --ignore-scripts
--offline`. No database credentials, inference or network calls by experiments.

Reproduce from this checkout with that Node binary:

```sh
node docs/implementation/a02-economy-2026-11-01-evidence/current-trace.mjs
node docs/implementation/a02-economy-2026-11-01-evidence/cycle-model.mjs
node --test scripts/town-economy.test.mjs scripts/town-commerce.test.mjs scripts/town-quality-community.test.mjs scripts/town-quality-save.test.mjs scripts/town-shift-context.test.mjs
```

The existing focused production suite passes **84/84 tests**. The two evidence
scripts pass Node syntax, targeted ESLint and formatting checks. There are no
production changes; a full build, production migration, full browser suite and
live inference were neither necessary for this design packet nor claimed.

After adoption, Sol can implement only this specification on an explicitly
chosen current baseline. Start with the typed optional service state and
transaction/hold/payable validator; add its bounded actions and matching UI
together. Preserve A01's final behavior and #61/#62 controls deliberately.
Run the specified engine/save/interruption and actual-control acceptance cases
before claiming the prototype works; then use the short human protocol.
Do not generalize a market, scheduler, banking system or broad roadmap here.

Suggested shared-framework/status update **for Sol to apply**, not applied here:
“A02.1 local economy analysis is complete: three seven-day engine traces
reconcile90 coins; conditional2-coin customer-funded café preparation is
specified with stress evidence and acceptance cases. Policy adoption and A02
implementation/human value testing remain open. No runtime, shared schema,
merge, deployment or live inference changed.”

## Next session: combine the café contract with Proof of Coffee

Added after Arwyn asked whether to bring the parallel ideas together and to
make a plan for the next session. This is a proposed integration plan, not
adoption of the price or permission to change gameplay now.

Read the chat **Research Proof of Coffee economy**
(`01a196ad-9d79-74d1-a2e3-a1ca28008ade`) and its
[research note](../../../planning/resident-development/PROOF_OF_COFFEE_RESEARCH_2026-11-01.md)
alongside the A02 specification linked above. Both were inspected read-only.
The research note was written while A02 was in progress; its statement that
the economic comparison is still underway is historical. A02's design is now
complete but its proposed policies remain unadopted. No separate visual chart
was found; the inspected material is the chat and its saved research note.

**Recommendation: combine the activity and receipt contract; stage the wider
shared-world work separately.** A02 answers who wants the result, who pays,
what earns a fee and why circulation can stop. Proof of Coffee adds a clear
customer journey and a durable record of actual receipt. Two independent café
payment systems would duplicate authority and create contradictory receipts.
Conversely, making A02 depend on visitor admission, multiplayer and a live bot
interface would postpone the small repeatable activity unnecessarily.

### Scope of the next session

Produce one reconciled, implementation-ready amendment to the existing A02
specification, one customer/worker walkthrough and a single acceptance matrix.
Use this checkout for the design work. Keep the existing specification and
evidence as the baseline; do not rerun a broad economy study or overwrite the
other research chat's note. Runtime implementation remains a bounded Sol task
after the service and policy choices are adopted.

1. **Refresh source and ownership.** Read START_HERE and Sol's current handoff;
   verify the implementation baseline and avoid assuming A01/#61/#62 have
   merged. Preserve `a01-replay/` and Sol's shared-record ownership.
2. **Choose one deliverable.** Decide whether the first customer buys a prepared
   table with a drink, as A02 specifies, or a collected cup, as the visitor
   proposal suggests. Recommended default: keep the funded preparation unit,
   let the customer collect the prepared drink at the same café point, and keep
   the table/public activity as optional use. This proposed amendment must
   specify its completion evidence and collection lifetime; do not silently
   rename tea as coffee or expand the worker's paid scope to delivery.
3. **Join the contracts.** One order ID links the quote, prepayment, hold,
   worker agreement, preparation evidence, wage, customer collection receipt
   and optional use. Preparation earns the agreed fee; receipt proves only
   collection; sitting/consumption needs its own evidence. Keep current
   cancellation protections and settle exactly once. Customer collection
   avoids adding a hidden unpaid delivery task. A ready-but-uncollected order
   retains the worker's wage and never earns a customer completion stamp.
4. **Keep the local prototype bounded.** Existing player/residents, one
   outstanding financial order and at most one preparation/day. A second
   customer sees unavailable capacity and is not charged. An informational
   ticket may show state, but a multi-customer queue is deferred. Decide
   separately whether an uncollected ready drink occupies physical capacity;
   releasing the financial slot must not silently erase an earlier drink.
5. **Specify the handoff and test it on paper/with existing synthetic tools.**
   Walk through normal collection, customer refusal, departure before/after
   worker acceptance and preparation, two simultaneous requests, interruption,
   reload/lost-response retry, full wage/refund purse, stale/forged collection,
   expiry, no demand and hoarding. Preserve money, identities and prior claims.
   End with exact changes to the A02 acceptance matrix and one bounded Sol
   implementation prompt, rather than two competing specifications.

The opening choices are **service scope** and whether to adopt the proposed
**2-coin price / 2-coin worker fee / zero retained margin**. A Proof of Coffee
receipt does not answer either question and adds no new source of coins.
The material-supply abstraction must stay explicit. If those choices remain
open, record them precisely and finish the reconciled contract without partial
runtime changes.

### Shared definitions and later boundary

| Record | Exact meaning | Financial effect |
| --- | --- | --- |
| Order/ticket | Named customer requested the specified service under accepted terms | Only its disclosed prepayment/hold |
| Preparation receipt | Bound worker completed the agreed preparation | Earns the funded fee once, even if customer subsequently leaves |
| Collection receipt / Proof of Coffee | The authorized customer actually received this order | Informational; no customer coin reward or additional worker payment |
| Use/follow-up record | Actual consumption, seating or public activity occurred, or the collection/use window expired | No implied purchase, affection, verification of truth or new wage |

Use world/character/order/action IDs and a rules version from the outset.
A local prototype receipt is evidence under the local engine's rules; it is
not a tamper-resistant shared-server proof or proof of an independent person.
Preserve the authority boundary for a later adapter without building that
adapter merely to show the local café interaction.

After the local activity is useful and dependable, the shared-server packet
can add authoritative time, a real queue, two clients/restart recovery,
operator-level limits, revocable bot control and explicitly admitted visitors.
Its separate acceptance includes human reclaim, stale delegated commands,
related bots, and copied local saves that must not mint shared funds. Visitor
starting funds need their own explicit conserved source/admission policy.
Neither fresh visitor purses nor customer reward stamps may quietly become
the cure for exhausted business funding. Blockchain integration, POA linkage
and real-asset rewards have no requirement in this minimum plan.

The human question remains: **does the customer want this café encounter
without being paid to visit?** Test whether people value the service and choose
another visit; a receipt alone proves neither usefulness nor enjoyment. If
coffee turns into a compulsory chore or an unnecessary gate to work, retain
the useful receipt machinery and change or drop that encounter.

Resume prompt: “Read the A02 handoff's Next session section, its specification
and the Proof of Coffee research note. Reconcile them into one bounded local
café order/collection contract and acceptance matrix. Preserve preparation
wages, optional participation and the existing eight identities. Resolve the
service scope and price policy explicitly. Prepare one implementation handoff
for Sol; keep live queues, visitors, bot credentials and shared-server work in
a later packet. Do not change production or shared planning records in this
design session.”

## Campaign, Emblem and eStamps options — planning addendum

Arwyn subsequently proposed “buy your agent a coffee” campaigns, QR access to
the relevant wallet/payment flow, a pixel coffee collectible, EmblemAgent
integration, and eCash/eStamps with server credit and later user-paid claims.
This addendum records the research and choices for the next session. It does
not authorize a public funding page, invoice, wallet connection, mint, transfer
or redeemable balance.

**Arwyn's clarification supersedes the initial funding interpretation:** “credit
on our server” meant **untokenised game items, coffee etc.**, not direct funding
in this case. This packet is therefore about server inventory and optional
later tokenisation. Runtime sponsorship, donation checkout, AI-time balances
and externally funded rewards are outside this specific flow. The earlier
chat response that recommended buying hosted service was a misunderstanding,
not an adopted product direction.

### Recommended product shape — ordinary items first

A coffee exists as an ordinary game item held in the authoritative server's
inventory. It has an item ID/type, current owner, provenance/order receipt,
revision and lifecycle state. No wallet transaction or NFT is required to
prepare, receive, hold or consume it. Existing in-game prices and funded worker
terms remain the A02 design decision; this clarification does not create a
new money source or real-money price.

The intended loop becomes: funded café order → worker prepares it → customer
receives the coffee item → customer uses it, keeps it, or optionally chooses
an eligible later tokenisation/claim flow. The preparation wage and item
handoff remain distinct events. A receipt proves the recorded event; inventory
says what the character currently has.

A “buy your agent a coffee” campaign can point to this in-game acquisition or
gifting journey. A QR should open a page scoped to the intended agent and
activity, not silently initiate a donation or expose a private receiving draft.
Ownership and gifting rules must be explicit; a display name alone cannot
select a wallet or authorize transfer. No functional payment QR is needed for
the next design mockup.

| Record | Represents | Rule |
| --- | --- | --- |
| Town coins | Existing gameplay balances, wages and purchases | Preserve the conserved economy; no automatic cash redemption |
| Untokenised item | A specific coffee or other game object with an owner | Receiving, gifting and consumption are validated inventory transitions |
| Proof of Coffee receipt | The actual preparation/collection/use event | Durable history; not itself a spendable coffee or proof of independent ownership |
| Optional stamp claim | An explicit request to represent an eligible item or commemorate an event on-chain | Separate consent, fees, asset mapping and exactly-once delivery rules |

**Choose what the stamp means before implementing claims.** If it represents
that same usable coffee, reserve/lock the server item during the claim and
mark it exported after confirmed delivery. It must not remain simultaneously
usable/giftable on the server. A consumed coffee cannot later be exported as
an unconsumed item. Reimport/redemption of a tokenised coffee would need its
own proven burn/escrow and custody rules; do not imply a working two-way bridge.

Alternatively, the stamp can be a **commemorative collectible** about a coffee
visit. Then it is distinct from the consumable coffee, may remain after the
coffee is consumed, and must never claim to redeem another cup automatically.
Its later holder is not proven to be the original visitor. Both designs are
possible; neither is selected by the word “untokenised”.

Start with the untokenised item lifecycle and an honest receipt. Optional
export is a later adapter. A local save is useful for prototypes but cannot
authorize a real-world claim: shared claims require canonical server inventory
and must reject copied/imported local balances or items.

### Pixel cup asset brief

One small, readable pixel-art cup can serve as the campaign icon, in-game
receipt image and proposed collectible artwork. Draft a 32×32 or64×64 PNG with
a limited palette, a clear cup silhouette and readable steam; test it at its
native scale. Keep campaign text and the functional QR outside the tiny image.
Do not generate a unique on-chain asset for every cup served in the game.

Before minting, choose whether this is one indivisible edition with multiple
units or individually unique assets, plus quantity, issuance/reissuance rules,
rights and destination. Record image bytes/hash and chain-qualified asset ID.
An unminted PNG is artwork, not an already-issued NFT. Artwork generation and
minting are separate steps; neither was performed during this planning update.

### Emblem and ECX have different roles

The exact “EmblemAgent” name was not found in the searched local documentation.
Local ECASH notes mention Emblem Build as a possible UI builder, not a verified
ECX asset SDK. Current official documentation identifies **EmblemAI AgentWallet**
and its MCP/A2A/authentication interfaces. Treat that as the likely integration
candidate, and confirm the intended Emblem product/version before coding.

| Candidate | Possible role | Verified boundary / next evidence |
| --- | --- | --- |
| Existing THE GAME account + wallet links | Preserve account ownership, agent profile and external address proof | Current source uses Better Auth; Bitcoin appearance/receiving proofs are separate. Public receiving remains disabled (`fundingPublished: false`); wallet proof is not a stamp-transfer feature |
| EmblemAI / AgentWallet | Optional agent interface, authentication and wallet operations | Official MCP/A2A/API-key/JWT interfaces exist. Published chain lists include Bitcoin but not ECX. Counterparty balance queries/Stamps analytics and vault-container minting do not prove native ECX Stamp issuance or delivery |
| ECX eStamps | Possible collectible issuance, inventory and transfer rail | Reuse Reina's existing stack. Its current handover records issuance/parser evidence and a pending actual browser/wallet test; the exact claim/fee/signing path for THE GAME is not qualified |

These are compatible architectural roles, not necessarily competing end-to-end
choices. Do not migrate the existing game login merely to experiment with a
wallet adapter. An Emblem identity or Bitcoin address proof does not authorize
ECX signing, real spending, avatar delegation or automatic asset withdrawal.
No verified Emblem→ECX eStamp mint/send adapter was found in this research.

For this project, **eCash means ecash.com / ECX, not XEC**. ECX's official
documentation says Bitcoin and ECX can use identical address strings; network
identity must therefore be explicit in every invoice, balance, asset and
receipt. Wallet format compatibility is not transaction compatibility. Verify
the selected signer preserves ECX's required replay-protection fields and uses
the intended network broadcast path. A BTC wallet login alone is insufficient.

### “Claim later and pay the fee then”

The idea is viable as a design, but the entitlement's backing must be explicit:

| Approach | Before the user claims | At claim | Main tradeoff |
| --- | --- | --- | --- |
| **Preissued bounded edition; reserved units** | Operator issues and funds a defined supply; server reserves a real available unit for each earned entitlement | Transfer a reserved unit to the approved recipient, with a fresh delivery/network fee quote | Clearest availability guarantee, but operator funds issuance and controls inventory before delivery |
| **Mint on claim** | Server records an unminted entitlement to a defined job, with supply/budget rules | Issue the asset, and deliver it if issuance does not already give it to the recipient | Avoids advance issuance, but signing, fees, multi-step recovery and recipient attribution are more complex |

These are future asset-delivery options, not the default representation of
ordinary inventory. First decide whether the stamp represents the same item
or a separate souvenir. Preissued units require inventory backing; mint-on-claim
requires a proven issuance/delivery path. The user's preference for untokenised
items does not itself select either mechanism. Neither is implemented by the
game, and ordinary item use must not depend on either.

“User pays withdrawal” does not fund an earlier mint for free. The quote must
separate any issuance/data-output cost, network fee, additional delivery fee
and service fee. Counterparty issuance and transfer of units are distinct;
moving issuer rights is not a substitute for delivering the collectible.
Determine who signs the inventory spend and how the user's fee is funded.
A treasury-owned asset may need an owner-approved treasury transaction even
when the recipient pays its cost; do not assume an arbitrary wallet can pay
another address's transaction fee automatically. Do not advertise fee numbers
until the selected chain/asset/signer path can quote them.

Proposed recovery contract: entitlement available → reserved for one claim →
fresh approved fee/destination quote → authorized transaction workflow →
broadcast pending → confirmed/indexed delivery → claimed. Retain transaction
IDs and reconcile unknown broadcast outcomes before retrying. Duplicate requests
return the same claim. Failed/expired pre-broadcast work can release the unit
only when it is safe; a possibly broadcast claim cannot reissue it. Reorgs and
indexer outages produce pending/reconciliation states, not a second grant.
Define treatment of separately paid fees when fulfillment fails before launch.

### Evidence checked on 1 November

- [Emblem developer docs](https://emblemvault.ai/docs) and
  [A2A authentication/payments](https://emblemvault.ai/docs/a2a-auth): agent/auth
  surfaces and provider payment options. These do not prove ECX support.
- [AgentWallet source](https://github.com/EmblemCompany/EmblemAi-AgentWallet)
  inspected at `0a8f472558d6d4d1cb951d5a340e0e6d49eec226`, and
  [Agent skills](https://github.com/EmblemCompany/Agent-skills) at
  `9a68a35c4d61a8b6fe673fa98c39e4b9dd9d2cd3`. The README lists seven chains;
  the newer [welcome page](https://emblemvault.ai/welcome) lists eight. Neither
  listed ECX. Pin exact versions/capabilities instead of assuming equivalence.
- [Official ECX site](https://ecash.com/) now reports mainnet activation on
  29 October. Earlier pre-fork plans are historical. The
  [wallet/address integration reference](https://github.com/eCash-com/fast-facts/blob/main/02-wallets-keys-addresses.md)
  describes shared address formats and required chain-specific signing checks.
- [Current local eStamps handover](../../../../ECASH/estamps-review/HANDOVER.md),
  29 October: use Reina's existing node/Counterparty/indexer/API/website, not
  the lab's duplicated backend roadmap. Website source baseline reported there
  is `c448786db3ee820baa6aae53c1549f5722162f36`; visual-only local candidate
  `57cf040299060aa653f85baf4a76ec683295f4f7`. Runtime reports and the pending
  Arwyn browser/wallet acceptance must retain their distinct evidence scopes.
- Source review found ECX sign-only wallet wrappers, server broadcast/replay
  gates and fixture tests. They are useful integration foundations, not proof
  of a complete user-funded claim. Exact current deployed revision was not
  independently established. The live eStamps website could not be retrieved
  by the web tool and private research PR reads returned404; neither result
  establishes that the deployed stack is absent or broken.
- THE GAME at `a26714e`: `src/lib/agent-wallets/proof.server.ts`,
  `store.server.ts`, `types.ts` and the existing wallet/registration designs
  retain Bitcoin mainnet/private receiving boundaries. No wallet/credit/claim
  implementation was changed here.

### Revised next-session plan after the clarification

Keep the A02 + Proof of Coffee contract as the gameplay packet and amend it
for a **bounded coffee item**, not a generic financial credit system:

1. Define the item's owner, identity, source order, preparation/collection
   evidence and available actions. Walk through receiving, keeping, gifting
   if included, and consuming one coffee; consumption must happen once.
2. Draft the pixel cup and a nonpayable QR-page mockup for the relevant
   agent/café journey. No donation checkout or runtime-credit purchase is
   part of this specific packet.
3. Specify authoritative item custody and save/reload compatibility. Inspect
   the existing item code before reuse: at main `a26714e`,
   `src/game/physical-items.ts` validates exactly one town-owned manuscript,
   so it is not already a general coffee inventory. Plan one additive bounded
   item contract without weakening that validator or overwriting existing saves.
4. Decide whether an optional stamp is the **same exportable item** or a
   **commemorative souvenir**. For same-item export, define lock/pending/exported
   states and block consumption, gifting and competing claims while locked.
   A timeout after possible broadcast requires reconciliation before unlocking.
   Keep fee quotes, Emblem/ECX adapter compatibility and actual issuance for a
   later qualified claim packet. No automatic return bridge is assumed.
5. Add acceptance cases for ordinary item acquisition, duplicate handoff,
   ownership transfer, consumption, refusal, interruption/reload, stale actor
   actions, two simultaneous uses/claims and copied-save rejection. Fake claim
   tests should prove no simultaneous spendable server item and exported asset.
   Produce one updated specification and a bounded implementation handoff for
   Sol; preserve production and shared-record ownership boundaries.

The immediate question is how a coffee behaves as an owned game object. Real
funding campaigns, agent-runtime billing, cash-out and external reward pools
are separate topics and are not prerequisites for this plan.

Updated resume prompt: “Read this handoff and Arwyn's clarification: server
credit meant untokenised items such as coffee, not direct funding. Reconcile
A02 and Proof of Coffee around one ordinary coffee item with funded preparation,
authoritative ownership, collection and consumption. Plan optional later stamp
export or a separate souvenir, explicitly distinguish those choices, and prevent
double use/claim. Preserve all existing identities, wages and saves. Prepare
the bounded specification and Sol handoff; do not add donation checkout,
runtime credits, production changes or live minting in this design session.”

## Latest clarification: coffee sales fund a working, growing café

Arwyn clarified that the central idea is **indirect payment through purchasing
coffee**. A customer pays for and receives a coffee, may keep it or drink it
(consuming it), and the sale funds staff who prepare and serve more coffee.
Additional demand and funded work can support more staff and greater service
capacity. The visible queue, preparation and handoff make an interesting,
playful analogy to proof of work. This is the product loop to design next.

The earlier funding interpretation was too specifically about donating money
or buying agent runtime. The subsequent correction overemphasized item custody
and tokenisation. Both missed the intended centre: **purchasing an ordinary
product is how customers pay for the workers and sustain the business**.
“Not direct funding” does not mean removing payment or business income; it
means buying coffee rather than directly topping up an agent's runtime account.

The intended sequence is:

1. Customer chooses and pays for a coffee under clear terms.
2. That order provides revenue from which the café protects its promised wages.
3. A consenting worker prepares and serves the named order, producing evidence
   of actual work. Preparation and delivery retain their distinct conditions;
   agree the paid unit without retroactively making accepted preparation unpaid.
4. Customer receives an owned coffee item. Keeping it is allowed; drinking it
   consumes that item once. The already-earned worker payment is unaffected by
   whether the customer drinks it.
5. More paid orders permit more fully funded work offers and, when useful,
   additional simultaneous staff. More staff increase bounded service capacity,
   allowing the café to fulfil more of the existing demand.
6. Workers can spend their earnings on further goods/services, supporting
   circulation. Neither customer demand nor worker spending is compulsory.

The proof is the engine-validated order, preparation and handoff with retained
payment receipts. It is not merely a stamp for standing in a queue. The visual
and social comedy of agents running a café is part of the product hypothesis,
not incidental decoration around the ledger. No blockchain consensus/mining
mechanism is implied by the analogy.

### What carries over and what must change

- Preserve the existing evidence, conserved accounts, funded acceptance,
  voluntary participation, earned wages, old debts and all eight identities.
- The 2-coin price/fee remains a prototype parameter awaiting adoption. It is
  not a requirement that forces the growing café to use those exact terms.
- One outstanding order and one preparation/day were isolation limits for the
  original analysis. They must not become permanent product limits that prevent
  the described loop. Start small, but explicitly model demand, queued orders,
  protected wages, worker availability and throughput before choosing limits.
- Zero retained margin can support more per-order workers if every new order
  fully funds its own labor. It does not cover extra ingredient, equipment,
  hiring or idle-shift costs if those are introduced. Compare that simple
  arrangement with a disclosed retained amount only where a real modeled cost
  needs funding; do not assume a profit pool or new subsidy is necessary.
- A staffing offer is conditional on money, consent, time and capacity. Creating
  demand or funds by automatically buying coffee on behalf of absent customers
  is not the intended loop. Reduced demand can leave fewer funded work offers.
- Payment currency is still a separate decision: the current A02 evidence is
  town-coin accounting; later ECX purchases would need their own explicit
  settlement/payroll relationship. The clarification does not select a payment
  rail or authorize real payments. It also does not limit the future concept to
  town coins merely because the coffee is untokenised.
- Inventory, optional collectible export and the QR campaign help present/use
  the product. NFT issuance is not the source of its worker's wages and is not
  required for an ordinary coffee sale. Preserve the existing claim research,
  but do not let it displace the café-economy design again.

### Previous next-session target (fulfilled by the current delivery above)

Amend the A02 specification around **coffee sales → funded staff → verifiable
service → owned/consumed coffee → further demand and circulation**. Produce one
small staffing/capacity model and implementation packet, using fake decisions
and existing identities rather than adding a general job market.

Compare one worker with two eligible workers under the same explicit customer
demand. Show when a second funded work offer can open, how many orders each
worker can fulfil, what happens to wait times, and all customer/café/worker
balances and reservations. Include insufficient demand, a declined job,
customer cancellation, interrupted preparation, duplicate handoff, retained
versus consumed coffee and save/reload. Do not claim that adding workers itself
creates paying customers or an infinite supply of money.

Then define the smallest visible café journey that demonstrates those results:
priced order, honest queue/availability, funded staff offer, preparation,
handoff, inventory and consumption. Preserve the library and current 5-coin
agreements. Exact hiring/retained-revenue rules, prices, capacity and time units
are decisions to resolve in that bounded model, not production changes made by
this handoff. Human testing should ask whether people understand that buying
coffee pays staff and whether the visible activity is enjoyable.

**Previous resume prompt:** “Read the latest clarification in this handoff.
Arwyn's core concept is indirect payment through coffee purchases: sales fund
staff, staff prepare and serve owned coffee items, and additional funded demand
can support more staff/capacity. Make this the centre of A02 + Proof of Coffee.
Revise the fixed one-order prototype into a bounded, demand-funded café model;
compare one and two workers, show the accounts, queue, work evidence and item
consumption, and produce one implementation-ready amendment for Sol. Preserve
existing wages, debts, identities and saves. Keep optional tokenisation and
external payment integration separate. This session is design/synthetic work,
not production gameplay, public funding, minting or deployment.”
