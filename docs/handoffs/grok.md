# Grok handoff

## Current graphics pass — 12 October 2026

Branch: `codex/town-graphics`. Base: released `main` at `65d93a905f256abdcdddc21d7612e7d4b8b07d53`. Code/art head: `fadefc2ce34189b567908be9386966c4e0386b63`. Draft PR: [#15](https://github.com/arwyn6969/the-game/pull/15). Subsequent documentation commits record delivery metadata.

- `src/components/town/WorldArt.ts`: cached ground art, distinct room materials/rugs, furniture sprites, tree canopies, food/books, shoreline/lily details and light gradients. Raised art follows existing collision cells.
- `src/game/render.ts`: shared furniture/resident depth order, stronger resident silhouettes, four facing views, walking based on movement distance, public-activity poses, shadows, night light pools, steam/ripples/leaves/fireflies and collision-free name/speech placement. Pause, replay and reduced motion freeze animation; rendering leaves saves untouched.
- `src/components/town/TownApp.tsx`: passes an additive optional `replay` flag to the renderer, so historical views do not animate or show current activity/speech.
- `docs/design/town-graphics.md`, `docs/design/graphics/` and `docs/design/graphics-checks.mjs`: design record, synthetic-town screenshots and portable localhost browser checks.

Clean locked install, typecheck, lint (one inherited warning), 65 town regressions, 263 script tests, 55 app/auth tests, diagnostics and a production build with database/model credentials unset passed. Desktop 1280×800 and phone 390×844 verified movement, touch controls, Pause, conversation, offline reply, download/import and reload. Pixel checks verified animation stability, tree occlusion and save immutability. Browser checks ended with zero console or page errors. See the design record for reproduction commands and limits.

No engine/schema contract changes are required. Existing camera and picking signatures are preserved. Publishing remains a separate release step; physical phone keyboards and hosted/real-provider conversation were not tested in this pass.

## Earlier first-day handoff

Base: `b8d6c97ebe5d88b2f97a56e5e5edc82287554ad1` on `codex/agent-collaboration-setup`. Draft PR: https://github.com/arwyn6969/the-game/pull/2, still draft. `main` was not updated and https://thegame.grok.me was not published.

## Changed

- `src/components/town/talk.ts` — a send counts as heard when a new player chat id appears, not when the typed text is found inside a memory. The composer is cleared only when it still holds that sent line in the same conversation and town. Enter and E open talk only when focus is not on a button, link, or field.
- `src/components/town/talk.test.ts` — the newline line, a delayed second draft, and Enter on a button.
- `src/components/town/TownApp.tsx` — uses those rules. Opening and offline help hide while a conversation is open. The offline line is one sentence.
- `src/styles.css`, `src/game/render.ts`, `docs/design/first-day.md` — unchanged in this pass.

## Checks

- `npx tsc --noEmit` passed.
- `node --experimental-strip-types --test src/components/town/talk.test.ts` — 4 passed, 0 failed. That file is not in `package.json` `test` because the script list is outside this lane. Run it with the command above.
- Browser: beside Kevin, with the 1× button focused, Enter did not open a conversation and the clock left pause. With focus on the page, E opened Kevin. The opening line was gone while the conversation was open. At 390×844 the transcript area was 326px tall and the composer ended at y=730 inside an 844px screen. Screenshots: [desktop](day1-talk.png), [phone](day1-mobile.png).
- Not tested: a physical phone keyboard.
- Earlier `node scripts/town-day.test.mjs` passed on the previous commit. It was not re-run; this pass does not change the simulation.
- Full `npm test` and `npm run lint` were not re-run. Inherited failures in `docs/BASELINE.md` are unchanged. This does not fix them.

## Not fixed here

Sol still owns long-play import limits, silent save failure, debt settlement, wages, offline repayment, and the memory packet. A reply is detected from a new chat id after `applyResult`, not by re-reading the saved sentence.

## Standing on each other

People no longer step onto a tile someone else is on. A saved pile is split on the next minute, and the player cannot walk through a person. If a click still covers more than one sprite, buttons name each of them.

The console lines about `__grok-preview/status`, `postMessage`, and `contentscript.js` are the preview frame and a browser extension, not the town. `manifest.webmanifest` 401 is the preview gate in front of the app. Vite's dev server is what the content-security warning means by `eval`. The page now saves on `pagehide` instead of `beforeunload`. Download inside this frame copies the town, because the frame is not allowed to save a file.
