# Sol 6.1: build the next consequential game loop

Use this as the starting message in the Sol 6.1 chat. It assigns implementation work; this planning session has not performed that implementation. The selected chat model is a user setting, not changed by this text.

---

Work on `arwyn6969/the-game` as the implementation lead. Build the assigned packet from the current strategic planning pack. The goal is: **“I come back because of what I did yesterday.”** A player's useful contribution must have understandable funding, fair payment, an observable result and a remembered consequence.

**Assigned packet: S1 only — accounts, funded-work contracts and compatible state.** Finish and verify that packet, then leave a reviewable PR and handoff. Do not automatically implement S2–S5. For a later assignment, replace this packet line with the next packet whose dependencies have passed; reuse the same planning sources and verification discipline.

## Establish the source

1. Fetch the repository and inspect current main, open PRs and local changes. Report the actual repository, checkout, branch and base SHA. The reviewed main at planning was `900015b2a3bba0a0826ea6d814f72af2f47dc7f0`; published runtime was `4e7786c30431e6701c8477d6ddb0b5ffa8ba8ca1`. Preserve any newer work.
2. Read `AGENTS.md`, `docs/ROADMAP.md`, `docs/design/consequential-first-week.md`, `docs/design/economy-and-fair-contribution.md`, `docs/implementation/community-project.md`, `docs/COLLABORATION.md` and `docs/RELEASE.md`. `docs/BASELINE.md` and the dated reviews are historical evidence, not today's failing checklist.
3. The planning pack is in PR #5 on `codex/playability-review`. If it is merged, start from current main. If it is still open, start from its latest remote head in your own checkout/branch and base your implementation PR on that planning branch. Verify it contains current main; integrate newer main only in your own implementation branch and resolve conflicts without losing work. Retarget after the planning PR merges. Never implement from an older export missing this pack.
4. Use an isolated checkout and a branch such as `codex/funded-project-accounts`. Do not reset or force-push another lane. PR #11 is a separate visual redesign touching TownApp, render, styles and assets; recheck its status before UI integration. Do not silently merge it or edit shared files concurrently.

## Implement S1

Read its full contract in `docs/implementation/community-project.md`; it is the acceptance specification, not an optional inspiration.

- Add the authoritative account/transfer/reservation/receipt helpers and validated optional v1 state. Preserve existing public APIs where possible. Account IDs must resolve the real personal purses and tills rather than create a second independently mutable cash store.
- Make commands atomic and idempotent. Bind quotes to actors, terms, current eligibility and revision. Failed commands cannot leave partial money, holds, work or item changes. Models may propose or explain, never authorize the player's spending or commitments.
- Define the migration boundary, validation, malformed-state recovery and old-runtime inconsistency detection. Preserve legacy balances, creditors, names, memories, debts, projects, pause and recorded work. Migration is not income and must not invent past earnings.
- Implement/test the funded task contract: reserve the full fee before acceptance; record required evidence; pay completed checks even when the result is unsuccessful; preserve payables across cancellation, midnight and reload. Follow the explicit atomic-unit cancellation terms.
- Protect payroll before project funding; a donor with unresolved or underfunded prior wage claims is ineligible. Implement the documented safe classification of legacy work, preserving ambiguous progress and preventing duplicate pay. Do not invent integer-coin proration. State remaining legacy limitations honestly.
- Audit all existing cash/till mutations and specify their adapters and integration points. S2 must activate the complete ledger, removal of unexplained top-ups/caps, matching financial terms and player UI together. S1 may deliver reviewed unused helpers; do not partially switch the live economy or quietly change terms without the UI.
- Provide the small additive query/action contract the S2 UI needs: available budget, holds, terms, progress, receipts, earned payables and rejection reasons. Keep implementation details out of player copy.

Do not build the library UI, shared meals, extra residents, cross-device storage, broader banking, provider changes or visual redesign in this packet. They have their own scope and stopping points. Continue independent engine work if the visual lane is active; record the precise integration handoff instead of overwriting it.

## Prove behavior

Use Node 24 and the committed lockfile. Keep live database/provider credentials out. Add meaningful tests for the S1 invariants and migration cases: the fresh 77-coin total; unequal imported balances and old-cap overflow; creditor ownership; competing holds; duplicate/stale/wrong-person/insufficient-fund requests; partial-failure rollback; full recipient purse; legacy paid/unfinished/unpaid/ambiguous work; day transitions; repeated migration/import; malformed extension recovery. Test outcomes rather than mirroring private helpers.

Run applicable checks and record actual counts/results:

```sh
npm run typecheck
npm run lint
npm run test:town
npm test
npm run diagnose:town
env -u DATABASE_URL -u XAI_API_KEY npm run build
```

The released baseline passed 317 full tests and 64 town tests; lint had one inherited unused-disable warning. Do not suppress regressions or treat diagnostic exit status as proof of fairness. If UI integration is assigned in a later packet, test real desktop 1280×800 and phone 390×844 journeys, imports/recovery and reload. Record any missing real-device or real-provider coverage.

## Finish the packet

Make routine reversible implementation choices without repeated approval requests. Resolve ambiguities using the documented prototype defaults; if a necessary decision materially changes the agreed experience or monetary obligations, make the narrow issue explicit and continue unaffected work. Do not silently reduce the acceptance scope.

Open a reviewable PR. Update `docs/handoffs/sol.md` with packet, base/head, changed behavior, invariant evidence, migration and compatibility, commands/results, unresolved limitations, additive UI contract and the exact next packet. Update roadmap status to “implemented, awaiting integration/release” only if that accurately describes the result; tests do not mean a feature is live.

This assignment does not authorize merging runtime changes, publishing, spending on services or changing production secrets. A later release instruction must identify the integrated candidate and be verified on the actual website. End with the PR link and what was proved, ready for review and S2.
