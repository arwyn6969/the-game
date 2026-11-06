# Server developer handoff — 6 November 2026

**The web game is hosted; the continuing shared world still needs implementation.** This packet is the current starting point for the incoming server developer. Read [AGENTS.md](../../AGENTS.md), [current status](../CURRENT_STATUS.md) and [roadmap](../ROADMAP.md). The older [new-developer assignment](new-developer.md) is historical: server AI accounting and budget guards already exist.

## Source and ownership

Snapshot supplied by the coordination review at approximately **15:46 UTC, 6 November**; refresh remote state before choosing a base because the release owner is active.

| Layer | Checkpoint |
| --- | --- |
| Main and published baseline | `c49facc52136cfda0270627e3e6aef51f5ab4588`, merged #71. The [5 November publication receipt](../review/live-release-2026-11-05/README.md) records runtime `c49facc52136` at [the game](https://www.arwyn.party/thegame/). A new production audit was not performed for this packet. |
| Combined implementation | [PR #72](https://github.com/arwyn6969/the-game/pull/72), branch `codex/character-learning-release`, observed head `8b89537322b99271e778e82c2a7e70d324715e43`. [Verify 42245485263](https://github.com/arwyn6969/the-game/actions/runs/42245485263) was in progress, not passing evidence, at this snapshot. |
| Independent local qualification | Integration receipt `46816311ade4b025e8d600aa0de2e62e4d8abf91`, qualified code `556d73263819e2f034b2b1679880daeb603e5092`, inherited implementation `be2ab88`. Strong synthetic evidence; it is not qualification of every later PR head. |
| Release owner | **Improve and expand characters**, chat `01a1ac4a-f413-75f2-ad8b-eaeee370409b`, owns PR #72 and its release gates. |
| Server owner | Incoming developer; record accepted name, branch, base/head, scope and next evidence in [current status](../CURRENT_STATUS.md) at kickoff. This document does not dispatch another chat. |

F1 accompaniment, F2 voluntary teaching, resident growth, witnessed learning history, Socrates and Estée are already combined. Preserve the original seven residents' identities and obligations; the candidate adds two zero-balance arrivals, yielding nine residents plus the player. Do not reimplement these packets. Start from freshly verified `origin/main`; if the slice requires unmerged #72, record that explicit dependency and coordinate its write boundary with the owner.

## If the task is deploying the existing app

Follow [Cloudflare hosting](../implementation/cloudflare-hosting.md), using [RELEASE.md](../RELEASE.md) for later receipts rather than its dated quota observations. The current arrangement uses Cloudflare Workers, mounted `/thegame/` assets/PWA, direct Google authentication and Postgres through Hyperdrive. Publishing this app preserves browser-owned simulation; it does not produce a world that runs after browsers close.

Use Node 24 and the committed lockfile in an independent checkout:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:town
npm test
npm run build:cloudflare
```

The Cloudflare build does not run migrations and emits `.output/server/wrangler.json`. The normal `npm run build` invokes migrations when `DATABASE_URL` is present. Use a clean credential-free environment for local validation; do not copy another owner's private configuration. Transfer secrets through the operator's existing secure route, never Git, public artifacts or `VITE_` variables.

Before publication, retain the exact source/build and current passing Verify, resolved review conversations, isolated-preview checks, named-target migration plan, backup and rollback receipt. The candidate's `20261105_character_arrivals.sql` requires explicit qualification against the intended database; disposable PGlite tests are insufficient. Preserve existing auth, binding, route, provider, quota and accounting contracts. Verify entry, login, assets/PWA, save/recovery, and any explicitly bounded real AI check with ledger settlement and reload. Keep failed online drafts recoverable; authored player replies require the explicit Local-only preference.

## If the task is the persistent world

The first deliverable is **one private synthetic A05 activity**, preceded by compatible A03 identity, A04 events/private-knowledge and A09 compute contracts. Read those sections in the [portable planning framework](../planning/resident-development/PLANNING_FRAMEWORK.md). Existing references are [authority design](../../experiments/server-authority/README.md), [real-engine adapter](../../experiments/server-adapter/README.md), [adapter delivery](server-adapter-2026-10-21.md), [independent review](server-adapter-review-2026-10-21.md) and [away-control contract](../implementation/offline-avatar-control.md).

Use one authoritative world, one resident, one object and one reversible activity. Clients submit authorized, revision-checked commands. Commit state, event, eligible knowledge delivery, receipt and durable outbox coherently; inference stays outside short transactions and returns proposals that are revalidated. Preserve export/recovery, identity lineage, balances, debts, earned wages and existing permissions. Imports cannot rewind a live authority or duplicate property.

The experiments already prove bounded local idempotency, real-engine wage settlement, reclaim and crash behavior. They remain trusted in-process prototypes with a local writer. Resolve these gaps:

- Authenticated membership and filtered network views; private Town snapshots cannot become client payloads.
- Transactional storage and writer fencing, coherent checkpoints/restores, and bounded job, observation and receipt retention. Full snapshots already showed substantial growth.
- Navigation state parity: cloning Town each transaction loses its external WeakMap cooldown, even before restart.
- Stale-job handling: strict global revision checks reject results after any intervening tick; define safe revalidation/replanning without duplicate effects or charges.
- Durable scheduling, server restart reconciliation and real service-time accounting; simulated milliseconds are not billable time.

**Settled clock requirement:** server time advances independently of clients. Remove ordinary-player Pause/Resume, speed and skip controls, shortcuts and command paths in server mode. A developer-authorized freeze stops time and all game action, including queued commands and late AI application. Freeze survives disconnect/restart indefinitely until explicit developer unpause; resume from frozen time without catch-up. Activity Stop/reclaim remains available without stopping the world. Preserve browser-local controls until the server mode replaces that authority.

## Record at kickoff

Agree and retain one decision record before choosing infrastructure or promising capacity:

- Owner, exact base/dependencies, files and environment; operator and secure access route for preview/production.
- Game-time/real-time ratio and downtime behavior; the developer-freeze rule above is already decided.
- Existing Cloudflare plus Postgres as the first compatibility target; choose and justify the durable scheduler/coordinator. Hosting alone supplies no continuous tick loop.
- Storage transactions, authority epochs/fencing, retention/compaction and migration strategy.
- Recovery point/time objectives, coherent backup/restore procedure and rollback owner.
- Measured capacity, provider limits, account/global cost caps and operating budget. Historical show budgets and free-model observations are not current server capacity or purchase approval.

Reversible synthetic design can proceed while a material product decision is pending. Record assumptions and unresolved choices explicitly.

## Acceptance and next boundary

Retain reproducible evidence that two network clients converge; authority advances with both closed; duplicate commands return the same outcome; unauthorized/stale results cannot mutate state; reclaim cancels old authority immediately; freeze/unfreeze works across restart; and crash plus coherent restore preserve identity, audiences, money and obligations. Test old-save migration on copies and replacement of a fake inference adapter. Include targeted regressions and the relevant repository checks.

The local integration reports 1,293 script plus 55 typed tests, 597 overlapping town cases, 42 authority/adapter cases and desktop/phone synthetic journeys. These establish covered behavior, not human enjoyment, useful real teaching, physical-device/accessibility acceptance or deployment recovery. Keep [#64](https://github.com/arwyn6969/the-game/issues/64), [#65](https://github.com/arwyn6969/the-game/issues/65) and [#66](https://github.com/arwyn6969/the-game/issues/66) scoped honestly.

After the slice passes, expand deliberately to the qualified town, then prove bounded unpaid away delegation and a factual return journal. Funding requires its separate payment, metering, crypto-paid hosting/inference and recovery gates. End each packet with one reviewable branch/diff, evidence, unresolved limits and the next owner/action. The [readiness verification](../review/server-handoff-2026-11-06/verification.json) records the source/evidence review. This documentation publication performs no migration, live inference, deployment or purchase.
