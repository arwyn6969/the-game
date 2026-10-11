# THE GAME: a stronger town and a route to Kevin World

Proposed producer plan, updated after the independent Astra review on 11 October 2026. This is a direction for implementation and playtesting, not a record of completed features or a promise of a measured tenfold improvement. Read the [completed Astra decision memo](reviews/2026-10-11-astra-direction.md), its [new evidence](reviews/2026-10-11-astra-evidence.md), and the earlier [playability review](reviews/2026-10-11-playability.md). The [Astra brief](prompts/ASTRA.md) remains the assignment record.

**Recommended next proof: one small library project that changes how residents work with the player.** Give three records a usable index, let residents contribute different expertise, show an immediate successful or failed lookup, and remember the player's part tomorrow. Paid work remains useful follow-on work; it is not a prerequisite for testing this direction. Astra's three packets—trustworthy choices, one consequential contribution, then return/playtest/release—set the order below.

## The experience we want

**“I come back because of what I did yesterday.”**

The player lives in a small community, makes commitments, contributes to projects and sees people respond. Residents' expertise gives them a reason to notice different things, disagree and help one another. Their work becomes visible in the town: a repaired object, a changed routine, an unfinished promise, a public notice or a story someone remembers.

This connects the current pixel town to Arwyn's original Kevin World think-tank idea. The present cast and personal history remain the starting point. The original proposed 25 residents are a future expansion, to be introduced when each brings a new relationship, activity or problem worth playing.

An illustrative future project could involve Kevin and Arwyn repairing a broken library catalogue: his technology interest meets her interest in records, the player can contribute or decline, and success changes what the library offers. That project is a design example, not an implemented feature. Expertise should affect what people do together as well as what they say.

## What “10×” would look like in play

| Today’s verified limitation                                               | Desired experience                                                               | Evidence we need                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A question about bread can open a debt; a refusal to pay can spend money. | An offer is clear, and the player chooses whether to accept.                     | Inquiries and refusals preserve state; accepted actions apply once and survive reload.                |
| Asking for work cannot establish the advertised offline shift.            | A player accepts work, sees its terms, attends and receives earned pay.          | Complete the journey through normal controls without a key, including declining or leaving.           |
| A phone reply can be below the visible conversation history.              | An exchange is readable and responsive.                                          | New replies stay visible while following the conversation; reading older messages preserves position. |
| A purchased tab has no useful item effect; scenery offers few actions.    | Places give the player small, meaningful choices.                                | Demonstrate one useful purchase and one object or project action with a visible consequence.          |
| Nearby public activity is absent from the player’s journal.               | The player can follow a community story and ask about what they witnessed.       | Witnessed events can be recalled; distant and private events remain private.                          |
| Much of NPC continuity is visible mainly through inspection.              | Yesterday’s promise or contribution changes tomorrow’s conversation or behavior. | A fulfilled or broken commitment is acknowledged after reload and a day transition.                   |
| Source and the hosted site differ.                                        | Everyone plays the same identified release.                                      | Verify the hosted build identifier and repeat the playable journey on that build.                     |

The improvement is a connected experience: **choice → action → visible consequence → memory → a different tomorrow**. More characters and richer language can grow around that loop.

## Delivery sequence

| Stage                                      | Work                                                                                                                                                                                                                                                                      | Exit condition                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Bring the project together              | Review the existing documentation and retrieval PRs; agree on a source revision; give the local and cloud chats the same brief and ownership. Record source, preview and published revisions separately.                                                                  | Each active chat reports its actual checkout, branch and head. One shared roadmap identifies the next change.                                                                   |
| 1. Make interactions trustworthy           | Correct transaction intent, newest-reply visibility, unreadable-save recovery and misleading status/debt labels. Deliver small PRs with focused acceptance cases.                                                                                                         | The reproduced inquiries cannot spend money, replies are visible and a damaged save has a recovery path.                                                                        |
| 2. Complete one consequential contribution | Build the three-record library index: explicit commitment or refusal, two expertise contributions, an immediate lookup result, a public receipt and next-day acknowledgment. Include one meaningful object action and keep exploration available.                         | A fresh player changes the library through normal controls without a key, explains what their choice did, and finds it preserved after reload and a game-day transition.        |
| 3. Return, measure and release             | Finish the bounded first-week correction and credit states, witness privacy and responsive background jobs. Run the five-player test, then prepare publication through the existing host and verify the exact released build.                                             | Players recognize their consequences and some choose to return; desktop/phone journeys and old-save checks pass on the identified hosted version after authorized publication.  |
| 4. Carry the town and grow its ideas       | Add useful optional paid work with employer-bound attendance, persistent unpaid wages and a purposeful purchase. Add the signed-in person's cross-device save with offline cache and conflict recovery. Trial richer dialogue and new specialists against measured needs. | The first contribution is already compelling; work is reachable and honest, account isolation/recovery works, and each AI or specialist addition improves an observed weakness. |

Astra has completed the independent review. Stage 1 repairs remain the next implementation; the first shared project then tests the revised direction before paid work expands. Account save follows the first playable day, as Arwyn's later note in the review specifies. It keeps each person's town separate.

The first implementation should finish the existing [PR #7](https://github.com/arwyn6969/the-game/pull/7), not duplicate it. Review found that model-proposed payments still bypass player consent, offline variants still transact, reply following can scroll past the answer, and recovery can truncate a manual backup or resume a paused town. Distinguish asking, refusing and explicitly accepting at the authoritative action boundary. Verify full backup bytes and actual chat visibility, not only helper tests. The [Astra packets](reviews/2026-10-11-astra-direction.md#three-implementation-packets) define benefits, file ownership, acceptance cases and stopping points.

## A useful test of the ambition

Start with five fresh players and a short desktop/phone session, followed by reopening their town and observing the next game day. Record where each hesitates, what they believe happened, and whether the game matches that belief. Ask Arwyn to show one confusing moment and one moment worth returning for; the producer translates those examples into the next task.

Proposed diagnostic targets:

- At least four of five players perform a chosen contribution or refusal and explain its visible consequence without being told the controls. Target a 10–15 minute demonstration, then measure actual completion time.
- At least four can explain one consequence of their choice and recognize its acknowledgment on the next game day; at least three choose an optional further visit without being directed to a reward.
- The reproduced inquiry/refusal cases create no transaction, and recovery tests preserve the original save bytes.
- Delayed or missing AI permits movement and useful play; measure response delay rather than describing it as “fast.”
- Each release has a recorded source revision, passing applicable checks and hosted verification.

These small playtests diagnose confusion; they do not establish retention or a tenfold business result. Compare successive builds on the same journey and use the observations to decide the next investment.

## Working as one project

The canonical repository is [arwyn6969/the-game](https://github.com/arwyn6969/the-game). `arwyn6969/THE_GAME` is the older Python simulator. The local project folder and cloud checkout are on separate machines; ordinary Git branches and explicit handoffs connect their work.

- **Arwyn:** creative direction and examples from play. No API key is needed to judge the first-day loop.
- **Astra:** completed the independent product and systems review, with recommendations, tradeoffs and three implementation packets. A coding assignment is separate.
- **Producer / Sol:** turn the chosen direction into small engine/data changes, coordinate interfaces, integrate reviewed work and record release evidence.
- **Grok / experience work:** readable dialogue, contextual interaction, touch/keyboard behavior and visual feedback against real engine outcomes. Hosting work uses the actual existing publishing session.

These remain proposed implementation responsibilities. Astra and a technical reviewer were dispatched as subagents for this review; the existing local/cloud project chats were not messaged or synchronized by that action. Each implementation task should name its files, behavior, acceptance cases and baseline. Avoid concurrent edits to shared orchestration. The feature handoff identifies the commit and checks; a document does not automatically message another chat.

Keep the backlog and these briefs in the repository. A chat should begin by checking the current branch and plan, and end by recording its result and the next unresolved behavior. The user should not have to carry contradictory status between chats.

## Current source and open decisions

Checked on 11 October 2026:

- [PR #4](https://github.com/arwyn6969/the-game/pull/4) is merged; main is `88f5039ab5743c3b6370a64b2e6d88a7de128da0`. The integrated source passed 295 full tests. Its exact hosted publication has not been established.
- [PR #5](https://github.com/arwyn6969/the-game/pull/5) is the documentation review and proposed plan, now including the completed Astra review. It preserves the later account-save requirement. Documentation is not a gameplay fix.
- [PR #7](https://github.com/arwyn6969/the-game/pull/7), reviewed at `2652f719cbe39aee3466b89c8275b2d0afe49d65`, is an open, unmerged trust repair. The [new review evidence](reviews/2026-10-11-astra-evidence.md) records remaining defects despite passing focused tests. Do not count this packet as finished.
- [PR #6](https://github.com/arwyn6969/the-game/pull/6), head `12e8358d0d869f8a7c25387ee39cbc815d9bf284`, is a draft technology-memory preference and [Kevin World source notes](https://github.com/arwyn6969/the-game/blob/codex/kevin-technology-retrieval/docs/KEVIN_WORLD.md). It passed 48 town and 301 full tests and CI. It has not been merged or published. The preference is not evidence that the dialogue is more enjoyable.
- Public assets observed earlier that day omit specific integrated save fixes. No cloud publishing session is available. A release needs that access and verification against the hosted site; merging GitHub alone does not complete it.
- The runtime remains xAI; no alternative-provider adapter or key has been configured. Groq is a candidate for a free trial once its account/model allowance and response quality are checked. First-day rules remain usable without AI. Provider integration is a separate task, with server-side secrets and limits.

Astra recommends foregrounding expertise through one practical shared problem while retaining ordinary town life and the existing personal stories. Its rejected alternative is a large autonomous expert panel before player agency is proven. Test whether players understand and care about their contribution; if they understand it but remain indifferent, change the problem and stakes before adding specialists.
