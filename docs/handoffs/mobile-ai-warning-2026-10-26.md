# Mobile AI failure diagnosis and connection notice

Owner: this mobile AI diagnosis chat. Branch `codex/mobile-ai-warning-20261026`,
fresh base `66d161d343dedb411c0a3fdfc0dc55cbf44952e4` from `origin/main`.
Scope: TownApp connection notices, shared notice styles, provider timeout
classification, browser/provider regressions and this evidence. No parallel
owner edits, save schema changes, provider-limit changes or production writes.

Read-only production evidence on 26 October, UTC (also London local time):

- Player provider attempts at 18:34:12 and 18:34:46 completed successfully.
- The 18:35:05 budget reservation settled without a provider attempt. Two
  provider starts were still inside the preceding rolling minute, consistent
  with the deployed two-per-minute provider gate. The rows do not themselves
  record the exact refused limit; no provider request was sent for this call.
- Another player call at 18:37:31 completed successfully in 8,396 ms.
- The 18:38:09 provider attempt received HTTP 200 headers but settled as
  `unreachable` after 11,816 ms with unknown token usage. The old catch discards
  the exception category. A body timeout near the 12-second provider deadline
  is plausible; another body read/decode failure cannot be excluded.
- Neither provider nor model was blocked. All observed charges were zero.
  These rows contain no prompts, replies, credentials or player identifiers.

The connection check verifies the authoritative session and configured AI
routes; it does not generate a reply or query live quota headroom. Its success
message previously suggested the AI connection was ready despite a retained
provider/limit error. The updated text explains the actual check.

The notice now has a 44px dismiss control and a 44px reopen control in the status
strip. Dismissal preserves the error category and unsent drafts, survives
availability polling, card navigation and late checks, and a new failed send
reveals the error again. The warning occupies its own bounded, scrollable flex
area above the composer, so sticky warning content cannot cover Send. The close
heading remains reachable while its own contents scroll. Positive connection
notes can also be dismissed/reopened.

The router retains its timeout signal through header/body reading and settles
aborted attempts with outcome `timeout`. Existing diagnostics map this category
to “The AI took too long to reply.” The SQL outcome column already accepts text;
no migration is needed. Timeouts, reservations, attempt limits and retry behavior
are unchanged; no errors or provider bodies are exposed.

Validation and screenshots: [review receipt](../review/mobile-ai-warning-2026-10-26/README.md).
The implementation is a review candidate; main integration and publication need
separate user authorization and the repository's passing current Verify gate.
