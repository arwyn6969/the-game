# Full meetings within the free allowance

`config/meeting-free-profile.json` is the explicit hosted profile for the
existing OpenRouter free model. It changes only the two AI policy bindings.
It does not enable a provider automatically, create credentials or alter towns.
The active deployment and evidence belong in `docs/CURRENT_STATUS.md`.

| Setting | Previous | Full-meeting profile |
| --- | ---: | ---: |
| Shared calls / rolling 24 hours | 24 | 48 |
| Player calls / rolling 24 hours | 12 | 48 |
| Provider calls / rolling 31 days | 744 | 1,488 |
| Conservative token reservation units / minute | 20,000 | 40,000 |
| Conservative token reservation units / day | 100,000 | 960,000 |

The provider account currently reports 50 free calls per UTC day. Forty-eight
shared calls leaves two requests of margin; one shared call remains reserved
for direct player replies. A player can use the available
shared pool, including recovery after earlier attempts, without increasing the
account-wide ceiling. Other players or prior usage can
reduce headroom, so a full real playtest checks sixteen available starts first.
No call is promised when shared, player or provider allowance is exhausted.

Token reservations deliberately count UTF-8 input bytes, a framing allowance
and maximum output rather than relying on an optimistic tokenizer estimate.
SQL retains the greater of reserved and reported usage, including failures.
The new ceilings cover two 20,000-unit reservations per minute and 48 per day;
they are accounting safeguards, not a provider token-price quote. The actual
bounded discussion prompts are checked during the full-meeting test. Counters,
timestamps and unknown failed attempts must never be reset to create headroom.

The existing controls remain: exact `:free` model, no paid fallback, zero
monetary ceiling/tariffs, one concurrent call/action, no autonomous background
calls, 2 physical starts/minute with at least 31 seconds between starts, one
attempt per action, 1,200 action output tokens and the 30-second action deadline.
The meeting retains six utterances and sixteen AI decisions. A pass yields the floor without requeuing unchanged input. Only real newly
heard speech or a deliberate turn request cues the passed resident again.
The sixteenth
successful decision now closes the meeting after recording its result, rather
than leaving an unresumable paused meeting. No extra summary or NPC words are
generated. Failure and Stop still pause/stop without replay.

Generate a protected, exclusive binding file with Node 24:

```sh
node scripts/meeting-free-profile.mjs --write /private/tmp/meeting-policy.json
```

That file contains only `MIND_POOL_CONFIG` and `MIND_BUDGET_CONFIG`, not provider
keys or authentication secrets. Validate it and record the intended production
Worker and rollback version before applying it through the existing staged
Wrangler workflow. Preserve all unrelated bindings, routes, secrets and runtime
settings. No database migration is required. Do not apply a historical whole
secrets file, which could overwrite newer credentials or session settings.

The fresh test closes the previous synthetic checkpoint using an ordinary
player command, preserves its entire ledger and starts one new meeting with
ordinary invitations. Player listening is explicit; there is no authored opening
or selected floor. NPCs retain accept/decline, listen/speak/pass/leave and close.
The actual automatic-run lifecycle and scheduler control each request. Audit
real speech, attributed memories, all eight knowledge projections, exact
save/reload, unchanged finances, normal closure and settled accounting. Mobile
work remains on hold until this end-to-end social gate passes.
