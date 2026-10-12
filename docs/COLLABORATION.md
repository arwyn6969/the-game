# Working with Sol and Grok

Prepared 11 October 2026 for `arwyn6969/the-game`. Live reference: https://thegame.grok.me.

The seven-resident integration is a later, explicitly authorized milestone. Its current schema is version 2, with version-1 loading preserved. See [the seven-resident handoff](handoffs/seven-resident-coherence.md). The lane setup and first-day scope below record the earlier milestone.

The first completed lane diffs have now been reviewed and combined in `codex/first-day-integration`. See [the release record](RELEASE.md) for current checks and publication status. The setup and lane prompts below describe the initial division of work; start future iterations from the reviewed integrated `main` once its release PR has merged.

## Goal

Deliver a polished first day in the existing town. A player should find Hobbs, talk naturally to Kevin without seeing his secrets, make a meaningful choice, and see a trustworthy consequence. Keep the endless-town premise and current cast. World expansion, multiplayer, a new AI provider, and hosting migration are later decisions.

## Start the two lanes

1. Read the setup PR on branch `codex/agent-collaboration-setup`. It adds project guidance, prompts, diagnostics, a Node version, and a lockfile repair; it does not repair game mechanics or redeploy the game.
2. If that setup has been merged, branch from current `origin/main`. Otherwise branch from `origin/codex/agent-collaboration-setup` and explicitly use that branch as the implementation PR's base. This avoids mixing the setup diff into each review. Retarget implementation PRs to `main` after setup is merged.
3. Give `docs/prompts/SOL-6.1.md` to a GPT-6.1 Sol chat with repository access. Select GPT-6.1 Sol and Extra high (`xhigh`) in the model controls; text in a prompt cannot select a model or reasoning setting.
4. Give `docs/prompts/GROK.md` to the existing Grok Build project for THE GAME. Have it identify its starting revision before editing. Grok's hosted copy must include the same source baseline and setup instructions.
5. Sol uses `codex/sol-foundation`; Grok uses `codex/grok-player-experience`. These names are planned work branches, not branches created or jobs dispatched by this setup.

Work in separate checkouts. A separate branch in a shared working directory does not isolate file edits. Both agents may work simultaneously inside their lanes once they share the same base and understand the current contracts.

## Ownership

| Area                                                             | Owner                                | Boundary                                                       |
| ---------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Saves, economy, memories, retrieval, offline dialogue, schedules | Sol                                  | `src/game/**`, except `render.ts`                              |
| Mind API, validation, budgets, build, tests, dependencies        | Sol                                  | `src/lib/mind.functions.ts`, `scripts/**`, root configuration  |
| Conversation layout, onboarding, input, responsive UI            | Grok                                 | `src/components/town/**`, `src/styles.css`                     |
| Canvas presentation and new game art                             | Grok                                 | `src/game/render.ts`, `public/game/**`                         |
| Existing auth, database, PWA, preview integration                | Sol, only for a demonstrated need    | Preserve platform behaviour; do not rewrite as general cleanup |
| Integration                                                      | Sol after both lane diffs are stable | Explicit pass, including necessary UI wiring                   |

`TownApp.tsx` contains both UI and orchestration. Grok owns it during parallel work. Sol records required orchestration changes instead of editing it concurrently. For example, Sol can introduce an additive save-status API while preserving `saveTown(town)` callers; the status display is wired in the integration pass. Grok's UI branch must keep working with the original exports until that pass.

Keep the current save schema and exported function signatures stable during independent lane work. The seven-resident integration uses `Town.version === 2` and preserves version-1 imports. Each agent records any proposed interface change in its own handoff with an example and test. Neither assumes an interface exists because the other agent might implement it.

## Grok web mode has a separate handoff route

The official web announcement confirms GitHub export. It does not establish that a particular web project can fetch arbitrary Git branches, merge changes back, or automatically load root instructions. The CLI documentation separately describes AGENTS.md discovery.

First ask Grok to report whether its actual environment can fetch the setup branch, create a feature branch, and export a diff/commit. It should read AGENTS.md explicitly, even if automatic discovery is available.

If the web project lacks Git operations, it can work on an isolated preview copy of the matching baseline and return a patch or the exact changed files, with paths and a base revision. If it cannot establish that baseline, it should produce a concrete UI proposal and specify the missing import step before modifying an unrelated/stale copy. Do not export a stale whole project over `main`. Sol can apply the scoped patch to its feature branch later.

Keep the published `thegame.grok.me` version available while both previews are developed. Publishing needs a separate release instruction.

## Review and integration

1. Both agents finish their scoped milestone and fill their own handoff with base/head SHAs, changes, checks, limitations, and contract requests.
2. Review Sol's data integrity and regression fixes first. Review Grok's UI in a browser against the existing engine; screenshots alone do not establish working controls.
3. Sol creates an integration branch from the current agreed base and combines the reviewed diffs. Resolve shared contracts explicitly and review the combined diff for lost work.
4. Run clean install, typecheck, lint, full tests, game regressions and a local production build without a live database. Make the inherited full-suite failures portable and meaningful; keep required assertions instead of marking them successful or skipping them indiscriminately.
5. Play the integrated first day online and offline. Test an older v1 town, day-5/day-30 exports, debt settlement, wages, save failure feedback, keyboard/touch input, and a page reload.
6. Produce a release candidate with validation evidence, current-source export, save backup instructions and rollback steps. Merge/publish only when the user instructs the release.

## Research behind this setup

- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) supports `xhigh`; the role split and chosen effort here are project recommendations, not a measured Sol-versus-Grok comparison.
- [OpenAI prompting guidance](https://developers.openai.com/api/docs/guides/latest-model) favours explicit outcomes, lean instructions and proportionate verification. The prompts use one bounded milestone each.
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) supplies repository instructions.
- [Grok CLI project rules](https://docs.x.ai/build/features/project-rules) also support AGENTS.md. CLI behaviour is not assumed for hosted web Build.
- [Grok web Build](https://x.ai/news/grok-build-for-everyone) documents GitHub export and hosted publication as separate capabilities.
- [Node release information](https://nodejs.org/en/about/previous-releases) lists Node 24 as LTS on the research date. The locked toolchain also excludes the locally installed Node 23 in one lint dependency's engine range.
