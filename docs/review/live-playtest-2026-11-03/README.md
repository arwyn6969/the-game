# Publication and live playtest — 3 November 2026

Both authorized fixes are published at [the game](https://www.arwyn.party/thegame/).
PR #69 merged as `6079050`; PR #70 merged as `49cf76f2236f12ff79b092f4e1df84e13f9b5a42`.
[Verify 41616048834](https://github.com/arwyn6969/the-game/actions/runs/41616048834)
passed every step at `2ea974be7097dff44cbd92daef0db566e79fe750`. Its tree exactly
matches the merged source (`b1028d2353a96c3a44d71c927a1e2c5083be7a3a`). The runtime
was built from that verified candidate in an isolated copy containing only tracked
source and the locked dependencies, without private environment files.

Production Worker: `6bf8d2d2-68ca-4624-8611-67b2c0f18531`.
Rollback Worker: `c4098113-6b5c-43db-8ff4-b39d64e2eb72`.
[Release receipt](release.json), [source qualification](source-qualification.json)
and [public checks](public-release-check.json) record four matching asset hashes,
eight endpoint checks and seven redirects. Fresh before/predeploy/after private
control-plane snapshots confirm all 18 binding definitions/values, seven secret
definitions, runtime settings and 52 routes are unchanged. No secret values were
retrieved or changed. No database migration, budget change or wallet transaction
was performed. Publication itself used no model call.

The existing cached Wrangler 4.151.3 passed a dry run. Deployment retained variables
with `--keep-vars`; see the [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy).
The first PR #70 CI failure was the café test selecting Hour by its former tooltip.
The check now selects the accessible Hour button and waits for `aria-busy=false`.
Its full eight café checks pass on both emulated sizes locally and in current CI.
No accounting assertion was removed.

## Actual play

In the in-app browser, the independent Observer town survived the production
update at Day 2 23:50 with four coins, the manuscript and old history intact.
Old manuscript speech now says [Arwyn spoke](live-speech-fixed.png), with one set
of controls. The stopped-trial notice leaves the global strip and Arwyn remains
the selected invitation recipient.

Ordinary UI play completed the source check, its two-coin payment, Kevin's
reference report, the submitted index, a direct lookup and Northern's paid
independent walking/search. Baba's dated note arrived after midnight. Guests
walked to the library and the player [joined the reading](reading-complete.png).
A [fresh hosted Arwyn reply](fresh-ai-reading-recall.png) recalled the actual
first-page line and Northern's hands steadying. It succeeded without a timeout;
no browser warnings or errors were observed.

The player then walked to Kevin, accepted one funded café shift and enabled the
pilot. Reload retained the completed reading, six-coin balance, pilot state and
0/180 shift minutes with all five wage coins reserved. No serving was started.

## Findings for the next fix

1. **P2 — Shared activities are absent from relationship history.** After the
   attended reading, Arwyn's Overview says [No shared history yet](reading-shared-history-missing.png).
   Sub [still says so after reload](reading-history-missing-after-reload.png).
   Arwyn's successful reply proves the reading is available to his context.
   `CharacterOverview` treats only direct chat as known; Together also lists only
   direct chats. Recognize the witnessed shared activity without inventing
   dialogue or increasing rapport automatically.
2. **P2 — Other people's commitments appear in resident cards.** Accept Kevin's
   café shift, then open Arwyn → Together. What is still open includes the café
   [attendance commitment](unrelated-commitment-arwyn.png). The view maps all open player projects, ignoring the
   selected resident. Scope relationship commitments and retain global work in
   the player journal.
3. **P3 — Café activation contradicts the existing shift.** Accept Kevin's shift
   before starting the café trial. The [activation message](cafe-start-contradicts-shift.png)
   says the player has not accepted a shift while that panel shows the reserved
   shift. Its five coins and the player balance remain correct through reload.
   Change the unconditional feedback to describe activation accurately.

[Machine-readable reproductions and source locations](findings.json).
These findings are recorded, not implemented. This was live desktop play plus
passing emulated desktop/phone CI. Physical-device play, live café ordering,
full/overnight shifts, provider outages and multi-player acceptance remain open.
