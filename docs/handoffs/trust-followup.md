# Player consent, conversation and recovery follow-up

11 October 2026. Corrective integration on `codex/trust-repair-followup`, based on PR #7 (`codex/grok-trustworthy-talk`). The initial review used `1d5cda532066fa2a7720a6f7eafa53a0f606aff6`; the usable-loaf update `96f25e6` was integrated before delivery. Main, hosting and production secrets were not changed.

## Player-visible changes

Conversation has a **Choices** disclosure with terms and explicit action buttons. Asking about bread, declining payment, discussing work or receiving an AI reply cannot create a player transaction or commitment. A chosen action checks current terms, debt identity, amount, funds, proximity and eligibility. Used or changed quotes fail. An unsent message survives choosing an action.

The shared branch's loaf is preserved: accepting bread records the loaf and its debt together; eating consumes the loaf without forgiving the tab. Neither action is inferred from free text. Existing saved loaves remain usable.

New cafe agreements pay only for their quoted 16:00–19:00 interval. Lunch does not count as work. Imported legacy shifts keep their existing planned hours. Missing schedule slots and conflicting saved projects prevent a false acceptance rather than creating a broken commitment. Work terms disclose the existing limits: recurring shifts, conditional till funding, no partial wage and no unpaid credit carried past midnight.

Replies follow the latest conversation entry, rather than the bottom of the combined conversation and obligation history. A reachable **Newest reply** button lets a reader return after looking at older entries. The header reports a compact count of open tabs/favors, with details in the journal, so old paid tabs cannot consume the play area. Choices and composer remain reachable on a phone.

Unreadable saves offer a complete raw download and full clipboard copy. A truncated preview is explicitly labelled as incomplete. Failed or unavailable clipboard access has an honest fallback. Both recovery import and ordinary replacement initialize pause, hint, panel, input and replay state through the same function. Unavailable storage presents a retry gate instead of treating an unknown existing town as missing.

## Verification

Node 24 validation on the combined source passed: `npm run typecheck`; `npm run lint` (one existing auth-file unused-disable warning); `npm run test:town` (64 tests); and `npm test` (262 script tests plus 55 app/auth tests, 317 total, none skipped). `npm run diagnose:town` found no world-audit issues and all measured exports imported through day 30 (819,492 UTF-8 bytes; 29 legitimate Northern wages). `env -u DATABASE_URL -u XAI_API_KEY npm run build` passed, with database migrations skipped.

Actual browser checks used the real TownApp, styles, simulation and save code in an isolated local fixture page, with only the mind gateway replaced by an offline stub. CSS viewport sizes were verified as 1280×800 and 390×844. Synthetic fixtures and screenshots are ignored under `artifacts/trust-review/`.

- Tested long conversations with twelve settled debts, explicit acceptance/payment, preserved drafts, reading older messages, **Newest reply**, and persistence after reload. A completed payment changed player money 4→2 and Baba money 9→11, with the exact tab paid.
- Tested explicit shift acceptance/cancellation, keyboard movement, held phone direction controls, pause, ordinary import confirmation and reload.
- Recovery rejected an invalid file. A valid paused 07:00 backup retained its name, planted conversation, debt and pause through import and reload, with the welcome hint dismissed.
- With clipboard access deliberately rejected, the damaged-save download matched all **480,063 UTF-8 bytes**, including Unicode, CRLF and the final sentinel. SHA-256: `3dfcadd542c4fbceb02aec14f3eb7f83b54e88a413829c4d4a4cbe6d67a7d045`. The displayed preview was only the first 200,000 of 300,063 characters.
- Unavailable storage stayed in the retry gate while blocked; after access returned, retry recovered the existing town.

Independent Astra review found the lunch-wage bug, false acceptance for malformed imported schedules, and the initial legacy-shift compatibility risk. Each received a focused regression. Model transaction bypasses, Unicode refusals, stale/replayed quotes and private-seed leakage in routine offline greetings also have regression coverage.

The final loaf integration was checked on the phone: receiving the loaf left money unchanged, eating removed the action and left the debt open, and payment then reduced the player balance from 4 to 2. Astra's final focused code review found no concrete blocker in atomic loaf/debt creation, consumption, stale quotes, model refusal or legacy-shift compatibility.

## Limits and next work

This is a trust repair, not the fair-economy implementation. The funded community-project proposal and Astra direction review remain in PR #5 at `e6c7c5658840b59438d7d91fa5ac237d6465d66b`. Funding sources, reserved wages, work receipts, useful outcomes and shared ownership still need implementation. Midnight till grants/caps remain unchanged.

Zero-value favors cannot be marked complete without a real completion mechanic. Free-form AI prose can still make an unsupported claim even though it cannot apply a transaction. The privacy fix covers routine offline seed disclosure, not every possible online disclosure. An imported town may wait for the old mind request to finish or time out before a new request can start; the old result cannot mutate the imported town. Real provider dialogue, physical phone keyboards and the hosted website were not tested in this pass. No merge or publication occurred.
