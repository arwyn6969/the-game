# Northern: reading a manuscript beside him

22 October 2026. Follow-up on [draft PR #42](https://github.com/arwyn6969/the-game/pull/42), explicitly dependent on the manuscript and grounding work. The user authorized adjacent-ground reading, clear current action options, and one further bounded real-AI trial.

## Change and boundaries

The shared engine/UI read rule permits the actor's own held manuscript, or a manuscript on the same ground tile or one tile north, south, east or west in the same zone. It returns the current saved words without pickup, relocation, revision change or ownership change. Distant/diagonal/across-zone ground items, blocked item tiles, another holder and stale revisions remain unavailable. Writing still requires holding.

The observation now contains current action templates with exact item IDs/revisions. Bring options include allowed destinations; generated speech/manuscript fields have explicit limits. The AI chooses freely from those options, and the engine rechecks its proposal. Metadata does not disclose unread words. Fiction remains permitted, and authored claims remain unverified.

The trial retains the same synthetic town, starting positions, exact free model, 1,200-output-token cap, 12-second deadline, single attempt, pacing and stop rules. Its allowance is at most eight and is reduced to remaining free requests under the saved 24/day operator ceiling. The preflight at 14:05 UTC showed 20 already used, leaving at most four for this trial. Production limits, routes and ledgers are unchanged.

## Local verification before the real trial

The [exact rejected seventh read](ground-read-replay.json) from the previous real trial now succeeds at source `7a5142b`: Northern reads his actual saved ledger at the noticeboard while the manuscript stays on the ground. Every item field, inference-usage counter and financial field stays unchanged; export/import preserves the item. This is a local replay with zero provider requests, not a new model choice.

Combined source `a311124` passed Node 24 typecheck, lint (zero errors, one inherited unused-disable warning), all **920 script + 55 typed tests**, **383 town tests**, diagnostics and a credential-free build. `DATABASE_URL` was absent and migrations skipped. The first full-suite invocation hit the sandbox's loopback-socket restriction in the existing port-collision test; the complete rerun with loopback access passed. Dense full-page/action-option prompt coverage remains below the unchanged 8,000-character cap.

The [desktop/phone browser receipt](../manuscript-ground-read-2026-10-22/README.md) passes at 1280×800 and 390×844 with synthetic transport. Same/cardinal ground reads expose actual saved text with the whole item and paused canvas unchanged. Diagonal, distant and other-held reads remain disabled. Movement, conversation drafts, pause, replay, reload, import/export and existing session guards pass. These checks used no provider credentials or live requests.

## What Northern actually did

One unsteered run at source `e3a35c63bf3fe7f06d773fa7f658b2122fccc7cc`, 14:21:25–14:23:03 UTC. The [complete report](report.json) and [state/usage audit](audit.json) preserve the outcome.

| Decision | Actual result | Input / output tokens | AI wait |
| --- | --- | ---: | ---: |
| 1. Read | Read actual blank pages from the adjacent ground manuscript, without pickup | 1,430 / 40 | 2.728 s |
| 2. Read again | Read the same unchanged blank revision; no new information | 1,522 / 25 | 1.270 s |
| 3. Read again | Read that unchanged blank revision once more | 1,519 / 31 | 1.918 s |
| 4. Pick up | Held the same manuscript; revision changed from 0 to 1 | 1,519 / 26 | 3.309 s |

The four-decision allowance then disabled the session. All four responses, parses and engine commands succeeded. No retry, fallback, restart or intervention followed. The manuscript remained blank; Northern did not write, speak or choose a destination in this run. The first three reads preserved every item field, including ground custody and revision. His later pickup was a separate explicit AI choice.

This proves real-model selection and execution of adjacent-ground reading. It also exposes a usefulness gap: the AI spent two extra decisions rereading pages it had already learned were blank. Clear valid actions do not by themselves make the next choice purposeful. This sample does not qualify the wider reading/play, fiction writing or continuous autonomous activity.

An independent read-only audit confirmed the four choices exactly matched their supplied options, prompt/source hashes matched, and every call/custody/accounting total agreed. The previous blank-read results were present in subsequent prompts. This sample does not establish why the model repeated its choice or whether option order influenced it.

## Measured compute and state

- **4 actual requests / attempts; 5,990 input + 122 output = 6,112 total tokens.** Reported reasoning tokens: 0. Each output stayed within the unchanged 1,200-token allowance.
- **9.225 seconds of AI invocation wait**; provider latency sums to 9.187 seconds. Wall duration was 98.401 seconds, including deliberate 31-second request spacing. These are API measurements, not GPU utilization.
- **$0 provider-reported cost**, zero account monetary usage and four settled SQL budget/pool rows, charging four calls and zero microusd.
- Provider free quota moved **20 → 24 used** (30 → 26 remaining of 50). The local operator ceiling remained 24/day. Only four calls were available under it; this is a reduced allowance versus the earlier eight-call maximum, not a matched eight-decision comparison.
- Two redundant unchanged reads used 3,097 of this run's tokens. No travel occurred, so there were zero simulation movement minutes and no per-tile inference.
- Cash, the entire economy, tills, favors and identities stayed unchanged. Economy/physical audits and export/import round trip pass. The initial town's actors, clock, money and item match the grounded repeat; fresh identity UUIDs and the deliberate allowance reduction are documented separately.
- Actual prompts ranged from 4,939 to 5,270 characters. The free model, zero-price preflight, reasoning setting, provider/output/deadline/attempt settings and stop rules stayed the same. The finite harness changed only to reduce the allowance to remaining daily headroom; source hashes are in the audit.

## Next small packet

Keep the present reading mechanics and free creative choice. Before expanding the event, make repeated unchanged reads visible as lack of progress and add a bounded pause/reconsideration policy. A reread can remain a deliberate choice; repeated calls should not quietly exhaust the activity budget. Qualify that small behavior with a separately authorized real run before claiming an autonomous creative loop. No additional live trial or production change was made here.
