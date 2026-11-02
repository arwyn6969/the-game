# Player API keys and local models

Owner: model-choice chat. Branch `codex/player-model-choice-20261026`, isolated
checkout `player-model-choice/`; base `a40867e5ca977453a5f42df2aff2cb9fbf022f82`.
This feature is a source candidate in
[draft PR #59](https://github.com/arwyn6969/the-game/pull/59). It has not been merged or published.

## Player behavior

Open **Help & privacy → AI source**. Keep the game's hosted AI, choose **My own
API key**, or choose **My local model**. Enter the provider's OpenAI-compatible
base URL and explicit model name, then save. Saving and connection checks make
no model request. The first normal AI job tests the chosen model. The existing
**Use local dialogue only** checkbox suppresses every AI source; uncheck it to
use a model.

Personal cloud requests go directly from the browser to the chosen HTTPS
endpoint. The provider must support cross-origin browser requests and the
OpenAI-compatible `/chat/completions` JSON contract, including JSON output,
temperature and `max_tokens`. This is not an adapter for native-only APIs.
Your provider's billing and limits cover these calls, including background AI
while town time runs; the hosted free allowance does not cover them.

Local endpoints are limited to `localhost`, `127.0.0.1` and `[::1]`, with HTTP
or HTTPS. The model server runs on the device opening the game. Ollama commonly
uses `http://127.0.0.1:11434/v1`; LM Studio commonly uses
`http://127.0.0.1:1234/v1`. Start the server, load a model and allow the game's
actual origin. The browser may request local-network permission. Local model
readiness does not require internet connectivity or the game's hosted service.

Ollama's [origin configuration](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)
uses `OLLAMA_ORIGINS`; allow the exact game origin, such as
`https://www.arwyn.party`, then restart the server. Its
[OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) describes
the local chat endpoint. LM Studio's [server options](https://lmstudio.ai/docs/cli/serve/server-start)
include browser CORS support. Keep the server bound to loopback and configure
authentication where supported. Choose a downloaded local model if inference
must stay on-device; a local server may itself forward to a cloud service.

## Boundaries

- The API key exists only in tab memory and the request to the selected
  endpoint. It is never written to local/session storage, server functions,
  town saves or exported backups. Reload requires re-entry. The source,
  endpoint and model name persist separately from the town.
- Source changes discard the previous source's key, invalidate old logical
  work and stop automatic meeting/trial decisions until explicit restart.
  Switching is disabled until an active physical request settles. Cancellation,
  authored local dialogue and unmount abort a personal request.
- Requests transmit once, omit cookies and referrers, reject redirects and
  expose only stable failures. Recognizable provider keys cannot be sent to a
  different provider host. Arbitrary API keys still require the player to trust
  the chosen HTTPS endpoint.
- All five existing job kinds use the same source dispatcher. Responses retain
  bounded body reads, output ceilings, JSON/envelope checks and the simulation's
  existing job-specific authority checks. A failed personal request does not
  fall back to a hosted model or retry automatically. Existing background
  simulation can still use its authored offline behavior.
- Local inference has a 60-second deadline. Personal cloud inference keeps a
  25-second deadline, or 30 seconds for actions; the UI allows five additional
  seconds to settle. Hosted transport, authentication and budgets retain their
  current behavior. Personal routes use no hosted budget or usage accounting.

## Verification

The focused transport tests cover endpoint/key validation, safe preference
persistence, one-attempt behavior, stable failures, cancellation, bounded JSON,
all five job output ceilings and timeout policies. The synthetic browser script
`scripts/personal-model-browser.mjs` is included in Verify alongside existing
hosted AI checks.

Desktop 1280×800 and phone 390×844 journeys verify actual accepted personal/cloud
and local responses through the ordinary player UI, no hosted calls, no key in
storage/downloads, missing key after reload, a source lock during inference,
failure/draft retention, local readiness with `navigator.onLine` false,
authored-dialogue suppression, keyboard/touch movement, pause and town
import/export. Evidence is ignored under `artifacts/personal-model-browser/`.
All model responses are synthetic and no model allowance was consumed.

Node 24 results: **1,107 script + 55 typed tests, 425 town tests**, including
all 12 focused transport tests; typecheck, full lint (zero errors, one inherited
`use-current-user.ts` warning), diagnostics and both credential-free Node and
Cloudflare production builds pass. Database migrations were skipped because
`DATABASE_URL` was unset.
The new personal-source browser journeys and unchanged full hosted AI browser
regression both pass desktop and phone. An earlier hosted run lost its open
conversation while a development build/source edits were concurrent; the full
stable-source rerun passes the same timeout assertion without a product or
assertion change. Canonical hosted evidence is
`artifacts/hosted-ai-regression-final/results.json`.

The user explicitly authorized pushing the tested branch to `arwyn6969/the-game`
and opening a draft PR on 27 October. The branch is pushed and draft PR #59 is
open. Implementation commit: `6796b31`; initial review head: `75eddba`.
The earlier automatic push-approval rejection is resolved by that explicit
authorization. Current-head Verify, review and authorization to merge/publish
remain next.
Real personal-provider compatibility, actual Ollama/LM Studio inference, physical
devices and hosted-origin browser permissions are not qualified by mocks.
No production migration, deployment, secret or provider configuration changed.
