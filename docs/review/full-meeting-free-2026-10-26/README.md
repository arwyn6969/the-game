# Full meeting within free allowance — 26 October 2026

**A fresh meeting opened and completed all six spoken turns in fourteen free
AI calls, with no failed call or timeout and $0 reported cost.** All three NPCs
accepted ordinary invitations and actually spoke. Arwyn opened without a
player-authored line. A single explicit Start and the existing automatic-run
helper/normal queue controlled the whole run, ending with “This meeting is
finished.” No resume, chosen floor or authored NPC speech was inserted.

Test source: `efa88b6edc4bb41987bb2210cc9d9d038919db60` on
`codex/full-meeting-budget-20261026`, based on current main `a40867e`. The real
provider, router, prompt/parser, mark/apply engine, automatic-run lifecycle and
local SQL stores ran together. This is a headless operator acceptance test;
an authenticated hosted browser meeting and physical-device acceptance remain
separate. Mobile work stayed on hold throughout.

## Budget change

The explicit [hosted profile](../../../config/meeting-free-profile.json) raises
shared calls from 24 to **48**, player calls from 12 to **32**, and the rolling
31-day provider cap from 744 to **1,488**. The existing account reports 50 free
calls per UTC day. This allows two sixteen-decision meetings per player from
fresh allowance while leaving shared margin and one direct-reply reserve.
Prior/other usage can reduce headroom; exhausted limits still stop inference.

Conservative token reservation ceilings rise from 20,000/minute and 100,000/day
to **40,000/minute and 960,000/day**, covering two 20,000-unit envelopes per minute
and 48 per day. They count input bytes plus maximum output, not only actual
reported tokens. All timestamps and charges, including the earlier unknown
timeout, remain. This change does not replace conservative accounting with
optimistic usage estimates or change the zero monetary ceiling.

The same exact free model, no paid fallback, one concurrent call/action,
no background AI, 31-second start spacing, one action attempt, 1,200 output
tokens and 30-second action deadline remain. The existing sixteen-decision
boundary now closes after committing its last result instead of leaving an
unresumable pause. A targeted regression proves the final spoken line,
recipients, accounting and save survive this boundary. The real meeting ended
at the ordinary six-turn boundary before using its full sixteen-call allowance.

## Actual complete run

Ordinary choices were:

1. Arwyn, Northern and Sub each accepted.
2. Arwyn participated; Northern and Sub listened.
3. Arwyn opened. Northern participated; Sub requested a turn.
4. Arwyn, Northern, Sub, Arwyn and Northern spoke in the normal queue.
5. The sixth actual NPC turn automatically closed the meeting.

Northern proposed the baker's market chant; Sub proposed a notice by the well.
Arwyn asked follow-up questions about both, and Northern responded. The player
explicitly listened before Start and received every new turn; nearby Baba and
other nonlisteners gained no speech knowledge. One exact repetition of Arwyn's
opening occurred before the other speakers' first turns; it is preserved in
the receipt rather than edited out. This test proves the completed budgeted
lifecycle and attributed exchange, not that every generated turn is unique.

The run used **24,550 actual known tokens**. Call latency was **720–11,595 ms**;
physical starts were at least **31,078 ms apart**. Free quota before the run was
22/50 used; the settled post-run check reports **36/50 used, 14 remaining, $0**.
The immediately returned counter lagged by one; the dispatch guard also counted
all physical starts conservatively.

## Independent verification

Offline replay made no network call. It independently rebuilt the initial
state by closing the earlier synthetic checkpoint through a player command,
creating the new meeting, delivering invitations and opting the player in.
Every real prompt hash, model choice, automatic dispatch and exact canonical
final town matched. All six speech deliveries were audited against actual
attention and acoustics, complete attributed memories and all eight scoped
knowledge projections. Export/reload preserved exact speech and knowledge;
finances, identities and historical dialogue remained.

The sixteen old ledger rows retain their exact identities, timestamps and
charges. All **30 cumulative attempts** settled: 29 successful responses and
one inherited timeout. Cumulative token reservations were **265,215**, maximum
individual reservation **10,813**, below the new bounded ceilings. No test town
or accounting history was reset, and no personal browser town was touched.

Node 24 passes **1,098 script tests + 55 typed tests**, **426 town tests**,
typecheck, lint (one inherited auth warning), diagnostics and both credential-free
Node/Cloudflare builds. The first full-suite run hit sandbox-denied localhost
listeners; the permitted rerun passed without dropping assertions. A separate
fake-network dry run verified one-attempt failure settlement and retention of
the sixteen old charges before any real generation.

Raw synthetic towns, prompts, ledger and verifier remain ignored under
`artifacts/full-meeting-20261026/` and `artifacts/full-meeting-runner-20261026/`.
The [sanitized receipt](summary.json) records the exact source, observed words,
checks and hashes. CI and hosted publication state are recorded in current
status and the PR; passing this local test alone does not claim deployment.
