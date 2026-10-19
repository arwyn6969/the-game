# THE GAME

A pixel town. Seven people already have days. You are their new neighbour. There is no ending.

This is the current web game: `arwyn6969/the-game`. The separate `arwyn6969/THE_GAME` repository is an older Python simulator. New game development belongs here. Publishing the website at https://thegame.grok.me is separate from updating GitHub.

The current quality candidate integrates main through `4a39cdf`, including character cards, town conversations, per-resident drafts and remembered deeds. It adds a playable funded library project, durable wage agreements, inventory actions, responsive AI waits, safer saves and shared provider budgets. See the [delivery notes](docs/implementation/game-quality-delivery.md) and [roadmap](docs/ROADMAP.md). Publishing https://thegame.grok.me is a separate step; this branch does not identify the live site's version.

The [pre-release refinement](docs/reviews/2026-10-15-pre-release-polish.md) adds precise library checklists, clearer money and inventory feedback, employer-bound work guidance, protected appointments and further draft/save recovery fixes.

The 16 October [interruption and save-recovery pass](docs/reviews/2026-10-16-interruptions.md) fixes hidden menus, keyboard tabs, wage follow-up dates, stale completed tasks and quest deadlines, with 610 passing tests and built desktop/phone checks.

The approved [stamp identity and wallet tooling plan](docs/implementation/stamp-identity-tooling.md) began at quality candidate `80ee299` and now includes its later fixes: permanent identities, verified stamp selection/optional heads, receiving wallets, owner-approved transfers, tested trading and then multiplayer/PvP. The additive identity packet and [read-only wallet appearance preview](docs/implementation/stamp-wallet-selection.md) provide portable IDs, optional Leather proof, supported classic stamp selection and player portraits/heads. [Packet 3A](docs/implementation/agent-receiving-registry.md) adds a private authenticated owner namespace and watch-only receiving drafts on `codex/agent-receiving-registry`; its [validation receipt](docs/implementation/agent-receiving-registry.md#validation-receipt) records passing account, SQL, signature and desktop/phone checks. Funding remains unpublished (`fundingPublished: false`). The [private chain-observation continuation](docs/implementation/agent-deposit-observations.md) adds explicitly requested BTC-output and Counterparty direct-send observations, including retained addresses and pending/confirmed/reorg handling. The [recovery policy](docs/implementation/agent-wallet-recovery.md) records account-linking protections and the successful human-assisted Chrome/Leather appearance proof. Stamp artwork uses nearest-neighbour scaling. [Wonder Wallet](docs/implementation/wonder-wallet.md) is the preferred connector in the review candidate, with Leather available explicitly; actual Wonder extension acceptance remains pending. Real receiving-message/account checks, asset compatibility and backup/restore acceptance remain open before inviting deposits. Every eventual outgoing transaction requires owner approval; live funds, trading and multiplayer/PvP remain later work.

## Play

Name yourself. The clock starts paused on the row.

1. Press 1× and walk to Hobbs Cafe.
2. Click Kevin.
3. Ask him who he is.

The question can travel onto the board and into other people's memories. Baba's **Choices** let you explicitly accept a loaf and a tab of 2, then repay the debt separately. **Inventory** lets you eat or optionally share the loaf. Kevin's **Choices** let you read and accept a funded shift: 5 for 180 eligible minutes at his cafe. Progress and its reserved wage survive interruption and midnight; visiting a counter does not earn a wage.

Open **Library** to help Northern arrange his first reading without an AI key. Choose or refuse a paid check, walk to the library, inspect the public cards and boxes, and submit your report. Observed box locations carry into the draft; you can review or change them before Northern's independent lookup. Agreed completed work is paid even if the reference fails.

After the lookup, choose a small park reading with Northern and Sub or wait for Baba's dated room note for a larger library reading with Arwyn. Guests walk there around prior work; **Go to the reading** finds their gathering. Join for free, listen or volunteer a first line, and optionally spend two coins on bread or tea from the shops. Their shared scene and your actual attendance survive reload. The index, payment credit and correction opportunity remain recorded separately. **Journal** keeps the agreements and outcomes.

The town saves in this browser. Conflicting tabs cannot silently overwrite newer saved progress. A failed save or conflict shows recovery and download actions. Import preserves a recovery copy before replacing the town. Download and import retain debts, notes, identities and validated financial records, including migration from ordinary version-1 towns. Portable files omit disposable replay frames and use an 8 MiB limit. Keep backups: browser shutdown saving is best effort.

The current development version has seven residents: Kevin, Arwyn, Northern, Baba, Sub, Data and Amelia, plus the player. Data brings a testing and technology perspective; Amelia brings economics and fair terms. Recent conversation turns persist, and characters receive dated memories with a distinction between spoken claims and recorded events. Local replies provide authored perspectives and follow-ups when the AI service is unavailable.

Version-1 towns migrate to version 2 with their original residents and history retained, then add Data and Amelia once. The original browser save remains under its old storage key; new saves use a separate key. Keep a downloaded backup before trying a development version. Older game versions cannot read version-2 exports. See [the seven-resident handoff](docs/handoffs/seven-resident-coherence.md) for checks and limits.

## What is in this repo

The character UI development build adds portrait cards with Overview, Strengths, Together and Progress tabs. Open **Town life** for readable NPC exchanges, recorded relationship changes and updated plans. **Watch town conversations** follows non-secret public dialogue without adding player knowledge; dated reflections are an optional separate view. Character drafts, pinning and camera following work for every resident. See [the character UI design and browser checks](docs/design/character-social-ui.md).

An opt-in [AI provider pool](docs/AI_PROVIDER_POOL.md) routes each game job to its preferred available model, reserves configured quotas, and falls back to offline play. Local quota records reset on restart; recognized deployments require shared Postgres. Start with `npm run ai:pool -- init`; the guide covers private setup, provider keys and model preferences. Every provider starts disabled. Ordinary development uses the existing Grok path when a server key is configured.

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

The [Kevin World notes](docs/KEVIN_WORLD.md) preserve Arwyn's original vision and explain Kevin's technology memory preference. The S1 economy foundation from PR #16 is reconciled here with eight actors, version-2 saves and the complete funded-work UI. Fresh towns contain 90 coins; imports keep their valid opening total. Ordinary transfers conserve money and existing creditors. Experimental version-1 ledger saves still require their original branch and remain recoverable. Older builds cannot safely maintain the new financial extension; download a backup before changing versions.

`npm run test:town` runs the town, save, economy, retrieval, conversation and collision regressions without a running Vite app. The day-two check verifies that the question travels, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.

## New contributors

Start with [AGENTS.md](AGENTS.md), the [delivery notes](docs/implementation/game-quality-delivery.md) and the [roadmap](docs/ROADMAP.md). The earlier [technical contributor handoff](docs/handoffs/new-developer.md) retains useful background; its AI-metering assignment predates this implementation. The browser-local game and a future continuously running shared town remain separate scopes.

## Development and two-agent setup

Use Node 24 (`.nvmrc`), then `npm ci` and `npm run dev`. The development server uses port 8080. AI dialogue requires a server-side `XAI_API_KEY`; without it the town uses offline dialogue. The player can also select **Local-only dialogue** in Help. Do not put keys in browser code or a `VITE_` variable. Deployed paid calls require shared accounting and explicit conservative tariffs for both provider modes; see [budget configuration](src/lib/mind-budget/README.md). Missing or failed accounting falls back locally.

Use the [branch and PR record](docs/BRANCHES.md) to choose the current parent for follow-on work. The active candidate is the four-PR gameplay → identity → appearance → private-wallet stack; main still contains the earlier baseline. The retired consolidation branch remains recoverable from merged commit `1461148`. Read [AGENTS.md](AGENTS.md), [the consolidation record](docs/CONSOLIDATION.md), and [the collaboration workflow](docs/COLLABORATION.md). Older prompts and [the baseline](docs/BASELINE.md) are historical; they are not instructions to restart a completed branch.

Run `npm run test:town` for game regressions, `npm run diagnose:town` for review scenarios and `npm run diagnose:longevity` for synthetic long-term checks. After building, `npm run test:browser` checks desktop and phone journeys, the library loop, both reading scenes, multi-tab conflict handling, replay input and keyboard/import focus. Against a warm local development server on port 8094, `npm run test:browser:ai` checks delayed, missing and reordered responses with a browser-only mock and no provider calls. CI runs both browser gates. Diagnostics report observations; tests assert their covered behavior. Help displays the source build ID. The [five-person playtest](docs/implementation/game-quality-playtest.md) remains a human evaluation gate. Earlier publication evidence is in [docs/RELEASE.md](docs/RELEASE.md).

`npm run build` also runs database migrations when `DATABASE_URL` is configured. Local validation should use no live database credentials. The full suite now passes; lint retains one existing unused-disable warning. The baseline records the historical starting failures.
