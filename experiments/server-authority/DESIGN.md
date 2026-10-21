# Proposed authority seam and next packet

Status: local spike/design only, 21 October 2026. Base: `313e9baf626a5ece11ef08f705a7f401ca3608b1`. Production implementation and host selection remain separate work. The current `Town` schema and exported engine functions are unchanged.

## Boundary

The smallest production seam is a **server-owned envelope around the existing Town v2**, with a versioned engine adapter. It is not a new browser-save version. The client submits an intent and renders committed state; the authority selects a draft, checks permissions, runs existing simulation rules, verifies invariants and persists effects, receipts and any outgoing job atomically. It publishes a revision only after commit.

Proposed envelope records:

| Record            | Responsibility                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| World             | Canonical server world ID, monotonically increasing revision, simulation/schema version, stored `Town` v2 payload, trusted clock cursor and coherent recovery point     |
| Membership/roster | Verified account membership; canonical character ID; local role/portable provenance mapping; owner revision. A copied save is never proof of ownership                  |
| Controller        | Exactly one human session, parked state or delegation per avatar; controller and policy revisions; scope, expiry, worker lease and fencing token                        |
| Action receipt    | World-scoped unique action ID, authenticated principal, canonical intent digest, accepted/rejected result and committed revision; prevents changed-term retries         |
| Job/outbox        | Stable job ID, bounded observation, captured controller/policy/lease revisions, delivery state and proposal result; no external model call inside the world transaction |
| Event/checkpoint  | Versioned committed event/delta plus sufficient state to recover deterministically, with coherent receipts and accounting through a known recovery point                |

The exact storage product is undecided. A database implementation must use an actual atomic transaction or a documented recoverable protocol. A storage-backed compare-and-swap/lease fences all world writers; an in-memory queue alone is insufficient across workers. The local lock/journal is evidence of ordering, not the production storage recommendation.

## Where it attaches to the actual game

| Existing code                                                           | Proposed integration, without changing it in this packet                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/types.ts:Town`, `AgentId`, `TownIdentityRegistry`             | Retain Town v2 and its additive extensions. Keep canonical authority outside the portable registry. The fixed eight-role `AgentId`/`AGENT_IDS` remain for the first adapter; dynamic membership needs a later explicit reference migration                                    |
| `src/game/save.ts:readTownFile`, `parseTownFile`, `exportTown`          | Continue local v1 import/v2 export and original-byte recovery. Use the same validator against a copied import in a separate ingestion flow; never write hosted controller/credit records into a portable export                                                               |
| `src/game/identity.ts:characterRef`, `townRecordRef`, `forkTown`        | Preserve portable identity/provenance and world-scoped record references. Maintain an explicit verified mapping to server identities. Forking remains distinct from joining/restoring a canonical world                                                                       |
| `src/game/sim.ts:stepMinute`                                            | Call against a private draft from a durable server clock cursor. It mutates Town and returns a possible `ThinkJob`; persist the changed Town and a durable job reference together, then run inference outside the commit                                                      |
| `src/game/sim.ts:advanceTown`                                           | Do not use it for a live server scheduler: it can loop up to 20,000 minutes and directly apply offline results. Establish a bounded per-tick adapter and explicit outage recovery policy first                                                                                |
| `src/game/effects.ts:applyPlayerAction`, `applyResult`                  | Humans and model proposals enter the same authority transaction before these validators. Add a distinct delegated-action adapter; do not remove NPC/player-agency guards to make AI control work                                                                              |
| `src/game/economy.ts:runEconomyCommand`, `auditEconomy`                 | Existing draft/receipt checks and immutable transactions remain authoritative. Link the outer action ID to economy command IDs and persist Town, world receipt and money history atomically; an economy receipt alone is not durable cross-worker idempotency                 |
| `src/components/town/TownApp.tsx`                                       | Later integration replaces browser simulation/mutation with command submission and committed projections in an explicit server mode. Keep local mode, exports, movement controls and render interpolation available; this lane has no permission to change the UI in parallel |
| `src/lib/agent-wallets/types.ts`, `auth.server.ts`, `service.server.ts` | Private registered copies are account-scoped. Resolve genuine authenticated ownership for canonical admission; do not treat a registered private copy or portable ID as a grant over another account's canonical avatar                                                       |

## Action and reclaim protocol

An ordinary proposal carries `actionId`, `worldId`, `characterId`, observed world revision, controller revision, policy revision and a typed payload. A delegated proposal additionally binds delegation and worker lease/fencing IDs. Account/session identity comes from server authentication, never the supplied intent. Server validation checks membership, controller, current capability, expiry, location and resource constraints again at commit.

The spike uses strict world-revision rejection: **any intervening tick invalidates a slow AI result**, even when the actor has not moved. Refresh and explicitly re-evaluate before submitting a **new** action ID; repeatedly retrying the old result cannot succeed. This can starve slow inference at a high tick rate. The production adapter needs an explicit retry/revalidation policy and may use narrower entity revisions only after defining which observations each action depends on. Do not silently replace stale revisions on a model result.

Owner reclaim is a separate high-priority control command. It compares the controller revision, does not depend on world revision, atomically increments the controller/policy fence and installs the authenticated human session. It never waits for a pending provider call. Old AI proposals, queued requests and old human tabs cannot act afterward, even with fresh world state. An explicit competing reclaim that loses the compare-and-swap refreshes its control view; it cannot silently undo a newer decision. Cancellation of external work is best effort; revocation at commit is mandatory.

Only effects already committed before reclaim remain valid. The prototype has no metering; later metering must end eligibility at that reclaim boundary while allowing prior valid delivery receipts to settle once. Lease expiration parks; unexpected browser disconnect alone does not grant AI control. The first adapter must preserve that opt-in distinction.

## Save and identity compatibility

1. Preserve the exact raw upload and its digest before parsing. Run the existing `readTownFile` migration against a copy. Invalid/existing experimental ledger files retain the raw recovery path; never repair them by discarding financial history.
2. A validated v1 import continues through the existing v2 migration once; v2 identities, names, memories, favors, notices, economy and replay remain intact in the payload. Store importer/engine version and the raw-to-normalized receipt. Repeated import ingestion uses an authenticated idempotency key and cannot create repeated opening funds.
3. Establish a new canonical world/membership record through an explicit admission operation, retaining portable IDs as provenance/mappings. Importing into an existing canonical world is **not** an overwrite/restore mechanism. A copied file cannot claim canonical ownership, create land title, restore spent credits or rewind a world transaction.
4. Account-linking and migration of existing private registrations require an explicit product/identity decision. Where an existing canonical mapping is valid, preserve it; do not silently mint replacements. For a new fork, generate new canonical identities and retain lineage.
5. A local export is a playable backup of its Town payload. A hosted disaster-recovery backup additionally needs authority, action/event history, jobs and accounting through the same recovery point. Keep admission frozen if later receipts/history are incomplete; a valid old snapshot is not evidence that later effects never happened.

This packet does not implement or test those production import steps. Existing v1/v2 save code is unchanged. The next adapter packet must exercise real fixtures and prove byte-preserving failure handling before any migration is proposed.

## Identities and capability boundaries reserved for later work

| Entity               | Stable reference and revision boundary                                                          | Capability boundary                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| World/character      | Canonical `worldId` and `characterId`; membership/ownership revision; explicit portable mapping | Joining and controlling require verified server rights                                                                                 |
| Parcel/building      | Server-issued `parcelId`/`buildingId`, layout/ownership/access revisions                        | Distinguish title holder, builder, operator, tenant, user and contributor; contribution is not ownership                               |
| Construction project | Stable `projectId`, funded commitments and stage/event revisions                                | `build.propose`, `build.fund`, `build.work`, `build.modify` are separate grants, subject to map and economy validation                 |
| App/deployment/run   | Stable `appId`, immutable `deploymentId`, unique `runId`, capability-policy revision            | External isolated executor receives filtered reads/scoped proposals; it cannot write world storage or hold signing/session credentials |
| External activity    | Adapter ID, stable external session/match ID, result receipt                                    | Destination allowlist, bounded actions and verified results; no general network/publishing authority                                   |

World-scoped references and versions belong in the envelope/registries, not inferred from map coordinates or names. Parcel/layout changes must update collision, navigation, entrances and access as one accepted revision. Reserve outbox links for app jobs, but do not execute generated code in the world process. Reclaim revokes avatar-action grants; only separately authorized service grants can outlive it. Wallets, land trading, paid AI and sandbox implementation are outside this packet; `move` delegation grants none of them.

## Failure evidence and remaining gates

The executable tests cover committed-view consistency; stale/duplicate/conflicting intents; wrong owners and workers; controller/session/policy/lease checks; restart replay; ambiguous response after fsync; an abruptly exited child; a locked second writer; disconnect-independent ticks/fake delegates; immediate reclaim; expiry; corrupt/truncated/duplicate journals. Rejections leave state unchanged. Hash checks are integrity diagnostics, not authentication.

Still unproved: real Town/economy atomicity, network disconnect/retry reconciliation, database multi-writer fencing, automatic failover, coherent backup restore, authenticated membership, filtered private views, outbox admission/cancellation/reconciliation, real server-time leases, resource caps and capacity. A full historical journal is required to prevent replay after restoring a stale backup. Do not claim OA1, OA2 or P2 complete from this spike.

## Next bounded packet: engine adapter with synthetic persistence

Owner: simulation/backend lane, after coordinator review. Begin from the chosen integrated candidate so Kevin's fix and the player-experience work are not overwritten.

The [prepared adapter contract](ADAPTER_PACKET.md) inventories the exact engine imports, existing fixtures, synthetic membership, transaction boundaries and acceptance cases. It remains gated on the coordinator's candidate pin; its preparation does not start engine implementation.

1. Add an isolated adapter harness around **real** `createTown`, `readTownFile`, `stepMinute`, `applyPlayerAction` and `auditEconomy`, preserving public signatures and Town v2. Keep provider responses deterministic and fake. Use no live DB or host.
2. Commit the complete Town draft and outer action receipt together; capture returned `ThinkJob` as an outbox proposal. Re-run existing financial/save invariants against commands, tick and replay. Use existing money paths; never award synthetic free coins to demonstrate persistence.
3. Test v1/v2 import/export round trips; names/memories/favors/identity/economy preserved; failed import retains all bytes; crash at effects/receipt/outbox boundaries; duplicate paid work does not double-pay; stale result after human reclaim cannot change Town.
4. Deliver an adapter contract and measured local record/tick sizes, with storage requirements and unresolved account/roster choices. Only then size the authenticated durable-store/network packet and choose hosting with the coordinator's operations evidence.

Entry blockers for that next packet: selection of the integrated source candidate and an agreed synthetic canonical-member mapping. Production store/host decisions are not blockers for this local adapter harness. No scheduling promise or service purchase follows from this design.
