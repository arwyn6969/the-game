# Resident growth: local implementation and next outcomes

5 November 2026. Branch `codex/resident-growth` in the reused `a02-economy/`
checkout, based on freshly fetched main `49cf76f2236f12ff79b092f4e1df84e13f9b5a42`.
The previous branch is retained. PR #71 and the separate F1 follower branch have
not been integrated or changed by this work.

## What changes for residents

| Area | Implemented here | Remaining boundary |
| --- | --- | --- |
| Personality | The seven current residents receive the same public role, voice, specialties and authored starting principle in paired and player conversations. Shared prompts receive shared experiences and pair obligations, with private self-descriptions, motives and notes excluded. | Estée and Socrates remain proposed additions. Research, biographies, cast/save migration and art are separate work. |
| Memory | Direct questions rank above background concerns. Old relevant records can outrank new unrelated chatter. Six narrow concept families and accent normalization improve indirect recall; each current NPC has a modest interest preference. | This is deterministic lexical/concept matching, not embeddings or unrestricted semantic search. |
| Retention | Existing archive limits reserve an early significant encounter per partner. Original evidence IDs can resolve through archive aliases; ambiguous IDs fail closed. | Ordinary records can still expire. This is not lifetime memory or server storage. |
| Relationships | Context distinguishes retained exchanges, private regard and this person's kept/broken/pending/forgiven commitments to the resident. | Trust, affection and disagreement are not guessed from one scalar or debt. Persisted independent dimensions still need evidence/change policies and UI design. |
| Outlook | Weekly self-description changes require a reason and one to three retained own, non-seed, non-reflection evidence references. Unchanged/unsupported proposals preserve the old description. Repeated reflections do not generate duplicate growth records. | The gate establishes provenance, not semantic truth or mastery. It cannot prove the model interpreted evidence correctly. Initial identity stays intact. |
| Learning | One failed library lookup, a supported correction, and a later different-record lookup form a saved growth demonstration. Individual prompts receive the applicable evidence. | The method and transfer opportunity are engine-guided, specific to this task. This does not implement general autonomous skill invention or the followers F2 milestone. |
| Continuity | Existing export/import retains the method evidence and identity revision provenance; no new Town/save schema is introduced. | Browser-closed shared life, server authority, general research and reusable external tools remain separate milestones. |

Private revision provenance uses the existing internal plan-record convention,
so evidence IDs and private reasons do not enter the ordinary character reflection
feed. Evidence dates, attribution, original failed attempts and financial records
remain intact. A proposal or self-praising sentence cannot establish a tested method.

## One observable learning story

1. Build an index with the wrong room-access mapping; Northern's independent
   funded search actually fails. Keep its original failure receipt.
2. Arwyn receives the search report. His context says the method needs correction.
3. Complete a correction supported by direct box inspections. This changes the
   method's status to ready to try; it does not yet claim personal competence.
4. On a later public library opportunity, Arwyn checks the Hobbs equipment register
   using the corrected method. This is a different record from the failed search.
5. The engine records this one lookup. A witness may describe observing the result;
   only Arwyn gets evidence of having demonstrated the method himself.
6. Export and reload. The result remains, the failure remains, and replay does not
   generate another trial or any new payment.

The existing library events and resident reply context expose the result. There is
no new skill dashboard and no new live-model call. Synthetic tests establish these
state transitions; they do not establish dialogue quality or player enjoyment.

## Validation

Validation is recorded on the final local source after integration review. See the
handoff for exact counts and commands. Tests cover prior/indirect recall, cast
attention, shared-context privacy, provenance rejection, public reflection filtering,
all-resident prompt budgets, real library actions, absent witnesses, misleading
self-praise, unsupported correction, saved contradictory evidence and reload/replay.
Node 24.22.1 and the committed npm lockfile are used. No provider credentials,
production database, wallet action or publication is involved.

## Next implementation outcomes

These are reviewable future outcomes, not claims that this pass completed them.

1. **Turn growth into a player-visible history.** Show a witnessed experience,
   what the resident decided to try, and its later result. Keep private reasons
   private. Distinguish “trying”, “observed” and “demonstrated”; allow no change.
   Prove it in ordinary desktop/phone play and with a short human playtest.
2. **Generalise reusable methods to two different activities.** Keep separate
   method versions, source evidence, counterexamples and actual application receipts.
   Let failure revise or retire a method. Prove transfer to a new case without
   granting mastery from attending or repeating a lesson. Integrate with F2 only
   after the F1 dependency is reviewed.
3. **Develop relationship dimensions deliberately.** Persist trust, affection,
   familiarity, disagreement and reliability with reasons and dates. A philosophical
   disagreement must be compatible with affection; a late repayment must not erase
   its earlier broken promise. Test independent directions and old-save migration.
4. **Preserve evidence for a lifetime.** Separate immutable events from summaries
   and working recall, with stable references, private audiences and explicit
   retention/deletion policies. Prove old-event retrieval, backup/restore and
   interrupted writes. Browser capacity must not silently decide which life remains.
5. **Add Estée's first growth activity.** First agree and source the starting
   biography/role. Then implement presentation → attributed feedback → revised
   method → different event → measured outcome. Separate feedback claims from actual
   attendance or comprehension. Use the same evidence contract across the cast.
   Socrates' starting portrayal needs its own sourced boundaries; Arwyn's lighter
   starting description is a character-design decision, not an automatic rewrite.
6. **Add bounded research and useful tools.** Start with read-only source retrieval,
   saved quotations/URLs/dates and an explicit permission model. Test conflicting
   sources and unavailable tools. Reusable procedures need validated outcomes before
   granting broader execution or writing powers.
7. **Continue one shared activity with all browsers closed.** Complete canonical
   identity, audience and compute contracts, then prove two clients, duplicate
   delivery, restart, backup/restore and absence of a connected browser. Move the
   whole town only after that slice works.

The next product acceptance should ask whether a player can explain what changed,
why it changed, and what demonstrated it. Test volume alone cannot answer that.
