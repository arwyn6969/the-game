# THE GAME

A pixel town. Seven people already have days. You are their new neighbour. There is no ending.

This is the current web game: `arwyn6969/the-game`. The separate `arwyn6969/THE_GAME` repository is an older Python simulator. New game development belongs here. Publishing the website at https://thegame.grok.me is separate from updating GitHub.

Main combines the released town graphics, seven-resident conversation work, provider routing, Kevin's memory preference and product documentation, merged in [PR #19](https://github.com/arwyn6969/the-game/pull/19). Start with [the consolidation record](docs/CONSOLIDATION.md) for source provenance, validation and branch cleanup. [The release record](docs/RELEASE.md) describes the previously published five-resident build.

## Play

Name yourself. The clock starts paused on the row.

1. Press 1× and walk to Hobbs Cafe.
2. Click Kevin.
3. Ask him who he is.

The question can travel onto the board and into other people's memories. Baba's **Choices** let you explicitly accept a loaf and a tab of 2, eat it, and repay the debt separately. Kevin's **Choices** let you read and accept a shift. Wages require an agreed shift and real attendance; visiting a counter does not earn a wage.

The town saves in this browser. A failed save shows a warning and offers a downloadable backup. Download and import keep the debts, notes, and selves, including older version-1 towns. Portable files omit disposable replay frames and use an 8 MiB import limit.

The current development version has seven residents: Kevin, Arwyn, Northern, Baba, Sub, Data and Amelia, plus the player. Data brings a testing and technology perspective; Amelia brings economics and fair terms. Recent conversation turns persist, and characters receive dated memories with a distinction between spoken claims and recorded events. Local replies provide authored perspectives and follow-ups when the AI service is unavailable.

Version-1 towns migrate to version 2 with their original residents and history retained, then add Data and Amelia once. The original browser save remains under its old storage key; new saves use a separate key. Keep a downloaded backup before trying a development version. Older game versions cannot read version-2 exports. See [the seven-resident handoff](docs/handoffs/seven-resident-coherence.md) for checks and limits.

## What is in this repo

The character UI development build adds portrait cards with Overview, Strengths, Together and Progress tabs. Open **Town life** for readable NPC exchanges, recorded relationship changes and updated plans. **Watch town conversations** follows non-secret public dialogue without adding player knowledge; dated reflections are an optional separate view. Character drafts, pinning and camera following work for every resident. See [the character UI design and browser checks](docs/design/character-social-ui.md).

An opt-in [AI provider pool](docs/AI_PROVIDER_POOL.md) routes each game job to its preferred available model, reserves configured quotas, and falls back to offline play. Local quota records reset on restart; recognized deployments require shared Postgres. Start with `npm run ai:pool -- init`; the guide covers private setup, provider keys and model preferences. Every provider starts disabled. Ordinary development uses the existing Grok path when a server key is configured.

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

The [Kevin World notes](docs/KEVIN_WORLD.md) preserve Arwyn's original vision and explain Kevin's technology memory preference. [The roadmap](docs/ROADMAP.md) defines the next useful, funded library contribution. The separate S1 economy foundation in PR #16 is inactive and remains outside this candidate pending version-2 save reconciliation and complete activation with its UI. Experimental saves containing that ledger require their original branch; this runtime retains them for recovery.

`npm run test:town` runs the town, save, economy, retrieval, conversation and collision regressions without a running Vite app. The day-two check verifies that the question travels, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.

## New contributors

Start with the [technical contributor handoff](docs/handoffs/new-developer.md): current source status, Node 24 setup, a bounded AI usage-metering task, file ownership and the draft-PR checklist. It distinguishes the Freeman Show pilot from the later shared-world service.

## Development and two-agent setup

Use Node 24 (`.nvmrc`), then `npm ci` and `npm run dev`. The development server uses port 8080. AI dialogue requires a server-side `XAI_API_KEY`; without it the town uses offline dialogue. Do not put the key in browser code or a `VITE_` variable.

Start new work from current `origin/main`. The consolidation checkpoint remains available in `codex/product-consolidation`. Read [AGENTS.md](AGENTS.md), [the consolidation record](docs/CONSOLIDATION.md), and [the collaboration workflow](docs/COLLABORATION.md). Older prompts and [the baseline](docs/BASELINE.md) are historical; they are not instructions to restart a completed branch.

Run `npm run test:town` for game regressions and `npm run diagnose:town` for longer review scenarios. Diagnostics report observations; the regression tests assert the required behavior. The integrated release and publishing handoff are recorded in [docs/RELEASE.md](docs/RELEASE.md).

`npm run build` also runs database migrations when `DATABASE_URL` is configured. Local validation should use no live database credentials. The full suite now passes; lint retains one existing unused-disable warning. The baseline records the historical starting failures.
