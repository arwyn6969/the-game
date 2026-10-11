# THE GAME — project instructions

THE GAME is a persistent, open-ended pixel town with five residents and the player. Preserve its cast, tone, existing towns, and the premise that the player is a resident. The next milestone is a reliable, enjoyable first day with consequences that persist into tomorrow.

## Start and scope

- Use Node 24 and the committed npm lockfile. Setup: `npm ci`. Development: `npm run dev` (the Grok preview contract is port 8080).
- Read `docs/COLLABORATION.md` for your lane and `docs/BASELINE.md` for verified starting conditions. Read the relevant files, rather than every document on every edit.
- Keep work in your own checkout and feature branch. Preserve user changes. Do not reset or force-push someone else's work.
- Implement and test the assigned milestone; make routine, reversible decisions without repeated approval requests. Leave a reviewable diff and an honest account of what ran.

## Two-agent ownership for this milestone

- **Sol:** simulation, memory, saves, transactions, offline behaviour, mind gateway, build tooling, dependencies, regression tests, and integration. Own `src/game/**` except `render.ts`; `src/lib/mind.functions.ts`; `scripts/**`; root tooling/configuration and CI. Existing platform/auth code changes must be narrowly justified by a reproduced problem.
- **Grok:** player experience and art direction. Own `src/components/town/**`, `src/styles.css`, `src/game/render.ts`, new `public/game/**` assets, and `docs/design/**`.
- Read any file needed. Do not edit the other lane's files in parallel. Describe a required change in your handoff, including its proposed interface and acceptance case, and continue independent work.
- Freeze the current `Town` save schema and existing exported game function signatures during independent work. Prefer additive, backward-compatible helpers. Integration changes are a separate, explicit pass after both lane diffs are stable.
- Each agent owns its own handoff: `docs/handoffs/sol.md` or `docs/handoffs/grok.md`. A handoff file is a record; it does not automatically message or wake the other agent.

## Product and correctness constraints

- Preserve version-1 save loading, names, memories, debts, notices, and identity. Never silently discard a town or clear storage to hide an error.
- Simulation rules decide money, debt ownership, time, and valid actions. Model output is a proposal and requires validation before applying effects.
- Keep NPC secrets and technical retrieval diagnostics out of the default player interface. Player knowledge must come from witnessed events or conversations. Developer inspection may be opt-in.
- Preserve accessible keyboard and touch movement, pause/speed controls, import/export, and useful offline play.
- Keep the existing AI provider and hosting during this milestone. Builder choice does not imply changing the game's runtime model.
- Preserve the auth, PWA and preview bridge contracts. Do not disable authentication or weaken safeguards to make tests pass. Never commit `.env`, `.grok` credentials, tokens, player save files, or private platform data.

## Validation and delivery

- Run checks relevant to the change: `npm run typecheck`, `npm run lint`, `npm run test:town`, `npm test`. Run `npm run diagnose:town` for the previous review's scenarios; it prints observations, not a release verdict.
- The full test and lint baseline currently has failures listed in `docs/BASELINE.md`. Reproduce and distinguish inherited failures; do not suppress assertions or claim the entire suite passed.
- `npm run build` also invokes database migrations. For a local build, run with `DATABASE_URL` unset and without production credentials. Do not run migrations against a live database as part of validation.
- UI work needs actual browser checks at 1280×800 and 390×844, including conversation entry, movement, pause, reload, and import/export. Capture screenshots and report untested interactions.
- Feature branches and draft PRs are the handoff. Do not merge to `main`, publish the Grok app, switch hosting, spend on services, or change production secrets as part of these implementation prompts.
