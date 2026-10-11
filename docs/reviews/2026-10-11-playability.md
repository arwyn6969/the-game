# Playability investigation — 11 October 2026

THE GAME has a functioning town simulation and a recognizable cast. Its player loop is incomplete: the player can walk, speak, acquire a tab and repay it, but cannot reliably turn an intention into useful work, a usable purchase or an ongoing personal commitment. Conversation presentation also hides some of the responses that do exist. These gaps explain the reported lack of interactivity.

The next milestone should be a first day where a player chooses something, does it, sees a consequence, and returns tomorrow to find that consequence remembered. Preserve the five residents, pixel town and open-ended premise.

## Scope and evidence

- Reviewed source: `main`, commit [`88f5039ab5743c3b6370a64b2e6d88a7de128da0`](https://github.com/arwyn6969/the-game/commit/88f5039ab5743c3b6370a64b2e6d88a7de128da0). This is the integrated release from PR #4. The review branch changes documentation only.
- Fresh synthetic towns in Chromium at 1280×800 and 390×844, using normal naming, keyboard walking, touch direction controls, resident clicks, conversation, pause and reload. Read-only diagnostic access supplied coordinates and map cells; it did not teleport the player or open conversations in this walkthrough.
- Separate focused browser checks for an unreadable existing save and the visibility of the newest reply. The latter uses the diagnostic conversation opener to isolate presentation.
- Focused offline engine probes for language intent, work eligibility, nearby NPC conversations, private dialogue, relationship changes and save loading. These observations are separate from regression tests.
- Public HTML and JavaScript fetched from [thegame.grok.me](https://thegame.grok.me) with TLS verification enabled. They establish specific differences from source, not an exact deployed commit.
- No real player saves, API keys, paid model calls, live migrations or hosting changes were used.

The town regressions were rerun during this investigation: **42 passed, zero failures or skips**. The earlier integrated release also passed the full **295-test suite**, typecheck and build, with one inherited lint warning; see [the release record](../RELEASE.md). Those checks establish specific technical behavior. They do not establish an enjoyable or complete player journey.

The hosted site could not be played directly in this environment: Chromium rejected its certificate chain, and the read-only hosted availability endpoint returned HTTP 403. The browser checks below apply to the reviewed local source. The deployed AI-key status, real model response quality, physical phone keyboard and disconnected-network PWA behavior remain unverified.

## What works and should be retained

| Area | Verified behavior | Practical limit |
| --- | --- | --- |
| Town and cast | Five distinct residents, a 56×42 map, named places, day/night shading and recognizable routines. | Most scenery has no player action. |
| Movement and time | Keyboard and touch walking work; pause, 1×, 4× and hour advancement exist. Nearby Enter opens conversation. | Pointer clicks on terrain do not walk there. Waiting for a mind stops movement as well as time. |
| Persistence | Normal reload retains money, debts and conversations. Current source supports older v1 imports and portable exports. Save-write failure has a warning and backup action. | Data belongs to this browser and origin. Two tabs can overwrite it. Account save is a later step, below, and is not part of this milestone. |
| Economy rules | Debt ownership, full payment, repeated settlement and balance limits are guarded. Northern's agreed cafe shift earns wages through actual attendance. | The input parser can choose the wrong transaction; the player cannot obtain a shift offline. |
| NPC continuity | NPCs move, meet, remember, open projects, spread Kevin's question and revise some plans. | Much of that activity is invisible to the player; offline days rely heavily on repeated templates. |
| Conversation foundation | Typed lines become saved exchanges; the composer and close control fit the reviewed phone viewport. Private inspector content is opt-in. | Latest replies can be offscreen; fallback responses often repeat history rather than address the question. |
| Development | Reproducible Node 24 setup, locked dependencies, CI and focused game regressions. | Current tests do not cover the full reachable work/purchase/day-two journey. |

The canonical product repository is **`arwyn6969/the-game`**. **`arwyn6969/THE_GAME`** is the older Python simulator and is not the code serving this web game. They are two repositories in the same GitHub account.

## Findings and fixes

P1 means a priority for the next corrective release: misleading gameplay, unintended state changes or a threat to saved progress. P2 means a substantial experience improvement. These priorities are for this game milestone, not security severity ratings.

### F1 — P1: inquiry and negation cause transactions

**Reproduction:** walk to Baba and ask `Do you sell bread?`. A debt of 2 is immediately created. Then say `Do not pay my tab yet.`. The debt becomes paid and the player purse falls from 4 to 2. Reload preserves this unintended result.

Separate engine probes also create a bread debt for `I do not want bread.`, `What does bread cost?` and `I am allergic to apples.`. With a tab open, `Can I pay tomorrow?`, `How do I pay?` and `I cannot pay.` all settle it when funds are available.

**Cause:** [offline.ts:567](../../src/game/offline.ts#L567) detects isolated purchase/payment words and applies the effect. Correct ledger validation cannot fix incorrectly inferred intent.

**Change:** distinguish information requests from explicit actions. Show clear offers and explicit `Take bread on a tab` / `Pay 2` actions. Ambiguous or negative language must preserve the ledger. Use the same validated action rules with and without AI.

**Acceptance:** all quoted inquiry/negation cases leave money and favors unchanged. An accepted purchase or payment changes the state once, visibly, and survives reload. Paying the wrong person or an already paid tab still fails safely.

### F2 — P1: the advertised player work loop is unreachable offline

**Reproduction:** the opening guidance says to ask about a shift. Ask Kevin `Can I work a shift at Hobbs?`, `I want a job. How do I earn money?` or `I accept the cafe shift.`. Responses discuss his open thread or private story. The player receives no project or commitment. In a focused engine probe, standing in the cafe for eight game hours after these requests leaves money at 4 and eligible shift hours at 0.

**Cause:** [offlinePlayer](../../src/game/offline.ts#L549) has bread, repayment, inspection, introduction and personal-question branches, but no player shift branch. [Wage rules](../../src/game/sim.ts#L157) require an owned open shift project, a matching planned interval and physical attendance. The UI does not establish these prerequisites. The wage tests exercise constructed eligible states; they do not prove that a player can reach one through conversation.

Online player replies can propose a project, but their prompt asks for the resident's own project and does not implement a dependable player shift agreement. Do not promise that adding an API key completes this workflow.

**Change:** implement an offer, explicit acceptance, a visible work place/time/pay commitment, attendance progress and a wage receipt. Keep the schedule/accounting rules consistent with the agreement. Make leaving, cancellation and an empty till explainable.

**Acceptance:** in a fresh town with no key, the player asks Kevin for work, accepts, attends and receives the promised wage. Idle presence without an agreement earns nothing. A skipped or unattended interval earns nothing. Progress and the agreement survive reload.

### F3 — P1: newest conversation replies can be invisible

**Reproduction:** in a 390×844 conversation, send five short messages without manually scrolling the history. The conversation body remains at `scrollTop = 0`; its visible height is 294 px and its content height is 904 px. The newest exchange starts below the body’s bottom edge and is entirely offscreen. The submission feedback says the line landed, while the reply appears missing.

**Cause:** [the conversation list](../../src/components/town/TownApp.tsx#L1270) appends chronological history with no scroll-to-latest behavior. It displays whole journal sentences containing both speakers, rather than a concise new reply.

**Change:** show player and resident messages distinctly; keep the newest reply visible when the player is following the current exchange. When they intentionally read older history, preserve their position and show a new-message indicator. Make the answer visible before clearing the player's expectation of a response.

**Acceptance:** the newest answer is visible after sending at both reviewed viewport sizes, including the smaller viewport used for keyboard layout checks. Reading older messages is not forcibly interrupted. Verify on a physical phone too.

### F4 — P1: unreadable existing saves have no recovery path

**Reproduction:** put a deliberately malformed town in the browser save key and reload. The naming screen appears with no alert. The original bytes remain until the player names themselves and presses `Walk in`; that action replaces the damaged town with a fresh one.

**Cause:** [loadTown](../../src/game/save.ts#L265) returns the same `null` for no save, storage failure and invalid data. [Boot](../../src/components/town/TownApp.tsx#L153) therefore treats all cases as a new player, and `enter` overwrites the same key. Save-write warnings do not cover this load path.

**Change:** return a backward-compatible load status that distinguishes missing, unreadable and unavailable storage. Preserve unreadable bytes and offer raw backup/recovery or importing a known backup before starting a replacement town.

**Acceptance:** malformed, structurally invalid and inaccessible saved data produce explicit recovery states. Creating a fresh town does not silently overwrite a damaged existing town. Normal and older v1 loads continue to work.

### F5 — P1: the published site is behind the reviewed release

Public HTML still references `/assets/index-D6OE8j1e.js` and its route bundle `/assets/routes-C3vt9xa2.js`. The fetched route bundle checks import size against `15e5` and uses a pretty export retaining replay frames. It lacks the current source's save-failure warning text. Current source uses an 8 MiB UTF-8-aware import limit and excludes replay from portable exports.

This proves specific fixes are not in the fetched published code. It does not identify every hosted change or its exact commit. Updating GitHub did not publish the website.

**Change:** after the corrective changes are integrated and checked, publish through the existing Grok hosting path. Expose a small build identifier in an about/debug surface and verify that identifier from the hosted site. Preserve existing browser saves and an actual hosted rollback option. [The release handoff](../RELEASE.md) records the available source archive and access limit.

**Acceptance:** published build identity matches the intended source; an existing town reloads, older v1 files import, save failure is visible, and the corrected first-day journey works on the hosted site. Hosting publication still needs access to the existing publishing session; this review does not publish it.

### F6 — P2: fallback conversation has weak understanding and social consequences

The initial work request produces a generic “open thread” reply. Follow-ups often quote a clipped previous exchange. A suitcase question repeats Kevin's origin monologue. Friendly, hostile and introduction probes all produce a relationship score of 0 offline, although an introduction can create a thread.

There is also a knowledge leak: in a fresh town at 08:00, `Good morning. Can I have coffee?` makes Kevin quote `I want to find out who I am...` and then say he is keeping the private part off the counter. [compose/quote](../../src/game/offline.ts#L242) can pull his private seed into an ordinary spoken reply.

Long replies lose content: after two work questions, a `Who are you?` reply is 393 characters; [exchange storage](../../src/game/effects.ts#L341) clips the reply to 320, and [memory creation](../../src/game/memory.ts#L36) clips the combined record again. The saved answer ends mid-thought. The first 40-character world bubble cannot carry the omitted answer.

**Change:** make common intents work deterministically: greeting, name, work, directions, buying, debt, refusal and a genuine follow-up. Keep replies brief and specific to the question; select public material for ordinary replies. Let explicit fulfilled commitments affect relationships and future conversation. AI may add variation while the gameplay rules remain usable offline.

**Acceptance:** distinct common questions receive relevant answers; the last response is preserved meaningfully; fulfilling a promise produces a later observable acknowledgment; a casual question does not expose Kevin's private seed. Unknown input gets an honest in-character response rather than an unrelated transaction.

### F7 — P2: life happens nearby but is not remembered by the player

In a focused simulation with the player at `(11,21)`, Arwyn and Kevin converse at 13:00; Arwyn is at `(10,20)`, two tiles away. The NPC chat is saved for its two speakers. The player receives zero chat memories. After ten game hours there are ten NPC chat records and the player still has only their initial reflection.

**Cause:** [NPC talk effects](../../src/game/effects.ts#L306) save to the two participants only. Hourly observation also runs for NPCs only. World bubbles show only the latest short line. The journal cannot recover something the player witnessed.

**Change:** add a readable local event stream and player memories for events actually witnessed, using proximity, place and appropriate visibility rules. Surface relevant public commitments or board changes without revealing distant/private NPC events. Show NPC project consequences in behavior, not only inspector records.

**Acceptance:** a nearby conversation or visible wage event can be found later in the player's journal. A distant or private conversation cannot. A remembered event can support a later relevant question.

### F8 — P2: interaction rules and status disagree with the world

At the opening, the player is in the Plaza while the HUD says `asleep in the last townhouse`. After actually walking to Hobbs at 07:00, it still says asleep. [The HUD](../../src/components/town/TownApp.tsx#L791) displays the player's preset schedule status instead of their actual activity. The README previously also described a start on the row; this review corrects that documentation.

A normal desktop click on Kevin from the opening Plaza position opens a conversation **17 tiles away**. Keyboard Enter requires a resident within two tiles. [Canvas selection and sendLine](../../src/components/town/TownApp.tsx#L640) enforce neither a matching distance nor a place boundary. Pinning Kevin also keeps him reachable independently of the player's location. Terrain clicks do nothing, without explaining that movement is keyboard/pad only.

**Change:** decide and communicate face-to-face conversation range consistently across mouse, touch and keyboard. Keep a pinned observation panel distinct from permission to speak. Show actual player activity. Make actionable residents/objects visibly selectable and give feedback for blocked movement or unavailable actions.

**Acceptance:** the same encounter is available through all supported controls; an out-of-range resident gives a useful walk/talk affordance; the HUD describes the real activity and place. No interaction silently fails.

### F9 — P2: the map promises more activity than it supplies

Beds, shelves, counters, tables and benches are map decoration/collision cells. Canvas interaction handles residents and the noticeboard; it supplies no sleep, sit, read, inspect, gather or counter action. Buying bread creates a debt but no inventory, consumption or useful item effect. The player has no visible personal agenda or actionable commitments beyond the debt list.

This is a design gap rather than a broken existing inventory feature: the reviewed town schema has no inventory or needs system.

**Change:** add a small number of meaningful contextual actions in the existing places. Start with one usable purchase and one work commitment, then a readable library object or public lead. A purchase may be consumed immediately or represented as an item; choose a purpose before adding a large inventory system. Let the journal show the player's chosen commitments.

**Acceptance:** the player can explain what an accepted purchase gave them and what their chosen commitment requires. Interacting with at least one non-NPC object yields useful information or a visible effect. These actions persist appropriately without breaking old towns.

### F10 — P2: AI waiting stops the entire town and player

[runMind](../../src/components/town/TownApp.tsx#L252) permits one pending job. While it is pending, both movement and clock advancement are disabled. The client allows a 45-second wait; [the gateway](../../src/lib/mind.functions.ts#L25) allows 25 seconds per attempt and can retry. The previous integration browser check explicitly verified this freeze with a delayed mock to avoid applying a reply against changed simulation state.

That protects consistency but can make an ordinary background NPC thought feel like a broken control. A real provider's latency and error rate were not measured here.

**Change:** shorten and explain waits, preserve a timely offline fallback, and use captured job context plus revalidation so walking can continue safely. Prioritize player replies over ambient thoughts. Keep the existing imported-town stale-result protections.

**Acceptance:** a delayed or failed background mind does not prevent the player walking. No old response mutates an imported town, pays the wrong debt or erases a newer draft. Offline fallback responds promptly.

### F11 — P2 before broader AI use: runtime availability and limits are incomplete

The `mind on` badge reports only whether a server key exists, not whether the provider can answer. The gateway has a process-local shared cap of 12 calls/minute, no per-player allowance or durable budget, and no caller-identity middleware attached to these server functions. Function input accepts a caller-supplied prompt string. Hosting-level protection was not established by this review.

A deterministic instantaneous-response first-day scheduling probe produces 13 automatic jobs in a game day, with peaks of 2 per real minute at 1× and 7 at 4×. A single player's ambient calls do not, by themselves, prove quota exhaustion. Multiple players and their dialogue share the in-process allowance; multiple server instances do not share it.

**Change:** before expanding paid AI play, define an allowed caller/session, per-player and total budgets, understandable fallback states, cancellation/retry limits and provider error monitoring. Construct trusted game context server-side where feasible. Keep all provider credentials server-side.

**Acceptance:** slow, missing-key, rejected-key and rate-limited cases have understandable behavior; one player's activity cannot consume everyone else's allowance; total paid usage has an enforceable bound. No provider migration is needed for the first playable loop.

## Phone and presentation observations

The fresh 390×844 screen devotes substantial space to HUD, offline status and a long tutorial, leaving a small town window. Movement controls cover part of that window. One early automated attempt to click Kevin immediately after keyboard walking was intercepted by the East button; a repeat using touch walking and allowing the camera to settle reached conversation normally. Treat that as a timing/overlap issue to investigate, not evidence that phone conversation always fails.

The confirmed phone blocker is F3: new replies fall below the visible history. A visible nearby `Talk` action, shorter contextual guidance and a more compact HUD would also make the controls discoverable. The current phone guidance explains Enter for talking but does not explain tapping a resident. Physical touch/keyboard testing is still required.

Additional small fixes: paid tabs remain in the top banner as `player owes baba 2 — paid`; use names and separate current obligations from settled history. `Pin Kevin` appears even when viewing Baba. Developer/“mind” wording and an NPC asking to “switch a mind on” occupy normal player flows; move connection diagnostics to a settings/debug surface and let fallback dialogue stay in character.

## Recommended delivery order

### 1. Make actions and responses trustworthy

Fix F1, F3 and F4; correct misleading status and debt labels from F8. Add focused regressions for language negation, load recovery and newest-reply visibility. Retain the existing ledger, save compatibility and stale-result checks.

Deliverable: inquiries never spend money; replies are visible; existing progress has a recovery path. Do this before calling a build ready for wider playtesting.

### 2. Complete one enjoyable first-day loop

Implement F2 and the smallest purposeful purchase/object interactions from F9. Provide visible contextual actions and chosen commitments. Improve common offline conversation and commitment-based acknowledgment from F6. Record witnessed events from F7.

Deliverable: **meet Kevin → accept a shift → work it → receive pay → choose a purchase or repay Baba → return tomorrow to a remembered consequence**. The player may decline, explore or walk away; this is an available loop, not a compulsory quest or ending.

### 3. Make it feel alive and publish a verified build

Address F10, the remaining F8 control inconsistencies, phone guidance and public event feedback. For paid AI expansion, include F11. Then publish via the existing hosting path with the build identity and hosted verification from F5. Make source, preview and published status easy to distinguish.

Deliverable: the actual website runs the demonstrated loop; model delays do not make controls appear broken; the town's changing relationships and public activity are legible.

Avoid broadening this milestone into a new framework, a larger world, multiplayer or a model-provider replacement. The existing town has enough setting for the next playable day. Account save is recorded next and waits until this day is trustworthy.

## Later: the town follows the person

Not part of the first playable day, and not a reason to delay it. Do this after the loop above keeps its promises.

The town is stored only in this browser, under `localStorage` key `the-game-town-v1`. Another device, browser, or person starts a new town. Sign-in already exists in the app and is not used by the save. Two tabs in one browser share that key, and the last write wins.

**Change:** store the town for the signed-in person, and keep the browser copy as the offline cache. On sign-in, load that person's town. If the browser copy and the account copy disagree, ask which to keep. Do not replace either silently. Two tabs for the same person must not clobber each other. Export and import stay the backup when the account write fails. Do not put players in one shared town, and do not turn on the unused peer-to-peer code.

This is separate from F11. F11 identifies a caller so one person cannot spend everyone's mind allowance. Account save stores the town. One user id can serve both, but the town must remain playable with no key and no account, as exit check 9 requires.

**Acceptance:** the same signed-in person sees their money, debts, and conversations in a second browser. A signed-out person, or a different person, does not. A failed account write leaves the browser copy unchanged and says it was not stored. An older v1 export still imports.

## Exit checks for the next milestone

1. A fresh no-key town gives understandable walking and nearby talking controls on desktop and phone.
2. The player can obtain a real shift through the normal interface; acceptance, attendance and pay are all visible.
3. A purchase has a useful visible outcome; asking its price or refusing it creates no debt.
4. Paying a tab is explicit, happens once, and produces the correct balance and settlement status.
5. The latest reply appears where the player can see it, including after several exchanges and phone keyboard layout changes.
6. A witnessed public event is remembered; private or distant events remain private.
7. A resident acknowledges a fulfilled commitment the next day, including after reload.
8. Normal, older and failed saves are handled without silently losing progress; export/import preserves the player's consequences.
9. Missing or slow AI permits useful play and clearly communicates fallback; no key is required for the demonstrated journey.
10. The published build identity matches the tested source and the same journey works there.

Keep the existing unit tests, add meaningful journey tests for these reachable states, and complete the relevant typecheck/lint/build/CI checks for implementation changes. Have a fresh player try the journey without coaching and record where they hesitate. Collect specific player examples to refine priorities; do not make the user's API-key purchase a prerequisite for this corrective work.

## Local investigation artifacts

These ignored files contain only synthetic review data and are not committed as player saves:

- `artifacts/playability-review.mjs` and `playability-review-results.json`: fresh desktop/touch walkthrough and observed states.
- `artifacts/playability-engine-review.mjs` and `playability-engine-results.json`: language, work, knowledge and recovery probes.
- `artifacts/review-recovery-and-feedback.mjs` and `review-recovery-and-feedback-results.json`: save replacement and newest-reply geometry.
- `artifacts/review-town-tests.log`: 42 passing town regressions.
- `artifacts/review-desktop-opening.png`, `review-desktop-kevin.png`, `review-desktop-cafe.png`, `review-desktop-paid-debt.png`, `review-mobile-opening.png`, `review-mobile-beside-kevin.png`, `review-mobile-work.png`, `review-mobile-hidden-newest-reply.png`: screenshots of the reviewed source.
- `artifacts/review-live.html`, `review-live-index.js`, `review-live-routes.js`: fetched public deployment artifacts. Asset names do not establish a deployed SHA.

Manual reproductions and acceptance checks are described in each finding so the review remains usable outside this workspace.
