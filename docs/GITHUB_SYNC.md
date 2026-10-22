# GitHub source synchronization receipt — 21 October 2026

**Historical receipt:** this snapshot merged through [PR #38](https://github.com/arwyn6969/the-game/pull/38), followed by later AI integration in [PR #39](https://github.com/arwyn6969/the-game/pull/39). [CURRENT_STATUS.md](CURRENT_STATUS.md) owns live source, deployment and ownership status. The source comparisons and checks below describe the original synchronization packet.

This branch brings the latest local implementation, review evidence and planning into one reviewable GitHub snapshot. It preserves the original commits through merges. The application and dependency files match AI candidate `0bd3e3b`; server experiments remain under `experiments/` and are not connected to the running game.

## Included source

| Work                                           | Original source                                                                                                   | Included result                                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accessibility and AI preparation               | PRs [#36](https://github.com/arwyn6969/the-game/pull/36) and [#37](https://github.com/arwyn6969/the-game/pull/37) | Readable panels, keyboard/focus improvements, isolated playtest tooling and zero-spend preflight                                                                                                                                           |
| AI diagnostics and grounding                   | `9210b78`, `0bd3e3b` on `codex/ai-playtest-readiness`                                                             | Safe diagnostics, saved-shift recall, plan destination correction and evidence-separated reflections; [receipt](review/ai-job-fixes-2026-10-21.md)                                                                                         |
| Player acceptance and independent review       | `cb35283` on `codex/player-acceptance-20261021`                                                                   | [Candidate browser checks](handoffs/candidate-browser-2026-10-21.md), synthetic screenshots and [adapter review](handoffs/server-adapter-review-2026-10-21.md)                                                                             |
| Local server authority and real-engine adapter | `350d0b5` on `codex/server-adapter-20261021`                                                                      | [Authority spike](../experiments/server-authority/README.md), [real-engine adapter](../experiments/server-adapter/README.md), atomic recovery and maximal-ID fixes                                                                         |
| Coordination                                   | `c411425` on `codex/production-roadmap-agent-world`                                                               | [Delivery tracker](DELIVERY_TRACKER.md), source pin and coordinator receipt                                                                                                                                                                |
| Previously uncommitted planning                | Captured from `product/`                                                                                          | [Production plan](PRODUCTION_PLAN.md), [agent-created world](implementation/agent-created-world.md), roadmap and continuity links                                                                                                          |
| Workspace-only records                         | Captured from the workspace root and AI recovery review                                                           | [Readiness checklist](workspace/01_Game_Readiness_Checklist.md), [Freeman Show tracker](workspace/00_Master_Production_Tracker.md), [workspace guide](workspace/START_HERE.md) and [AI recovery history](review/ai-recovery-2026-10-20.md) |

The [document source manifest](review/github-sync-2026-10-21-sources.json) records original file hashes before link normalization. Original planning files and local workspaces remain preserved. The candidate tag `candidate/2026-10-21-ai-quality` retains the original AI source pin; this combined branch adds experiments and documentation without moving that pin.

The earlier `codex/server-foundation-20261021` and `codex/offline-avatar-plan` references preserve original prototype/planning history. Their current implementations are already represented by the adapter and the merged avatar roadmap. Older coherence/UI clones are historical sources whose reconciled implementations reached main; this synchronization does not revive those superseded implementations or replace the current game with old exports.

## Verification

- Fresh Node 24 application run on candidate `0bd3e3b`: **929 passed** (874 script tests and 55 app/auth tests), zero failures or skips. An initial sandbox attempt could not bind loopback; the complete unchanged suite passed with local sockets permitted.
- Fresh Node 24 server experiment run on `350d0b5`: **42 passed**, zero failures or skips; tests deny live inference and external network access.
- Combined application/dependency files are byte-identical to the tested AI candidate; experiment files are byte-identical to the tested adapter source.
- Existing desktop/phone-emulation browser evidence identifies the pinned candidate and retains physical-device, assistive-technology and human-testing limitations.
- Publication checks cover document links, formatting, whitespace and changed-file credential patterns. The only token-pattern match in new source is an explicitly synthetic test string.

Full GitHub CI runs on the pull request. Its result is separate from the local verification above.

## Publication and gates at the original checkpoint

The original publication target was `codex/github-sync-20261021`; PR #38 integrated it into main. Source refs were subsequently reviewed in the [branch alignment receipt](review/branch-alignment-2026-10-21/README.md). Hosted publication and later implementation have their own evidence in [CURRENT_STATUS.md](CURRENT_STATUS.md). The dated “no push” statements describe their original sessions.

Fresh generated planning/reflection quality, sustained/concurrent AI, five actual human sessions, physical-device/assistive-technology testing, host/accounting/recovery acceptance and production server storage/auth/network integration remain open. Private provider configuration, credentials, databases, personal towns, ignored runtime artifacts and dependency/build directories are excluded. Public funding and paid services are not enabled by this source update.
