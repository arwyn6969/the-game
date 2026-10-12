# Character social UI handoff

12 October 2026. Branch `codex/character-social-ui`. This is an implementation for review, not a production publication.

## Baseline and dependency

Started from seven-resident / provider integration `578ab31` and incorporated the published graphics at `a454103`. During this work, PR #14 and the product consolidation merged into main. The feature now integrates main at `88dfcae` and targets main directly, preserving the newer provider credential guards, memory interests, experimental-economy save rejection and deployment configuration. The current renderer's Data/Amelia accessories are retained in the portraits. S1 funded accounts (PR #16) remain independent and were not activated or overwritten.

## Delivered behaviour

- Select every resident from the map or keyboard-accessible portrait strip. Cards have Overview, Strengths, Together and Progress tabs; inspection works at a distance while speaking and explicit actions retain their existing range and authority checks.
- Generalised character pinning, separate draft text for each resident, and camera following with Return to me. Camera movement does not teleport the player. Movement restores the player camera.
- Town life displays attributed NPC exchanges, their game date/place, actual directional relationship changes with reasons, the recorded participants' memories, and applied schedule changes. Captions can be stepped through and opened as a full exchange.
- Watch mode is explicitly labelled and does not create player knowledge. The normal view shows the player's exchanges and NPC speech witnessed in the same zone within six tiles; witnessed speech enters memory as a statement. Non-secret dated reflections are optional and do not claim to be live thoughts or exclusively caused by the selected exchange.
- Bounded optional version-2 social history, validated imports and legacy transcript deduplication. Existing saves and version-1 migration remain supported. Legacy exchanges have no invented relationship history. Replay excludes future events and disables current character statistics.
- Phone captions and movement controls have separate touch areas. Bottom sheets retain access to the resident strip and transport controls. The portraits use the actual renderer's character appearances.

## Validation

Node 24.19.0 and a clean install from the committed lockfile:

- Typecheck passed.
- Lint passed with the existing unused-disable warning in `src/lib/auth/use-current-user.ts`; no new warning.
- Town suite: 153 tests passed, none skipped, including nine new social-history regressions.
- Full suite: 379 script tests and 55 app/auth tests, 434 passed, none skipped.
- Production build passed with `DATABASE_URL` and `XAI_API_KEY` unset; database migration explicitly skipped. Existing dependency-level bundler warnings remain.
- Thirty-day offline diagnostics reported no world-audit findings, and sampled exports imported. Diagnostics are observations, not a separate test verdict.
- Final isolated Chromium checks passed at 1280×800 and 390×844: overlapping canvas selection through the crowd picker, caption stepping, NPC transcripts, relationship changes, applied plans, dated reflections, camera following without moving the player, all card tabs, pinning for quick access, separate drafts, local replies, keyboard/d-pad movement, pause, download/import/reload, replay filtering and new-town name entry. A synthetic private seed bubble is excluded from map painting. No page errors or horizontal overflow in the successful run.

Reproduction: `docs/design/character-social-checks.mjs`. Screenshots, synthetic exports, logs and the machine-readable final result are ignored under `artifacts/social-ui/`. Browser runs use new contexts rather than personal profiles or saves. Initial verification required the normal Vite dependency warm-up; a real caption/d-pad overlap was found and repaired. The final harness accounts for the existing overlapping-sprite crowd picker.

## Limits

No live/paid AI call, production migration, merge, hosted publication or physical-device keyboard check was performed. Social history retains 128 applied events; older available transcripts can be read without reconstructed score changes. Numeric skills, health, hunger and mood systems remain unimplemented, as planned. Auth, provider routing, hosting and explicit transaction rules are preserved.
