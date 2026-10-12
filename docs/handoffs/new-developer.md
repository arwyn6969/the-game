# Technical contributor handoff

Welcome to THE GAME and The Freeman Show. The consolidation candidate is a browser-based pixel town with seven residents and the player. The Freeman Show is the openly documented story of building and living in that world. The next product proof is a meaningful contribution that is remembered tomorrow; the next operational need is knowing what the AI actually costs.

**Your recommended first contribution: one draft PR adding server-side AI usage accounting and a testable budget guard interface.** Start with mocked responses. You need Node 24 and Git, but no API key, paid service, GPU or Spark.

## Start here

- Code: [arwyn6969/the-game](https://github.com/arwyn6969/the-game). The uppercase `THE_GAME` repository is an older Python simulator.
- Live reference: [thegame.grok.me](https://thegame.grok.me/). [The release record](../RELEASE.md) identifies the published graphics source and verification limits. The consolidation candidate has not been published; use Git for development.
- Read [AGENTS.md](../../AGENTS.md), then this task. [COLLABORATION.md](../COLLABORATION.md) describes the existing ownership lanes; its initial setup branches and prompts are historical.
- Current source and cleanup: [consolidation record](../CONSOLIDATION.md). Product direction: [roadmap](../ROADMAP.md).

The first pilot month has a **£100 total cloud/content ceiling**, including applicable fees and tax. That is not £100 just for AI. The working AI allocation is £40; the account bill must be checked before configuration. This task spends nothing and does not by itself activate a financial cap.

Before substantial work, agree credit, any payment and delivery expectations with Arwyn. Before editing the gateway, tell Arwyn you are taking the task below, list your branch/base SHA and intended files, and check that nobody else has claimed the same file. You can begin setup and standalone mocked tests immediately.

## Current source snapshot

Updated 12 October 2026 after branch consolidation:

| Work                                                    | State                           | What it means for you                                                                            |
| ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `main` at `8d15a722b61c09a7dca198ccf49ea8dd0b3f8125`    | PR #19 consolidation merged     | Seven residents, conversation fixes, provider routing, Kevin interests and current planning/docs |
| `codex/product-consolidation`                           | Retained source checkpoint      | Main merge and 17-branch retirement are complete; hosted publication remains separate            |
| PRs #5, #6, #9, #13 and #14                             | Incorporated into the candidate | Historical source PRs; do not repeat their work                                                  |
| [PR #16](https://github.com/arwyn6969/the-game/pull/16) | Separate inactive S1 foundation | Needs v2/eight-actor account reconciliation and full S2/UI activation                            |

Start from current `origin/main`. Do not independently recreate the completed integration. Record the actual base SHA. The gateway now delegates legacy transport to `mind.gateway.ts`; opt-in pool routing uses `mind-pool/server.ts` and `router.ts`.

## Set up your own checkout

Use Node 24 and the committed npm lockfile. These shell examples are for macOS/Linux or WSL. With nvm already installed:

```sh
git clone https://github.com/arwyn6969/the-game.git the-game-contributor
cd the-game-contributor
git fetch origin
git switch -c codex/ai-usage-metering origin/main
git rev-parse HEAD
nvm install
nvm use
node --version
npm ci
npm run test:town
```

Confirm that `node --version` prints v24. If you use a different Node manager, select version 24 there instead. Do not install or run from another contributor's working directory.

For the local game in a clean checkout:

```sh
env -u DATABASE_URL -u XAI_API_KEY npm run dev
```

Open `http://localhost:8080`. Missing AI credentials should give offline dialogue. Keep the development port contract; do not kill another person's process if 8080 is already occupied.

Do not copy production `.env`, `.grok`, keys or database credentials into the checkout. `.grok/app-env.json` carries only browser build flags; it is not a server-secret loader. Preserve authentication. If startup fails, report the command, Node version and redacted error; the headless town tests can still help isolate an application-startup problem.

## How the game is wired

| Area                      | Relevant path                                          | Current behaviour                                                                                    |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Browser and orchestration | `src/components/town/TownApp.tsx`                      | Owns the town, clock, input and pending AI work                                                      |
| Rules and saves           | `src/game/`                                            | Validates consequences and saves to browser localStorage                                             |
| Pixel rendering           | `src/game/render.ts`                                   | Canvas rendering; no cloud GPU requirement                                                           |
| AI gateway                | `src/lib/mind.functions.ts`, `src/lib/mind.gateway.ts` | Legacy Grok validation/transport; opt-in pool delegation                                             |
| Provider pool             | `src/lib/mind-pool/`                                   | Per-attempt request/token quota reservations, fallback and diagnostic usage; no durable monetary cap |
| Database abstraction      | `src/lib/db.ts`                                        | PostgreSQL option; local PGLite fallback is in-memory                                                |
| Build                     | `vite.config.ts`, `scripts/`                           | TanStack Start/Nitro; Vercel preset and migration-aware build                                        |

The town is not yet an always-running shared server world. The in-memory limiter and PGLite fallback are not durable monthly budget enforcement.

## First PR scope

**Outcome:** an operator or a later durable ledger can account for every actual provider attempt, and a test can deny an attempt before money could be spent.

The legacy gateway does not account for provider cost. Its process-local limiter can admit one logical request that makes two upstream attempts. The pool already records request/token reservations and per-attempt outcomes, then returns summary diagnostics; that is not a monetary budget ledger. Reuse those interfaces and account for every actual attempt, including legacy retries and unknown billing, without duplicating pool requests.

Proposed contributor ownership for this task:

- `src/lib/mind.functions.ts`, `src/lib/mind.gateway.ts` and narrowly justified `src/lib/mind-pool/` adapters: gateway integration on the agreed baseline.
- New server-only helper modules alongside it, with injectable transport, accounting sink and pre-attempt guard.
- New focused tests in `scripts/*.test.mjs`, following the repository's existing test patterns; `npm test` discovers that directory.
- `docs/handoffs/ai-usage-metering.md`: results and remaining work.

This is a proposed subdivision of the backend/Sol lane, not permission to take over the rest of that lane. Leave `TownApp.tsx`, `src/game/**`, styles, save schema, auth, hosting configuration, dependencies and model selection unchanged. Describe any necessary out-of-scope integration in your handoff.

Persisting a ledger and implementing distributed, atomic monetary reservations belong in a follow-up PR. A server-only structured sink is sufficient here if its limits are documented. Do not label it a working £100 cap.

## Acceptance checklist

- [ ] Each physical attempt has one final accounting event, linked to a logical request ID and attempt number. Retrying creates a second attempt, not a duplicate record of the first.
- [ ] Include timestamp, elapsed time, request kind, requested/returned model where available, HTTP/outcome status and provider usage. Distinguish a valid zero cost from missing, malformed or unknown billing.
- [ ] Preserve integer billing precision. xAI documents `usage.cost_in_usd_ticks`, with 10 billion ticks per USD. Validate values rather than trusting arbitrary JSON. [Provider cost-field documentation](https://docs.x.ai/developers/cost-tracking)
- [ ] Never include API keys, authorization headers, raw prompts, dialogue, resident secrets or player save data in accounting events.
- [ ] The guard runs before every upstream attempt, including retries. A denied request performs zero fetches; denial before retry prevents that retry.
- [ ] Preserve current `thinkTown` inputs and success/error response compatibility, offline behaviour and `mindAvailability().online`. Do not change the model or retry policy as unrelated cleanup.
- [ ] An accounting-sink failure cannot trigger a second paid request or silently present a successful call as a zero-cost call. Document failure handling.
- [ ] Mocked tests cover success, retry, 401/403/429 without retry, missing/malformed usage, empty/invalid response, timeout, guard denial and sink failure. They make no real provider calls.
- [ ] The handoff states that missing usage can mean unknown cost and that durable shared enforcement is still outstanding.

Prefer no new dependencies. Keep details flexible enough to fit the existing architecture; the behaviour above is the contract.

## Validate and deliver

Run baseline checks before editing and record failures. `docs/BASELINE.md` describes older failures; do not accept a current regression simply because an old document mentions a failed suite.

```sh
npm run typecheck
npm run lint
npm run test:town
npm test
env -u DATABASE_URL -u XAI_API_KEY npm run build
```

The build command also runs migrations when `DATABASE_URL` is set. Run it only in a clean development environment without production credentials or env files. Report the inherited lint warning separately. For this server-only task, test the gateway and confirm offline play still starts; if you change UI scope later, the repository requires desktop/phone interaction checks.

Open a **draft PR targeting main**. If you have repository write access, push your own feature branch. Otherwise push to your fork and open a cross-repository PR; Arwyn does not need to grant production access. Do not force-push someone else's branch, merge, deploy, buy services or change production secrets.

Include in the PR and your handoff:

1. Base SHA, head SHA and touched files.
2. One concrete before/after example, such as a retry producing two accounted attempts.
3. Check results and any inherited failure, with redacted evidence.
4. Exact event/guard interface and one synthetic accounting example.
5. Known gaps: storage durability, unknown billing and no aggregate financial cap yet.
6. The next bounded step and any files another contributor must wire.

Arwyn owns product and budget decisions; the existing maintainer reviews and integrates code. No automatic reviewer or message has been assigned by this document. “Done” for your first contribution means a reviewable, tested draft PR—not a production deployment.

## Message to start the contribution

> I’m taking the AI usage-metering task. I’ll use my own checkout from origin/main, report its SHA, and scope changes to the gateway, new server helpers, focused tests and my handoff. My first milestone is mocked accounting and guard tests with no API key or paid calls. Please flag any overlapping gateway work before I edit that file.
