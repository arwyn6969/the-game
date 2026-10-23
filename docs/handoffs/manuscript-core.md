# Physical manuscript prototype — core lane

22 October 2026. Base `dd50d26`; branch `codex/manuscript-core-20261022`. This is local prototype source, not a publication or a live-model acceptance receipt.

The optional `Town.physicalItems` extension creates one blank communal manuscript only on explicit opt-in. Its fixed local ID, author/content revision and exactly one ground/held location survive restore and explicit fork without embedding old permanent character/world references. All eight actors share strict revision-checked immediate pickup, drop, read, write, speak and wait commands. Model-generated writing must supply actual bounded text; no seed story or invented resident dialogue is created. Only the reader receives the text from a read. Visible metadata and actual nearby residents form the physical observation; bystanders do not receive manuscript content merely by standing nearby.

The single selected NPC may use a bounded approach/bring intent. Ordinary pathfinding and the existing three-step-per-minute movement pass do the work; no inference occurs for each step and no teleport proves arrival. Existing Library goals and active paid cafe/grocery work take priority. A 180-game-minute deadline, competing custody/revisions, Stop and an explicit new-trial controller revision prevent indefinite or stale continuation. Route paths can be discarded on save; persisted intentions rebuild goals after reload. Carrying never automatically puts down, reads, writes or speaks.

The controller supports one resident and a finite 1–20 decision allowance (default eight). UI owns inference dispatch through `nextPhysicalJob` / `markPhysicalRequest`; `stepMinute` does not emit physical AI jobs through legacy offline inference. Marking increments requests/decisions and unknown attempt/token samples without changing session revision. Fresh usage completion replaces each unknown once; stop/stale completion leaves uncertainty. Record usage before applying the decision. `applyPhysicalCommand` increments controller revision after accepting or rejecting the current actor's decision. The caller must validate the response's actor/session revision before execution because the common immediate command interface also serves ordinary player actions. Generic `applyResult` rejects physical decisions before mutating state.

`speak` and `wait` park further inference. An explicit new bounded trial may replace a parked session, with a new revision and reset trial accounting; content/custody remain. Stop a running movement or active nonwaiting trial first. Pending requests stay waiting after reload: only explicit operator restart starts another trial, never an inferred success or automatic retry.

The pure extension validator runs before legacy save repair and on writes/exports. Invalid custody, content, versions, poses, intent structure or accounting fail visibly with raw recovery bytes retained. Normal item commits preserve the live Town root and resident references, so existing storage-origin and multi-tab conflict protection still applies. No economy, wallet, auth, model routing or hosting behavior changes; legacy loaf/project behavior remains intact.

Validation in this isolated checkout with bundled Node 24:

- Exact-lock `npm ci --offline --no-audit --no-fund`: passed (454 packages).
- New focused core suite: 14 passed, covering all eight actors, private read content, strict quotes/custody, single movement pass, paid/Library priority, route reload/expiry/competition, request accounting/stops, restore/fork, malformed raw recovery and multi-tab conflicts.
- Relevant combined save, identity, reading and interruption suites: 64 passed, zero failures/skips.
- Changed-file lint and diff whitespace checks: passed after removing a control-regex lint error.
- Standalone typecheck: only the expected frozen-contract `act` union errors in AI-owned `offline.ts` and `prompt.ts` remain until lane integration; no core-file diagnostics. The coordinator must rerun typecheck/full checks after integration.

No live model/provider, browser, production database, migration, wallet, paid call or deployment was used. UI/renderer and AI prompt/gateway integration are separate lanes and require the coordinator's final integrated checks.

## Grounding follow-up — 22 October

The coordinator's first real-model trial demonstrated working pickup/read/write/speech but also invented financial claims. After integrating coordinator baseline `b1a74b3`, this core follow-up changes only new manuscript memories and their focused regressions. Actual pickup, writing and reading completion remain factual events. The quoted body copied into the author's or reader's own memory is explicitly labelled **quoted, unverified authored manuscript content** and uses `source: "statement"`. Another resident reading the same document receives the same provenance. Reading establishes what words are present, not the truth of their claims. Empty pages remain a factual observation; no invented quotation is added.

Manuscript content and action results remain verbatim. There is no currency filter, truth classifier, forced story or financial mutation. Two regressions deliberately write unsupported “Cash on hand: £12.40” / “Rent £85” claims while Northern actually has two coins, then have Sub read the same text. They verify body memories remain statements, completion metadata remains events, bystanders receive no private-read content, all finances stay identical, and both legacy-v1 migration and current-v2 sources survive the v2 save round trip. No Town/types/save contract changes or historical memory rewrites are included.

Follow-up validation: typecheck passed; changed-file ESLint/Prettier and whitespace checks passed; all **20** core, manuscript integration and physical prompt/parser tests passed (16 core cases, including the two additions). This lane made no real-model request, configuration change, migration or deployment. The coordinator owns integration and the separately authorized bounded qualification trial; prompt/own-financial-facts changes belong to the AI lane.
