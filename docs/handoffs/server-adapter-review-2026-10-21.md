# Local server-adapter review — 21 October 2026

**Review outcome: both reproduced blockers are fixed; no remaining concrete blocker found within this isolated adapter's stated scope at `350d0b51dbfe91cb7581963a8af9825e4041380c`.** This review does not accept a production server, real authentication, live inference or exact browser/server pathing equivalence. No application source was changed by this reviewer.

## Resolved blockers

### Missing HEAD must not reinitialize retained state

The first frozen `store.mjs` (`99ec87a986dea55643e6bd8bbcaf9de25879fd72fc7e650f8eb7f14543642737`) treated an absent `HEAD` as a fresh store even when committed hash records remained. An independent synthetic probe committed a wage-like receipt at revision 1, removed `HEAD`, then reopened with a different import initializer: it incorrectly published a replacement revision-0 world and empty receipts. The coordinator sent this reproduced case to C.

C added a fail-closed check for any retained directory entry other than the newly owned writer lock. The frozen corrected store (`0c73196bc5cd5309193a463df1c08d388f0f874e88240ce84d79aeaf60e32539`) independently passed all three rejection cases: retained committed records, orphan hash record and temporary HEAD. Each invoked the initializer **zero times** and preserved the complete retained file/hash inventory. C also added the engine-level committed-wage regression; this reviewer inspected but did not execute C's actively edited tests.

### Every accepted origin ID must produce a completable job

The malformed-input guard in `e82c48ccad743801b32a3a68f450251961d74737` reused the 150-character outer-ID bound for derived `job:` IDs. A frozen probe accepted a 150-character origin request, created its 154-character job ID, then rejected completion even with an explicit short completion request ID. The default helper also produced a 163-character outer ID, exceeding the accepted outer range. That commit was not accepted as the final review target.

The final fix preserves the 150-character outer-ID range, gives derived `job:` IDs a separate 154-character bound with string validation, and makes the default completion request ID deterministic and bounded using a digest. Independent frozen-authority probes passed for both the explicit short ID (14 characters) and default ID (73 characters): the original maximal job applied once, completed durably, and redelivery after reopening returned `DUPLICATE_REQUEST` without changing the committed state. A 151-character origin and malformed kind/job-ID values rejected without throwing or mutating state. These boundary probes use a synthetic stub engine; C's two real-engine regressions cover the equivalent maximal-ID paths in the authored suite.

## Reviewed boundaries

| Boundary | Assessment |
| --- | --- |
| Full Town, receipt and outbox atomicity | Engine mutations occur in a private full-state draft. The outer receipt and pending/completed/rejected outbox state join the same immutable snapshot record; an atomically replaced, fsynced HEAD is the commit point. Views publish only after commit. Uncertain persistence closes the authority to further reads/writes until recovery. |
| Duplicate effects and actual paid work | Outer request ID/fingerprint lookup precedes engine effects, while the engine's quoted action ID stays separate. Clock sequence and observation revisions reject competing/stale operations. Recovery restores committed full state rather than replaying effects. Inspected tests cover a real funded cafe wage, lost final-tick response, duplicate delivery and restart; they assert one settled payable/transaction and conserved funds. |
| Membership/import provenance | Canonical server-world/character IDs and owner/controller state live outside portable Town identity. Only the synthetic owner controls the player; NPC authority stays simulation-owned. A different import cannot overwrite the established store. Rejected imports retain their original string and do not admit a Town. This remains a trusted in-process principal model, not authentication. |
| Slow AI and human reclaim | NPC jobs and avatar proposals have separate principals/scopes. Avatar completion checks the recorded controller/policy/lease and observation revision; reclaim cancels pending avatar jobs in its own commit. Refreshed request fields cannot rewrite the persisted job binding. Any intervening world commit makes an old observation stale, as explicitly required by this packet. |
| Canonical state versus export | Internal records retain full JSON-safe Town state, including paths and replay scrub. `exportTown` is used only for portable output. Import/normalization validation runs on a throwaway copy rather than replacing the canonical Town every transaction. Portable output does not carry server membership or control. |

## Independent evidence and limits

Review artifacts are retained in this checkout's ignored `artifacts/server-adapter-review/`: initial/implementation/post-fix/final source snapshots and hashes, the original missing-HEAD and ID-boundary reproductions, atomic probes, and corrected-store/authority probe results. No C file was edited. No network, provider call, external database, broad suite or framework change was made. No service or child process remains running from this review. Synthetic journals and raw probe records remain uncommitted.

Three independent frozen-store crash probes passed both before and after the fix: failures after record fsync or before HEAD rename recover the entire previous envelope; a failure after durable HEAD sync recovers the entire next Town/receipt/outbox envelope. An uncertain store rejects reads until reopening. These probes use synthetic complete envelopes and establish store mechanics, not real-engine wage acceptance.

C's final committed handoff reports **42 passing tests: 26 adapter and 16 prior-spike checks**, targeted ESLint, formatting and staged whitespace checks, with zero attempted network calls. This is owner evidence, not a suite rerun by this reviewer. The implementation and authored regressions were read, including quoted work, import history, stale/duplicate jobs, reclaim, corruption and both maximal-ID completion modes. The earlier pinned-candidate browser receipt covers the browser application; it does not establish adapter parity.

The following two commands passed against frozen copies of the final committed source, from `/Users/arwynhughes/Documents/ChatGPT/THE GAME/player-acceptance`:

```sh
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node artifacts/server-adapter-review/final-store-probe.mjs
/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node artifacts/server-adapter-review/final-id-probe.mjs
```

The first passed three missing-HEAD preservation cases and three crash windows. The second passed explicit/default maximal-ID completions, restart deduplication and malformed-input rejection, with fetch/TCP/listen deny hooks recording zero attempts. Exact outputs are `artifacts/server-adapter-review/final-store-probe-results.json` and `artifacts/server-adapter-review/final-id-probe-results.json`. Earlier failure evidence remains in `missing-head-result.json` and `id-boundary-result.json` under the same artifact directory.

The adapter is deliberately a single local writer with full snapshots, retained history and manual stale-lock/corrupt-store recovery. Trusted unfiltered in-process views are not private network projections. The full-Town clone made on **every transaction** loses navigation's external Town-keyed WeakMap cooldown, even without a process restart. Exact browser pathing parity therefore remains a next-packet gate. Production writer fencing, distributed recovery, authenticated membership, real inference and P2/OA1 acceptance remain outside this review.

## Final source verification

Reviewed checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/server-foundation`, branch `codex/server-adapter-20261021`.

- Final adapter commit: `350d0b51dbfe91cb7581963a8af9825e4041380c`.
- Final adapter tree: `0550d8dc328164218296a9c4be17de69f2a6eab0`.
- Engine source: `0bd3e3b1401ebf6b460d9d71f287c4b474b2452b`, tree `0b68cf176037b436c07a6225a2fdeebb58f0eea1`.
- Frozen final capture: `2026-10-21T11:10:48.185Z`, `artifacts/server-adapter-review/final/snapshot.json`.
- Checkout was clean, HEAD did not change during capture, and all seven files matched a second read. `git diff --stat 0bd3e3b1401ebf6b460d9d71f287c4b474b2452b -- src package.json package-lock.json` was empty.

| Reviewed file | SHA-256 of final bytes |
| --- | --- |
| `experiments/server-adapter/store.mjs` | `0c73196bc5cd5309193a463df1c08d388f0f874e88240ce84d79aeaf60e32539` |
| `experiments/server-adapter/engine.mjs` | `b0b2b303cb8d684df329b57928c5956a0e072999dfc31218b9589e643b8a624b` |
| `experiments/server-adapter/authority.mjs` | `a1d9e571b6ea1890fcf416b495f94101fe310e49b0437d2fcb9bcf0bffe21665` |
| `experiments/server-adapter/adapter.test.mjs` | `362c246ba5e46a54d594a9b0768f1554232f22f9a4bf4c43ef75cf0ca0154e2e` |
| `experiments/server-adapter/README.md` | `818d9cfacaa3e0dbd3d6e35de6efc808cce9c75db9e915c3aaf85b53b9387817` |
| `docs/handoffs/server-adapter-2026-10-21.md` | `45c63699e0cdcb54058a7b4b29e9290fa6a90c1446749d74153b3ba8e639147f` |
| `experiments/server-authority/ADAPTER_PACKET.md` | `a150e1ec30e2da00b8d84b0c24f58038604052c3cd4d9edd148bd5c981d085c1` |

Final post-probe source verification is retained in `artifacts/server-adapter-review/final-source-verification.json`. The next action is the separately assigned navigation-state parity and stale-job revalidation packet described by C. Five humans, physical-device/assistive-technology acceptance, live planning/reflection and production gates remain unrun by this review.
