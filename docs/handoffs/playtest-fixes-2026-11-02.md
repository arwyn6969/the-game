# Playtest fixes — 2 November 2026

Owner: this chat. Branch: `codex/playtest-fixes`, based on `6c72f28`.
Implementation: `311e2ad`, [draft PR #70](https://github.com/arwyn6969/the-game/pull/70).
Local validation passes; Verify is pending.
Scope: the eight findings from the in-app browser playtest. No deployment,
provider/budget change, live inference, migration or player-save replacement.

## Result

| Finding | Result |
| --- | --- |
| Manuscript recipient resets | Invitation choice lives in TownApp across panel mounts. An active trial displays its actual actor; reload restores the recorded session actor. |
| Speech appears as Arwyn ↔ Arwyn | Legacy self-addressed speech has one participant and is labeled “Arwyn spoke.” Its words remain intact, with one set of View/Follow controls. No listeners or knowledge are invented. |
| Stop disappears when the panel closes | Active trials have a Stop manuscript trial button beside their status, including pending requests and cooldowns. |
| Completed notice lingers | Explicitly stopped feedback stays in the manuscript panel. A paused error remains visible while following its actor, then drops out when attention moves elsewhere. |
| Bread instructions under manuscript | Loaf-use guidance appears only when carrying bread. |
| Sidebar label is clipped | Library Ink sidebar labels wrap, with icons retaining their size. |
| Replay advances the live clock | Replay disables Pause, 1×, 4× and Hour. Handler guards require Back to now before any clock change. |
| Hour stops without explanation | The status reports the actual minutes advanced and whether a conversation, resident decision, save issue or another action stopped it early. Existing simulation boundaries remain. |

The Town save schema and exported game function signatures are unchanged. Old
speech memories remain readable, and watch mode still does not deliver speech
to nearby residents. The separate connection-recovery PR #69 is independent.

## Validation

- Node 24: typecheck and lint pass; lint retains one existing unused-disable
  warning in `src/lib/auth/use-current-user.ts`.
- 484 town tests pass. Full suite: 1,179 script tests and 55 auth/app-data tests
  pass. Town diagnostics complete; their observations are not a release verdict.
- Build passes with `DATABASE_URL` unset; migrations are skipped.
- [Built browser smoke checks](../review/playtest-fixes-2026-11-02/built-browser-results.json)
  pass at both sizes: conversation entry, keyboard/touch movement, pause, reload,
  versioned save download, restore/fork and corrupt-import recovery.
- [Focused browser regressions](../review/playtest-fixes-2026-11-02/browser-results.json)
  pass at 1280×800 and 390×844, with no page errors, transport leaks or provider
  calls. They cover panel persistence, active actor identity, visible Stop,
  ignored late responses, speech attribution, scoped notices, inventory copy,
  sidebar width, replay controls, Hour explanations and reload.
- [Existing manuscript journeys](../review/playtest-fixes-2026-11-02/manuscript-browser-results.json)
  pass on desktop and phone, including reading, movement, cancellation,
  import/export, usage limits and scoped accessibility checks. The suite caught
  the need to retain paused-error feedback; that behavior is covered and passes.
- The in-app localhost preview independently confirms recipient persistence,
  removal of irrelevant bread copy, the wrapped label, replay clock guards and
  an accurate four-minute Hour explanation, using authored local dialogue.

See the [tested-source hashes](../review/playtest-fixes-2026-11-02/tested-source.json)
and [desktop](../review/playtest-fixes-2026-11-02/desktop-visible-stop.png) /
[phone](../review/playtest-fixes-2026-11-02/phone-visible-stop.png) Stop captures.
Physical devices and a fresh hosted reply on this revision are not claimed.

## Handoff

The focused browser regressions are included in Verify and their artifacts are
uploaded with the existing browser evidence. Review and CI precede integration;
publication remains a separate operation. Broader earlier-round observations
about project guidance and shared-history wording are outside this eight-item
implementation.
