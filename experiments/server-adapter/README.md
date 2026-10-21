# Real-engine authority adapter — local experiment

This experiment runs the **actual pinned game engine** inside a synthetic authority envelope. It proves local transaction and recovery boundaries; it is not a hosted/shared-world release. Source pin: `0bd3e3b1401ebf6b460d9d71f287c4b474b2452b` (`candidate/2026-10-21-ai-quality`). Existing application source, saves, authentication, provider configuration and dependencies are unchanged.

Run with Node 24 and the repository's existing dependencies:

```sh
node --test experiments/server-adapter/adapter.test.mjs experiments/server-authority/authority.test.mjs
node node_modules/eslint/bin/eslint.js experiments/server-adapter/*.mjs experiments/server-authority/*.mjs
```

The verified local binary is `/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Dependencies were independently cloned from the pinned candidate's `node_modules` using `cp -cR`; no installation, package change or shared dependency write was required. The Vite SSR loader disables application config, `.env` loading, HMR, websocket, file watching and the HTTP listener. It loads only the real `src/game` module graph used by the experiment.

## What the adapter demonstrates

| Boundary           | Implemented evidence                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real migration     | `readTownFile` imports the committed v1 fixture and synthetic v2 files. Raw bytes are retained outside Town; invalid imports remain rejected and recoverable                                                                                            |
| Canonical identity | All eight fixed roles remain. One fake account controls only `player`; seven NPCs remain simulation-controlled. Synthetic server IDs are separate from portable provenance                                                                              |
| Committed views    | Two independent local client views see the same committed Town; returned objects cannot mutate authoritative state                                                                                                                                      |
| Human choices      | `playerActions` supplies the current quote; `applyPlayerAction` validates it. Outer request IDs stay distinct from engine quote IDs                                                                                                                     |
| Clock and outbox   | Each `stepMinute` result commits with the complete Town, receipt and any pending NPC `ThinkJob`; a timer can progress with no clients                                                                                                                   |
| Fake jobs          | NPC jobs use `offlineResult` on an observation copy and `applyResult` on a validated transaction draft. Delegated player jobs have a separate movement-only scope and use the real map                                                                  |
| Return control     | Reclaim changes the player authority revision and cancels pending avatar jobs immediately. Old workers/tabs cannot regain authority with fresh world revisions; NPC jobs retain their distinct scope                                                    |
| Money              | A real quoted cafe agreement, 180 eligible attendance minutes and the actual payroll path pay one wage of 5. Crashing after the final tick commits, then redelivering/restarting, cannot pay again; `auditEconomy` passes and total funds are conserved |
| Recovery           | Six transaction fault points, ambiguous completion response and an actual abruptly exited process preserve all-or-none commits. Duplicate requests do not rerun effects                                                                                 |
| Damaged history    | Corruption fails closed. Missing `HEAD` with any retained record/temp evidence refuses initialization, including after a settled wage, and preserves all remaining bytes                                                                                |

The tests intercept `fetch`, outgoing TCP connections and server-listen attempts from before engine loading through cleanup. All counters remained zero. The abrupt-exit child has the same deny hooks. No live AI, provider gateway, real account, production database, migration, hosting or paid service was used. Test data lives in temporary local directories and is removed on completion.

## Storage contract

`store.mjs` writes a content-addressed immutable **full envelope** record containing the complete JSON-safe Town, membership, controller, outbox and outer receipts. It fsyncs that record and directory, then fsyncs and atomically replaces `HEAD`; that pointer is the commit boundary. Views publish only after durable completion. An uncertain storage write fences the process until reopen/reconciliation.

Recovery validates the referenced hash/revision chain and loads its full committed state. It does not rerun engine mutations or fake inference. Unreferenced records cannot be mistaken for committed effects. If `HEAD` is missing but any store evidence remains, automatic admission is forbidden; a missing pointer is not proof that no payments happened. A killed writer leaves an exclusive lock. The test joins the exact exited child before removing that stale lock; production recovery needs an equivalent verified operator/supervisor procedure.

`exportTown` remains a separate portable-export operation. It intentionally removes paths/replay; canonical persistence retains those fields. Engine migration creates some optional properties with `undefined`; canonical persistence uses their JSON form, while raw input bytes, meaningful fields, paths and replay assertions stay exact. No save-format change is introduced.

## Measured sample and limits

One local diagnostic sampled 181 real clock ticks, one shift acceptance and crash/restart checks. It retained **183 full records**, with a **2,164,988-byte latest record** and **185,076,392 bytes of retained record data**. The sampled elapsed time was **14,271 ms**, including serialization, fsync and recovery. These are diagnostic measurements on this workstation, not capacity or latency promises. Pending outbox observations and complete snapshots make this deliberately expensive; there is no compaction or retention policy.

Other explicit limits:

- Principals and snapshots are trusted, unfiltered in-process test objects. There is no HTTP API, real authentication, private player projection, network reconciliation or multi-process failover.
- The local store is not a production database or distributed fencing implementation. Hashes detect accidental corruption, not malicious rewriting. An older internally valid backup can roll back later receipts; do not admit a restored world without complete history/reconciliation. Orphan records and a lost `HEAD` require manual recovery; no automatic guessing or garbage collection is implemented.
- Every transaction clones Town. `navigation.ts` keeps a yield cooldown in a `WeakMap` keyed by object identity; that cache resets between these drafts and after restart. Committed paths/replay survive exactly, but future yielding may differ from a long-lived browser Town. Deterministic navigation/cache ownership needs an explicit adapter contract before production integration.
- Strict world-revision checks invalidate a slow fake result after **any** intervening tick. Stale jobs become explicit rejected records; they are not silently retargeted. No automatic replan policy or assurance against inference starvation is implemented.
- Clock milliseconds are simulated, independent of game minute count. There is no real elapsed-service metering, downtime catch-up, paid time, renewal or worker lease takeover. Expiry parks the avatar.
- `applyResult` can tolerate partial edits and returns no success detail. Completion receipts capture the actual audited post-state and its digest; they do not claim every proposed edit succeeded.
- Stored observations and the job output are synthetic and local. There are no inference budgets, service capacity checks, secrets, wallet actions, land market, construction or generated-code execution.
- The adapter proves funded-work and representative migration/recovery paths, not every gameplay rule. Full application/browser/device and hosted acceptance were not rerun; the pinned application's acceptance remains separate.

## Next bounded packet

Review the transaction API and make the engine's nonserialized navigation cache explicit without changing Town v2: determine which runtime state belongs in the authoritative adapter and add a browser-versus-adapter continuation test, including restart. Define stale-job retry/revalidation and observation retention with tests that prevent duplicate work. Then prepare a transactional storage contract with measured state sizes, checkpoint/delta strategy and coherent backup recovery.

Keep this local and fake until those contracts are accepted. Authenticated membership, filtered views, actual database writer fencing, network clients and hosting are a separately sized packet; this experiment does not close P2/OA1/OA2.

See the [delivery handoff](../../docs/handoffs/server-adapter-2026-10-21.md) and [preparation contract](../server-authority/ADAPTER_PACKET.md).
