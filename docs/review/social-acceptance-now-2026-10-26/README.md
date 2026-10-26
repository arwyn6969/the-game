# Social continuation and usage assessment — 26 October 2026

**The bounded multi-speaker and post-opt-out speech cases passed.** The user asked
to perform the previously scheduled four-call continuation immediately. The same
synthetic meeting resumed through the ordinary scheduler, with every earlier
choice, receipt, memory and accounting row retained. No new meeting was created.
Mobile stays on hold; this result does not establish sustained or hosted/device
acceptance or a fresh unattended opening.

Test source: `b486c383148aca77a0574460f242461faf59b0e4`; application code compares
identical to deployed source `9e610475b535b04587dc02603d2e3e16e7ebd9b0`, Worker
`87687764-4b95-478d-b1bb-f3dfbd5329dc`. No runtime code, live configuration,
deployment, production database or personal browser town changed.

## What actually happened

Four real free-model calls at 23:12:33–23:14:11 UTC chose **Sub listen → Arwyn
speak → Sub listen → Northern speak**. All succeeded in **718–4,426 ms**, with
**7,554 known tokens**, zero new timeouts and zero reported cost. Physical starts
were at least **31,093 ms apart**. One attempt per decision, one request at a time,
1,200 output tokens and the exact existing free model were retained.

Arwyn's new statement proposed an imperfect, welcoming reading and asked whether
to change its setting, text or invitations. Northern replied with concrete ideas:
ten minutes, no introduction round or preparation, and an open library door so
people could drift in and out. Those are actual model words retained in the
[sanitized receipt](summary.json), rather than participation being counted as speech.

| Actual NPC turn | Attentive recipients |
| --- | --- |
| Earlier Arwyn statement | Northern, Sub |
| New Arwyn statement | Northern, Sub, player |
| New Northern reply, after explicit player opt-out | Arwyn, Sub |

The player had joined without earlier speech backfill, heard the new Arwyn turn,
then explicitly stopped listening before Northern spoke. Nearby Baba and all
other nonlisteners gained no meeting speech. Independent offline replay matched
every new prompt hash, choice and exact canonical final town. It re-audited both
new turns' complete attributed memories and all eight knowledge projections,
preserved exact save/reload knowledge, money and identities, and verified all
twelve original ledger row identities, timestamps and charges unchanged.

All **16 cumulative charges** settled: **15 successful provider responses and
one inherited timeout**. Known cumulative tokens are **23,877**, plus that one
unknown historical sample. The run stopped after its four calls with no pending
request, keeping the existing sixteen-decision/six-utterance meeting caps.

## Usage caps and timeouts are separate

The current provider account reports **50 free requests per UTC day**. Read-only
preflight reported 18 used/32 remaining; the settled post-run check at 23:15:29
reported **22 used/28 remaining**, with monetary usage still zero. The immediate
post-run counter briefly lagged at 21, so dispatch also counted all physical starts
locally. The account ceiling stayed 24. Current model prices were explicitly zero.
[Provider limit and error documentation](https://openrouter.ai/docs/api_reference/limits)
distinguishes request-limit rejection from upstream capacity failures.

The live game's policy remains **24 shared and 12/player calls per rolling
24 hours**, one concurrent request, two/minute provider pacing, and **100,000
conservative token reservation units/day**. These are configured safeguards, not
a measured maximum throughput. Actions now have one 30-second provider deadline
and a 45-second client wait. Nine calls since the deadline/prompt fix succeeded
in 718–4,426 ms; that small sample does not establish a timeout-free rate or show
that the provider's fiftieth call must complete. Daily quota exhaustion and slow
responses must remain separate diagnoses.

The earlier test hit its twelve-call guard. Its pool also retained **98,410**
conservative token reservation units against 100,000, despite 16,323 known actual
tokens plus one unknown timeout. SQL counts the greater of reserved and reported
tokens, so another full prompt would be rejected before transmission. A fake
network dry run exposed this second guard without making a real provider call.

For the user's immediate four-call operator continuation only, the copied local
ledger allowed **16 cumulative calls and 180,000 reservation units**. The latter
adds at most four existing 20,000-unit per-minute reservations. All old charges,
the same operator identity, zero cost, account ceiling and pacing remained.
This explicit operator exception is recorded separately; the successful social
test does not prove that a full sixteen-decision meeting fits the live twelve-call
player allowance. No live limit was increased or ledger reset.

## Follow-up state

The one-shot automation `complete-remaining-social-test-once` is **PAUSED** and
cannot duplicate these calls tomorrow. No replacement was scheduled. The two
requested remaining observations are complete; a fresh unattended opening,
sustained group flow and hosted/device acceptance remain unqualified. Choosing
operating limits for longer meetings needs a separate decision informed by these
actual costs and conservative reservations. No further inference or mobile work
is started by this receipt.

Private synthetic reports, prompts, ledger, replay, hashes and both isolated dry
runs remain ignored under `artifacts/` or temporary verification copies. The
replay's first full-town comparison exposed save loading's normalization of
optional false memory flags; both complete towns were then compared through the
same canonical save boundary, with no fields dropped. The final replay passed
without any network call. [Sanitized machine-readable evidence](summary.json).
