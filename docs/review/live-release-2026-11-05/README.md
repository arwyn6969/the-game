# Publication of merged PR 71 — 5 November 2026

Merged source `c49facc52136cfda0270627e3e6aef51f5ab4588` is published at
[THE GAME](https://www.arwyn.party/thegame/), runtime `c49facc52136`, Worker
`df4fa4fb-8725-42ba-a52a-6e050509f3a5`. The immediate rollback Worker is
`6bf8d2d2-68ca-4624-8611-67b2c0f18531`; preserve database contents and browser saves.

The user explicitly requested redeployment after merging #71. Its source tree
exactly matches tested head `2ee631f`, whose [Verify run](https://github.com/arwyn6969/the-game/actions/runs/42009873247)
passed every step. An isolated tracked-source copy was installed from the lockfile
and built for the existing production target with Node 24 and cached Wrangler
4.151.3. Build and deployment dry run passed. Deployment retained variables with
`--keep-vars`; no secrets were uploaded or read back.

Before/predeploy/after control-plane comparisons preserve all 18 bindings, seven
secret definitions, runtime settings and 52 routes. Four published asset hashes,
eight endpoint checks and seven redirect checks pass. Isolated browser entry
checks at 1280×800 and 390×844 show hydrated controls without JavaScript errors;
no town was created or personal browser attached. No database migrations, model
calls, wallet actions or budget/provider/hosting changes were performed.

This publishes #71's relationship and café fixes. The separate follower-learning,
resident-growth and character-continuity branches remain outside this release.
The source already passed its CI gameplay checks; this release smoke check does
not establish fresh authenticated AI, human gameplay or physical-device acceptance.

[Release receipt](release.json) · [source qualification](source-qualification.json)
· [public checks](public-release-check.json) · [browser smoke checks](browser-smoke.json).

Private control-plane snapshots, build/deploy logs and entry screenshots remain
under the workspace's `review/live-release-2026-11-05/` and are excluded from this
sanitized receipt set.
