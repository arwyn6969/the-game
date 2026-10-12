# Verified starting point

Historical baseline, retained for evidence. Its failures and publication status are not current: the trust repair release passed all automated checks and was published on 12 October 2026. Use [RELEASE.md](RELEASE.md) for current validation and [ROADMAP.md](ROADMAP.md) for the next assignment.

Reviewed 11 October 2026. Repository baseline: [`ee5ff6575300bbe8a3ff6509ffb1bc2fcd1e85e3`](https://github.com/arwyn6969/the-game/commit/ee5ff6575300bbe8a3ff6509ffb1bc2fcd1e85e3), “Sync the full town app, not only the simulation slice.” Live reference: https://thegame.grok.me. The live deployment's exact source revision was not independently established.

The updated export includes the React/TanStack Start app, Vite configuration, npm manifest/lockfile, auth/app-data infrastructure, platform scripts, assets and deployment configuration. The core game, TownApp, mind gateway and original town-day check are unchanged from the earlier `1cc7559` review. The previously observed game issues therefore still need work; the scenarios below were rerun against this full export.

## Setup changes in this branch

- `.nvmrc` selects Node 24. Validation used Node 24.19.0 on macOS.
- Repaired the npm lockfile's incompatible AJV dependency placement and missing entries. The exported lockfile failed `npm ci` with EUSAGE. No direct dependency declarations were upgraded.
- Added shared instructions, two implementation prompts and separate handoff templates.
- Added `test:town` as an alias for the existing game check and `diagnose:town` for deterministic offline observations. No gameplay or production configuration was changed.

## Checks and limitations

| Check                                                        | Observed result                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean install with repaired lockfile                         | Passed; see reproduction commands below                                                                                                     |
| `npm run typecheck`                                          | Passed                                                                                                                                      |
| `npm run build`, with `DATABASE_URL` and `XAI_API_KEY` unset | Passed; migration explicitly skipped because no database URL was configured                                                                 |
| Existing `scripts/town-day.test.mjs`                         | Passed (`town-day ok`); its Vite setup also attempted an HMR listener and printed a sandbox `EPERM` for port 24678                          |
| `npm test`, script-test stage                                | 198 tests: 181 passed, 17 failed; command exits unsuccessfully and does not reach the app/auth stage                                        |
| App/auth stage run independently                             | 55 tests passed, zero failed                                                                                                                |
| `npm run lint`                                               | Two errors, five warnings                                                                                                                   |
| New offline diagnostic script                                | Completed without network, model credentials or a listening server; observations in [the snapshot](review/2026-10-11-town-diagnostics.json) |

The 17 script-test failures comprise four absent OG skill/reference fixtures under ignored `.grok/skills/og`, four expectations involving the absent `.grok/app-env.json` (including three wrapper tests), eight PWA/share-metadata expectations and one missing `public/__grok/icon-180.png`. Treat these as real failing checks to investigate: some are environment-dependent template tests, while the missing public asset or metadata behaviour may require application repairs. Do not copy private Grok workspace data or disable auth to satisfy a fixture.

Lint errors are `no-control-regex` at `src/game/text.ts:61` and `no-empty` at `src/lib/app-data/client.server.ts:281`. Warnings are four unused variables in `src/game/offline.ts` and an unused eslint-disable directive in `src/lib/auth/use-current-user.ts`.

The existing town-day check is shallow: passing it does not establish correct debt ownership, wages, save round trips or query-aware memory. The production build also does not prove that a clean external deployment has the right auth, database or runtime AI configuration. No deployment, real database migration, provider load test, security audit or real-device keyboard test was performed for this setup.

## Reproduce locally

Use Node 24 and a clean checkout of this setup branch. Keep production credentials out of this environment.

```sh
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm run test:town
npm test
npm run diagnose:town
env -u DATABASE_URL -u XAI_API_KEY npm run build
```

The commands are listed separately because the inherited test/lint failures are expected to stop an `&&` chain. To run the app/auth stage despite the first test stage failing:

```sh
node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts
```

The diagnostic command deliberately prints current behaviour, including bugs. Its exit status means the scenarios ran; it is not a test pass. `reviewedBaselineCommit` identifies the source reviewed when the scenarios were written, not the checkout revision of every future run. The committed JSON snapshot is historical evidence and should not be rewritten to imply fixes. Add regression assertions for repaired behaviour.

## Reproduced game issues and acceptance targets

| Finding                                                        | Reproduction evidence                                                                                                                                                 | Required outcome                                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long-play exports reject themselves                            | A deterministic day-5 export is 1,688,016 characters; day 30 is 3,562,249. Both fail `parseTownFile`, whose input limit is 1.5 million characters.                    | Export/import round trips preserve meaningful town state at days 5 and 30 and load older v1 saves. Bound and measure input consistently.                       |
| Save failure is silent to callers                              | A quota-throwing storage stub causes three write attempts and an `undefined` result.                                                                                  | Add an observable failure result/status without breaking existing callers or mutating meaningful live memories to hide failure. UI wiring follows integration. |
| Referenced debt is not bound to payment participants           | A Northern→Baba debt is marked paid while money moves from player→Kevin.                                                                                              | Validate identity, ownership, funds and status before applying any settlement.                                                                                 |
| Northern does not earn the offered wage                        | Thirty simulated days leave Northern on 2 coins with zero wage memories. The offered 16:00–20:00 shift conflicts with the current wage window and required work time. | Account for eligible work and pay the promised shift when the till can afford it.                                                                              |
| Offline repayment and trust are unreliable                     | Asking for bread then offering 2 with enough money leaves the debt owed. Three “I hate you” messages raise Baba's trust to 3.                                         | Deterministic offline repayment, no duplicate charge, neutral unknown text, justified relationship changes.                                                    |
| The online memory packet ignores the question in retrieval     | A planted violin fact ranks first with a direct query but is absent from the actual prompt packet, which contains four unrelated grocery observations.                | Current question influences selection and diagnostics describe the actual packet.                                                                              |
| Resident interface exposes private state and obscures dialogue | Earlier live desktop/mobile review found wants, self-sentences, hidden threads and memory diagnostics exposed, with the composer far down the panel.                  | Reachable conversation input and close controls; player-facing information limited to what the player can know.                                                |

The diagnostics use newly created towns and injected fake data, never real player saves. The world consistency audit returned no findings. These observations do not exhaust all possible bugs.

## Next milestone

Sol fixes reproducibility and data integrity; Grok improves onboarding, conversation and the phone layout. Follow [the collaboration boundaries](COLLABORATION.md) and each agent's prompt. Keep the current hosting while the integrated game is verified; choose a migration only from demonstrated limitations, costs and deployment requirements.
