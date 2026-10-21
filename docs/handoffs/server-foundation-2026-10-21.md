# Server foundation — first parallel packet

Owner: server-foundation lane C (`/root/server_foundation`). Completed locally on **21 October 2026**; ready for coordinator review. This is a dependency-free protocol spike, not completion of P2/OA1/OA2. No production files or shared tracker were edited.

## Source and delivery

- Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/server-foundation`.
- Branch: `codex/server-foundation-20261021`.
- Base and starting HEAD: `313e9baf626a5ece11ef08f705a7f401ca3608b1`.
- Delivery head: the commit containing this handoff on that branch; the exact resulting SHA is sent to the coordinator for `product/docs/DELIVERY_TRACKER.md` after commit. Resolve locally with `git log -1 --format=%H -- docs/handoffs/server-foundation-2026-10-21.md`.
- Owned files: this handoff and the five files beneath `experiments/server-authority/`. Existing `src`, save schema, package/lock/configuration, provider settings, and Kevin's checkout are unchanged.
- Read-only planning references: the parent product checkout's latest `docs/PRODUCTION_PLAN.md`, `docs/implementation/offline-avatar-control.md`, and `docs/implementation/agent-created-world.md`; those uncommitted documents were not copied over.

## Result

The [prototype](../../experiments/server-authority/README.md) serializes synthetic world actions, persists effects and receipts together, projects committed revisions to two local clients, continues a simulated clock with no clients, and fences in-flight fake AI work when the human reclaims. It rejects stale, duplicate, conflicting, unauthorized and out-of-bounds requests. A duplicate retry cannot repeat an effect, including after an unacknowledged durable commit or actual child-process exit.

The [design](../../experiments/server-authority/DESIGN.md) proposes an authority envelope around the existing Town v2 rather than changing portable saves. It maps the boundary to the actual save, identity, simulation, effects, economy and UI functions; describes a v1/v2 ingestion/recovery plan; reserves stable world/parcel/building/project/app/deployment/run references and separate capability grants; and defines the next real-engine adapter packet.

## Verification actually run

Runtime: Node **v24.19.0** at `/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. For the exact commands below, `NODE24` denotes that absolute binary path (not a change to system Node).

```sh
"$NODE24" --test experiments/server-authority/authority.test.mjs
"$NODE24" ../product/node_modules/eslint/bin/eslint.js --config ../product/eslint.config.mjs experiments/server-authority/authority.mjs experiments/server-authority/simulated-worker.mjs experiments/server-authority/authority.test.mjs
```

- Tests: **16 passed, 0 failed, 0 skipped**. Covers two views, view isolation, concurrent stale/duplicate actions, action-ID conflicts, wrong owner, clean replay, uncertain commit response, abrupt subprocess exit and manual lock recovery, disconnected clients/two fake delegates, immediate reclaim, stale human tabs, lease/policy/capability checks, expiry, clock authority/order, malformed input, exclusive writer, corruption/truncation and repeated journal records.
- Targeted ESLint: **passed with no warnings/errors** using the product checkout's existing binary/configuration read-only; no install/cache/package changes.
- Prettier `--check` passed for all six new files after formatting. Git whitespace verification passed. Both used the current isolated file set; no production formatting changes were made.
- Full app tests/typecheck/build, browser/device tests, actual v1/v2 migration and real hosted/network recovery were **not run**: production source is unchanged and dependencies were not installed in this isolated checkout. The spike's invariants do not substitute for those integration gates.

## Limits and blockers

No blocker remains for this packet. No network listener, timer, child process or provider job remains running. Tests cleaned their synthetic temporary journals. Nothing was deployed, merged, published, purchased, or sent externally.

The store is one local process, guarded by an exclusive file lock. It rewrites the full journal per action and is not suitable for production load/failover. Crash recovery deliberately requires a verified stopped writer before clearing a stale lock. Corrupt journals fail closed; restoring an older valid journal is not reconciled automatically and could repeat later effects without complete history.

Principals and views are trusted, unfiltered in-process test objects, not genuine authentication or player privacy projections. The prototype has a tiny grid and no real Town, economy or AI outbox. Global world-revision comparison rejects slow AI after any intervening tick; the engine adapter needs an explicit revalidation/retry policy. Lease/policy deadlines use simulated server clock milliseconds, not paid real service time; renewal, takeover, downtime reconciliation and metering are unimplemented. There is no production save-compatibility claim.

## What comes next

Coordinator reviews the packet and chooses the integrated candidate. Lane C can then implement the bounded **real-engine adapter harness** described in the design: existing v1/v2 fixtures, private Town draft, actual engine/economy validation, atomic outer receipt, fake outbox, and crash/reclaim tests without live models or a production database.

That next packet needs the agreed source candidate and a synthetic canonical-member mapping. It does not need a host/provider purchase. Authenticated membership, database-backed writer fencing, filtered views, coherent backups and network clients follow in a separately sized durable-server packet. No other agent should modify Town/schema/UI contracts during this spike's integration without the coordinator assigning that work.
