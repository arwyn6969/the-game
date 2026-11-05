# Player-visible library learning history

5 November 2026. Sole core/UI owner: this Codex chat. Implementation source is
`e0e2b5c` on `codex/resident-growth` in `a02-economy/`. Started clean at
`a2d0c86a68e2f43dd32df5dc15069a8371915f38`, retaining the explicitly required
`0186b964a0590511b301d91fe0c9605872feb9fa` implementation. Fetched main was
`c49facc52136cfda0270627e3e6aef51f5ab4588`, including PR #71; it was inspected,
not merged into this stacked local packet. The `product/` and `a01-replay/`
checkouts were not changed.

## Player outcome

The ordinary character card's Overview now has **Learning you've seen**.
A chronological list shows a failed independent lookup, an evidence-supported
index correction ready to try, and Arwyn's successful lookup of the different
Hobbs equipment record. Its last known state distinguishes **Ready to try**,
**Observed a test** and **Demonstrated once**. The result explicitly covers one
lookup, not general mastery. Other residents use the same component; Data's
observed result cannot become his own demonstration, and no shared evidence
produces a calm empty state.

Missing later evidence leaves the visible history at the correction. A known
later lookup alone is described as a successful lookup, without inventing an
earlier method change or motive. Replay hides the entire section. Internal keys
are React keys only, never rendered text, labels or attributes.

## Evidence and privacy contract

- `src/game/community.ts` adds `publicLibraryLearningEvents`, which validates the
  existing trial and intersects the resident's actual event audience with the
  player's. An alternative read receipt must be a non-secret observation with
  event source, exactly matching an actual saved event, dated no earlier than
  that event and no later than the current town. Chat, reflection and
  posted-but-unread notices do not establish knowledge.
- `src/game/learning.ts` adds the pure `publicLearningHistory` projection. It
  derives its stages from shared evidence, independently of the private
  `learningContext` prompt's final status. Full private knowledge cannot leak a
  hidden stage, date, summary or count through this projection.
- Dates are those of the supporting shared event. For example, when Arwyn learns
  of the original failure through the next-day report, the row uses that report's
  date. It does not backdate a resident's receipt to the earlier search or use the
  current clock. Original failed-search, correction and reuse records stay intact.
- `CharacterLearning` in `src/components/town/CharacterSocial.tsx` is mounted in
  the ordinary Overview in `TownApp.tsx`; CSS changes are scoped to its list.
  Viewing it, following a resident and Watch mode do not write knowledge.
- The existing prompt contract, save schema, balances, trial safeguards, providers
  and cast remain unchanged. This exposes one authored, engine-guided library
  trial; it does not add autonomous invention, research or general learning.

## Validation

All gates used the verified Node **24.22.1** binary and existing lockfile/dependencies.
Gates ran on the working source tree subsequently committed as `e0e2b5c`.
No game or component files changed after those gates; browser-harness fixes
and this receipt followed. The final browser harness also passed targeted ESLint.

| Check                                        | Result                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five focused resident files                  | 39 pass, including 12 new public-history cases                                                                                                     |
| `npm run typecheck`                          | Pass                                                                                                                                               |
| `npm run lint`                               | Zero errors; one inherited unused-disable warning in `src/lib/auth/use-current-user.ts`                                                            |
| `npm run test:town`                          | 523 pass                                                                                                                                           |
| `npm test`                                   | 1,218 script + 55 typed tests pass; town cases overlap                                                                                             |
| `npm run diagnose:town`                      | Completed; observations are not a release verdict                                                                                                  |
| `npm run build`                              | Pass; auth explicitly enabled, empty credential environment, no `.env*` or `.grok/app-env.json`; migrations explicitly skip without `DATABASE_URL` |
| `node scripts/resident-learning-browser.mjs` | Both 1280×800 and 390×844 built Chromium journeys pass                                                                                             |
| `git diff --check`                           | Clean                                                                                                                                              |

The initial sandbox denied the local browser's loopback listener. The browser and
full suite then ran with normal local-listener escalation; tests were not changed
to bypass the restriction. Early browser runs corrected harness assumptions:
replay closes the card on return, focus and saves settle asynchronously, a free
movement tile is required, and touch uses the established 100 ms press pattern.
No runtime control change was needed.

Source cases cover fresh/version-1 towns, all evidence subsets, both audience
directions, personal versus observed demonstration, real matching read receipts,
chat/reflection/notice rejection, premature/future/secret receipts, purity,
portable continuity, duplicate events, unsupported corrections and corrupt trial
chronology. The real-action fixture was extracted from the inherited learning
tests and reused; result events are not mocked.

Both browser sizes import disposable towns created with those real game actions,
then assert the **built React component** against the **current source helper**.
Each size checks seven visible evidence states, Data's observation, keyboard
expansion, Watch privacy, DOM text and accessibility names, no horizontal overflow,
replay hiding, local conversation, movement, pause, export/import and reload.
The phone additionally proves an actual CDP touch swipe scrolls the history and
touch movement changes the player tile. Original economy records, balances and
one reuse event survive the portable round trip. Browser errors and inference
requests are both zero.

[Machine-readable checks](checks.json), [browser report](browser-results.json)
and [migration/build tail](build-tail.txt) retain the results. All 23 successful
journey screenshots are retained beside this record. Representative views:
[desktop history](desktop-demonstration.png),
[desktop result](desktop-demonstration-result.png),
[phone complete result](phone-demonstration-result.png),
[phone touch scroll](phone-history-scrolled.png),
[phone empty state](phone-absent.png), [observed result](phone-observed.png),
[replay](phone-replay.png) and [reload](phone-reloaded.png).

## Limits and next outcome

This is local synthetic/offline validation. Human enjoyment, an ordinary human
playthrough, physical phones, screen readers, other browser engines and live
providers were not tested. The built-in phone skin has an inherited layout
limitation while following: the following button can squeeze the resident strip.
The tested ordinary route uses **Return to me** before reopening the card;
Watch remains enabled, confirmed by the visible reflection-section control. The
strip layout itself was not changed or qualified for direct pointer access while
following. No upload, main integration, publication, paid inference or production
access occurred. Integration with fetched main/F1 is separate.

The one next outcome is an ordinary-player playthrough in which the player can
explain the failure, the correction and the limited evidence of transfer.

### Ordinary-player checklist — not yet performed by a human

1. In a disposable local town, prepare the library index with the wrong room-access
   mapping, let Northern test it, and hear Arwyn review the failed search report.
2. Open Arwyn's card → Overview → **Learning you've seen**. Identify the failed
   search and its date. Complete the supported correction; confirm **Ready to try**.
3. Later, witness Arwyn check the Hobbs equipment record at the library. Confirm
   **Demonstrated once** and explain why that one result is not general mastery.
4. Compare Data's witnessed history with an absent resident's empty history. Miss
   the later trial in another disposable town; the card should remain at the last
   event you actually received, even in Watch mode. Replay should hide the section.
5. On desktop and phone, expand with the keyboard or touch, scroll, talk, walk and
   pause. Download, reimport and reload; confirm the same dated rows and balances.
   Report any confusing copy or inaccessible control and whether the sequence gave
   you a reason to return.
