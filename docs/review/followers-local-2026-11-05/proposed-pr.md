# Add local companion sessions with a truthful saved journal

Players can choose **Spend time with** on a nearby resident, select 30/60/120 game
minutes, accompany them through normal navigation and optionally listen to a
specific eligible discussion. **Watch character** stays camera-only. The journal
retains only actual received speech and evidenced visits/shared activity, including
source IDs and attributed excerpts; a quiet visit honestly records no discussion.

One deterministic controller owns movement alongside the existing café/manual
arbitration. Manual input, Stop, context changes and recovery revoke authority
immediately; Resume is explicit and reload never authorizes automation. Optional
bounded v2 save data preserves old saves, raw recovery bytes, earned work and
payment obligations. No follower inference or provider/hosting/payment changes.

**Dependency:** stacked on draft PR #71 at `2ee631f`, using its witnessed shared
history and café station-handover fixes. Until #71 merges, the review base is
`codex/relationship-feedback`; afterwards rebase onto current main and qualify that
integration separately. This description is local; no PR has been uploaded.

Validation: Node 24.22.1, lockfile install, typecheck, lint (one inherited warning),
525 town tests, 1,220 script + 55 typed tests, clean town diagnostics and a
credential-free build with the migration step skipped. Eight actual Chromium
journeys at 1280×800/390×844 cover the library visit, second target/quiet outcome,
pending Stop, manual takeover, visibility, reload/import and recovery. All four
existing interface layouts fit. Twenty focused source cases cover acoustic/privacy,
late arrival/departure, blocked movement, listener ownership, actual café wage
holds, duration, capacity and deduplication. Synthetic transport counted four
explicit speaker calls and zero follower/live calls.

Evidence: `docs/review/followers-local-2026-11-05/README.md`.
Remaining acceptance: short human playtest, physical devices/screen readers,
broader browsers and deployed/PWA/provider compatibility. No closed-browser or
server operation is claimed. Upload, merge, publication and spending remain
separate authorizations.
