# Character continuity — local implementation and qualification

Implementation `c084ffba1d875eef7b5f71d775a84c9ce44b46f1` on
`codex/character-continuity` adds Socrates and Estée, distinct starting interests
and personal conversations for all nine residents, and playable newcomer library
facilitation. New towns give Arwyn a light independent background and Sub his
art/writing/digital-culture foundation. Kevin's undecided origin awareness remains
open. Existing saved lives are retained.

This candidate also combines the completed F1 companion source `58b9616` and
resident-growth source `0186b96` (cherry-picked as `29ff251`). Current main
`c49facc` is incorporated by `a83863e`; its tree exactly matches the already-used
PR #71 dependency `2ee631f`. The original owners' checkouts remain intact. Their
ongoing F2 and later growth-history UI work are outside this snapshot.

## What passed

| Check | Result |
| --- | --- |
| Locked setup | `npm ci`, Node 24.22.1 |
| Full source suite | 1,257 script + 55 typed tests; zero failures |
| Town suite | 561 tests; zero failures |
| Typecheck | Pass |
| Lint | Zero errors; inherited unused eslint-disable warning in `use-current-user.ts:59` |
| Offline diagnostics | Completed; empty world audit. Observations are not a release verdict |
| Production build | Pass with an empty environment except local PATH/TMPDIR; `DATABASE_URL` absent and database migration explicitly skipped |
| Complete built-preview browser gate | Pass at 1280×800 and 390×844 |
| Combined companion browser gate | Eight journeys pass at both sizes; zero live or follower inference calls |
| Visual inspection | Both newcomer conversations at both sizes and desktop/phone retained companion journals inspected |

[Source-check receipt](source-checks.json) · [diagnostic observations](diagnostics.json)
· [complete browser report](browser/results.json) · [companion report](following/browser.json).
The explicit browser URL was a freshly built local production preview on port
8271, rather than the harness's default preview port. Companion transport mocks
used a separate development server on 8272. Contexts and exports were synthetic;
no personal browser or town was attached.

The browser checks cover keyboard/touch movement, pause, authored conversations,
reload, ordinary import/export, version-1 migration, explicit fork/restore,
identity-corruption rejection, competing-tab recovery, library work and reading
activities, controls and interface layouts. The newcomer checks additionally
verify exact pre-arrival backup bytes, retained original identities, attributed
replies after reload, unchanged transactions, and independent pending invitations
when either new facilitator is proposed.

The first new harness attempt timed out waiting for an hourly save; Pause now
uses the ordinary immediate-save path. A second attempt selected Overview instead
of Together; the harness now selects the conversation tab. Both were harness
assumptions and required no runtime change. The complete gate subsequently passed.

## Compatibility evidence

The synthetic old eight-person export comes from the original implementation.
Its existing biographies, wants, memories, IDs, opening accounts, transactions,
holds and receipts survive arrival and repeated reload. Socrates and Estée have
zero opening money and neutral local relationships. Standard opening funds stay
90 coins. A corrupted old ledger is rejected before migration; a failed backup
write preserves the exact canonical save. Previously forked towns retain their
lineage; newcomers have no invented parent incarnation.

The private registry accepts complete historical eight-person and current
ten-person registrations. The additive role-constraint migration was exercised
only in disposable PGlite tests. Existing registered profiles and ownership are
not expanded or remapped automatically. New ten-person registrations need
`20261105_character_arrivals.sql` at a future authorized deployment.

Prompt limits remain bounded: dawn/reflect batches 14,000 characters, discussion
10,000, physical actions 8,000. Low-priority recollections yield to current
observations and authoritative obligations; shared prompts exclude private origin
history. The existing financial, hearing, consent and model-validation contracts
remain in force.

## What this does not establish

No upload, PR creation, main merge, publication, production migration or paid inference occurred
in this character packet. Current production remains the coordinator's #71
release; this cast is local. CI on a future integration head is still required.

Authored offline dialogue and synthetic transport do not establish live-model
voice, historical fidelity, enjoyment or physical-device/screen-reader acceptance.
A short human review should compare the nine voices and run the library
failure/correction/different-record method-reuse activity. That engine-guided
demonstration is not general autonomous skill learning. Full lifetime archives,
browser-closed shared life, richer independent relationship dimensions and
general tools/research remain separate milestones. Public name/likeness clearance
for the historical portrayals remains a release decision.

[Implementation decisions and sources](../../implementation/character-development-2026-11-05.md)
· [handoff](../../handoffs/character-continuity-2026-11-05.md).
