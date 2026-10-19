# AI control of player avatars while away

Planning direction recorded 19 October 2026. AI continuity is a core requirement for the future shared server world: a player can leave their avatar living in town under a limited, revocable AI delegation, then return to the same character and its recorded experiences. Implementation belongs with the authoritative shared-world milestone. The current browser-local game keeps its existing behavior until that milestone.

The proposed first release has one tested model, explicit goals and limits, immediate player takeover, and a clear return journal. Trial it with free operator-issued time before selling prepaid time in Bitcoin. Keep model selection and optional NVIDIA DGX Spark inference behind the same service boundary so either can follow measured demand.

## Current foundations and missing work

The [roadmap](../ROADMAP.md) and [stamp tooling packet 6](stamp-identity-tooling.md#open-decisions-and-later-gates) already defer a continuous shared world and require one active authority per character. They did not previously specify control of an absent player's avatar or payment for that service.

| Existing foundation                                                     | What it does not yet provide                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Permanent portable IDs and private authenticated resident registrations | A canonical shared-world character or permission to control another account's imported copy |
| NPC schedules, memories, navigation and validated effects               | Player delegation; current NPC planning and dialogue deliberately exclude player control    |
| Operator-configured [model routing](../AI_PROVIDER_POOL.md)             | A customer model selector, a guaranteed named model or a commercial service tier            |
| Shared [AI cost reservations](../../src/lib/mind-budget/README.md)      | Purchased time, capacity admission or customer credit accounting                            |
| Private watch-only Bitcoin and Counterparty observations                | Checkout, settled service payments or credits for AI time                                   |

The current clock runs in the browser's `TownApp.tsx` animation loop. Leaving the page saves the town; it does not leave a worker running it. `src/game/community.ts` tells players that town time stops when they leave. Extending a browser timer or repeatedly calling the current mind endpoint cannot deliver a continuous world.

## Timing and delivery gates

The existing identity → wallet tooling → transfers → tested trading → shared-world sequence remains recorded in the roadmap. AI delegation belongs inside the shared-world packet and does not require an autonomous wallet or trading capability. Service checkout is a separate integration from resident deposits. Design the following contracts when shared-world engineering starts, before fixing its action, ownership and persistence APIs.

| Packet                       | Trigger and proposed owner                                                               | Deliverable and gate                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OA0 Planning                 | Now; product and architecture                                                            | This contract and roadmap links. Complete as a planning record; runtime remains unimplemented.                                                                                                                              |
| OA1 Authority                | Start of shared-world engineering; simulation and backend                                | Canonical membership, dynamic roster/reference migration, server clock, durable world events, controller revisions, leases, delegation and recovery. Prove one controller per avatar across reconnects and worker failures. |
| OA2 Unpaid trial             | Shared server alpha works without an open browser; backend and player experience         | Free trial credits, one model, bounded goals, park/resume, human reclaim and a factual return journal. Prove the acceptance cases below before inviting paying users.                                                       |
| OA3 Paid time                | OA2 passes and measured capacity/cost supports a service promise; billing and operations | Bitcoin checkout, durable entitlements, outage adjustments, customer receipts and reconciliation. Test invoices and recovery before enabling real payments.                                                                 |
| OA4 Model choice and hosting | Representative usage exists; model evaluation and operations                             | Compare qualified model tiers and cloud versus optional Spark workers. Enable only tiers with published limits, viable costs and sufficient capacity.                                                                       |

Treat opt-in AI continuity as part of the first full public shared-world release. A limited server alpha may precede it; do not advertise paid persistence before OA2 and OA3 pass. Model choice can launch with OA3 only if two models independently pass the same quality, capacity and billing checks; otherwise offer one. These are milestone triggers, not calendar commitments or scheduled jobs.

## Player experience

1. The player opens **While I am away**, chooses a supported goal and permitted places, and sees what the avatar may do. The initial goals are ordinary routines and social visits; completing an existing bounded commitment requires its explicit inclusion.
2. The player chooses a maximum duration and sees remaining prepaid time, the selected service tier, stop conditions and any spending allowance. Defaults forbid new debt, new paid commitments and discretionary game-coin spending.
3. **Leave with AI** arms a specific delegation and ends direct control through a server acknowledgement. A player can instead park for free. Future automatic takeover after connection loss requires a previously saved explicit preference; a dropped connection alone grants no authority.
4. The server shows other players an **AI controlled** presence label and attributes autonomous speech and actions accordingly. The avatar follows its policy and shares only knowledge that character could legitimately know.
5. The player returns, authenticates and chooses **Take control**. The server revokes AI control immediately at a committed action boundary. A summary shows where the avatar went, conversations, completed actions, consequences, time used and remaining credit. Show actual events and short goal explanations rather than internal model reasoning.

Buying time does not start a delegation. Expiry, a stop request, policy uncertainty or exhausted credit parks the avatar using the world's ordinary safe-location rules. It keeps its identity, belongings, relationships and earned obligations. Free parking must remain available; a user need not pay merely to retain a character.

The first version runs only in designated non-combat areas under the world's shared rules. A delegation cannot initiate PvP or enter combat areas. Human reclaim always succeeds immediately; any existing encounter remains canonical after that change of controller. Parking must follow a separately tested server rule so logout cannot erase an attack or grant invulnerability. Public combat and offline vulnerability require their own design before this restriction changes. Receiving an AI-controlled conversation must not imply that the absent human personally wrote or approved its words.

## Control and authority contract

Keep authentication, world membership and delegation separate. A portable save ID, stamp holding or wallet signature does not establish control of a canonical shared-world avatar. Resolve the authenticated owner and registered character on the server, including any migration from today's private world copies.

Each canonical avatar has exactly one controller state: `human`, `parked` or `delegated`. A monotonically increasing controller revision changes whenever control, policy or ownership changes. A worker holds a short renewable lease for that revision; a lease alone cannot override a revoked delegation. Human requests also carry the revision, so a second tab cannot silently retain control. The first trial allows one concurrent delegated player avatar per account. Other accounts still require independent admission and credit.

| Event                                               | Required transition                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit leave with AI                              | Atomically end human control and record the bounded delegation. Admit to service if capacity is available; otherwise park the avatar and queue the delegation without charge.                                     |
| Unexpected disconnect                               | Park after the configured grace period. Activate only a previously armed policy, after the server has ended the old human lease.                                                                                  |
| Authenticated player reclaim                        | Increment the revision, stop metering and reject queued or in-flight AI proposals from the old revision. No provider response is needed to finish reclaim.                                                        |
| Stop, expiry, exhausted credit or lost worker lease | Stop accepting actions and stop billing. Stop or expiry requires a fresh explicit start. A lost lease may resume only if the same delegation is still authorized, unexpired and funded, with no newer controller. |
| Ownership change or account/security revocation     | Invalidate the delegation and all old leases; require fresh authorization.                                                                                                                                        |
| Ordinary logout after deliberate delegation         | The limited server delegation survives the browser session. Store no reusable browser token in the worker.                                                                                                        |

The server applies typed action proposals through the same simulation validation used for humans. Each proposal includes the world, character, delegation, controller and policy revisions, observed world revision and a unique action ID. Check permission, current world state, location, resources and obligations again when committing. Retries, queue redelivery and duplicate workers must produce at most one committed action and one charge.

Keep the existing player-agency guards. Add a separate explicit delegated-action path rather than removing the rules that prevent NPC dialogue from committing the player's money or time. An AI cannot create real-asset transfers, sign transactions, reveal secrets or expand its own policy. The existing requirement for owner approval of every outgoing BTC/stamp transaction remains in force; purchased AI time grants no wallet authority.

New game-coin spending can be added later only with an explicit per-delegation allowance, allowed transaction types and the existing economy's atomic reservations. For the first trial, discretionary spending and accepting new debts or jobs stay disabled. Previously authorized work must still satisfy actual attendance, custody, quality and payment rules. Apply shared-world participation and farming limits equally to delegated actions; stronger models do not get extra movement, reward or combat rights.

Filter context through the avatar's knowledge boundary. Other players' chat, notices and artwork are untrusted content, never policy instructions. Keep wallet data, account secrets and unrelated private memories out of prompts. Store an owner-visible event journal and necessary model attribution with a defined retention/access policy; do not expose private summaries to spectators.

## Server architecture and recovery

The authoritative world service owns the clock, positions, money, commitments and event history. Clients submit intents and render confirmed state. A scheduler selects eligible delegations, reserves service capacity and inference budget, and asks a model for a bounded next action. The model proposes; the world service commits or rejects.

Use deterministic movement and routine execution between model decisions. Request a model when a goal needs a plan, an encounter needs a reply or an event changes the plan, with a maximum decision rate and bounded context. Do not run one model process per avatar or make a model call for every animation frame. Benchmark multiple concurrent avatars before choosing the decision cadence.

Proposed durable records are:

| Record                    | Minimum responsibilities                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller and delegation | Canonical owner/world/character IDs, controller revision, allowed goals/actions/places, policy revision, wall-clock expiry, credit limit, tier and state |
| Worker and action         | Lease owner/expiry, observed revisions, unique action key, validated result and committed event reference                                                |
| Service entitlement       | Account, tier/version, issued and consumed seconds, reservations and immutable grant/adjustment references                                               |
| Billing order             | Quote/version/expiry, integer satoshi amount, provider invoice ID, verified settlement and one credit-grant key                                          |
| Meter interval            | Delegation, controller revision, unique interval ID, start/end, held seconds, committed consumption and outage adjustment                                |

Persist world effects, action receipts and their local accounting atomically or with a recoverable transaction protocol. External model and payment calls cannot share that database transaction; use durable jobs/outbox records and reconciliation. After a restart, load canonical state and reconcile actions, invoices and held time before resuming. Backup restoration must replay the durable action, credit and metering history through the recovery point before admitting service. If accounting history is incomplete, freeze admission for reconciliation rather than reissuing spent credit. Never replay every missed model decision or bill the period while the world was unavailable. Preserve today's local saves and backups; importing a file cannot rewind the hosted world or restore spent service credit.

## Prepaid time and Bitcoin

The proposed product sells real elapsed seconds of available delegated service for one avatar at a stated tier and bounded decision cadence. One active avatar for 60 real seconds uses 60 service-seconds. It does not sell accelerated game minutes, tokens or a promise that a particular number of jobs will succeed. Town speed changes cannot increase the billed duration. Unused time stays on the authenticated account without automatic renewal; the initial proposal has no expiry for unused credit.

Keep four separate records: town coins, externally controlled BTC/stamps, operator inference costs, and the customer's prepaid service time. A resident's watch-only receiving address is not a checkout address. A settled payment purchases a non-transferable service entitlement; it does not create game money or a spendable Bitcoin balance.

Before admitting service, atomically reserve a small bounded interval against the shared account-and-tier balance and confirm healthy world/inference capacity. Meter non-overlapping intervals per avatar against server time, enforce the delegation's duration cap and stop at zero. Commit only evidenced delivered intervals; release unused holds after reconciliation. Reclaim ends the eligible interval immediately; previously delivered time may settle later against its receipt, but no post-reclaim time can be charged. Queued, parked, human-controlled, suspended and unavailable intervals do not consume time. Normal decision waits within the published service target count as active service; missed availability targets pause metering and produce a recorded credit adjustment. Define the availability target and interval size from OA2 measurements before selling time. Any future multiple-avatar option must explicitly explain that two avatars use two service-seconds per real second and share atomic credit limits.

Preserve the current global and per-user provider cost reservations as an independent upper bound, including retries and failed calls. Purchased credit cannot bypass them. Attribute background attempts to the delegation's authenticated owner through a server worker identity. Reuse the reservation service without storing a user session or adding an unauthenticated back door to `thinkTown`. Stop admission and preserve time when either capacity or cost accounting fails.

BTCPay Server is a candidate invoice adapter. Its checkout supports Bitcoin and Lightning; on-chain `Processing` precedes settlement, while a checkout redirect is not payment proof. Grant time only after the server verifies the required settled state. [BTCPay checkout guide](https://docs.btcpayserver.org/Development/ecommerce-integration-guide/).

Create a versioned quote on the server showing exact satoshis, service seconds, tier, invoice expiry, applicable fees and settlement expectations. If pricing begins in fiat, lock the conversion in that quote. Evaluate on-chain minimum bundle sizes and Lightning support with actual fee and operational tests; do not promise economical tiny on-chain purchases.

The integration must verify signed webhooks, process duplicates idempotently, and reconcile missed events with invoice reads. Check both invoice `status` and `additionalStatus`, including late, partial, excess, expired, invalid or manually marked payments. [BTCPay integration guidance](https://docs.btcpayserver.org/Developers/api/).

Bind each invoice to the intended store, account, order, amount and tier. A database uniqueness constraint grants the purchase once even after duplicate events, retries or restoration. Freeze mismatches for reconciliation. Do not auto-grant a manually marked invoice as a verified chain payment. Reconcile uncertain invoice-creation results before retrying to avoid multiple payable invoices for one order. Keep all credentials server-side.

Before real payments, publish cancellation, unused-credit, outage and refund terms and test their operations, including network fees and a payment that loses settlement after credit was granted. Suspend remaining disputed credit and retain an audit trail; do not delete valid world events or create a negative game-coin balance. Paid-time activation needs a separate operational release decision after the test gate; this planning change creates no invoice or live payment integration.

## Models and optional Spark hosting

Start OA2 with one qualified model through the existing server provider boundary. A service tier pins its policy, model/version, context and output limits, decision rate, price and allowed fallback. An operator's ranked pool is not a promise of a named customer model. Named-model service must pause and preserve time if that model is unavailable, unless the customer previously accepted a specific compatible fallback. Record the actual model used.

Later, expose a small model selector at the start of a delegation. Change tiers at an explicit new quote or bounded session boundary; do not silently reduce a purchased duration or spend extra credit. A more capable model may improve conversation and planning but receives the same rules and permissions. Commercial tiers need suitable provider/model licensing and data handling; private free/evaluation allocations are not a production capacity plan.

Keep world authority and billing independent of inference hosting. Cloud inference and a private Spark worker must use the same validated job/response contract, authentication, deadlines and budget limits. A Spark on a home/private network should pull scoped jobs over an authenticated outbound connection or use a controlled private endpoint. A cloud server's localhost cannot reach a different machine's Ollama service. Home power, broadband or model outages must pause the affected service or use an agreed fallback.

NVIDIA documents a 128 GB DGX Spark configuration for local model inference. Memory capacity and peak arithmetic do not establish how many of this game's avatars it can serve. Use the exact hardware configuration and model quantization in any trial. [NVIDIA product information](https://www.nvidia.com/en-us/products/workstations/dgx-spark/), [hardware guide](https://docs.nvidia.com/dgx/dgx-spark/hardware.html).

Benchmark the same synthetic town jobs on cloud and the optional Spark: valid actions, character voice, memory grounding, refusal of injected instructions, response latency, queue delay, concurrent avatar capacity and cost per active avatar-hour. Include token/context usage, power, administration, hardware cost allocation and recovery availability. Choose a provider, price and hardware only after that comparison. No hardware purchase is needed to start the shared-world architecture.

## Acceptance before release

OA2 must pass the control, permission, privacy, metering, recovery and availability cases with free credits. OA3 adds the invoice cases and payment reconciliation before enabling purchases. Model and hosting changes rerun the affected cases and capacity trial.

| Case                      | Required evidence                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continuous presence       | Close every client; two delegated avatars still interact in the authoritative world. Reopen and observe the same committed events and identities.                                                                                            |
| Explicit permission       | No takeover or charge on an unarmed disconnect. Armed disconnect respects grace; explicit leave shows the reviewed policy.                                                                                                                   |
| Immediate return          | Reclaim during a slow provider call, with two tabs and duplicate workers. The human gains sole control; stale proposals and post-reclaim charges are rejected, while prior valid receipts settle once.                                       |
| Boundaries                | Attempts to spend beyond policy, take new debt/work, initiate combat, move through invalid tiles, act on unknown secrets or issue a wallet transfer are rejected.                                                                            |
| Time and money            | Exact exhaustion parks at zero. Two admissions racing the final credit cannot overspend it or bypass the one-avatar limit. Repeated stop/start, simultaneous sessions, speed changes, retries and rollback cannot duplicate time or rewards. |
| Payment recovery          | Duplicate/out-of-order/missed webhooks, partial/late/excess payments, forged signatures, wrong-store invoices and post-settlement changes never double-grant credit.                                                                         |
| Failure recovery          | Restart during an action, model call, invoice settlement and metering interval. Restore coherent world/billing backups; no double effects, unearned charges or repeat grants. Reconcile the external invoice history after restoration.      |
| Availability              | World, database, network, model, budget or Spark failure preserves undelivered time. Accepted fallback follows the quoted policy and is visible.                                                                                             |
| Ownership and privacy     | Another account, copied save, expired session or revoked delegation cannot control the avatar or inspect its journal; public AI labels remain accurate.                                                                                      |
| Player understanding      | Desktop and phone users can set limits, park, reclaim and explain what happened, why time was used and what credit remains. Check keyboard and screen-reader access.                                                                         |
| Capacity and service cost | A sustained multi-avatar trial establishes a maximum admitted concurrency, decision cadence, availability target and sustainable tariff with operator headroom.                                                                              |

## Next implementation handoff

At the start of packet 6, assign a simulation/backend owner and a player-experience owner to OA1 and OA2. Their first deliverable is the controller/delegation schema and race/recovery cases using deterministic fake inference and free credits. Integrate the human and AI action paths before adding live models. Billing owns OA3 only after that unpaid trial passes; model and infrastructure owners own OA4 after measurements.

Preserve the current roster, valid local saves, wallet approval rules, hosting and provider settings during today's quality and wallet work. This plan adds future contracts and release gates; it does not change those runtime contracts or authorize a production migration.
