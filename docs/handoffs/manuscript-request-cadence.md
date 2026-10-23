# Browser manuscript request cadence

23 October 2026. Owner: `platform_inventory`; scope is `TownApp.tsx` only, on `codex/northern-speech-continuation-20261023`.

Automatic physical-action request starts are spaced by at least 31,000 milliseconds of `performance.now()` time. The gate precedes request marking, usage counts, prompt construction and effects. A component ref records the start immediately before transport. It remains across explicitly started new trials and imported towns within the mounted tab, resetting only on remount. An existing manuscript note explains the wait; waiting itself consumes no request.

Discussion decisions and player requests keep their existing behavior. Visibility, pending/transport exclusion, pause/replay/import, the eight-request cap, explicit wait/stop, failures and unchanged-read pauses remain enforced. This adds no retry, restart, fallback, model choice, schema, save data or configuration. Shared server quotas still decide actual headroom across tabs/users.

Validation: typecheck, scoped ESLint and formatting/whitespace checks passed; all 45 focused manuscript/core/grounding regressions passed. These regressions preserve core bounds; the UI lane separately owns virtual-time browser acceptance proving counters stay unchanged during the wait and dispatch resumes at the deadline. Browser evidence is pending at this commit. No real provider request belongs to this packet.
