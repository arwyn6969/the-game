# Astra direction review — 11 October 2026

**Subsequent economic amendment:** Arwyn asked where value originates, when money is created or invested, where it flows and who keeps fair accounts. Astra reconsidered the scope: include paid, budgeted contributions and a deterministic ledger in the first shared project; defer only the generic job system. The [economic design](../design/economy-and-fair-contribution.md) supersedes the deferral of all paid work below. The original review is retained as the decision record.

**Decision: make a town where solving a small shared problem changes how people work with you.** The player is a resident and collaborator. Kevin World contributes differing expertise, disagreement and withdrawal to that experience. Keep the five residents; give their existing relationships something concrete to act upon.

## Evidence and provenance

I inspected the clean checkout `review/astra-source`, branch `codex/astra-direction-review`, HEAD `433bcb96eb21b51bfa296e42ad34e2eba319b720`, remote `https://github.com/arwyn6969/the-game.git`. Its difference from main is documentation only. Read: project instructions, collaboration, baseline, release, roadmap, Astra brief, playability review, Kevin World notes and the relevant game/UI/gateway code.

The coordinating reviewer verified GitHub state during this review:

- PR #4 merged; main/code baseline `88f5039ab5743c3b6370a64b2e6d88a7de128da0`.
- PR #5 open draft, documentation head `433bcb96eb21b51bfa296e42ad34e2eba319b720`.
- PR #6 open draft, `12e8358d0d869f8a7c25387ee39cbc815d9bf284`; Kevin notes and technology retrieval preference inspected from that branch.
- PR #7 open, unmerged, `2652f719cbe39aee3466b89c8275b2d0afe49d65`; proposed transaction, reply scrolling, reach and save-recovery changes. Independent technical review found remaining consent failures. Treat it as a candidate, not a completed fix.

I did **not** play a browser build. Browser observations below belong to the [earlier source review](2026-10-11-playability.md), including desktop/phone reply visibility and damaged-save replacement. Coordinated synthetic engine probes are identified separately. The coordinating reviewer reran 42 town tests successfully; concurrent Vite optimization emitted `ENOTEMPTY` warnings. Full-suite/build results in [RELEASE.md](../RELEASE.md) are historical, not rerun here. The hosted revision, current hosted behavior, real provider quality and physical-phone behavior remain unknown. Earlier fetched hosted assets omitted specific integrated save fixes; that is not a current deployment identity.

New coordinated checks: the producer's narrow local desktop probe reconfirmed remote conversation, contradictory HUD status and an unanswered work request. The independent PR #7 reviewer tested its actual conversation component with synthetic history on desktop/phone viewports; findings below are that reviewer's observations, not my playthrough.

Reproductions and limitations are recorded in the [coordinated evidence report](2026-10-11-astra-evidence.md).

## Promise and audience

**“We changed this place together, and people remember my part.”** This suits players who enjoy small social mysteries, practical choices and revisiting familiar people. An immediate useful change earns the later return. “I come back because of yesterday” is a good continuity test, but insufficient as a first-session promise.

The proposed work → earn → spend loop is infrastructure, not the strongest demonstration. Current work is attendance accounting, bread has no use, and another currency loop would barely test Kevin World. Keep money meaningful and optional. Do not force a shift before the player can contribute an idea. Remove the misleading work invitation until an actual agreement can be reached.

The strongest alternative rejected is an autonomous panel of 25 specialists producing debates and research. It fits the original think-tank description, but makes the player an audience to largely unverified prose. First prove that two differing contributions change a playable outcome. Broader expertise can then grow around town problems.

**Biggest falsifiable assumption:** players care more about a legible consequence shared with these residents than about generating more conversation. If they understand the consequence but do not want to revisit it, improving memory retrieval or adding residents will not rescue this direction.

## The demonstration: “Three boxes, one usable index”

Everything in this scenario beyond the existing cast/places is **proposed**, not implemented. Use three authored records, one library interaction and two outcome variants. No procedural project generator, new district or inventory system.

**First session, target 10–15 minutes.** Kevin points out that Northern could not find a public record in the library. A nearby action lets the player inspect three mismatched box labels. Arwyn offers a bounded commitment: help make these three records findable for a reading tomorrow. The card names the task, deadline in **game time**, and withdrawal option. The player can ask, accept, say “not today,” or leave. Refusal creates no debt, false promise or trust penalty; Arwyn continues with a smaller provisional index.

On accepting, the player chooses a contribution: compare two conflicting source dates with Arwyn, or test Kevin's suggested reference numbers against the boxes. These are short object actions with readable evidence, not keyword guessing. Arwyn insists an uncertain author stays uncertain. Kevin proposes stable references and keeping the original labels alongside corrections: his technology interest changes the method without replacing his café identity.

Sub offers attractive but overconfident wording for the notice. The player can publish it as certain, label it provisional, or request the source check. Northern tests the finished index. **Immediate payoff:** he retrieves the correct record, or visibly reaches the wrong box and tells you why. The library now has a usable three-entry index or a visibly flagged mistake. The journal records the player's actual contribution and its result.

Failure is recoverable. A rushed attribution requires a correction; Arwyn asks for evidence before using your next claim. Abandoning an accepted test leaves it marked incomplete, and Northern tests it himself. Explicitly withdrawing before the deadline is different from promising and failing to attend. Residents remember facts, not a universal morality score. They never punish time spent away from the app.

**First game week.** Day 2, after reload, Northern names the entry you repaired; on the rushed branch, he brings the failed lookup. Day 3, Baba offers a dated delivery entry that can resolve the discrepancy, exercising her ledger knowledge. Day 4, Sub asks to revise the public wording; the player may refuse authorship without blocking someone else's correction. By days 5–7 the one index has a credited revision or remains explicitly provisional, and Arwyn uses that version in her routine. No additional quest chain is required. Days advance through existing controls, never real-world attendance requirements.

Do not turn Kevin's identity question into a prize for completing chores. Public collaboration can create an earned opportunity to confide later; personal disclosure still needs its own boundary.

## Diagnosis ranked by evidence

| Evidence                                           | Finding and implication                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed source; PR #7 independent probes         | [`offlinePlayer`](../../src/game/offline.ts) infers transactions from words. PR #7 improves selected cases, but `parseMind` → `applyResult` still accepts model-proposed spending on “Do not pay my tab yet.” The technical reviewer reproduced purse 4→2 and a closed debt on that refusal. Offline variants with curly apostrophes and indirect wording also fail. Consent belongs in authoritative actions, not a larger refusal regex.                                   |
| Confirmed source; coordinated baseline probes      | Three work requests followed by eight café hours leave money 4, hours 0, projects empty. [`working/wages`](../../src/game/sim.ts) need a project and schedule that offline dialogue never creates. Constructed eligible states also combine 120 café minutes with 60 grocery minutes into a grocery wage; an unpaid 21:00–24:00 shift loses credit at midnight with no arrears. These last two are engine fixtures, not reachable player journeys. Fix before exposing work. |
| Confirmed source; coordinated baseline probe       | At 08:00 a coffee greeting quotes Kevin's private seed. [`compose/quote`](../../src/game/offline.ts) retrieves private internal memories for speech. A resident owning knowledge does not mean they consent to tell everyone.                                                                                                                                                                                                                                                |
| Confirmed source                                   | [`effects.ts`](../../src/game/effects.ts) stores NPC chats only for participants; [`sim.ts`](../../src/game/sim.ts) observations omit the player. [`Project`](../../src/game/types.ts) is mostly status/prose, without deliverables or causal outcomes. These are design gaps preventing visible collaboration.                                                                                                                                                              |
| Confirmed source                                   | Combined dialogue is truncated first in effects and again at 420 characters in [`makeMemory`](../../src/game/memory.ts). Protected folded memories retain only a sliced concatenation, not reliable facts. New commitments and receipts must survive independently of prose compression.                                                                                                                                                                                     |
| Prior browser report; new independent PR #7 checks | PR #7's scroll-to-bottom can hide the newest reply above accumulated favor history at both viewports. Its recovery textarea truncates above 200,000 characters but suggests manual copying after clipboard failure. Require latest-chat anchoring and a byte-complete raw download before destructive replacement. Reach/status improvements still need full journey verification.                                                                                           |
| Confirmed source                                   | [`runMind`](../../src/components/town/TownApp.tsx) blocks walking and time during requests; its town-reference check protects imported saves and its draft helper preserves newer input. Preserve those protections when removing the freeze. [`mind.functions.ts`](../../src/lib/mind.functions.ts) has a shared process-local allowance, caller-supplied context and key-presence availability. Provider/service guarantees are unproved.                                  |

An additional authorship problem: the simulation writes “I missed Hobbs” at noon regardless of whether the player chose that appointment. Remove such invented obligations from the demonstration. Likewise, a model's relationship delta must not decide that the player reciprocates affection or accepted a promise.

PR #6's capped 0.25 technology bonus is a reasonable, small attention preference. It preserves other memories and requires no save migration. It is not technical competence or proven dialogue improvement, and it does not fix disclosure. Keep it optional to this milestone. Add contextual interests only when observed project conversations repeatedly choose irrelevant memories; compare selection with and without an active-project signal before introducing dynamic personalities or embeddings.

## Smallest coherent implementation

Use one additive action layer; retain existing entry points. UI buttons submit explicit commands. Free text and models may propose an offer, explain, or request clarification. They cannot accept a player obligation or execute a payment on the player's behalf.

An offer binds issuer, recipient, terms, target, revision and expiry. Acceptance validates current place, eligibility and state, then produces a commitment. A commitment owns its progress and completion/failure/cancellation, independent of a daily counter. An accepted command creates an idempotent receipt; UI feedback, money/project changes and memories derive from that same validated outcome. Repeated clicks/retries must not reapply it. Rejections show a reason and change no substantive state.

Store new structured state as an optional, validated v1 extension in an **explicit integration pass**, after lane contracts are agreed; do not smuggle it into text fields or change frozen exported signatures during parallel work. Default absent fields for old towns. Keep commitments and outcome records through export/import and memory compression. Preserve existing identities, memories and debts. Check malformed extension data without silently replacing its town.

Events need separate internal and public projections. Participants receive only what was said or done; nearby witnesses receive only audible/public content, using place, range and visibility at the event time. A notice is learned when read. Never copy an entire NPC prompt, private reflection or hidden thread into a witness journal. A public action receipt can change a relationship on one side; it does not assert the player's feelings.

Rules determine evidence availability, acceptance, payment, attendance, attribution, lookup success and consequences. Models may phrase a grounded response or suggest a nonbinding interpretation. Supply only shareable material to speech generation. Missing AI uses brief authored responses. Slow ambient jobs use captured context/revision, cancellation and revalidation; walking continues, stale results cannot mutate an imported town, and newer drafts survive. The demo needs no paid calls.

## Three implementation packets

### 1. Trustworthy choices and recovery

**Benefit:** questions stay questions, answers are readable, existing progress is safe. **Depends on:** review PR #7 against its exact head; reuse accepted fixes, avoid a competing UI patch. Sol owns authoritative effects/save contracts; Grok owns interaction presentation.

**Areas:** `offline.ts`, `prompt.ts`, `effects.ts`, `save.ts`, `TownApp.tsx`, `talk.ts`, relevant regression/browser checks. Add explicit purchase/payment offers and authoritative acceptance; filter private material from ordinary replies. Finish scroll/reach/status/load recovery.

**Proof:** the earlier refusal/inquiry corpus plus curly apostrophes and proposed model effects leave balances/obligations unchanged. One accepted action applies once; wrong-person, expired and repeated actions fail safely. Malformed/unavailable storage offers recovery without overwriting bytes; clipboard failure still permits a complete large raw backup. Latest replies remain readable with long favor history while older-history browsing is preserved. Casual coffee requests disclose no seed. **Failure risks:** guarding only offline text, dishonest “paid” prose after a rejected action, recovery that overwrites on the next autosave. **Stop:** trustworthy existing interactions; no shared-project machinery yet.

### 2. One contribution with an immediate consequence

**Benefit:** the player can improve one place with residents. **Depends on:** packet 1; agreed optional v1 contract. **Areas:** additive action/project/event helpers in `src/game`, `types.ts`, `save.ts`, `offline.ts`, `sim.ts`; `TownApp.tsx`, `render.ts`, styles and one library interaction.

Implement the three-box scenario, explicit commitment/withdrawal, two expertise contributions, Sub's wording choice, Northern's lookup and persistent result. Existing money is unnecessary; remove the unreachable shift tutorial. Include participant/witness projections and a compact “What I agreed” journal.

**Proof:** complete both successful and rushed paths through normal controls without a key. Decline/withdraw produce their distinct outcomes. Duplicate actions do not duplicate credit. Reload halfway and after completion; import an older town; preserve results through a game-day transition. Nearby witnesses remember the public lookup, distant residents do not acquire it magically. **Failure risks:** multiple prose copies disagreeing, a forced choice disguised as refusal, endless waiting, expertise changing only dialogue. **Stop:** three records, two outcome variants, one immediate visible change and one next-day acknowledgment. No general quest engine.

### 3. Return, measure and release

**Benefit:** the same town remains responsive and its consequences stay legible. **Depends on:** packet 2 passing journey checks. **Areas:** `TownApp.tsx` job orchestration, `sim.ts`, memory/save regression scenarios, browser harness, build identity and `docs/RELEASE.md`.

Finish the bounded first-week correction/credit states; remove invented appointments. Prioritize player interaction, allow walking through delayed ambient jobs, and validate stale results. Test day-5/day-30 saves and all project states. Do not bundle a new shift economy or provider migration.

**Proof:** delayed/missing/rejected AI leaves useful controls; no late response crosses towns, overwrites drafts or repeats an action. Review at 1280×800 and 390×844 plus physical-phone keyboard/touch: movement, nearby interaction, scrolling, pause/speed, reload, import/export and recovery. **Failure risks:** async races, journals exposing secrets, effects disappearing after compression, calling source “live.” **Stop:** identified candidate, playtest evidence, then separately authorized hosted publication and verification; do not claim release completion without access.

## Disproof test and handoff

Give five fresh players a 15-minute uncoached session, split desktop/phone, then reopen their saved town on the next **game day**. Prompt only “Find something you want to help with, or decline it.” Observe time to first chosen action, hesitations, refusals and recovery. Afterward ask what changed, whose contribution mattered, and what they want to check next.

Require four of five to perform a chosen action and explain its visible consequence; four to recognize their own consequence after reopening; at least three to choose an optional further visit without being directed to a reward. These are diagnostic thresholds, not retention statistics. If people cannot explain causality, fix feedback. If they can but remain indifferent, revise the problem and stakes before expanding. Any unintended obligation or secret disclosure blocks release regardless of enthusiasm. Record quotes and a timestamped confusion example, not just completion counts.

The release handoff names exact base/head, included PRs, actual checks, browser evidence and remaining limits. Export current hosted source for rollback and back up real towns outside Git. The existing Grok publishing session must apply the tested commit without changing host/auth/secrets. Verify its visible build ID and repeat the journey, old-save import and reload on `thegame.grok.me`. A GitHub merge is not that verification.

After this test, useful paid work merits a separate packet with employer-bound attendance and persistent arrears; make one purchase useful without inventing hunger. Cross-device saves follow the first trustworthy day: per-person isolation, offline cache, explicit conflicts and two-tab protection. Add another specialist only for a new playable disagreement. Trial another provider only against measured dialogue weaknesses, with enforced caller/total budgets and fallback; changing providers cannot repair these rules.
