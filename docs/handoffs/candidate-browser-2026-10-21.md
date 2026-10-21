# Final-candidate browser recheck — 21 October 2026

**Passed: the pinned candidate's local-only desktop and emulated-phone browser journeys.** No reproduced blocker or application patch. This receipt is separate from the earlier `215c8c7` player-acceptance run.

## Exact tested source

- Checkout: `/Users/arwynhughes/Documents/ChatGPT/THE GAME/candidate-20261021`.
- Commit: `0bd3e3b1401ebf6b460d9d71f287c4b474b2452b`.
- Tree: `0b68cf176037b436c07a6225a2fdeebb58f0eea1`.
- Local tag: `candidate/2026-10-21-ai-quality`.
- Build ID: `0bd3e3b1401e`; source clean at build and after checks.
- Application fingerprint: `5c065816684643b390a48fb914c8195677251b88ee98b111cf48993fe67d890a`.
- Runtime: Node `v24.19.0`; independent installed dependencies; credential-free production-stage build with authentication enabled, `envDir: false`, no provider credentials or migration command. Preview used only `http://127.0.0.1:8102/`.

[Build receipt](../review/candidate-browser-2026-10-21/build-receipt.json) and [post-run source/results verification](../review/candidate-browser-2026-10-21/verification.json). The original 250-input manifest remains in the candidate checkout's ignored `artifacts/playtest-app/build.json`.

## Results

The unchanged `scripts/quality-browser.mjs` completed successfully against the staged final candidate. Every group ran at **1280×800 desktop** and **390×844 phone viewport**, in disposable synthetic Chromium contexts.

| Group | Verified result |
| --- | --- |
| Movement, conversation and controls | Keyboard movement on desktop, touch movement in phone emulation, pause, Journal/Inventory/Help and authored local reply passed; no page-wide horizontal overflow. |
| Saves and identity | Nonempty download, import/reload, competing-tab protection, version-1 migration, repeated identity restoration, explicit separate-town fork and corrupt-identity rejection passed. |
| Library | Ordinary-control successful desktop and intentionally unsuccessful phone lookup paths both passed. Each paid 6 earned coins, kept 2 project coins, conserved 90 total coins and preserved its outcome across export/import/reload. |
| Northern's reading | Park and library paths passed at both sizes, including listen/read participation and optional bread/tea. Outcomes survived portable import/reload and money remained reconciled. |
| UI edges | Escape/focus return, route cancellation, replay movement protection, keyboard import choices/cancellation, old-project handling and caption dismissal/history/reload passed. |
| UI interruptions | Resident/tool transitions, keyboard tabs, exclusive panels, notice-board focus, unchanged money while opening panels and phone touch cancellation passed. |

**Zero reported failures or browser errors.** The subjourneys that record blocked provider-request attempts reported empty lists. All journeys used local dialogue; no live model calls were made. The harness's `builtPreview: false` means its own default server launcher was bypassed using `GAME_QA_URL`; that URL served the recorded built production stage.

[Complete browser results](../review/candidate-browser-2026-10-21/browser-results.json). Inspected screenshots: [desktop town](../review/candidate-browser-2026-10-21/desktop-town.png), [phone town](../review/candidate-browser-2026-10-21/phone-town.png), [desktop reading](../review/candidate-browser-2026-10-21/desktop-reading.png), [phone reading](../review/candidate-browser-2026-10-21/phone-reading.png). No new layout regression was apparent in those captured states.

## Commands and source preservation

Used the bundled Node 24 binary at `/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. With the candidate checkout as the working directory:

```sh
node scripts/playtest.mjs --build-only
GAME_QA_URL=http://127.0.0.1:8102/ GAME_QA_OUT='/Users/arwynhughes/Documents/ChatGPT/THE GAME/player-acceptance/artifacts/candidate-browser-2026-10-21/browser' node scripts/quality-browser.mjs
```

Between those commands, started the ignored `player-acceptance/artifacts/candidate-browser-2026-10-21/preview-8102.mjs` helper from the player-acceptance checkout. It checks the clean pinned commit, validates the saved build against `sourceSnapshot`, checks the staged tree for private configuration, checks port availability, and launches ordinary Vite production preview with the existing launcher's minimal `playtestEnvironment`. Port 8102 is strict and loopback-only. No authentication bypass or application change was introduced. The actual human-session origins 8181–8185 were not served.

After all journeys, the candidate's commit, tree and fingerprint still matched the build; `git status --porcelain` was empty. The verification ran at **11:54:57 BST**. No tracked candidate file or Git ref was changed. Candidate writes were confined to ignored build artifacts and dependency cache. New handoff/evidence files are only in the player-acceptance branch.

The build and browser processes exited successfully. The preview's own child was identified as PID 3870 with the candidate's staged-source working directory, terminated, and its wrapper exited successfully. A final listener check found nothing on 8102. No unrelated process was stopped. Original logs, generated synthetic saves, extra screenshots and the preview helper remain in the player-acceptance checkout's ignored `artifacts/candidate-browser-2026-10-21/` folder; no synthetic save or private human record is committed.

## Limits and next gate

This verifies local browser behavior on the pinned source. It **does not establish live planning/reflection acceptance**: the coordinator reports those live checks timed out, and this run makes no model requests. It also does not re-establish genuine hosted sign-in, shared accounting, billing terms or production readiness.

Five uncoached human sessions, voluntary return, physical-phone/on-screen-keyboard use, real screen-reader use and native browser-zoom acceptance remain **unrun**. Phone Chromium emulation is not a physical phone session. The nearby-conversation and migration checks use synthetic fixtures; the library and reading sequences use ordinary controls but are automated, not human observations.

No broad unit suite or expanded axe audit was repeated; this was the requested targeted browser recheck after A's reported final 929-test run. The coordinator can now attach this receipt to the pinned candidate and proceed with the existing human protocol while retaining the separate live-AI gate.
