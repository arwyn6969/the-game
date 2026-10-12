# Everyday conversation and movement follow-up

Prepared 12 October 2026 for the existing `codex/seven-resident-coherence` draft. This extends [the seven-resident handoff](seven-resident-coherence.md); it is a development build, not a published release.

## What changed

The earlier local dialogue coverage concentrated on education and energy. Everyday requests could still fall through to an unrelated greeting or a generic answer. New bounded local handlers cover wage questions, work, money, shop stock, offers of help, invitations, refusals and short follow-ups. They can recover the subject of a previous vague reply from the player's attributed question. History is limited to three recent exchanges with that resident; unrelated, stale and private material cannot become the current topic.

Wage answers cite the worker's exact engine receipt, its employer, day and time. Missing payment answers distinguish the current agreement, recorded attendance and funding limits. A conversational claim is not a receipt. Paying a tab, accepting work and cancelling work still require the existing explicit action. Invitations acknowledge the social intention without inventing an appointment or changing anyone's schedule. Stock answers disclose that the game does not track a complete inventory. Standalone greetings no longer assume an unstated task.

Residents can now make room for one another at a blocked doorway. Every step uses a legal unoccupied tile and the normal three-step movement budget; the player is never pushed. Shared destinations do not cause endless displacement. Status describes movement or a blocked route until actual arrival, including after loading a paused town or applying a new plan. Observations are recorded after movement and status refresh.

Local reflections use new engine receipts and attributed statements instead of repeatedly copying a personal motto or a planned status. Statements remain explicitly unverified and retain their original date and time. Duplicate claims are suppressed across reloads, and a quiet period adds no reflection. Existing historical memories are retained.

The conversation composer now explains when local dialogue is active. This matters while the conversation panel covers the general status explanation.

## Validation

All committed fixtures and browser scenarios are synthetic. No player save or private transcript is included.

- Node 24: typecheck passed; lint passed with the existing unused-disable warning in `src/lib/auth/use-current-user.ts`.
- Game regressions: 134 passed, none skipped. Full suite: 332 script tests plus 55 app/auth tests, 387 total, all passed.
- New regression coverage includes employer/date-bound wages, invalid payment claims, current attendance, invitation/help follow-ups, receiving versus offering help, refusals, explicit tab repayment/cancellation, private/stale history, blocked cafe/library doors, stationary players, shared goals, paused reloads, new plans and reflection attribution/deduplication.
- Production build passed with `DATABASE_URL` and `XAI_API_KEY` unset; database migration skipped. Dependency-level `use client` warnings remain non-fatal.
- Isolated Chromium checks passed at 1280×800 and 390×844: name entry, keyboard/touch movement, pause, v1 migration, v2 import/export, reload, the visible local-dialogue explanation and 26 conversation replies across five residents. Wage dates, invitations, help, stock and short follow-ups were checked against the saved structured turns. A 639-character reply remained fully readable after import and reload. No console errors, page errors or provider requests occurred. The composer and header fit both viewports without horizontal overflow.
- The 30-day local diagnostic reported no world-audit issues and all sampled exports imported. Day-30 export: 732,891 UTF-8 bytes. These are diagnostic observations, not a quality score.

Synthetic browser results, screenshots and the harness are retained locally in ignored `artifacts/everyday-coherence-qa/`. The refreshed production preview uses port 8081 and remains in local-dialogue mode. Existing browser storage is preserved; reloading uses the new build.

## Next acceptance gate

Keep seven residents while validating actual provider-backed conversation. Local dialogue is still authored fallback; these fixes do not turn it into open-ended reasoning. No live provider calls or paid model comparisons were run in this pass.

Use the same small scenario set for every resident: a social invitation, an offer of help, a correction, a refusal, a money/work question, a factual follow-up and a question outside their expertise. Include paraphrases absent from the regression tests. Score whether each answer addresses the latest message, preserves the previous subject, distinguishes claims from receipts, stays within the resident's knowledge and agrees with actual game state. Record source, latency and usage alongside the score. Recheck the key conversation after reload.

Next, make recurring NPC activity depend on new shared events and open goals. Generic autonomous exchanges still use a limited set of authored lines, and not every conversation changes a project. Data and Amelia need a small useful project with a visible, validated outcome before more cast members add value. Grow toward fifteen only after conversation quality, provider cost/latency and simulation movement meet that seven-resident gate.

The runtime provider/model, hosting, authentication and save version remain unchanged. Publication is still a separate release step under `AGENTS.md`.
