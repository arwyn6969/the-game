# THE GAME

A pixel town. Five people already have days. You are the sixth, not the narrator. There is no ending.

## Play

Name yourself. The clock starts paused on the row.

1. Press 1× and walk to Hobbs Cafe.
2. Click Kevin.
3. Ask him who he is.

The question can travel onto the board and into other people's memories. Ask Baba for bread and she writes a tab of 2. Stand a shift at Hobbs or the grocery and the till pays you, or tells you it is empty.

The town saves in this browser. Download and import keep the debts, notes, and selves.

## What is in this repo

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

`node scripts/town-day.test.mjs` needs the Vite app beside it. It checks that after two days the question has traveled, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.

## Development and two-agent setup

Use Node 24 (`.nvmrc`), then `npm ci` and `npm run dev`. The development server uses port 8080. AI dialogue requires a server-side `XAI_API_KEY`; without it the town uses offline dialogue. Do not put the key in browser code or a `VITE_` variable.

Start with [the collaboration workflow](docs/COLLABORATION.md). The two ready-to-paste prompts are [GPT-6.1 Sol](docs/prompts/SOL-6.1.md) and [Grok Build](docs/prompts/GROK.md). Shared rules live in [AGENTS.md](AGENTS.md), and current validation results and known gaps are in [the baseline](docs/BASELINE.md).

Run `npm run test:town` for the existing game check and `npm run diagnose:town` for the longer review scenarios. Diagnostics report observations; a successful command does not mean those known bugs have been fixed.

`npm run build` also runs database migrations when `DATABASE_URL` is configured. Local validation should use no live database credentials. Full-suite and lint failures inherited from the exported project are recorded in the baseline rather than hidden.
