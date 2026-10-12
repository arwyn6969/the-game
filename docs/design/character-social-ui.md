# Characters and town life

12 October 2026. The social UI follows the seven-resident conversation build and incorporates the published town graphics. It is a development feature, not a published release.

## Player experience

The resident strip opens portrait cards at any distance. Overview shows specialties and, when observed, current activity; Strengths explains expertise and limitations; Together contains the player's conversations and explicit choices; Progress shows recorded contributions, work attendance and agreements. Skill levels are unmeasured rather than invented. Each character keeps a separate draft. Pin keeps the selected character first in the strip for quick access during the session; it remains available when browsing other cards.

Town life presents recent conversations, attributed full dialogue, actual directional relationship changes with their recorded reason, and actual changes to participant schedules. Readable captions let the player step through an exchange independently of the game's minute counter. Older conversations remain readable but do not gain fabricated past relationship changes.

The default feed contains conversations with the player and NPC exchanges witnessed within six tiles in the same zone. A witnessed exchange also enters the player's memory as a spoken statement, rather than a verified fact. Watch town conversations is an explicit viewer setting: it reveals non-secret recorded town dialogue without adding player knowledge. Follow changes the camera, not the player's position. Return to me restores the player's view.

Watch mode can show dated recorded character reflections. They are separate from speech, exclude seed disclosures and compression summaries, and are not described as live thoughts or as necessarily caused by the selected exchange. Private identity, wants and hidden threads stay in the existing opt-in developer inspector.

## Persistence and limits

An optional `Town.social` array retains up to 128 applied events in version-2 saves. Existing version-2 towns without it still load; version-1 migration remains intact. Imported events are validated and bounded. Duplicate participant memory copies appear once in the feed. Reading, pinning and camera following do not change money or agreements.

Replay shows only events recorded by its selected game date. Character cards and current statistics are disabled during replay. The map's original historical roster handling remains intact.

Specialties are authored backgrounds, not proven proficiency. Contribution progress has statuses and attended hours; there are no invented task completion percentages. Health, hunger, mood, numeric skills and wider think-tank mechanics remain outside this feature.

## Browser reproduction

Use Node 24 and `npm ci`. Start a local preview with no live database or provider credentials. The standard dev wrapper and auth configuration remain enabled:

```sh
MIND_PROVIDER_MODE=offline npm run dev -- --host 127.0.0.1 --port 8093 --strictPort
node docs/design/character-social-checks.mjs
```

The harness uses isolated Chromium contexts and synthetic towns at 1280×800 and 390×844. `SOCIAL_QA_URL` can select another local port. Output is ignored under `artifacts/social-ui/`. It exercises canvas selection, captions, transcripts, changes, updated plans, reflections, camera following, cards, separate drafts, local replies, movement, pause, export/import/reload, replay filtering and new-town entry. Physical phone keyboards and live-provider dialogue require separate verification.
