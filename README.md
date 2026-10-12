# THE GAME

A pixel town. Five people already have days. You are the sixth, not the narrator. There is no ending.

This is the current web game: `arwyn6969/the-game`. The separate `arwyn6969/THE_GAME` repository is an older Python simulator. New game development belongs here. Publishing the website at https://thegame.grok.me is separate from updating GitHub.

## Play

Name yourself. The clock starts paused on the row.

1. Press 1× and walk to Hobbs Cafe.
2. Click Kevin.
3. Ask him who he is.

The question can travel onto the board and into other people's memories. Ask Baba for bread and he writes a tab of 2. Ask what you owe, then pay it when you have the money. Wages require an agreed shift and real attendance; visiting a counter does not earn a wage.

The town saves in this browser. A failed save shows a warning and offers a downloadable backup. Download and import keep the debts, notes, and selves, including older version-1 towns. Portable files omit disposable replay frames and use an 8 MiB import limit.

The current development version has seven residents: Kevin, Arwyn, Northern, Baba, Sub, Data and Amelia, plus the player. Data brings a testing and technology perspective; Amelia brings economics and fair terms. Recent conversation turns persist, and characters receive dated memories with a distinction between spoken claims and recorded events. Local replies provide authored perspectives and follow-ups when the AI service is unavailable.

Version-1 towns migrate to version 2 with their original residents and history retained, then add Data and Amelia once. The original browser save remains under its old storage key; new saves use a separate key. Keep a downloaded backup before trying a development version. Older game versions cannot read version-2 exports. See [the seven-resident handoff](docs/handoffs/seven-resident-coherence.md) for checks and limits.

## What is in this repo

An opt-in [AI provider pool](docs/AI_PROVIDER_POOL.md) routes each game job to its preferred available model, enforces shared quotas, and falls back automatically. Start with `npm run ai:pool -- init`; the guide covers private setup, provider keys and model preferences.

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

The [Kevin World notes](docs/KEVIN_WORLD.md) preserve Arwyn's original vision and explain Kevin's technology memory preference. The current town keeps its five residents; the larger cast is future work.

`npm run test:town` runs the town, save, economy, retrieval, conversation and collision regressions without a running Vite app. The day-two check verifies that the question travels, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.

## New contributors

Start with the [technical contributor handoff](docs/handoffs/new-developer.md): current source status, Node 24 setup, a bounded AI usage-metering task, file ownership and the draft-PR checklist. It distinguishes the Freeman Show pilot from the later shared-world service.

## Development and two-agent setup

Use Node 24 (`.nvmrc`), then `npm ci` and `npm run dev`. The development server uses port 8080. AI dialogue requires a server-side `XAI_API_KEY`; without it the town uses offline dialogue. Do not put the key in browser code or a `VITE_` variable.

Start with [the collaboration workflow](docs/COLLABORATION.md). The two ready-to-paste prompts are [GPT-6.1 Sol](docs/prompts/SOL-6.1.md) and [Grok Build](docs/prompts/GROK.md). Shared rules live in [AGENTS.md](AGENTS.md), and current validation results and known gaps are in [the baseline](docs/BASELINE.md).

Run `npm run test:town` for game regressions and `npm run diagnose:town` for longer review scenarios. Diagnostics report observations; the regression tests assert the required behavior. The integrated release and publishing handoff are recorded in [docs/RELEASE.md](docs/RELEASE.md).

`npm run build` also runs database migrations when `DATABASE_URL` is configured. Local validation should use no live database credentials. The full suite now passes; lint retains one existing unused-disable warning. The baseline records the historical starting failures.
