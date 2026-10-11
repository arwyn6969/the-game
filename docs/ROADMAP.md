# THE GAME: a stronger town and a route to Kevin World

Proposed producer plan, 11 October 2026. This is a direction for review and playtesting, not a record of completed features or a promise of a measured tenfold improvement. The detailed evidence is in the [playability review](reviews/2026-10-11-playability.md); the [Astra brief](prompts/ASTRA.md) asks for an independent challenge to this plan.

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

| Stage                                         | Work                                                                                                                                                                                                                                                       | Exit condition                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Bring the project together                 | Review the existing documentation and retrieval PRs; agree on a source revision; give the local and cloud chats the same brief and ownership. Record source, preview and published revisions separately.                                                   | Each active chat reports its actual checkout, branch and head. One shared roadmap identifies the next change.                                              |
| 1. Make interactions trustworthy              | Correct transaction intent, newest-reply visibility, unreadable-save recovery and misleading status/debt labels. Deliver small PRs with focused acceptance cases.                                                                                          | The reproduced inquiries cannot spend money, replies are visible and a damaged save has a recovery path.                                                   |
| 2. Complete the first day and its tomorrow    | Offer and accept a real shift; show attendance and pay; give one purchase a purpose; record a commitment and its next-day acknowledgment. Keep declining and exploring available.                                                                          | A fresh player can meet Kevin, choose work, earn pay, use it and return to a remembered consequence through ordinary controls without a key.               |
| 3. Make community life visible and release it | Add witnessed public events, consistent interaction range and contextual actions; preserve movement during background model waits; demonstrate one small shared project when the simpler loop works. Publish via the existing host and verify the release. | The player can explain a public event and a project consequence. The hosted site passes the same journey and old-save checks as the reviewed build.        |
| 4. Carry the town and grow its ideas          | Add the signed-in person's own cross-device save, with offline cache and explicit conflict recovery. Trial richer AI dialogue with a budget and fallback. Expand specialist residents and projects one at a time.                                          | Account isolation and recovery work; AI improves a measured playtest within the allowance; each new resident adds a demonstrable activity or relationship. |

Stage 1 can proceed while Astra reviews the broader direction. An independent opinion is useful input; it is not a prerequisite for fixing reproduced defects. Account save follows the first playable day, as Arwyn's later note in the review specifies. It keeps each person's town separate.

The first implementation should address F1, transaction intent. Distinguish asking, refusing and accepting; apply an explicit validated action; then verify the quoted price, refusal and payment cases plus existing ledger tests. Phone conversation and save recovery should have their own small, reviewable changes. Astra can challenge this ordering with a concrete player benefit and evidence.

## A useful test of the ambition

Start with five fresh players and a short desktop/phone session, followed by reopening their town and observing the next game day. Record where each hesitates, what they believe happened, and whether the game matches that belief. Ask Arwyn to show one confusing moment and one moment worth returning for; the producer translates those examples into the next task.

Proposed diagnostic targets:

- At least four of five players find and complete the chosen work/purchase loop without being told the controls. Record completion time before setting a firm session-length target.
- At least four can explain one consequence of their choice and recognize its acknowledgment on the next day.
- The reproduced inquiry/refusal cases create no transaction, and recovery tests preserve the original save bytes.
- Delayed or missing AI permits movement and useful play; measure response delay rather than describing it as “fast.”
- Each release has a recorded source revision, passing applicable checks and hosted verification.

These small playtests diagnose confusion; they do not establish retention or a tenfold business result. Compare successive builds on the same journey and use the observations to decide the next investment.

## Working as one project

The canonical repository is [arwyn6969/the-game](https://github.com/arwyn6969/the-game). `arwyn6969/THE_GAME` is the older Python simulator. The local project folder and this cloud checkout are separate machines; ordinary Git branches and explicit handoffs connect their work.

- **Arwyn:** creative direction and examples from play. No API key is needed to judge the first-day loop.
- **Astra:** an independent product and systems review using the evidence and brief below. Produce recommendations, tradeoffs and implementation packets before beginning a separate coding assignment.
- **Producer / Sol:** turn the chosen direction into small engine/data changes, coordinate interfaces, integrate reviewed work and record release evidence.
- **Grok / experience work:** readable dialogue, contextual interaction, touch/keyboard behavior and visual feedback against real engine outcomes. Hosting work uses the actual existing publishing session.

These are proposed responsibilities, not agents already dispatched. Each implementation task should name its files, behavior, acceptance cases and baseline. Avoid concurrent edits to shared orchestration. The feature handoff identifies the commit and checks; a document does not automatically message another chat.

Keep the backlog and these briefs in the repository. A chat should begin by checking the current branch and plan, and end by recording its result and the next unresolved behavior. The user should not have to carry contradictory status between chats.

## Current source and open decisions

Checked on 11 October 2026:

- [PR #4](https://github.com/arwyn6969/the-game/pull/4) is merged; main is `88f5039ab5743c3b6370a64b2e6d88a7de128da0`. The integrated source passed 295 full tests. Its exact hosted publication has not been established.
- [PR #5](https://github.com/arwyn6969/the-game/pull/5) is the documentation review and proposed plan. It contains the later account-save requirement. Documentation is not a gameplay fix.
- [PR #6](https://github.com/arwyn6969/the-game/pull/6), head `12e8358d0d869f8a7c25387ee39cbc815d9bf284`, is a draft technology-memory preference and [Kevin World source notes](https://github.com/arwyn6969/the-game/blob/codex/kevin-technology-retrieval/docs/KEVIN_WORLD.md). It passed 48 town and 301 full tests and CI. It has not been merged or published. The preference is not evidence that the dialogue is more enjoyable.
- Public assets observed earlier that day omit specific integrated save fixes. No cloud publishing session is available. A release needs that access and verification against the hosted site; merging GitHub alone does not complete it.
- The runtime remains xAI; no alternative-provider adapter or key has been configured. Groq is a candidate for a free trial once its account/model allowance and response quality are checked. First-day rules remain usable without AI. Provider integration is a separate task, with server-side secrets and limits.

The main design decision for Astra is how strongly the first shared projects should foreground expertise and ideas while retaining ordinary town life and the existing personal stories. The brief asks for a recommendation, not a menu that leaves that choice with Arwyn.
