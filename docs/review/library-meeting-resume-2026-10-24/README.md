# Same live library meeting: validation and opt-in delivery

The same saved Arwyn-facilitated meeting resumed successfully after a locally verified prompt correction. Arwyn and Sub independently chose **listen**; Northern's earlier decline remained unchanged. Since neither opted to speak and the ordinary scheduler had no further NPC job, one explicitly labelled **player-authored** line tested delivery. Exactly Arwyn and Sub received it. The same meeting is left paused, with the player's listening off and no pending request.

This is bounded real-AI attention and player-speech delivery evidence. It does not qualify AI-generated meeting speech, uninterrupted group discussion, late-join delivery or speech after stopping listening.

## Diagnosis and correction

The original fourth request returned HTTP 200 but failed provider-output format validation before engine commitment. Its 1,240 tokens remain charged. The original response body was not retained; historical Cloudflare telemetry could not be retrieved with the existing CLI permission. Consequently its exact invalid syntax or field is **unknown**. No expanded logging permissions or raw response capture was introduced.

The saved job's three legal attention choices all passed both strict parsers locally. The prompt now gives a complete valid JSON envelope for **every currently offered choice**, and speech guidance only when speech is offered. Regression coverage reproduces the pre-failure job, accepts each offered choice and rejects extra fields. Validators, legal choices, scheduling and audience rules were preserved. This corrects incomplete output guidance; it is not proof of the historical response's exact defect.

## Verified publication

| Item | Reference |
| --- | --- |
| Runtime source | `a7ca408b1b128aae53c21d36c9a527fc485a576f` |
| Source integration | [PR #49](https://github.com/arwyn6969/the-game/pull/49), merged as `6f890add7968002a59aee3ebd506f7f6129479cd` |
| Current runtime Verify | [40042407847: passed](https://github.com/arwyn6969/the-game/actions/runs/40042407847) |
| Live game | https://www.arwyn.party/thegame/ |
| Production Worker version | `c66bb68a-7c96-414a-9a38-72e2d62766e9`, tag `a7ca408b1b12` |
| Immediate rollback version | `722e5658-356d-4c82-baf1-7e70f1c1163c` |
| Preserved dependencies | Interface `7949f01`, atomic UI test correction `a527a53`, manuscript main `4aaf8bd` |

Node 24 local checks passed 1,053 script + 55 typed tests, 415 town tests, typecheck, lint (zero errors; one inherited warning), diagnostics and both credential-free builds. The Node build skipped database migration. Final full runtime CI passed all checks, including browser meeting/manuscript, delayed AI, accessibility, stamp/wallet journeys and both builds.

Verification also exposed a narrow fallback-font interface overflow inherited from the interface prerequisite. A bounded two-column character-tab grid at widths up to 360px preserves every label and 44px target. Actual local 320px, 390px, 1280px, all four appearances and a 14px monospace stress view passed. No assertions were removed. The atomic geometry correction is the interface owner's exact test-only fix.

Public CSS/JavaScript bytes matched the clean output; mounted privacy, anonymous session, PWA manifest and homepage checks passed. Publication used existing bindings and variables. No database migration, secret upload, routing change, monetary change or AI limit increase was made.

## Actual continuation and delivery

The saved town was byte-identical before the fix, immediately before publication and after release reload. Earlier choices and all original memory records remained intact.

| Step | Actual action | Result |
| --- | --- | --- |
| Request 5, 00:12:17.888 UTC | Arwyn chose `listen` | Valid response, 1,313 tokens |
| Request 6, 00:13:02.708 UTC | Sub chose `listen` | Valid response, 1,308 tokens |
| Normal scheduler | No NPC had an offered next job | No NPC speech or floor was forced |
| Player UI | Joined as speaker and said one labelled test line | One actual `mind: player` statement |
| Cleanup | Player stopped listening; meeting decisions paused | No pending job; saved state survived an actual reload |

The player line was: “Observer test line: listening to this library meeting is a choice.” Its committed recipients were exactly Arwyn and Sub. Both gained a complete attributed statement memory; the player retained their own statement. Northern, the nearby bystander and the other residents gained no words or memories from it. All eight scoped knowledge projections matched. Independent audits verified the exact core audience helper, actual exports, unchanged finances/identities/time, original memory preservation and final reload. Reload only supplied existing false `seed`/`protected` defaults on the three new memories.

## Usage and limits

| Scope | Requests | Known tokens | Failures | Charged USD |
| --- | ---: | ---: | ---: | ---: |
| Original saved run | 4 | 4,927 | 1 format rejection | 0 |
| This continuation | 2 | 2,621 | 0 | 0 |
| Same meeting cumulative | 6 | 7,548 | 1 historical | 0 |

Production SQL confirmed all six requests completed, both new attempts were `ok`/HTTP 200, and no budget/pool request remained live. The browser recorded 3,242ms additional AI wait (15,383ms cumulative); server provider latencies were 904ms and 830ms. These measure different portions of the request path. The provider counter moved from 0 to 2 requests on 24 October, with $0 daily usage and exact configured model pricing of zero. Midnight did **not** refresh the user's original twelve-call authorization: four prior + two new leaves six unused. A premature local spacing check rejected before a click or request and consumed no call.

The existing free-only `nvidia/nemotron-3-ultra-550b-a55b:free` route remains. Limits stay 24 shared calls per rolling day, 12/player/day, 3/player/minute, two/minute provider pacing, one global concurrent request, `backgroundConcurrent: 0`, `actionConcurrent: 1`, existing interactive reserves and zero monetary tariffs/ceilings. No automatic retry, paid fallback, ledger reset, forced choice or extra generation occurred.

The filtered post-deploy tail received a live frame but captured zero normalized rejection summaries. This is not the success evidence: actual exports, parser checks, independent audits and server accounting establish the outcome. The tail was stopped cleanly.

## Evidence and recovery

The [sanitized receipt](receipt.json) records the bounded result. Raw towns, private memories, provider/SQL receipts and screenshots remain in ignored `artifacts/library-meeting-live-20261023-resume/`; none is committed. The original inconclusive run remains separately preserved in [draft PR #48](https://github.com/arwyn6969/the-game/pull/48).

For runtime recovery, restore the immediate previous Worker version above through the established Wrangler rollback procedure and verify existing bindings. Preserve the database and browser save. Source recovery is a normal revert PR, not a history rewrite. No rollback was performed.
