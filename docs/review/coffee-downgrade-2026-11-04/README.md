# Café downgrade and recovery

4 November 2026. Code `2307655b2c3737ce012f3384c535edc703ba9aa0`, continuing
draft [PR #71](https://github.com/arwyn6969/the-game/pull/71) from `6e29a0c` on
`codex/relationship-feedback`; fetched main remains `49cf76f`. The user authorized
these checks, reproduced fixes and the PR update. Starting-head
[Verify 41841845121](https://github.com/arwyn6969/the-game/actions/runs/41841845121)
passed every step; the updated head requires separate CI qualification.

## Pinned rollback and result

The actual recorded rollback Worker `c4098113-6b5c-43db-8ff4-b39d64e2eb72` maps
to source **`c183e32d3dc4de923490471da2d30a66caf788a7`**, tree
`acd7473281d444b4f52720bed8067a94b1bef60e` in the
[2 November release receipt](../live-release-2026-11-02/release.json).

The harness archives that exact source, verifies identical package/lock/Node
files, and builds it without private configuration or provider/database credentials.
Both this archive and the current source build successfully with migration skipped.
A disposable proxy switches between these builds **on one browser origin**.
Each visit verifies the selected build's entry assets against fetched hashes;
current and rollback bundles differ. Service workers are blocked and browser
HTTP cache is bypassed so cached current code cannot mask the older build.

Four Chromium journeys pass: enabled and feature-off saves at 1280×800 and
390×844. Each runs current → pinned rollback → current, performs ordinary
movement-triggered saves and downloads, and compares complete books, tills,
identities, memories, debts, work and coffee records. No destructive save or
financial defect was reproduced for this candidate.

The shared source-generated fixture contains all four rights together:

- One ready player-owned counter cup, with actual 20-minute brewing/10-minute placement provenance.
- Sub's two-coin refund pending at a full purse, cancelled after 12 actual brewing minutes.
- The player's suspended 20-minute shift and complete five-coin wage hold.
- Northern's earned five-coin payable after 180 actual attendance minutes, blocked by a full purse.

Both full purses are declared before the immutable opening ledger. The synthetic
opening is **2,081 coins**, not ordinary 90-coin play. Subsequent lawful transfers
conserve this total. The helper's manual source movement uses labelled adjacent
inputs; the prepared claims are not claimed as UI-earned in this packet.

After the actual old-build export reopens, source API capacity transfers settle
the original refund and wage exactly once, retaining the partial wage and cup.
Separate source cases test both settlement orders and explicit completion of the
existing partial shift in a later controlled service window. Feature-off refuses
new purchases, staffing and re-enable attempts; accepted work remains drainable.

Ordinary current UI Hour/travel/collect/drink controls then use the original
recovered cup once. Wage, refund, hold and transfer records do not change during
collection/use; reload retains one consumed cup and no second drink action.

## Fix and refusal/recovery checks

Visual review found misleading recovery copy: an existing disabled pilot still
invited the player to “Try seven game days” although no new trial was available.
The current panel now explains that new orders are closed while tickets, cups
and wage reservations remain. Initial opt-in wording stays available for towns
without a pilot. [Before screenshot](before-fix.png), [failing prior-build assertion](before-fix.json).
The final browser cases require the truthful recovery message and absence of the
invitation. No simulation, save schema, exported API or account rule changed.

A **one-shot** future café-version fault is introduced on the disposable origin.
The pinned and current builds both refuse it, keep the exact canonical bytes and
download the full original. A supported backup imported through the recovery UI
restores the valid town while preserving the unsupported original in a replacement
backup. The injector does not rewrite bytes between builds. Separate source
cases reject removed coffee data, cups or refund holds and retain the precise
lossy input rather than reconstructing empty rights.

## Validation and limits

[Checks](checks.json) · [browser report and asset receipts](browser-results.json)
· [diagnostics](diagnostics.json) · [screenshots](screenshots/).

Node 24.22.1: 1,200 script + 55 typed tests (1,255 total), 505 town tests and five
focused recovery cases pass. Typecheck, lint (zero errors, one inherited warning),
formatting and diagnostics (`worldAudit: []`) pass. Both credential-free builds
skip migrations. All 185 runtime/public/migration/config files in the final current
preview match the working source. Four final browser journeys, 16 assertion groups
and ten screenshots have no page/console errors or provider requests. Desktop and
phone recovery screenshots were visually inspected.

This supplies targeted R08 feature-off and **executed pinned-build compatibility**
evidence. It qualifies only `c183e32`, not arbitrary older versions, a deployed
Worker rollback, subpath hosting or service-worker/PWA cache transitions. The
fixture starts with paused/ended routines and proves they stay inactive; earlier
[control-interruption evidence](../coffee-ai-interruptions-2026-11-04/README.md)
supplies active-grant revocation coverage. Full-purse settlement here uses source
APIs; physical devices, screen readers and human comprehension/enjoyment remain
open. Simultaneous ready-versus-cancel and actual hosted/personal-model acceptance
retain separate gaps. No merge, publication, live inference, production migration,
wallet transaction, secret or budget change occurred. Grok/automations stay paused.
