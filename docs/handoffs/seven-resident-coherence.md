# Seven-resident conversation test build

Prepared 12 October 2026. This is a development handoff; it does not describe a published release.

The subsequent [everyday-coherence pass](everyday-coherence.md) extends this build with ordinary conversation handling, doorway yielding, truthful arrival statuses and less repetitive reflections. Its validation counts supersede the earlier numbers below.

## Source and scope

Branch: `codex/seven-resident-coherence`, based on current main `65d93a905f256abdcdddc21d7612e7d4b8b07d53`. It preserves the neon UI and the latest authored identities for the original five residents. Independent implementation lanes were integrated and reviewed in this checkout.

The cast is now Kevin, Arwyn, Northern, Baba, Sub, Data and Amelia, plus the player. Data is a fictional technology/science researcher; Dr. Amelia Keynes is a fictional economist. Each has routines, a home, a distinct public perspective and limitations. Their library interests do not create funding, completed research or an implemented community project.

## Conversation changes

- Player conversations store attributed turns separately from the compact legacy summary. Up to six recent turns from the same pair are supplied before older keyword retrieval. Full replies, up to 700 characters, display and survive save/reload.
- Memories carry an ID, game date and source category: recorded event, spoken statement or reflection. Current obligations, action choices and wage receipts take priority over remembered claims. Compressed memories preserve attribution cues.
- Shared NPC requests receive public profiles, shared conversation and the pair's obligations. They do not pool private identities, wants or unrelated memories. The global model instructions do not supply Kevin's private story to other speakers.
- Speech cannot authorize player payments, bread acceptance, shifts or schedule changes. Common unsupported completion/payment claims are corrected against records; generated project completion is rejected. NPC effects stay within their participants and existing validation rules.
- Local dialogue has distinct education and energy perspectives, contextual follow-ups, factual town answers and honest limits. It is authored fallback dialogue, not a general-purpose reasoning model.
- Requests have bounded context and one provider attempt with a 25-second timeout. Dawn planning covers at most two residents per request, resumes unfinished plans after reload, and rejects unusable plan responses so local fallback can proceed. Reflections also run in batches of at most two.
- Status distinguishes an available but unverified AI connection, a successfully applied AI reply and local fallback. Conversation entries identify their reply source. Provider diagnostics include outcome, elapsed time and available token usage.

The runtime provider/model, hosting, auth and PWA contracts are unchanged. The model remains `grok-4.5`; no stronger model was purchased or silently substituted.

## Save compatibility

New saves use version 2 and browser key `the-game-town-v2`. A version-1 town with the original six actors is migrated once, retaining names, money, debts, notices, memories and plans, subject to the existing exact authored-line repairs from main. Data and Amelia are then added. The original bytes under `the-game-town-v1` are retained, including when the new save fails.

Unknown versions, partial/duplicate rosters, malformed wrappers and damaged current saves trigger recovery instead of silently replacing the town. Replay frames store roster IDs; newcomers are absent in frames from before their arrival. Downloads keep the existing 8 MiB limit and omit disposable replay frames.

Download a backup before trying the development build. Old game versions cannot import a version-2 export. Returning to an old build may resume its older retained version-1 browser snapshot; it will not contain progress made in this build.

## Validation

Node 24.19.0 verification passed after a clean `npm ci` using the committed lockfile:

- `npm run typecheck`.
- `npm run lint`, with only the existing unused-disable warning in `src/lib/auth/use-current-user.ts`.
- `npm run test:town`: 106 passed, none skipped.
- `npm test`: 304 script tests plus 55 app/auth tests, 359 total passed, none skipped.
- `npm run build` with `DATABASE_URL` and `XAI_API_KEY` unset. Database migration was skipped. The bundler reported dependency-level `use client` directive warnings without build failure.

Browser checks passed at 1280×800 and 390×844 in isolated Chromium contexts, with the API key unset. They covered name entry, eight actors, keyboard/touch movement, pause, v2 download/import, a synthetic six-actor v1 fixture, preserved debt/name/memories, reload, and 24 local Kevin/Data/Amelia replies across education, energy and follow-ups. A 639-character structured reply retained its final marker in the UI and after import/reload. No money or debt changes accompanied these conversations; no console/page errors occurred in the successful run.

Evidence is local and ignored by Git: `artifacts/seven-resident-qa/results.json`, the reproducible `run.mjs` harness, and 16 screenshots. Test contexts and exports are synthetic. Initial browser attempts encountered a dev dependency-cache refresh and a case-sensitive harness assertion; the final warmed-server run passed. The "Pin Kevin" shortcut still pins Kevin from every conversation panel.

The 30-day offline diagnostic observed no world-audit issues; all sampled exports imported successfully. Its day-30 export was 985,724 UTF-8 bytes. This diagnostic is an observation, separate from the regression verdict.

## Limits and next acceptance test

No paid/live provider dialogue was run. Mocked gateway tests verify failures, parsing and usage reporting, not the quality or latency of actual model replies. Prose guards cover common patterns and do not prove arbitrary claims true. Unusual maximum-size packets can omit older context with explicit omission counts; the newest exchange and current facts take priority. The process-local rate limit remains a limit per server process, not a deployment-wide spending cap.

For the next live test, talk to the seven residents about the same topic, follow up with "why?", introduce a correction, reload, and check that they distinguish their knowledge and perspective. Include a false claim that a tab was paid and a claim that library work was completed. Measure relevance, continuity, unsupported claims, latency and token use. The funded library project, external research tools, 15-character expansion and stronger-model comparison remain later work.

Merge and publication require the separate release instruction in `AGENTS.md`. This handoff leaves the production game unchanged.
