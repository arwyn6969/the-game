# Physical cadence UI acceptance

Owner: `gameplay_inventory`. Owned only `scripts/manuscript-ui-browser.mjs` and uniquely named evidence/handoff. Runtime `TownApp` cadence belongs to the platform agent.

Desktop 1280×800 and phone 390×844 actual browser journeys pass at source `a3a34af`, runtime `b002e36`. Playwright virtual time verifies the unchanged 31-second interval without long real sleeps: zero queued usage, no new-trial bypass, pending/hidden/stop/wait/reload safeguards and the eight-decision cap. Existing manuscript, attention, meeting-state isolation and enabled-auth assertions remain covered.

[Receipt and three inspected screenshots](../review/manuscript-live-cadence-2026-10-23/README.md). Scoped ESLint/whitespace pass. No runtime edits, provider credentials or live calls; the credential-free local preview was stopped after acceptance.
