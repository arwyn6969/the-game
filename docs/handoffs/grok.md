# Grok handoff

Base: `b8d6c97ebe5d88b2f97a56e5e5edc82287554ad1` on `codex/agent-collaboration-setup`. Draft PR: https://github.com/arwyn6969/the-game/pull/2, still draft. `main` was not updated and https://thegame.grok.me was not published.

## Changed

- `src/components/town/talk.ts` — a send counts as heard when a new player chat id appears, not when the typed text is found inside a memory. The composer is cleared only when it still holds that sent line in the same conversation and town. Enter and E open talk only when focus is not on a button, link, or field.
- `src/components/town/talk.test.ts` — the newline line, a delayed second draft, and Enter on a button.
- `src/components/town/TownApp.tsx` — uses those rules. Opening and offline help hide while a conversation is open. The offline line is one sentence.
- `src/styles.css`, `src/game/render.ts`, `docs/design/first-day.md` — unchanged in this pass.

## Checks

- `npx tsc --noEmit` passed.
- `node --experimental-strip-types --test src/components/town/talk.test.ts` — 4 passed, 0 failed. That file is not in `package.json` `test` because the script list is outside this lane. Run it with the command above.
- Browser: beside Kevin, with the 1× button focused, Enter did not open a conversation and the clock left pause. With focus on the page, E opened Kevin. The opening line was gone while the conversation was open. At 390×844 the transcript area was 326px tall and the composer ended at y=730 inside an 844px screen. Desktop and phone screenshots were taken with the conversation open.
- Not tested: a physical phone keyboard.
- Earlier `node scripts/town-day.test.mjs` passed on the previous commit. It was not re-run; this pass does not change the simulation.
- Full `npm test` and `npm run lint` were not re-run. Inherited failures in `docs/BASELINE.md` are unchanged. This does not fix them.

## Not fixed here

Sol still owns long-play import limits, silent save failure, debt settlement, wages, offline repayment, and the memory packet. A reply is detected from a new chat id after `applyResult`, not by re-reading the saved sentence.
