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

## What is in this repo

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

`npm run test:town` runs the town, save, economy, retrieval, conversation and collision regressions without a running Vite app. The day-two check verifies that the question travels, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.

## Development and two-agent setup

Use Node 24 (`.nvmrc`), then `npm ci` and `npm run dev`. The development server uses port 8080. AI dialogue requires a server-side `XAI_API_KEY`; without it the town uses offline dialogue. Do not put the key in browser code or a `VITE_` variable.

Start with [the collaboration workflow](docs/COLLABORATION.md). The two ready-to-paste prompts are [GPT-6.1 Sol](docs/prompts/SOL-6.1.md) and [Grok Build](docs/prompts/GROK.md). Shared rules live in [AGENTS.md](AGENTS.md), and current validation results and known gaps are in [the baseline](docs/BASELINE.md).

Run `npm run test:town` for game regressions and `npm run diagnose:town` for longer review scenarios. Diagnostics report observations; the regression tests assert the required behavior. The integrated release and publishing handoff are recorded in [docs/RELEASE.md](docs/RELEASE.md).

`npm run build` also runs database migrations when `DATABASE_URL` is configured. Local validation should use no live database credentials. The full suite now passes; lint retains one existing unused-disable warning. The baseline records the historical starting failures.
