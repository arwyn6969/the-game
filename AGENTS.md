# THE GAME — project instructions

THE GAME is a persistent, open-ended pixel town with seven residents and the player. Preserve its cast, tone, existing towns, and the premise that the player is a resident. The consolidated main combines released art, coherent conversation, Data and Amelia, opt-in provider routing and version-2 saves with version-1 import. Start with `docs/CURRENT_STATUS.md` for current source, deployment evidence and named ownership, and `docs/ROADMAP.md` for milestones.

## Start and scope

- Use Node 24 and the committed npm lockfile. Setup: `npm ci`. Development: `npm run dev` (the Grok preview contract is port 8080).
- Read `docs/CURRENT_STATUS.md` for the current baseline and active work, `docs/BRANCHES.md` for branch lifecycle, and `docs/COLLABORATION.md` for coordination. `docs/CONSOLIDATION.md` and `docs/BASELINE.md` are historical receipts. Read the relevant files, rather than every document on every edit.
- Keep work in your own checkout and feature branch. Preserve user changes. Do not reset or force-push someone else's work.
- Start each bounded task from current `origin/main`; record its owner, branch/PR, base/head and next acceptance evidence in `docs/CURRENT_STATUS.md`. Update that record when ownership, integration or deployment changes. Use stacked branches only for an explicit dependency; retire completed refs after preservation and dependency checks. Do not introduce a permanent `develop` branch.
- Implement and test the assigned milestone; make routine, reversible decisions without repeated approval requests. Leave a reviewable diff and an honest account of what ran.

## Default ownership boundaries

Current named assignments in `docs/CURRENT_STATUS.md` override the historical Sol/Grok role labels below. These defaults do not dispatch or wake a chat. Agree on write boundaries before parallel editing, and keep the historical delivery board as evidence rather than a live assignment list.

- **Sol:** simulation, memory, saves, transactions, offline behaviour, mind gateway, build tooling, dependencies, regression tests, and integration. Own `src/game/**` except `render.ts`; `src/lib/mind.functions.ts`; `scripts/**`; root tooling/configuration and CI. Existing platform/auth code changes must be narrowly justified by a reproduced problem.
- **Grok:** player experience and art direction. Own `src/components/town/**`, `src/styles.css`, `src/game/render.ts`, new `public/game/**` assets, and `docs/design/**`.
- Read any file needed. Do not edit the other lane's files in parallel. Describe a required change in your handoff, including its proposed interface and acceptance case, and continue independent work.
- Freeze the current `Town` save schema and existing exported game function signatures during independent work. Prefer additive, backward-compatible helpers. Integration changes are a separate, explicit pass after both lane diffs are stable.
- Each named owner maintains a uniquely named handoff under `docs/handoffs/`; the earlier Sol/Grok handoffs retain their historical scope. A handoff file is a record; it does not automatically message or wake another agent.

## Product and correctness constraints

- Preserve version-1 save loading, names, memories, debts, notices, and identity. Never silently discard a town or clear storage to hide an error.
- Simulation rules decide money, debt ownership, time, and valid actions. Model output is a proposal and requires validation before applying effects.
- Keep NPC secrets and technical retrieval diagnostics out of the default player interface. Player knowledge must come from witnessed events or conversations. Developer inspection may be opt-in.
- Preserve accessible keyboard and touch movement, pause/speed controls, import/export, and useful offline play.
- Preserve existing AI provider and hosting contracts unless the user's assigned task explicitly changes them. Hosting/auth migration belongs exclusively to its named owner in `docs/CURRENT_STATUS.md`; builder choice alone does not authorize a runtime-model or hosting change.
- Preserve the auth, PWA and preview bridge contracts. Do not disable authentication or weaken safeguards to make tests pass. Never commit `.env`, `.grok` credentials, tokens, player save files, or private platform data.

## Validation and delivery

- Run checks relevant to the change: `npm run typecheck`, `npm run lint`, `npm run test:town`, `npm test`. Run `npm run diagnose:town` for the previous review's scenarios; it prints observations, not a release verdict.
- Record current check results and distinguish inherited failures. Do not suppress assertions or use historical failures in `docs/BASELINE.md` to excuse a new regression.
- `npm run build` also invokes database migrations. For a local build, run with `DATABASE_URL` unset and without production credentials. Do not run migrations against a live database as part of validation.
- UI work needs actual browser checks at 1280×800 and 390×844, including conversation entry, movement, pause, reload, and import/export. Capture screenshots and report untested interactions.
- Feature branches and draft PRs are the handoff. Main requires a PR, a passing current `verify` check and resolved review conversations; force pushes and deletion are blocked, including for admins. Merged head branches are deleted automatically. Merge, hosted publication, hosting changes, spending and production-secret changes require authorization in the user's task; these generic implementation instructions alone do not grant it.
