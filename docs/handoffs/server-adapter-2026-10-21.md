# Real-engine adapter — delivery packet

Owner: server-foundation lane C. Completed locally **21 October 2026** at $0 project/provider/service spend. Ready for coordinator review; this is a local experiment, not a deployed shared world or completion of P2/OA1/OA2.

## Reviewed source and scope

- Exact engine source/base: `0bd3e3b1401ebf6b460d9d71f287c4b474b2452b`; tree `0b68cf176037b436c07a6225a2fdeebb58f0eea1`; annotated tag `candidate/2026-10-21-ai-quality`.
- Own checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/server-foundation`; branch `codex/server-adapter-20261021`, created directly from that pin.
- Own earlier commits were cherry-picked only: prototype `16900ad…` → `88cd9de…`, preparation `07cdb53…` → `f091e257bfa6c2bc0ad52061c7aa573e019ce8d4`. The old branch and candidate checkout were not reset or rewritten.
- Adapter delivery head is the commit containing this handoff; its exact resulting SHA is sent to the coordinator after commit. Resolve with `git log -1 --format=%H -- docs/handoffs/server-adapter-2026-10-21.md`.
- New implementation is confined to `experiments/server-adapter/`, plus this handoff. No `src`, Town/schema/UI/auth/provider contracts, package/lock/root tooling, shared tracker or candidate-source changes.
- Dependencies were independently cloned with `cp -cR ../candidate-20261021/node_modules node_modules`. No install/network fetch or shared dependency modification.

## Delivered behavior

The [adapter](../../experiments/server-adapter/README.md) loads the real `createTown`, `readTownFile`, `stepMinute`, `playerActions`, `applyPlayerAction`, `applyResult`, `auditEconomy`, `offlineResult`, map and identity modules. Canonical persistence keeps the entire JSON-safe Town with its outer receipts, durable pending jobs and synthetic authority records in one commit. Portable exports retain their existing, separate behavior.

All eight roles remain; one fake account owns only player control. NPC `ThinkJob` processing stays distinct from revocable player movement. Two local views observe committed state; raw imports survive normalization/rejection; quoted requests, tick effects, paid work and fake job results cannot repeat after redelivery/restart. Human reclaim invalidates pending avatar work without waiting for its result.

Independent review identified a missing-HEAD admission bug in the initial store. It is fixed: any retained store evidence without `HEAD` requires recovery, never automatic initialization. The regression removes `HEAD` after the real settled wage, attempts a different initializer, then verifies every retained file hash is unchanged and no replacement genesis/pointer appears. Orphan genesis/temp evidence also fails closed.

Final review found a derived-ID boundary issue: a valid 150-character outer request ID creates a 154-character `job:` ID. The follow-up preserves the accepted outer range, validates derived job IDs separately up to 154 characters, and uses a bounded deterministic digest-based default completion ID. Two regressions complete the maximal-origin job with an explicit short ID and the default helper, then prove duplicate rejection after restart. Invalid-type IDs still fail without throwing or changing state. This is a separate fix commit atop `e82c48ccad743801b32a3a68f450251961d74737`; the coordinator records B's final assessment against its exact head.

## Actual verification

Runtime: Node **v24.19.0** at `/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Commands below ran from the own checkout using that binary:

```sh
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test experiments/server-adapter/adapter.test.mjs experiments/server-authority/authority.test.mjs
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/eslint/bin/eslint.js experiments/server-adapter/*.mjs experiments/server-authority/*.mjs
```

- **42 tests passed, 0 failed, 0 skipped**: 26 new real-engine tests plus the 16 prior authority tests. Actual final combined duration: 17,339 ms.
- **Targeted ESLint passed** with no warnings/errors.
- **Prettier and staged whitespace checks passed** for all six new files. Source-scope verification against the pin found no application/script/package/migration/server/tooling changes. No full app suite/typecheck/build/browser/device or live-provider checks were claimed for this isolated diff; the coordinator's pinned-source checks remain separate evidence.
- Tests install deny hooks for `fetch`, outgoing TCP and server-listen calls before engine loading and retain them through cleanup; **zero attempts occurred**. The abruptly exited child has equivalent deny hooks. Vite uses `configFile:false`, `envDir:false`, middleware mode and disabled HMR/websocket/watch; its HTTP server is null.
- No real model/provider call, project network work, project secret or `.env` file, private save, production database/migration, deployment, account or paid service was used. Temporary synthetic journals, timers and child processes are cleaned up; no service remains running.

The assertions cover real v1 migration and legacy/current v2 imports, exact raw recovery, normalized identity/history preservation, internal path/replay persistence, separate portable omissions, membership/control denial, shared committed views, quoted-choice idempotency, NPC outbox creation/recovery/completion, invalid and stale results, movement-only delegation, immediate reclaim, disconnected ticking, lease expiry, six crash windows, lost completion response, actual abrupt process exit, corruption and lost-pointer recovery.

The cafe scenario accepts an actual current quote, earns **180 eligible minutes** via `stepMinute`, loses the response after the wage commits, then restarts/redelivers. It finds **one settled payable, one wage transfer of 5**, conserved total money and a passing real economy audit. Another tick/restart still cannot pay it again.

## Measured local storage

| Diagnostic sample            | Result                                                 |
| ---------------------------- | ------------------------------------------------------ |
| Work scenario                | 181 real ticks, shift acceptance, crash/restart checks |
| Physical / committed records | 183 / 183                                              |
| Latest full record           | 2,164,988 bytes                                        |
| Retained record bytes        | 185,076,392 bytes                                      |
| Sampled elapsed time         | 14,469 ms, including persistence and recovery          |

The result confirms that retaining full snapshots and pending observations is costly; it is not production sizing or capacity evidence. The [README limitations](../../experiments/server-adapter/README.md#measured-sample-and-limits) are part of this delivery.

## Limits, blockers and next packet

No blocker remains for the bounded local evidence. Production remains gated on real authentication and filtered views, database/distributed writer fencing, network behavior, coherent backup/reconciliation, bounded job retention and an explicit clock/revalidation policy. Strict global revisions invalidate jobs across any tick; no automatic retry is implemented. Simulated milliseconds are not billable real time. An older valid backup can still hide later commits unless the recovery history is reconciled.

Each draft clone gets a new Town identity, so navigation's external WeakMap yield cooldown resets **between transactions as well as after restart**. Stored paths/replay are preserved, but future pathing equivalence to the browser is not established. Also, `applyResult` returns void and tolerates some partial edits: receipts report the audited actual state, not success for every proposal field. These constraints were reported early to the coordinator.

Next bounded local packet: specify adapter-owned ephemeral navigation state and test continued pathing against a long-lived browser-style Town; define stale-job revalidation/replanning and observation retention without duplicate effects; then propose a transactional checkpoint/delta and coherent recovery contract using the measured sizes. No production host, live AI or service purchase is needed for that contract work. Any application-interface change belongs in a separately assigned integration pass.
