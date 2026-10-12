# THE GAME

A pixel town. Five people already have days. You are the sixth, not the narrator. There is no ending.

This is the current web game: `arwyn6969/the-game`. The separate `arwyn6969/THE_GAME` repository is an older Python simulator. New game development belongs here. Publishing the website at https://thegame.grok.me is separate from updating GitHub.

## Play

Name yourself. The clock starts paused in the plaza.

1. Press 1× and walk to Hobbs Cafe.
2. Click Kevin.
3. Ask him who he is.

The question can travel onto the board and into other people's memories. Beside Baba, open **Choices** to accept a loaf and a tab of 2, eat the loaf, or pay what you owe. Eating does not pay the tab and currently gives no health or energy benefit. Beside Kevin, **Choices** offers a cafe shift from 16:00 to 19:00: full attendance earns 5 if the till can pay. Read the terms before choosing; conversation alone cannot buy, pay or accept work.

The town saves in this browser. A failed save shows a warning and offers a downloadable backup. Download and import keep the debts, notes, and selves, including older version-1 towns. Portable files omit disposable replay frames and use an 8 MiB import limit.

## What is in this repo

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

Start the next build with the [current roadmap](docs/ROADMAP.md), [first-week strategy](docs/design/consequential-first-week.md), [implementation packets](docs/implementation/community-project.md), and [Sol 6.1 brief](docs/prompts/SOL-6.1.md). The next milestone is one fairly funded library project whose result matters tomorrow. Bread sharing, account saves and additional specialists remain planned. The [completed Astra review](docs/reviews/2026-10-11-astra-direction.md) is historical context; current publication and limits are in the [release record](docs/RELEASE.md).

`npm run test:town` runs the town, save, economy, retrieval, conversation and collision regressions without a running Vite app. The day-two check verifies that the question travels, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.

## Development and two-agent setup

Use Node 24 (`.nvmrc`), then `npm ci` and `npm run dev`. The development server uses port 8080. AI dialogue requires a server-side `XAI_API_KEY`; without it the town uses offline dialogue. Do not put the key in browser code or a `VITE_` variable.

Start with [the collaboration workflow](docs/COLLABORATION.md). The current implementation assignment is [Sol 6.1](docs/prompts/SOL-6.1.md); the [Grok Build brief](docs/prompts/GROK.md) records the original UI lane. Shared rules live in [AGENTS.md](AGENTS.md). Current validation and limits are in the [release record](docs/RELEASE.md); [the baseline](docs/BASELINE.md) preserves the historical starting failures.

Run `npm run test:town` for game regressions and `npm run diagnose:town` for longer review scenarios. Diagnostics report observations; the regression tests assert the required behavior. The integrated release and publishing handoff are recorded in [docs/RELEASE.md](docs/RELEASE.md).

`npm run build` also runs database migrations when `DATABASE_URL` is configured. Local validation should use no live database credentials. The full suite now passes; lint retains one existing unused-disable warning. The baseline records the historical starting failures.
