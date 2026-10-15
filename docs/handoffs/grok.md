# Grok handoff

## Quality backlog UX pass — 15 October 2026

Branch: `codex/game-quality-review`, in the shared `product/` checkout. This is the player-experience lane; the engine, ledger, community project, memory and save implementation are owned by the other lanes. The earlier quality review and generated evidence were preserved.

- Permanent Journal, Inventory, Go somewhere, Library project and Help & privacy controls replace dependence on the first conversation hint. The opening points to the funded library index while leaving participation optional. Kevin has a nonbinding project shortcut; the library has its own board button.
- `PlayerTools.tsx` shows player agreements, event receipts, tabs and carried items. Active funded work uses `fundedWorkSummary` for reservations, recorded attendance, earned payables and settlements. Inventory quotes use `playerActions(town, "player")` and the existing explicit action boundary.
- `LibraryProject.tsx` displays the engine's public view: next step, separate custody/reservations/spending, entries, inspected evidence, attributed reports, actual lookup outcome and public history. Grouped `ActionCards` display terms and disabled reasons before every explicit action. Evidence, drafts and lookup restrictions remain in `applyLibraryAction`; no chat text authorizes completion.
- Pins now refer to the resident being viewed. The developer inspector is first enabled from Help; default resident cards no longer offer private simulation notes.
- A browser-persistent local-only option is available on entry and in Help. It prevents player, ambient and Hour AI requests. Help explains the transmitted context and private contents of downloaded town files. Switching to local invalidates a pending request; a current foreground message receives authored local dialogue.
- Ambient requests no longer freeze movement, time or ordinary actions. Requests are serialized; a player message during ambient work uses a local reply. Ambient replies require the same town/request, minute/day, post-prompt revision and player position. Changed scenes discard the late proposal. Foreground requests retain a clock pause and action lock, allow walking, discard a request as soon as the player leaves earshot, have an immediate Use local reply now control, and fall back after 15 seconds. Old request cleanup cannot clear a newer request.
- Destination buttons walk through the existing collision/path rules. Keyboard/screen-reader activation of direction buttons moves one tile. Location and blocked/arrival messages are announced. Manual directions or Escape stop a route; importing/replay/another tool cancels it. Canvas remains keyboard focusable.
- Movement saves at most every second while moving and immediately when movement stops through the coordinated lock API, reducing reliance on asynchronous unload writes.
- Browser saves use the coordinated async API. Initialization cannot replace a town created while naming; acknowledged replacement preserves the prior raw copy before adoption. Conflicts pause time and offer Download this copy / Load saved town. Help exposes preserved raw conflict/replacement copies without deleting them. Export and clipboard failures are surfaced.

Additional effects integration was explicitly assigned after the UX lane. `effects.ts` now offers standalone inventory consumption and optional quoted shared meals after a completed library result, with an authored present invitee, nearby witnesses only, public outcome shown, one consumption, surviving debt and no relationship bonus. Financial activation precedes NPC/debt reference capture. New cafe units reserve five coins before acceptance, retain accrued attendance and earned payables across midnight, and expose suspend/resume. Explicit legacy recognition preserves source evidence, carries only disclosed unambiguous minutes, and confirms zero ambiguous minutes. Original unambiguous timetables are restored on resume; ambiguous replacements disclose new hours. Read-only offer previews never activate live books, and ordinary talk creates no ledger. `scripts/town-quality-actions.test.mjs` passes 9/9; targeted coherence suites pass 24/24. Staged commits retain resident, debt and existing project object identity; conflicting non-shift legacy cafe projects are rejected. Four existing identity/consent regressions pass unchanged. Root owns final test-contract migration from the old midnight-loss mechanics.

Validation in this lane: targeted ESLint passed; `npm run typecheck` passed after `community.ts` landed; `node --test scripts/town-player.test.mjs` passed 10/10; `git diff --check` passed. No paid AI calls or browser sessions were made in this lane. The integration lane owns the final built browser gate at desktop/phone sizes, delayed-provider/multi-tab checks and the funded-project journey. Physical-device keyboards and VoiceOver remain unverified until a human/device pass.

## Current graphics pass — 12 October 2026

Branch: `codex/town-graphics`. Base: released `main` at `65d93a905f256abdcdddc21d7612e7d4b8b07d53`. Code/art head: `fadefc2ce34189b567908be9386966c4e0386b63`. Merged PR: [#15](https://github.com/arwyn6969/the-game/pull/15). Subsequent documentation commits record delivery metadata.

- `src/components/town/WorldArt.ts`: cached ground art, distinct room materials/rugs, furniture sprites, tree canopies, food/books, shoreline/lily details and light gradients. Raised art follows existing collision cells.
- `src/game/render.ts`: shared furniture/resident depth order, stronger resident silhouettes, four facing views, walking based on movement distance, public-activity poses, shadows, night light pools, steam/ripples/leaves/fireflies and collision-free name/speech placement. Pause, replay and reduced motion freeze animation; rendering leaves saves untouched.
- `src/components/town/TownApp.tsx`: passes an additive optional `replay` flag to the renderer, so historical views do not animate or show current activity/speech.
- `docs/design/town-graphics.md`, `docs/design/graphics/` and `docs/design/graphics-checks.mjs`: design record, synthetic-town screenshots and portable localhost browser checks.

Clean locked install, typecheck, lint (one inherited warning), 65 town regressions, 263 script tests, 55 app/auth tests, diagnostics and a production build with database/model credentials unset passed. Desktop 1280×800 and phone 390×844 verified movement, touch controls, Pause, conversation, offline reply, download/import and reload. Pixel checks verified animation stability, tree occlusion and save immutability. Browser checks ended with zero console or page errors. See the design record for reproduction commands and limits.

No engine/schema contract changes are required. Existing camera and picking signatures are preserved. This release was subsequently published to the existing thegame.grok.me project after user authorization. The source and hosted layout/save evidence are in [docs/RELEASE.md](../RELEASE.md). Physical phone keyboards and real-provider conversation quality were not tested in this pass.

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
