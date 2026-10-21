# Player acceptance — 21 October 2026

**Status: bounded packet ready for review.** The current committed candidate passed fresh local-only desktop and emulated-phone controls, conversation, save, library and reading journeys. No reproduced application defect warrants a code change in this packet. Five human sessions, physical-phone use, real screen-reader use and AI-quality acceptance remain unrun here.

## Ownership and tested source

- Owner: `player_acceptance`, coordinated by the [canonical delivery tracker](../../../product/docs/DELIVERY_TRACKER.md).
- Checkout: `player-acceptance/`; branch: `codex/player-acceptance-20261021`.
- Base and tested application head: `215c8c74c7c3b41c5a6f07e921da4552c5498c0d` (committed PR #36/#37 candidate).
- Application source fingerprint: `8592d746116e1195ab041db936e4b4584789b91b839514977fda93287f6a91d3`.
- The clean-source build predates this documentation-only handoff. Kevin's active repair and the existing agent's uncommitted provider changes are excluded. No claims below validate that subsequent candidate.
- Node `v24.19.0`; dedicated `node_modules` copy; sanitized staged production build; loopback `http://127.0.0.1:8102/`; fresh disposable browser contexts. No personal town, wallet, external account or model was used.

The [build receipt](../review/player-acceptance-2026-10-21/build-receipt.json) identifies the actual build. The complete original manifest remains in ignored `artifacts/playtest-app/build.json`. Authentication was enabled throughout. The checked-in evidence contains only synthetic towns and interface screenshots; no player save is committed.

## Result and evidence

| Automated check | Result and limit |
| --- | --- |
| Desktop 1280×800 and phone viewport 390×844 | Keyboard/touch movement, pause, Journal/Inventory/Help, local conversation, nonempty download, import and reload passed; no browser errors or page-wide horizontal overflow. Phone is desktop Chromium touch emulation. |
| Save safety and identity | Stale-tab conflict preserves the latest save; version-1 migration, repeated identity restoration, explicit new-town fork, reload and corrupt-identity rejection passed. The nearby-conversation fixture is synthetic, not a naturally discovered human journey. |
| Library using ordinary controls | Successful desktop and deliberately unsuccessful phone lookup paths passed. Both paid all 6 earned coins, retained 2 project coins and conserved the world total of 90. Export/import/reload preserved outcomes. |
| First reading using ordinary controls | Park and library routes passed at both sizes, with 2/3 guests, listen/read participation, optional bread/tea, conserved money and portable import/reload. Automated scene completion is not evidence of enjoyment or comprehension. |
| UI edge and interruption checks | Escape/focus restoration, route cancellation, replay movement protection, keyboard import modes, modal cancellation, caption preservation, resident/tool exclusivity, keyboard tabs and phone touch cancellation passed. Panels alone changed no money. |
| Fresh arrival observation | Two additional empty synthetic contexts captured entry, arrival and first Library view using ordinary controls. No errors or attempted model calls. Measured and visually inspected the first-screen layout. |

Saved receipts: [browser journeys](../review/player-acceptance-2026-10-21/browser-results.json), [fresh arrival observations](../review/player-acceptance-2026-10-21/first-look-results.json). The browser receipt's `builtPreview: false` means the harness did not auto-launch its default server; the supplied URL served the production build identified above.

Screenshots: [desktop arrival](../review/player-acceptance-2026-10-21/desktop-arrival.png), [phone arrival](../review/player-acceptance-2026-10-21/phone-arrival.png), [desktop first Library](../review/player-acceptance-2026-10-21/desktop-first-library.png), [phone first Library](../review/player-acceptance-2026-10-21/phone-first-library.png).

## First-session friction to observe with people

These are concrete presentation observations and test hypotheses, not reproduced functional failures. No redesign was made before participant evidence.

1. **Phone navigation visibility:** at 390px, Agent wallets, Stamp identity, Journal and Inventory occupy the first tool strip. Go to extends past the right edge (x=361–410), while Library and Help start offscreen (x=415 and 479). The visible welcome card supplies a working Library entry, and scrolling/focus can reveal the other controls. Record whether people find destinations and Help without assistance or become distracted by wallet/identity controls. If repeated, the next narrow UI change should put essential town navigation first while retaining optional identity tools.
2. **First choice reading load:** the phone Library view presents the story, next step and roughly 69 words of source-check terms before its first Accept button. The second paid option and explicit Decline are below the fold. Funding, payment and withdrawal terms are accurate and necessary; observe time to decision, whether refusal is discovered, and whether people can state the task in their own words. If they struggle, shorten the choice's lead sentence and disclose detail without hiding material payment/obligation terms.
3. **Tomorrow expectations:** the entry screen says “A persistent pixel town,” while the actual local game saves in this browser and does not advance while closed. The existing protocol already handles this correctly. Ask what the participant expects before reopening and record any mistaken expectation; do not promise elapsed-real-time progress. This is a research prompt, not evidence that participants are currently confused.

## Exact commands and local artifacts

Executed with the Node 24 binary at `/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`:

```sh
node scripts/playtest.mjs --build-only
node artifacts/player-acceptance/preview-8102.mjs
GAME_QA_URL=http://127.0.0.1:8102/ GAME_QA_OUT=artifacts/player-acceptance/browser node scripts/quality-browser.mjs
node artifacts/player-acceptance/first-look.mjs
```

The existing launcher cannot select QA port 8102. The ignored, lane-local `preview-8102.mjs` verifies the existing receipt/stage and uses the launcher's `playtestEnvironment` and `assertPortAvailable`, then starts ordinary Vite production preview on 8102 with `envDir: false` and `strictPort: true`. It changes no application/auth code and signals only its own child. Human-session ports 8181–8185 were not started or used. The additional first-look script is an ignored evidence helper using Playwright, ordinary controls and blocked model endpoints.

The initial sandbox attempt failed its loopback permission check with `EPERM`; tool escalation then allowed the same local operation. No approval rejection or unresolved tooling blocker occurred. Logs, source manifest, synthetic downloaded saves, helper scripts and additional screenshots remain in this checkout's ignored `artifacts/player-acceptance/` and `artifacts/playtest-app/` folders. The original evidence was retained. Full typecheck/lint/unit suites and the broader axe audit were not rerun: this packet changes no application code and the assigned fresh browser acceptance passed.

## Handoff to the existing five-human protocol

Use [the existing protocol](../implementation/game-quality-playtest.md); do not create a competing test round. The launcher prepared private `artifacts/playtest-human/PT01/record.json` through `PT05/record.json`, all still **not run**, with no build/session observations fabricated.

1. Coordinator pins one reviewed application candidate after the A/B review. If any application input or the build's recorded source state changes, rebuild through `node scripts/playtest.mjs --build-only`; record its receipt. The current smoke is transferable only to the recorded source, not automatically to Kevin's final patch.
2. Assign five actual participants: PT01 and PT02 desktop, PT03 and PT04 phone, PT05 either including keyboard/access needs where available. Record anonymous IDs, actual device/browser and actual accessibility settings privately. A participant/facilitator roster has not been supplied.
3. For desktop baseline, run `node scripts/playtest.mjs --skip-build --session PT01` (then the appropriate session ID). Keep its origin/profile and build constant across visits. Select local dialogue, confirm a fresh name screen and use the sole uncoached prompt: “Find something you want to help with, or decline it.” A model or synthetic browser journey never fills a human slot.
4. Physical phone sessions require a separate authorized device-reachable preview of the same build; `127.0.0.1:818x` is loopback on the computer. Do not count phone viewport emulation as that preview or as device acceptance. The coordinator must arrange the actual phone route before scheduling PT03/PT04.
5. Follow the existing 10–15 minute session, pause and verify a real nonempty download, reopen the same saved town and use ordinary clock controls to the next game day. Preserve each browser copy/export. Record consequence understanding and voluntary return separately from functional completion.
6. Gate within this local round: at least 4/5 choose a contribution/refusal and explain it; at least 4/5 recognize their consequence after reopening; at least 3/5 voluntarily choose another visit. Lost saves/payment, unintended obligations, money reconciliation errors or private disclosures fail the round regardless of counts. Keep a later AI round's observations separate.

## Blockers and next action

| Gate | Status / exact missing input | Owner / next action |
| --- | --- | --- |
| This local automated packet | Ready for review; zero failing journeys | Coordinator reviews evidence; no runtime delta to integrate. |
| Five human sessions and voluntary return | **Not run:** participants/facilitator slots and final candidate are not assigned | Coordinator pins candidate and records actual session ownership; then conduct the existing protocol. |
| Physical phone | **Not run:** no physical device session or authorized device-reachable preview | Coordinator arranges same-build phone access; facilitator records touch, on-screen keyboard, download/import and reload on hardware. |
| Real screen reader / native zoom | **Not run in this packet:** no actual assistive-technology session | Facilitator performs and records the protocol's device/AT paths; prior incomplete VoiceOver work remains incomplete. |
| AI quality and Kevin repair | **Outside this local-only evidence:** final A handoff and relevant auth/accounting/$0 prerequisites | Existing A owner finishes Kevin; coordinator integrates/rechecks affected paths and scopes the separate AI-quality round. |

The next useful work is to put this known candidate in front of people and collect the specific observations above. Additional generated playthroughs cannot resolve the remaining comprehension, return-intent and physical-accessibility gates.
