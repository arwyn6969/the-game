# Collaboration workflow

## Current workflow

[CURRENT_STATUS.md](CURRENT_STATUS.md) owns live source/deployment status and named assignments. Use one owner, one bounded task, one isolated checkout and one short-lived `codex/` branch from current main. Record the base/head, PR, write boundary, blocker and next evidence. Use stacking only for an explicit dependency; no permanent `develop` branch is needed. Preserve user changes and private files. Follow the [branch lifecycle](BRANCHES.md) for integration and retirement.

Main requires a PR, the passing current `verify` check and resolved conversations. Merge, spending and hosted publication still follow the user's authorization. After a merge, update CURRENT_STATUS and retire the completed head; preserve recovery checkpoints with tags and dated receipts. Only current named owners edit their lane; historical role labels and queues do not dispatch or wake chats.

The sections below preserve earlier collaboration arrangements. Their source revisions, acceptance limits and assignments describe those past rounds; consult CURRENT_STATUS for later integration, successful narrow AI checks and active hosting work.

## Completed parallel round — 21 October 2026

The user authorized the lanes recorded in the [completed delivery-round receipt](DELIVERY_TRACKER.md). That dated board superseded earlier lane assignments during the round: Kevin's fix stayed with the existing AI chat; `player_acceptance` owned bounded UI/acceptance work in its isolated checkout; `server_foundation` owned only an isolated authority prototype; the coordinating chat owned integration and the shared board. The board records those base revisions, file boundaries, ports and acceptance evidence. Agents maintained separate handoffs and the coordinator recorded status. The earlier Sol/Grok role labels describe previous milestones and do not dispatch or wake chats.

## Historical integration — 19 October 2026

The reviewed stack is merged into main: [PR #30](https://github.com/arwyn6969/the-game/pull/30) (gameplay and caption controls) → [PR #31](https://github.com/arwyn6969/the-game/pull/31) (permanent identities) → [PR #32](https://github.com/arwyn6969/the-game/pull/32) (stamp appearance) → [PR #33](https://github.com/arwyn6969/the-game/pull/33) (private wallet tooling and Wonder Wallet). The user approved integration in that order with merge commits; implementation integration checkpoint `426b00b` has the verified `c84f69ed` tree. Start new work on feature branches from current `origin/main`. The [branch record](BRANCHES.md) identifies merge commits, the checkpoint CI receipt and preserved source/recovery refs.

PR #16 is closed as superseded by the reconciled eight-actor implementation in PR #30. Its original implementation is preserved for experimental version-1 ledger recovery at tag `archive/2026-10-21/funded-project-accounts`. PR #29's caption change is incorporated into PR #30 with source ancestry preserved. Neither old draft should be merged independently. That integration preserved source refs and checkouts. The later [21 October alignment](review/branch-alignment-2026-10-21/README.md) records remote retirement and recovery tags; all checkout folders remain preserved. Hosted publication, human/accessibility checks, live provider/operator acceptance, actual Wonder extension signing and receiving/recovery/asset reconciliation remain pending. Public funding stays disabled; every eventual outgoing transfer requires owner approval.

## Integration snapshot — 12 October 2026

The following paragraphs preserve the earlier status; use CURRENT_STATUS for new work.

The [consolidation record](CONSOLIDATION.md) records that historical source and cleanup checkpoint. PR #19 merged PRs #5, #6, #9, #13 and #14 into main. The 17 incorporated remote branches are retired; start new work from current `origin/main`. The existing graphics are retained. Do not restart their historical lanes or copy an older whole-project export over this candidate.

PR #16 remains the separate, inactive S1 economy foundation. Its six-actor version-1 ledger needs reconciliation with the eight-actor version-2 save, including new resident accounts and opening totals. Only then should S2 activate every cash path and matching player terms together. PR #23 is merged. Assign an owner and use a fresh branch from current main.

Keep each active task in its own checkout. Complete integration and validation before requesting release approval. Merge and hosted publication remain separate decisions; no document automatically messages or wakes another chat.

## Earlier packet brief — funded community project

The first-day and trust-repair work is merged and published. Start new work from the [roadmap](ROADMAP.md), [community-project packets](implementation/community-project.md), [Sol brief](prompts/SOL-6.1.md) and [release record](RELEASE.md). The setup-branch instructions below are historical; do not restart the old foundation assignment.

For the next packet, fetch and identify current main. The planning pack from PR #5 is already integrated. Sol owns S1 engine, account and save work, but that draft is not merged. PR #11's neon interface is on main; do not treat it as an unmerged redesign or avoid TownApp for that reason. No chat is synchronised or messaged merely because this document names it.

Each handoff records packet, base/head, behavior, tests, save migration, open limitations and the next packet. User-authorised scope governs implementation; these briefs do not themselves authorise a new publication or production configuration change.

## Original first-day workflow (historical)

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
