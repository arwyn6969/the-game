# Game quality playtest guide

Use five uncoached human sessions to decide whether the funded library loop is understandable and worth revisiting. Automated browser journeys test correctness and access; they do not count as these sessions.

Run the reviewed candidate locally or use the exact authorized release. Record its commit/build identifier. Create a fresh synthetic town for each participant; never replace their personal town. Use at least two desktop and two phone sessions, with the fifth on either. Include a physical phone and a keyboard or screen reader session where available. Record the evaluation round and dialogue mode. Local dialogue provides a repeatable baseline for accessibility and the authored game loop; it does not validate AI conversation quality.

## Evaluation rounds and dialogue mode

Keep two separate rounds:

| Round                           | Purpose                                                                                                              | Prerequisites and current status                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential-free local baseline  | Accessibility, controls, saves, the funded-library loop and recognition of its authored consequences                 | Use the launcher below with local dialogue only. Five blank session records are prepared; all remain **not run**.                                                                                                |
| AI-enabled conversation quality | Assess the existing AI service's relevance, character consistency, responsiveness and effect on the human experience | **Pending** legitimate configuration of the existing provider, verified authentication, functioning shared usage accounting, conservative tariffs and verified spending limits in the intended test environment. |

Use the same recorded dialogue mode across all five scored sessions in a round. Keep local-only and AI-enabled records, observations and decision-gate counts separate; do not pool their results. If an AI round follows the local baseline, use separate anonymous round identifiers and fresh synthetic towns, and record any participant's prior exposure. An accessibility pass or a successful local playtest is not evidence that generated conversations work well.

The AI round needs its own recorded provider/model, configuration and accounting-verification receipt, without credentials or private account data. Confirm actual model replies before claiming AI-quality evidence; record local fallbacks, errors and waiting behavior separately. Switching the selected dialogue mode during a scored session requires recording that change and repeating the affected path in the round's agreed mode.

The launcher below deliberately supplies no provider credentials or live AI configuration. It makes no new paid calls and performs no credential setup, tariff configuration or production migration. Prepare the AI round through the existing provider/auth/budget contracts in an appropriately authorized environment; do not add keys to this credential-free snapshot. AI-quality acceptance remains pending until that separate round is actually observed.

The existing provider path is the legacy Grok gateway (`MIND_PROVIDER_MODE=legacy`, also the default). Use its existing private configuration in the intended authenticated environment. Follow the [mind budget operator guide](../../src/lib/mind-budget/README.md) to verify shared database accounting, the budget migration, conservative maximum tariffs and a real verified identity before live sessions. `MIND_BUDGET_LOCAL_DEV` uses ephemeral accounting and cannot establish a durable spending limit. Record the model actually returned and observed usage; changing providers is outside this preparation.

## Local setup and session isolation

Use Node 24 and the installed dependencies from the committed lockfile. From the project checkout:

```sh
npm run playtest -- --build-only
npm run playtest -- --skip-build --session PT01
```

The first command stages the current Git-visible application inputs in `artifacts/playtest-app/source`, builds them once and writes `artifacts/playtest-app/build.json`. The receipt records the full source commit, whether the checkout had local changes, hashes of the actual application inputs, build time and Node version. Help displays the same commit-based build label, including “local changes” where applicable. Copy the receipt's build identifier and source fingerprint into each actual session record. A changed source or missing receipt requires a fresh build; `--skip-build` refuses a mismatched source.

This launcher uses an explicit minimal child environment, keeps authentication enabled and excludes `.env*`, `.grok`, local configuration and credentials from its staged source. Vite uses `envDir: false`; Nitro sees the same environment-free staged directory. Its build output and Nitro/Vite caches are separate from the ordinary app build. It does not run the deployment migration command, sign into an account, call a paid AI provider, open a browser, publish the app or clear browser storage. Normal development and deployment commands retain their existing behavior.

The second command starts only PT01. Substitute PT02–PT05 for later sessions, or omit `--session` to start all five. Running `npm run playtest` without options builds and starts all five. The fixed origins isolate browser storage:

| Session | URL                    | Planned device                 | Result  |
| ------- | ---------------------- | ------------------------------ | ------- |
| PT01    | http://127.0.0.1:8181/ | Desktop                        | Not run |
| PT02    | http://127.0.0.1:8182/ | Desktop                        | Not run |
| PT03    | http://127.0.0.1:8183/ | Phone                          | Not run |
| PT04    | http://127.0.0.1:8184/ | Phone                          | Not run |
| PT05    | http://127.0.0.1:8185/ | Desktop or phone; access needs | Not run |

The launcher initializes private, blank `artifacts/playtest-human/PT01/record.json` through `PT05/record.json` with status `not run`. Existing records are never overwritten. All `artifacts/` files are ignored by Git. Keep participant contact details separately; do not commit player saves, browser profiles, transcripts or identifiable quotes. A planned device or an automated phone viewport is not a completed human session.

Use the exact assigned URL, browser and browser profile on both visits. Changing `127.0.0.1` to `localhost`, changing the port or using another profile gives a different saved town. Query parameters do not create separate storage. Before a participant starts, confirm that the name-entry screen is visible. If a town already exists, preserve and assign it to its original session; use another session origin or a new dedicated browser profile. Never clear storage to make a session appear fresh. Do not open two tabs for the same session town.

The preview listens only on this computer's loopback interface. A physical phone cannot reach the computer through these URLs; a phone-sized desktop browser remains an emulation check. Real-phone acceptance requires a separately arranged local-device preview of the same recorded build. Record that acceptance as pending until a person actually completes it. This launcher creates no public URL or network-facing service.

Ports are strict. If another process occupies one, the launcher fails without stopping it. Stop these previews with Ctrl-C in their terminal; it signals only the children it started. Keep the staged build, session origins and private records between visits. To rebuild, stop all five playtest previews first, then rerun `--build-only`; do not change builds halfway through a participant's two visits without recording that change.

## Prepare, preserve and reopen a session

1. Record the evaluation round, build receipt, device, browser, input method and actual accessibility settings. For the credential-free local baseline, create a synthetic resident such as PT01 and select **Use local dialogue only** before **Walk in**; confirm local mode in Help if needed. For a separately prepared AI round, record its verified configuration receipt and consistent AI-enabled mode instead. Do not connect a real wallet or fund an account for this gameplay test.
2. Give the uncoached prompt below. Let the participant make their own choices. Record any assistance and the actual game day/time; assistance does not meet the uncoached completion gate.
3. At the end, pause the clock and choose **Download town**. Confirm that an actual nonempty JSON download exists; a requested download alone is not proof of a backup. Keep it privately in that session's ignored folder with the day/time, browser/profile description and build receipt. Downloads include conversation history and private resident notes. Retain the browser's saved copy too.
4. Reopen the exact same origin and browser profile. Check that the same resident, game day and chosen consequence remain. Use ordinary **Hour** or speed controls to reach the next game day, then pause and ask what the participant recognizes. Browser closure or an overnight wait does not advance the local simulation. Do not use developer inspection or scripted time jumps for the human session.
5. If restoration is needed, first download and preserve the currently open town. Choose **Import**, inspect the preview and choose the restoration option to keep the original people and identities. **Create separate town** deliberately creates new identities with copied histories. Both choices replace the current browser town after preserving a recovery copy; cancel if the target session or backup is uncertain. Keep the original file regardless of the import result.

There is no account-based cross-device synchronization. A participant changing device must use a private export/import transfer, record the change and preserve the original browser copy. Never import a test town into a participant's personal game origin.

## Accessibility and device acceptance

Record the exact browser/assistive technology and the result of each path, with any defect and assistance. Automation is evidence for the paths it actually runs; it does not establish screen-reader or physical-device acceptance.

- **Keyboard:** start a town, reach every essential control using Tab/Shift-Tab, identify visible focus, open/close Help, Journal, Inventory, Library and destination navigation, and return focus sensibly after dialogs. Check Escape, conversation entry and per-resident drafts. Arrow/WASD movement and shortcut keys must not steal typing from a focused input.
- **Movement and time:** use single-step and destination controls without a pointer, stop a destination walk, and use pause, 1×, 4× and Hour while retaining understandable location/time status. Essential actions must not require precise canvas pointing.
- **Screen reader:** on a real supported setup, find the name field, local-dialogue setting, town tools, destinations, actionable library choices and conversation text. Confirm that control names, dialogue status and save/import errors are understandable and updates do not overwhelm reading. Verify modal focus containment, close controls and return focus.
- **Visual and motion settings:** check desktop at 1280×800 and phone at 390×844, 200% browser zoom, narrow reflow and reduced motion. Ensure text/controls remain visible, focused content is not obscured and meaning is available without color alone. Check contrast and target sizes with the accessibility audit, then inspect the affected controls visually.
- **Physical phone:** test touch movement, single-step alternatives, dialogue with the on-screen keyboard open, scrolling, pause, dialog closure, file download/import and reload on actual hardware. Record browser, orientation and any keyboard obstruction. A desktop touch emulation is recorded separately.
- **Persistence:** use the ordinary download, import cancel/restore and reload paths with a synthetic town. A lost save, inaccessible essential action, unintended obligation, lost earned payment or private disclosure blocks acceptance until reproduced and repaired.

Keep human-playtest counts and accessibility acceptance separate. Mark screen-reader, physical-phone and voluntary-return results `not run` or `pending human` until they have been observed.

### Engineering accessibility receipt — 19 October 2026

The candidate fixes clock selection semantics, invalid dialog/region labels, initial pane focus, keyboard reading without accidental town movement, focus after one-use choices, enlarged-text pane clipping and focus hidden behind overlays. Nonmodal panes dismiss if they obscure the newly focused control and keep its destination visible. Visible clock and reply controls preserve the open conversation; explicit Close/Escape restores an opener or the map. Import confirmation retains its modal focus containment. Existing towns and save formats are preserved.

The [saved checks](../review/playtest-accessibility-2026-10-19/checks.json) record 892 passing tests, 338 town tests, typecheck, lint with one inherited warning, a credential-free build, desktop/phone gameplay journeys and 54 accessibility surfaces with 27 essential checks. Synthetic delayed-AI tests separately cover manual fallback, pause, late replies, replay and draft preservation without live provider calls. The automatic audit found zero detectable WCAG/best-practice violations or browser errors. Its source fingerprint and build receipt identify the exact tested local candidate; no human session is marked complete.

Run `npm run test:browser:a11y` against a loopback preview with `GAME_A11Y_QA_URL`. It uses isolated synthetic browser contexts and axe-core 4.10.3, writes screenshots and `artifacts/accessibility-browser/results.json`, and gates detectable WCAG 2 A/AA, 2.1 and 2.2 AA violations plus separate best-practice findings. The current coverage includes desktop 1280×800, phone 390×844, narrow 320px/reduced motion, a 640×400 viewport equivalent to 200% zoom, and 200% CSS text with WCAG text-spacing overrides. The latter two are recorded techniques, not a claim of native browser-zoom testing.

Gradient/canvas contrast checks retain axe `incomplete` results. Source-based conservative contrast bounds and visual inspection supplement these findings, with their scope recorded in the [review evidence](../review/playtest-accessibility-2026-10-19/contrast-bounds.json). Zero automatic violations do not establish complete [WCAG 2.2 conformance](https://www.w3.org/TR/WCAG22/).

Native Chrome keyboard entry reached the name field, local-dialogue checkbox and town controls in a disposable town. With user approval, macOS VoiceOver was temporarily switched on, but subsequent state checks showed it off and no speech or VoiceOver navigation could be verified. It is currently off; screen-reader acceptance remains **incomplete**. Physical-phone, native 200% zoom, five uncoached sessions, voluntary return and live AI conversation-quality acceptance remain **pending**. No automated journey is counted as a participant.

## Session instructions

Allow 10–15 minutes for the first session. Give only this prompt:

> Find something you want to help with, or decline it.

Let the participant read and choose without steering them toward a preferred answer. Do not fix a draft for them. Record hesitation, mistaken expectations and the participant's own words. If they become stuck, record where and why before giving assistance; the assisted result does not meet the uncoached completion gate.

After their chosen action, ask:

1. What did you choose, and what changed because of it?
2. Who funded the work? Who was paid, and for what?
3. Did the result actually help anyone? How can you tell?
4. Who owns the index? Does being credited give anyone control over another person's work?
5. Is there anything you would want to do on a further visit?

For the first-reading story, also record who the player believed they were helping, why they chose the park or library, and whether the gathering felt worth arranging. Ask whether optional bread or tea felt useful and whether free attendance was clear. Do not explain these answers for them.

Reopen the same saved town on the next **game** day, using ordinary clock controls. Leaving the browser overnight does not advance this local simulation. Ask the participant what they recognize and what they would do next. Do not promise a reward for returning.

## Session record

Copy this record for each participant. Use anonymous session identifiers; keep personal details outside Git.

| Field                                                | Observation       |
| ---------------------------------------------------- | ----------------- |
| Session                                              | 1 / 2 / 3 / 4 / 5 |
| Evaluation round                                     |                   |
| Date and local timezone                              |                   |
| Exact build                                          |                   |
| Device and browser                                   |                   |
| Input and accessibility settings                     |                   |
| Local-only or AI mode                                |                   |
| AI provider/model and verification receipt, if used  |                   |
| Actual AI replies, local fallbacks and waiting       |                   |
| Starting town day and time                           |                   |
| First action discovered without help                 |                   |
| Chosen contribution or refusal                       |                   |
| Time to decision and result                          |                   |
| Hesitation and any assistance                        |                   |
| Player's explanation of the consequence              |                   |
| Understanding of funding and payment                 |                   |
| Understanding of usefulness and ownership            |                   |
| Understanding of Northern's purpose and chosen venue |                   |
| Reaction to the reading and optional spending        |                   |
| Recognition after reopening                          |                   |
| Voluntary further visit                              |                   |
| Player's words and suggested change                  |                   |
| Defect, if any                                       |                   |

## Decision gate

Within each separately recorded round, four of five participants should make a chosen contribution or refusal and explain its consequence. Four should recognize their own consequence after reopening. At least three should choose another visit without a directed reward. Record the round's dialogue mode, counts and underlying observations; do not combine local-only and AI-enabled counts. Five sessions diagnose a prototype and do not establish retention at scale. These game-loop counts do not replace the AI round's conversation-quality observations.

Any unintended obligation, lost earned payment, unreconciled money, private disclosure or unrecoverable save fails the gate regardless of the counts. Reproduce and fix the defect, then repeat the affected path. Confusing terms need clearer presentation; an uninteresting consequence needs better stakes. Do not solve either by adding more residents or more generated chatter.
