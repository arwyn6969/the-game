# Evidence for the Astra direction review

Review date: 11 October 2026. These observations support the [Astra decision memo](2026-10-11-astra-direction.md). No production town, provider key or live database was used. No gameplay fix or hosted publication is claimed.

## Revisions and review roles

The canonical repository is `arwyn6969/the-game`. Main's game code was `88f5039ab5743c3b6370a64b2e6d88a7de128da0`. The review checkout started at PR #5's documentation-only head `433bcb96eb21b51bfa296e42ad34e2eba319b720`, on local branch `codex/astra-direction-review`. Its new documents do not change that game baseline.

A delegated **GPT-6 Astra** reviewer, with high reasoning, inspected the brief, original Kevin World notes and source and wrote the decision memo. A separate technical reviewer examined PR #7 at `2652f719cbe39aee3466b89c8275b2d0afe49d65`. The coordinating reviewer reproduced baseline engine behavior and a narrow local desktop interaction. These were collaborators on this review; existing local/cloud chats were not messaged or claimed synchronized.

GitHub readback during review showed PR #5 open/draft, PR #6 open/draft at `12e8358d0d869f8a7c25387ee39cbc815d9bf284`, and PR #7 open/unmerged. PR #6 was not included in either tested code baseline.

## PR 7 still needs four corrections

### Player consent must govern both reply paths

PR #7's offline checks at [offline.ts:575](https://github.com/arwyn6969/the-game/blob/2652f719cbe39aee3466b89c8275b2d0afe49d65/src/game/offline.ts#L575) cover selected wording, while the model path still accepts a proposed `favor` through `parseMind` and `applyResult` without binding it to an accepted player action.

Exact-head synthetic probes reproduced:

| Input and path                                                                   | Observed state change                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Model proposes a purchase after “Do you sell bread?” or “I do not want bread.”   | An owed debt of 2 is created.                                             |
| Model proposes repayment after “Do not pay my tab yet.” or “Can I pay tomorrow?” | Player 4→2, Baba 9→11, owed debt becomes paid.                            |
| Offline “I won’t pay my tab.” or “I don’t want to pay you.”                      | Curly apostrophes bypass the refusal guard; repayment occurs.             |
| Offline “You should pay me for the bread.”                                       | Money moves from player to Baba despite the opposite direction expressed. |
| Offline “Tell me about bread on a tab.”                                          | A debt opens from an information request.                                 |

The online probes supply synthetic model JSON; they establish what the rules permit, not the likelihood of a real provider producing it. Fix at the authoritative action boundary. Verify all these inputs preserve substantive state, then confirm that an explicit acceptance applies once and a rejected proposal cannot still announce “Paid.”

### Following replies scrolls past the reply

At [TownApp.tsx:1369](https://github.com/arwyn6969/the-game/blob/2652f719cbe39aee3466b89c8275b2d0afe49d65/src/components/town/TownApp.tsx#L1369), automatic following moves to the bottom of the entire conversation body. Favor history appears after chat in that same scrolling area.

The technical reviewer rendered the unchanged PR #7 `TownApp` in a local browser fixture with an offline gateway stub. With eight synthetic chats and four paid bread debts at 390×844, the newest reply occupied y=316.95–396.95 while the visible body began at y=437.95: the answer was completely above the viewport. “Newest” was absent because following remained active. Twelve favor entries reproduced the problem at both 1280×800 and 390×844. Four entries remained readable on desktop, showing why the phone case matters.

Anchor following and the Newest control to the latest chat element, or separate chat scrolling from commitments. Check empty and long favor histories, the inspector, new replies and deliberate reading of older messages.

### Recovery must offer the complete original data

[TownApp.tsx:788](https://github.com/arwyn6969/the-game/blob/2652f719cbe39aee3466b89c8275b2d0afe49d65/src/components/town/TownApp.tsx#L788) truncates the recovery textarea after 200,000 characters. Successful clipboard copying uses the full string, but its failure message at line 801 tells the player to copy the truncated textarea before starting over. A large town can therefore lose its only complete copy after following that fallback.

Source inspection and a browser fixture confirm the truncation: a 250,001-character malformed save remained intact initially, but after clipboard rejection the field contained only 200,002 characters (the prefix plus newline and ellipsis), alongside the manual-copy instruction. Provide a byte-complete raw download, explicitly label any preview truncation, and handle an absent clipboard as well as a rejected clipboard call. Compare backup bytes exactly before replacement. Starting a new town must remain an explicit choice.

### Restoring a paused town must preserve its clock state

The recovery import at [TownApp.tsx:843](https://github.com/arwyn6969/the-game/blob/2652f719cbe39aee3466b89c8275b2d0afe49d65/src/components/town/TownApp.tsx#L843) omits the speed/hint initialization used by ordinary import at line 1197. In the same isolated browser fixture, recovering a paused 07:00 backup activated 1× and advanced to 07:02 after 2.3 seconds. Share the import initialization and verify that paused and running backups preserve their intended time state in both paths.

## Baseline engine observations

The coordinating reviewer ran synthetic offline probes against main's code through Vite's module loader:

- At 08:00, `Good morning. Can I have coffee?` quotes the beginning of Kevin's private identity seed. Source: [offline.ts:243](https://github.com/arwyn6969/the-game/blob/88f5039ab5743c3b6370a64b2e6d88a7de128da0/src/game/offline.ts#L243). Owning a memory and choosing to disclose it need distinct rules.
- Three work requests followed by eight game hours with the player placed in the café produce money 4, `shiftHours: 0`, and no projects. A normal request cannot create the prerequisites for existing wage accounting.
- In a constructed eligible fixture, 120 café minutes followed by 60 grocery minutes yield a grocery wage of 4 because both use one `shiftHours` counter. This is a prospective player-work contract problem, not evidence of a currently reachable work journey.
- In another constructed fixture, a 21:00–24:00 café shift with an empty till leaves the player unpaid at midnight, clears hours to zero, replenishes the till to 12, and creates no payable arrears. Only a “cannot pay” memory remains. Source: [wages](https://github.com/arwyn6969/the-game/blob/88f5039ab5743c3b6370a64b2e6d88a7de128da0/src/game/sim.ts#L175) and [midnight reset](https://github.com/arwyn6969/the-game/blob/88f5039ab5743c3b6370a64b2e6d88a7de128da0/src/game/sim.ts#L313).

The last two cases constrain a future work feature. They do not justify adding a larger wage system to the first shared-project demonstration.

## Browser and test scope

The coordinating reviewer opened the pinned baseline locally at a 1422×798 desktop viewport, entered a synthetic town, clicked Kevin across the plaza and submitted `Can I work a shift at Hobbs?` using the normal composer. The HUD simultaneously said Plaza and “asleep in the last townhouse.” Kevin returned unrelated open-thread/private-counter prose; the commitment section remained empty. This was a narrow interaction check, not a complete walking journey or hosted playtest.

- Locked dependencies installed using Node 24 and `npm ci --offline --no-audit --no-fund`.
- Baseline `npm run test:town`: **42 passed, zero failed or skipped**. Concurrent Vite dependency optimization emitted `ENOTEMPTY` errors even though the command exited 0; this harness issue remains visible.
- PR #7 focused regression/player test files: **45 passed, zero failed**, including its new inquiry and scroll-helper assertions. The full PR #7 town command was not rerun by this review; its PR description reports 46 including the separate town-day test.
- Full-suite, lint and build results in earlier release/PR descriptions were not rerun here and remain historical reports.
- PR #7 browser fixtures used synthetic state and a stubbed gateway, not the full hosted service. No physical phone or real AI request was tested.
- A fresh web-tool request to the hosted address was inaccessible. Current publication identity and behavior remain unverified; the earlier asset findings remain dated observations.

Local probe scripts, synthetic outputs and screenshots are retained outside the tracked deliverable under ignored `artifacts/astra-review` and the reviewer's temporary fixture. No real player saves are included in these documents.
