# Manuscript grounding follow-up — 22 October 2026

Owner: manuscript AI lane. This is the user-authorized correction after the first real Northern trial invented financial facts. Parent baseline `b1a74b3` is merged into this checkout. The independent core provenance repair `e167d29` is also included for combined checks; the parent has already integrated that core change separately.

## Change

Only `src/game/prompt.ts` changes runtime behavior in this packet. Action prompts now supply the bound NPC's actual cash and **town coins** unit, profile limitations, and a bounded projection of that NPC's recorded obligations and work. `fundedWorkSummary(town, actor.id)` supplies actual funded records; unrelated player/resident work, private debts, till balances and global funding diagnostics are excluded. Current active/suspended agreements and earned unpaid amounts outrank closed history. The facts packet is at most 1500 characters, preserves cash/unit and reports omitted counts explicitly. A missing or omitted record never becomes an invented price, job or due date.

Recorded shift projects remain visibly separate from accepted funded work. Offers are not accepted agreements; attendance and earned wages are not settled payment. The projection is read-only and does not initialize accounts or modify money, debt, work or memories.

The instruction explicitly preserves freely chosen fiction, including fictional selves, events, money and prices when marked as fiction. Hypotheses and estimates remain available with their attribution. It requires no particular genre, story, destination or performance. Writing/reading establishes the action and exact words, not the truth of embedded claims. This applies even to imported older document memories labelled `source: event`; those memories are retained rather than rewritten. Repeating the actor's own words is not corroboration.

No physical-item engine, provider configuration, accounting, harness, token/timeout limit or production setting was changed by this packet. No provider request or production migration was made. This is a prompt-grounding correction, not a general semantic verifier or proof that real generated content is now grounded; the parent owns the single separately authorized bounded repeat.

## Verification

Node 24 checks passed:

- **36 focused tests**: new grounding/fiction/privacy/budget cases plus existing action prompts, saved shift context, planning/reflection grounding and real physical-item core cases.
- The final maximum-context fixture uses actual pickup/write/read commands and a 1200-character body; its six grounding cases passed after that fixture refinement.
- Typecheck; targeted ESLint; formatting; diff whitespace.

Measured prompt sizes from synthetic actual engine state: **5297 characters** initially; **7762** after a maximum-body read with long own obligations/projects. Both retain the existing **8000-character fail-closed ceiling**. These sizes are not token-usage measurements. There was no real-model generation or claim of production acceptance during these checks.
