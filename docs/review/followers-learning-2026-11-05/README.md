# F2 — ask and practise

Local implementation and acceptance record, 5 November 2026. Owner: this Codex
chat. Checkout: `a01-replay/`, branch `codex/followers-learning`. Source commit:
`185eab7b030b88c09bd2f27a18032e8430c1f396`. Explicit dependency/base: completed
F1 at `58b9616f473aa960b39793ee375703ca9e705dbc`; the `codex/followers-local`
ref remains there. [Machine receipt](checks.json), [teaching browser receipt](browser.json),
[F1 regression receipt](f1-regression/browser.json), [proposed PR](proposed-pr.md)
and [handoff](../../handoffs/followers-learning-2026-11-05.md).

At start, fetched main was `49cf76f` and F1 inherited open PR #71 at `2ee631f`.
A separate release owner subsequently merged #71; refreshed `origin/main` is
`c49facc52136cfda0270627e3e6aef51f5ab4588`. F2 retains the requested F1 base.
The independent `product/` release checkout was observed clean on
`codex/release-20261105` at `9e693a5`; F2 did not edit or switch it. The separately
owned resident-growth branch in `a02-economy/` was inspected for overlap, not
integrated. This packet sequentially owns its additive controller/save/UI/gateway
integration; it dispatches no other builders and changes no production settings.

Final preservation recheck: `product/` remains at `9e693a5` but now has separate
uncommitted edits in `src/lib/mind-budget/runner.ts` and
`src/lib/mind-pool/{router,server,store}.ts`. Those appeared after its clean
checkpoint and are not F2 changes. They were left untouched; do not treat that
checkout as clean integration space.

## Playable journey

Accompany a resident into an eligible library discussion, open **Ask and learn**,
and explicitly enable it. Following alone still makes no learner requests.
The selected goal is checking current references without inventing a historical
date. A visible, initially checked **Pause town time for this lesson** choice
keeps the existing companion deadline still while studying; the player retains
the local clock controls. Each AI action needs an explicit button press and the
existing request pacing. Nothing runs with a hidden or closed page.

Try a before-instruction case, then ask whether the resident will teach. The
resident may accept, decline or defer on their existing speaking turn. Acceptance
makes the public procedure card available to the learner. Two optional generated
questions have distinct verification/uncertainty focuses; the second must cite
the actual first answer. Each question waits for the discussion floor and its
received answer. Practice uses a fresh case and a changed, misleading case. One
optional private end reflection ends the lesson; Stop ends it without generating
a reflection. No skill points or rapport are awarded.

The UI shows received speech as attributed claims, reflection as unverified
interpretation, and inspections/submissions as recorded actions with their
deterministically checked outcomes. Refusal, incomplete work, unavailable capacity
and failed practice remain honest outcomes. The earlier lesson history is readable.

## Method and action suitability

The existing library reference-checking activity is suitable: its stable
Birch/Alder/Cedar identifiers, inspection of actual contents, and distinction
between current contents and an uncertain historical date provide a concrete
method. Its funded task is finite and tied to work/payment obligations. F2 therefore
uses a separate free public practice tray with the same stable identifiers and
explicit validated `inspect`/`submit` actions. It does not reset the canonical
index or turn practice into paid work. The shared identifier constant was moved
to a leaf module without changing values or existing exports.

The stored procedure includes prerequisites, permitted actions, source references
to the public card and actual received teaching line, and limitations. Three
distinct cases each allow one inspection proposal (one to three unique boxes)
and one submission. Only actual inspection receipts can support a submission.
Wrong contents, an unsupported date, or an invented inspection cannot pass.
The model never receives the hidden box key or uninspected contents. Previously
received instruction remains available in later lessons; the baseline does not
pretend an experienced learner is untrained.

The comparison requires all six practice requests to have applied, exactly one
known transmitted attempt each, and matching provider/model/output-token caps.
All have the same prompt ceiling and two-request allowance. Unknown or changed
compute prevents qualification. A baseline that already succeeded is not an
improvement. A failed changed case is not transfer. Even the qualifying small-run
message explicitly excludes general competence. The finite authored case pool
has three variants per phase and can repeat across lessons.

## Authority, knowledge and cost boundaries

- A town-scoped, in-memory permission captures lesson/follow revisions, actor,
  context, floor and member revision. Saved records confer no authority. The
  player has a separate restricted executor; ordinary NPC jobs still reject a
  player actor. Teacher speech uses the original marked discussion job and its
  decision, turn, recipient and agency validation.
- Inputs contain the learning goal and selected witnessed receipts. Teacher
  inputs additionally exclude follower speech the teacher did not receive.
  Private memories, spectator transcripts, future answers and hidden practice
  keys are excluded. Source citations are checked, although semantic truth or
  paraphrase quality still requires live-model/human qualification.
- Keyboard, actual phone touch and a clicked destination immediately revoke
  following/learning authority. Stop, context/attention changes, page hiding,
  restore/import, replay and save failure/conflict suspend or end it. Late
  speech, practice and reflection are rejected. Resume is explicit and preserves
  attempts. Only the lesson's temporary player participation and exact pending
  teacher request are released; a later manual attention choice survives.
- Limits are twelve total requests: at most two question attempts, two answer
  attempts, one invitation, six practice requests and one reflection. Each is
  single-attempt with no automatic retry. The discussion retains its separate
  sixteen-decision/six-speech limits. No movement owner is added.
- All calls use the existing hosted `act` gateway and account reservations.
  Existing unavailable/background restrictions remain authoritative; F2 does
  not enable an action route or increase quotas. Personal/legacy/unconfigured
  action capacity is not qualified or silently substituted. Local receipts
  attribute actor, speaker/learner role, attempts, tokens and unknown usage.
  The teacher's discussion receipt is another view of the same call, not an
  additional charge. A timeout or reload never assumes a refund.
- The optional versioned `followerLearning` extension preserves old v1/v2 towns.
  It retains at most eight ended lessons plus one current lesson, twelve calls
  and thirty-two short receipts per lesson. Actual excerpts and source IDs
  survive transcript trimming. Save headroom and the existing total size limit
  remain enforced. Invalid or forged extensions enter raw-byte recovery;
  canonical and losing save bytes are preserved on conflict.

## Acceptance evidence

| Case | Evidence |
| --- | --- |
| Ordinary teaching | Source and both browser sizes: explicit grant, baseline, voluntary acceptance, two actual question/answer pairs, stored procedure, distinct fresh/changed cases, one private reflection, reload and export/import |
| Refusal/defer | Both browsers: declined line is received and attributed; no method or later practice is invented. Source separately verifies defer and further refusal |
| Exhaustion | Both browsers: unavailable synthetic capacity consumes its bounded slot, pauses and retains unknown/known usage honestly. Source exercises the actual budget runner with action capacity disabled and preserves final direct-reply capacity |
| Privacy/turns | Source: private canaries, unheard speech, forged citations/actions, invitation, acoustics, floor changes and original NPC/player guards. Every browser prompt is checked for private canary leakage; no external/provider requests are allowed |
| Late responses/takeover | Both browsers: keyboard or phone touch during a pending question, explicit Resume, then clicked Go-to Library during another pending question; both late lines rejected. Source also covers late practice/reflection and listener revision ownership |
| Practice failure | Both browsers: misleading changed-case submission fails and the comparison refuses competence. Source covers already-correct baseline, unknown attempts, changed model/token limits, invalid action proposals and forged saved success |
| Save/reload/recovery | Both browsers: pending reload has no automatic continuation; completed export/import retains exact evidence. Source: raw malformed extension and losing save bytes, unknown pending costs, bounded retention and explicit Resume |
| F1/commitments | Eight existing browser journeys rerun: library, pending leave, quiet second target and recovery at both sizes; all four interface geometries fit. Source preserves actual funded five-coin work reservation and existing café regressions |

Actual Chromium dimensions: **1280×800** and **390×844**. Reviewed setup,
comparison, refusal, capacity, late-reply and restored-state screenshots are
linked from the JSON reports. The lesson scrolls within the companion panel;
the existing companion Stop remains above it. Representative images:
[desktop comparison](desktop-complete-comparison.png),
[phone setup](phone-complete-setup.png),
[phone failed practice](phone-practice-failure-comparison.png).

Twelve F2 journeys pass with **60 synthetic calls: 12 speaker, 48 learner**.
The ordinary journey uses three speaker and nine learner calls per viewport.
Eight F1 journeys pass with four explicitly requested synthetic speaker calls,
**zero F1 follower calls**. Both reports have no browser errors, unexpected
server-function calls or provider requests. The source pool test separately
uses one fake transmitted response with reservation/settlement; its budget test
uses a synthetic runner. These are not live provider or learning measurements.

## Source checks and credential-free build

Node **24.22.1**, committed lockfile; `npm ci --offline --no-audit --no-fund`
passed. Typecheck, lint, **545 town tests**, **1,240 script + 55 typed tests**,
town diagnostics and production build passed. The twenty new F2 source cases
are included in those totals; F1's twenty remain included. Diagnostics retain
an empty world audit. Lint has the inherited unused-disable warning in
`src/lib/auth/use-current-user.ts:59`; build retains chunk-size/dynamic-import
and platform advisories. No assertions were suppressed.

The build ran with only `PATH` in its environment and no `.env*` files in the
checkout. Its actual migration step printed:
`[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).`
No live database credentials reached that step; no schema migration was added.
The machine receipt includes source hashes, final check results and log hashes.

Full testing caught an enlarged NPC prompt after adding a return-to-listening
choice. Restricting that choice to the player preserved the original NPC prompt
and agency limits. A retention check caught and fixed nine ended lessons when
the companion itself stopped. The final suites and browser runs pass. The F2
browser harness is in the existing Verify step with its artifacts; remote CI
has not run on this unuploaded feature.

## Remaining qualification and integration

**No live or paid inference ran.** Scripted success demonstrates validation,
attribution and accounting, not that a live learner acquired competence. Actual
resident willingness, answer relevance, semantic repetition, model compliance,
provider diagnostic fidelity and learning transfer remain unqualified. A real
provider can decline, fail, or run out of capacity; the UI records those outcomes.
No live-model quality claim follows from a matching synthetic model identifier.

F1's outstanding human comprehension/repeat-visit playtest, physical devices,
screen readers and hosted acceptance remain open; see the preserved
[F1 limits](../followers-local-2026-11-05/README.md). Phone evidence is Chromium
emulation, not a physical phone. The current local clock/paused lesson is not
the future always-running server clock.

Review F2 against F1 `58b9616`. F1 is still an unmerged local dependency, even
though #71 has now merged separately. Reconcile the independently owned
resident-growth/character work and requalify the eventual main integration;
textual overlap resolution alone is not behavioural acceptance. No F3/F4,
closed-browser worker, general skill framework, guild, production configuration,
secret, quota, payment or hosting change is included. Upload, merge, publication
and paid inference require separate authorization.
