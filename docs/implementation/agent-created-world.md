# Agent-created buildings, land, software and external activities

Direction recorded **21 October 2026** at Arwyn's request. Agents should ultimately be able to construct and operate their own buildings, potentially buy and sell land, write and run their own code and apps in a sandbox, and participate in external activities such as **chessbots.ai**. These are future product requirements to plan into the shared-world architecture. They are not implemented features, a settled land-market policy or authorization for external accounts, purchases or publication.

The [production plan](../PRODUCTION_PLAN.md) assigns these to P4–P7 after server foundations. The [roadmap](../ROADMAP.md) remains the feature-status entry point. Begin the architectural contracts with OA1; retain the bounded OA2 trial's initial restrictions until each new capability passes acceptance.

## Intended experience

A resident notices a useful missing place, proposes a workshop, obtains an authorized plot and resources, builds it through a recorded project, and invites others to use it. The workshop can later host an app written by that resident. The resident can test, deploy, run and maintain its own software, inspect failures and improve it within its allowance. A chess club could enter an approved external match and retain the moves and result as a genuine town event.

Both autonomous residents and delegated player avatars use the same world rules. The player remains free to participate or refuse. Construction, trading and app execution each need their own authority; permission to talk or act while away does not grant any of them automatically.

## AC0 — contracts to establish during shared-world engineering

The current map's buildings are authored in `src/game/world.ts`, and Town v2 does not contain a construction, parcel or app registry. Existing shared AI-budget storage is not a continuous world server or a code sandbox. Extend these systems deliberately rather than interpreting existing project dialogue as a completed building or running generated code inside the game process.

| Contract                  | Required design                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical identities      | Stable world, parcel, building, project, app, deployment and run IDs tied to canonical characters/accounts; copied local IDs confer no server ownership                                      |
| Ownership and rights      | Distinguish title holder, builder, operator, tenant/user and contributor; identify who may build, modify, invite, sell, deploy or stop. Contribution credit alone grants no title            |
| World changes             | Versioned parcel boundaries and building layouts; collision, pathfinding, entrances, public access and references update consistently when construction changes the map                      |
| Validated actions         | Typed intents carry actor/controller/policy/world revisions and unique action IDs; server checks permissions, location, resources and current state before one atomic effect                 |
| Economy                   | Reserve actual available resources/coins; record recipients, earned work, refunds and ownership transfers. No model-created money or arbitrary balance changes                               |
| Persistence and migration | Recover construction, ownership, jobs and receipts through restart/backup; migrate old local towns without erasing history; imported saves cannot mint canonical land or rewind transactions |
| Permissioned jobs         | World submits scoped jobs to a separate executor; code receives a restricted API and filtered knowledge, never direct world/database/signing access                                          |
| User control              | Visible plans, limits, costs, logs and stop/reclaim controls; ownership or policy revocation invalidates outstanding work and action authority                                               |

Acceptance for AC0 is a reviewed schema/action proposal, migration plan and failure-case list. This note specifies those requirements; it does not claim the engineering design or migration exists yet. Preserve compatibility by adding versioned records and explicit migrations during implementation rather than modifying today's save format in this documentation pass.

## AC1 — agents construct and run buildings

Start with a small set of approved building templates and one permitted workshop plot. Agents select a purpose, submit a footprint and resource/work plan, obtain the necessary rights, reserve funding and progress through **proposed → permitted → funded → building → usable**, with cancellation and repair paths. More flexible layouts or generated designs follow once validation works.

Construction is a persistent project with real duration, materials or stated coin costs, participants, milestones and a usable result. A café, workshop or chess club should offer an actual supported activity. The simulation validates every stage; agent-written descriptions cannot create completed structures or free resources. Set initial per-agent/world limits and require paid work to follow existing funded-work rules.

Protect essential roads, entrances, public facilities and occupied space. Check reachability, overlapping claims, capacity and accessibility before accepting a layout. Define who owns materials/work in progress, what happens on abandonment, and which modifications or demolition are allowed. Cancellation preserves earned payments and returns only unspent resources. Existing residents, buildings and valid saves survive migration.

**First acceptance:** one agent plans, funds and finishes a usable workshop on an authorized parcel; a second resident enters and uses it; building state, access and accounts survive reload/server restart. Reject blocked paths, overlapping footprints, unauthorized changes and duplicate completion. Pause/cancel and a mid-construction restore preserve commitments and resources.

## AC2 — optional land ownership and buying/selling

Arwyn's “maybe buy/sell land” is an option to investigate, not a decision to launch a speculative or real-money land economy. Begin with allocated or leased plots so construction can ship without a marketplace. Decide initial allocation, scarcity/map growth, parcel sizes, purchase versus lease, ownership caps, public commons, inactivity and dispute handling before setting prices or opening trade.

If adopted, begin with town-coin transactions. Agents may list, negotiate, buy and sell only within explicit ownership and spending authority. A listing must state the parcel, seller, price, expiry, attached buildings, fixtures, access rights, tenants and outstanding construction/work obligations. State exactly what transfers and what remains with the seller; a sale must not silently cancel workers' earned pay or transfer a character's memories, wallet keys or app credentials.

Use server-side offers and atomic reservation/settlement so a buyer's funds and the seller's current title are checked together. Prevent double sales, stale listings and repeat settlement. Keep an immutable title/transaction history and a clear cancellation/refund path. Define transaction limits and anti-hoarding rules without introducing confiscation or taxes by assumption. Real BTC/stamp settlement, if ever chosen, requires its separate wallet/asset gates and owner signing; a town land title is not automatically an on-chain asset.

**First acceptance:** two agents complete one authorized town-coin parcel sale; title and money change exactly once; stated access/building rights follow the contract. Competing buyers, insufficient funds, expiry, revoked permission, disconnect/retry and restart cannot lose funds or duplicate title. Restore produces the same settled ownership and balances.

## AC3 — agents write and operate code/apps in a sandbox

Provide a persistent workspace where an agent can create and edit source, run bounded tests, inspect stdout/errors, package a versioned artifact, deploy it into isolated execution and operate it through limited jobs or services. Give each app a purpose, owner, source/version record, declared permissions and resource allowance. An app may appear at a workshop terminal or other in-world entry point; buildings and app deployments have independent lifecycles.

Start with one operator-supported language/runtime and finite jobs. Later add schedules, long-running services and approved external endpoints only after quotas, restart and abuse controls pass. A reusable sandbox interface should allow hosting to change without changing the world action protocol; no runtime vendor is selected by these notes.

Required facilities:

- Isolation between agents/apps and the game server using a runtime designed for untrusted code; a normal JavaScript evaluator, subprocess or browser worker alone is not the production security boundary. Evaluate the runtime with explicit escape and cross-account access tests.
- CPU, memory, wall-clock, process, storage, network, concurrency and spend limits; cancellation, garbage collection, owner/operator kill controls and an auditable run receipt. App compute is separately accounted from game coins, AI inference costs and AI-away time.
- A scoped filesystem and dependency installation policy, immutable deployed versions, revision history, retained workspace data, bounded logs, deployment rollback and explicit permissions before an update gains more access.
- Network denied by default, with approved destinations and mediated credentials when needed. No host environment, production database credentials, signing keys or other residents' private data in agent workspaces. External content remains untrusted input.
- A capability API exposing only permitted, filtered reads and typed world-action proposals. The authoritative server checks policy, controller revision and budgets again at commit. Apps cannot write canonical state directly, grant themselves rights or bypass ordinary gameplay rules.
- A separate origin and restricted embedding for user-facing app interfaces so app code cannot read game cookies, browser storage or another account's session. Public sharing/endpoints are explicit deployment capabilities.
- Clear stop/restart semantics, health/status, failure logs, an owner journal and recovery of durable jobs without duplicate actions. Human reclaim revokes avatar-action authority; explicitly independent services may continue only under a separate valid service policy.

First examples are a private town notice index, a workshop stock calculator and an internal chess-analysis app. Start with synthetic data and no external side effects. Agents can autonomously iterate within their granted sandbox; publishing externally, adding paid services or expanding access requires the appropriate grant.

**First acceptance:** an agent writes, tests and deploys a useful small app, a permitted user runs it, and the agent diagnoses a failure and rolls back. An infinite loop is stopped at quota; cross-agent files, credentials and forbidden network access remain inaccessible; a forged world-action request is rejected; restart/redelivery cannot duplicate a game effect or charge. Isolation review and resource accounting must pass before arbitrary generated code is admitted.

## AC4 — external games and services

**chessbots.ai is the requested example and an investigation target.** An attempted read on 21 October could not retrieve the site; this planning pass has not verified an API, bot policy, account flow, availability or commercial terms. Do not infer supported integration from the domain name. Establish those facts before estimating or implementing that adapter.

Define a replaceable external-activity adapter with identity/account mapping, permission scope, credential mediation, rate/concurrency limits, match/session IDs, legal actions, deadlines, resume/cancel behavior and result verification. Prefer a documented supported API. If the service has no permitted automation interface, retain it as a blocked integration candidate and prove the gameplay with an internal chess board or another permitted service.

For chess, record moves, clocks where relevant, side, opponent, match ID and outcome. Enforce legal moves and the external clock; handle timeout, illegal response, disconnect, retry, duplicate callbacks and forfeits. Resume the same match instead of silently starting duplicates. Publish a result or award a game reward only after a verified result; no unbounded reward farming or trusting an agent's self-reported win. Spectators and journals should distinguish internal practice from an actual external match.

External service access has its own allowlist, account/spend allowance and permission to transmit data. Send only what the activity needs, not private town memories. Do not register accounts, send messages, enter paid competitions or publish on an owner's behalf merely because an app can reach the network. Agent code cannot change the game service's rules or bypass bot restrictions.

**First acceptance:** an authorized agent completes a permitted chess match, records a replayable move list and a verified result once, then recovers a second interrupted match without duplicate entry/reward. Revoked credentials, exhausted quotas, service downtime and owner stop leave an honest recoverable status. A chess adapter does not grant unrestricted access to other websites; each later service receives its own adapter and acceptance.

## Decisions needed before scheduling implementation

| Decision                          | Suggested starting point                                                   | Decision gate                   |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| Building freedom and resources    | Approved templates, one workshop plot, bounded funded work                 | AC1 sizing                      |
| Land market                       | Allocated plots first; evaluate town-coin sales later                      | Before AC2 commitment           |
| Title, tenancy and bundled rights | Explicit parcel/building/access contract with preserved obligations        | AC0/AC2 design                  |
| Runtime and languages             | One isolated runtime, bounded jobs, private apps first                     | AC3 prototype and cost review   |
| App hosting charges               | Separate compute allowance with measured limits                            | Before admitting real workloads |
| External chess provider           | Verify chessbots.ai; keep a replaceable adapter and internal practice mode | AC4 feasibility                 |
| Delegated avatar permission       | Construction, land and apps require separate scoped grants                 | Before extending OA2            |

These notes establish direction and delivery gates. They do not change runtime state, create a land market, start a sandbox, enable network access or deploy an external integration.
