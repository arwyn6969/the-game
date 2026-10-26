# Social facilitation and action deadlines — 26 October 2026

Owner: current social assessment chat. Branch `codex/social-experience-20261026`,
isolated checkout `social-experience-fix/`, base `4a5ae77d531b984320203daa86449c168bd0fe15`.
Runtime/tested source: `86895092768a22edf3a563522af042941eff1dba`.
Review: [draft PR #57](https://github.com/arwyn6969/the-game/pull/57).

## Change

An accepting facilitator now receives clear role guidance: normally join as a
speaker, open with a brief relevant question and invite other views. Decline,
listen, pass, leave and close remain valid voluntary choices; no engine decision,
dialogue or audience is forced. Participant guidance encourages a relevant
contribution when the resident has one. Examples describe wire syntax rather
than declaring every action equally purposeful.

One action request now has a bounded 30-second provider deadline and a
45-second client wait, including transport/accounting overhead. Optional
`actionTimeoutMs` can shorten the provider wait; existing configurations need no
edit. Other job deadlines retain their configuration. Action attempts remain one,
output remains capped at 1,200 tokens, and existing quota, accounting, concurrency,
auth and save contracts remain. The server's 90-second budget lease is unchanged.
This prevents the previous 15-second client wait from expiring before the new
action deadline; upstream availability remains a separate limitation.

## Actual bounded retest

The exact earlier synthetic town, labelled player opening, voluntary resident
choices, memories and seven settled attempt rows were retained. One explicit
resume used at most five further calls under the original twelve-call player
ceiling and twenty-four-call account ceiling. There was no new grant, retry,
paid fallback, production database or configuration change. The copied local
ledger gained the existing manual-action function so it could retain one global
request, `backgroundConcurrent: 0` and `actionConcurrent: 1`; prior charges were
verified before inference. The monetary tariff remained zero.

The default scheduler produced:

1. Arwyn: participate.
2. Northern: keep listening.
3. Sub: keep listening.
4. Arwyn: a real spoken suggestion about familiar texts, followed by “What would you change?”
5. Northern: participate.

All five requests succeeded without a timeout, in 0.820–3.609 seconds each, using
8,468 known tokens. The provider snapshot reported zero monetary usage. Arwyn's
statement reached exactly Northern and Sub. The player was off for that turn,
then explicitly listened without receiving earlier words. Nearby Baba and other
uninvolved residents received no statement memory. Finances and saved knowledge
remained unchanged outside the actual attributed statement. Generation stopped
at twelve cumulative attempts; all twelve local budget/provider rows settled.
The historical timeout remains recorded with unknown usage.

An offline replay matched every new transmitted prompt hash, applied all five
actual decisions, independently audited the real statement, reproduced the final
meeting exactly, checked save/reload knowledge and queried a copy of the SQL
ledger. [Sanitized result](../review/social-reliability-2026-10-26/summary.json).
Raw prompts, synthetic towns, ledgers, replay code and hashes remain ignored in
`artifacts/social-reliability-20261026/` and `artifacts/social-retest-runner/`.

## Validation and limits

- Node 24: 1,095 script tests, 55 typed tests and 425 town tests pass. Typecheck,
  lint (zero errors; one inherited auth warning), diagnostics and credential-free
  Node/Cloudflare builds pass. The first full-suite run had three sandbox-only
  loopback `EPERM` failures; the permitted rerun passed every test. Migrations
  skipped with `DATABASE_URL` absent.
- Added transport regressions accept a response body beyond the legacy deadline,
  reject invalid timeout overrides and settle a timed-out action once without
  retry. Existing refusal, audience, late-response, pacing and reload tests pass.
- Actual CUA used a separate loopback preview with synthetic 20-second responses
  and no provider credentials. Desktop and narrow layouts accepted the response
  after the former 15-second deadline. A confirmed pending Stop disabled restart
  while settling and rejected the late result; the meeting stayed paused without
  additional speech. The clock, normal meeting controls and reload were used.
  Chrome's requested 390-wide override produced a measured 520 CSS-pixel viewport,
  so exact 390-width acceptance is not claimed. Private screenshots and UI results
  remain in `artifacts/social-ui-check/`.

This proves one facilitator contribution with correct delivery and a subsequent
voluntary participant choice. A second NPC's spoken reply, speech after player
opt-out, a fresh unattended meeting from new invitations, sustained conversation
quality and hosted/device acceptance remain unqualified. The earlier player
opening remains explicitly labelled; this retest does not establish a fresh
unprompted meeting opening. More real requests require actual quota headroom.

Source integration and hosted publication have not been performed by this task.
Mobile work remains after the remaining social qualification, as requested.
