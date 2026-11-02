# Live consolidated release — 2 November 2026

The user requested publication of the consolidated game and will test the live build at https://www.arwyn.party/thegame/.

- Published source: `c183e32d3dc4de923490471da2d30a66caf788a7` from merged PR #67. It has the same tree as the fully passing Verify candidate `722a66c`.
- Production Worker: `the-game-production`, version `c4098113-6b5c-43db-8ff4-b39d64e2eb72`, serving 100% of traffic.
- Rollback version: `c4b89bfc-d9e4-48d1-ba1d-930280eaa8f5`. Restore Worker code only; preserve saves and database contents.
- Built an exact clean Git archive with Node 24 and the existing locked dependencies, production binding/origin, and migrations disabled. Wrangler 4.151.3 dry run and deployment passed.
- Fresh before/after control-plane comparison preserves all 18 binding definitions/values, seven secret definitions, runtime settings, and 52 routes. Only release annotations changed. No secret values were retrieved or changed.
- Four served asset hashes match the production package. Eight public endpoint checks and seven redirect/canonical-URL checks pass.
- Isolated desktop (1280×800) and mobile (390×844) browser towns passed entry, keyboard/touch movement, pause, Help build, café controls, save download and reload, with no startup exceptions or horizontal overflow. Local dialogue was selected. A first mobile driver attempt used a mouse click and timed out; actual touch events passed. [Browser receipt](browser-check.json). Physical devices and authenticated live AI remain for acceptance.
- No AI calls, database migrations, wallet transactions or budget changes occurred. Existing hosted AI allowance and authentication still apply.

[Machine receipt](release.json) and [public asset/routing checks](public-release-check.json) are retained here. The workspace's `review/live-release-2026-11-02/` contains the clean source archive, package, private control-plane snapshots, build/deploy logs and browser evidence. It contains no copied secret values.

Human playtesting, a useful hosted meeting, physical-device/screen-reader acceptance, café mixed play and actual personal-endpoint compatibility remain tracked in #64, #65 and #66. Publication does not close those acceptance issues.
