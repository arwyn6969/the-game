# Local authority spike — 21 October 2026

This dependency-free experiment proves a small authority/recovery protocol using synthetic characters and a five-by-five movement grid. It does **not** implement the game's shared server, import real towns, choose a host, call a model, or wire into production. [DESIGN.md](DESIGN.md) maps the result to the current engine and describes the next packet.

Run from the repository root with Node 24:

```sh
node --test experiments/server-authority/authority.test.mjs
```

On this workstation the verified binary is `/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. There is no install step. Tests create and remove synthetic journals beneath the OS temporary directory; no environment file or real save is read. No listener or server is left running.

## What is implemented

- One authority serializes changes; two independent in-process client views receive the same committed revision and cannot mutate it through returned objects.
- Typed movement, delegation, reclaim and clock requests use stable world/character/action IDs. The authority rejects stale world/controller/policy versions, unsupported actions, invalid movement, wrong owners, wrong workers and wrong/expired leases.
- An action ID commits at most once. An identical retry is rejected with the original receipt when the caller remains authorized; different terms under that ID conflict. A revoked worker cannot obtain authority by refreshing its world revision.
- An independent timer advances simulated server time after every view disconnects. Fake workers capture an observation before a delayed completion, then submit to the same validation boundary as humans.
- Owner reclaim changes the controller revision immediately, without waiting for inference or the current world revision. It compares the controller revision and grants one human session control; old tabs and AI proposals lose authority.
- Effects and receipts live in the same hash-chained journal. Restart rebuilds both by applying recorded events, without re-running inference. A durable write followed by lost response is discovered on restart and cannot repeat the effect.
- Journal updates write and fsync a temporary file, rename it, then fsync the directory before publishing the new revision. An uncertain write fences the process. Corruption or an unsupported journal fails closed and retains original bytes.
- An exclusive lock file prevents another local writer. An abrupt process exit leaves a stale lock; recovery is deliberately manual after proving the old writer stopped. The subprocess test demonstrates that procedure.

## Deliberate limits

All identities are synthetic and principals are trusted **in-process test inputs**, not credentials. Any caller able to invoke the JavaScript API can pretend to be the scheduler or an account; it must never be exposed directly as an HTTP API. Client snapshots include test authority records and are not a production privacy projection.

This is one process on a local filesystem. It is not a distributed lease, database transaction implementation, failover system, backup guarantee or network/client reconciliation test. The journal is rewritten in full on every action and grows without compaction; it is intentionally unsuitable for production load. Checksums detect accidental corruption, not malicious file rewriting or a valid but rolled-back backup. Restoring an older valid journal without the complete later history could repeat effects: production admission must remain frozen until its recovery point and external receipts are reconciled.

One timer callback advances 1,000 **simulated** server milliseconds and one game minute. No real-time service duration is measured or billed, and no missed downtime is caught up. Production leases use trusted monotonic/wall-clock deadlines independent of game speed. The three-second simulated worker lease has no renewal/takeover API: expiry parks the avatar and fresh owner control is needed. Tick/reclaim ordering is serialized at commit; previously committed actions remain committed.

The narrow model contains positions, controller state, clock and receipts. It has no actual Town v1/v2 payload, conversations, economy, payroll, dynamic roster, collision map, authentication, AI outbox, billing, private journal UI, parcel registry or sandbox. Production compatibility is a documented adapter proposal, **not a proven engine migration**. The full application checks were not run for this isolated experiment; the existing source, save schema and dependencies are unchanged.

## Files

| File                   | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `authority.mjs`        | Synthetic reducer, action authority, atomic local journal, replay and client views |
| `simulated-worker.mjs` | Delayed fake action completion and a client-independent clock                      |
| `authority.test.mjs`   | Executable authority, replay, process-exit and corruption evidence                 |
| `DESIGN.md`            | Proposed production seam, migration boundaries and next delivery packet            |

See the [lane handoff](../../docs/handoffs/server-foundation-2026-10-21.md) for source revisions, actual checks, blockers and the next owner.
