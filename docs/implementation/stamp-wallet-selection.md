# Read-only stamp selection and optional heads

Packet 2 of the approved [tooling sequence](stamp-identity-tooling.md), implemented in commit `6638071` on `codex/stamp-wallet-selection`, in [draft PR 32](https://github.com/arwyn6969/the-game/pull/32) above [identity PR 31](https://github.com/arwyn6969/the-game/pull/31) and gameplay PR 30. Retarget after those dependencies are integrated. This packet is a reviewable preview. It adds wallet proof, classic raster stamp selection and an optional player head. It does not establish account or canonical character ownership. Receiving profiles, signing transactions, trading and multiplayer remain later packets.

## Player flow

Name entry keeps **Walk in** and adds **Choose a stamp identity**. Both first create the normal local town; the second opens the optional appearance panel. Returning players open **Stamp identity** from the town tools.

1. Connect Leather and review a message that states the exact game origin, Bitcoin mainnet, address, permanent world/character IDs, purpose, nonce and expiry.
2. The server verifies the signature and reads holdings for that same address. The panel shows supported stamps, edition quantities, supply and pagination; unsupported assets are counted separately.
3. Select a stamp for a sanitized preview. Choose original appearance, portrait only, or stamp head and portrait. Zoom and crop before applying. The portrait appears in the town's Stamp identity control; the head attaches to the player's existing body.
4. Restore the original appearance without ending the proof session, or disconnect to delete that scoped proof and appearance. A cancelled wallet popup or failed lookup leaves ordinary town play available.

Names, personalities, local coins, collisions, movement and combat statistics are independent of the artwork. Other residents keep their authored appearance in this packet. A stamp can have multiple holders; selecting it makes no exclusivity claim. No seed, private key, PSBT, transaction or transfer method is requested by this feature.

## Wallet compatibility boundary

| Capability          | Implemented scope                                                                          | Evidence and remaining gate                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet              | Leather's injected `LeatherProvider.request`                                               | Adapter contract fixtures and built browser provider simulation; a real extension/version is still to be checked                                                     |
| Address             | Bitcoin mainnet Native SegWit P2WPKH, canonical lowercase `bc1q` with 20-byte program      | Server checksum/script validation; client chooses BTC/p2wpkh rather than trusting array order                                                                        |
| Account             | BIP84 mainnet receiving path `m/84'/0'/N'/0/0` when returned                               | Derives the signing account from the returned path; incompatible paths rejected                                                                                      |
| Message signature   | Leather's unprefixed BIP-322-simple two-item witness                                       | Genuine disposable-key signatures, altered-message rejection and strict framing tests; legacy BIP137, Taproot, full/proof-of-funds and newer prefixed forms excluded |
| Assets              | Positive indivisible classic stamp balances with PNG, JPEG or WebP art                     | Recorded public GET schema plus mocked pagination, quantities and media tests                                                                                        |
| Outside this packet | UniSat, Horizon, testnet, arbitrary addresses, SRC-20, composed SRC-721, sending and swaps | Requires a separate compatibility implementation and acceptance evidence                                                                                             |

`bip322-js` is pinned to 4.0.0. Its scoped `bitcoinjs-lib` dependency is pinned to 7.0.1: genuine signature tests reproduced a synthetic-transaction extraction incompatibility with 7.0.4. The strict witness gate runs before the library verifier because that library also supports legacy message signatures. `sharp` is pinned to 0.35.5. Changing these pins requires rerunning genuine proof and bounded-image tests.

Primary contracts checked on 15 October 2026: [Leather getAddresses](https://leather.gitbook.io/developers/methods/getaddresses), [Leather signMessage](https://leather.gitbook.io/developers/bitcoin-methods/signmessage), [Leather RPC signing schema](https://github.com/leather-io/mono/blob/dev/packages/rpc/src/methods/bitcoin/sign-message.ts), [BIP-322 verifier source](https://github.com/ACken2/bip322-js/blob/main/src/Verifier.ts), and [Stampchain schema](https://github.com/stampchain-io/stampchain.io/blob/main/schema.yml). Public GET observations are compatibility evidence, not a service commitment or a live-wallet test.

## Proof and appearance state

The current game enters through a local name and browser town; it has no active game-account onboarding. Rather than introduce a partial account system, this packet creates a separate optional read-only wallet proof session. It preserves the existing authentication, preview bridge and recovery contracts. Authenticated account registration, canonical character control and owner/delegate permissions are mandatory additions before receiving wallets or transfers.

Background polling starts only after an explicit successful wallet connection in this browser session. A bounded scope-only sessionStorage hint remembers that opt-in across reloads; it contains no wallet data or proof and grants no authority. Ordinary local play makes no stamp server requests.

An opaque random 256-bit cookie is HttpOnly, Secure, SameSite=Strict and host-only. Only its SHA-256 hash is stored. Each row is scoped to that session, world ID and character ID. Knowledge of public IDs or an imported town is insufficient to read another session's association. The signature proves control of the address for cosmetic selection only; the caller's chosen local IDs are not an authenticated ownership claim.

| State             | Bound and behavior                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Challenge         | 5-minute expiry, random 192-bit nonce, single atomic consume before verification; failed attempts also consume it                                                                         |
| Reissue           | Minimum 5 seconds per scoped session, including after success                                                                                                                             |
| Proof             | 15 minutes, with a 30-minute session row/cookie lifetime refreshed when issuing a challenge                                                                                               |
| Active appearance | At most 2 minutes and never beyond proof expiry; server rechecks holdings before renewal                                                                                                  |
| Client refresh    | Every 60 seconds for a session the player has explicitly connected; failed verification clears the active display or its existing lease expires, while the original sprite remains usable |
| Mutations         | Atomic proof and appearance revision checks stop delayed reads/selections from reviving state after clear, disconnect or reproof                                                          |

POSTs require the exact Origin; Fetch Metadata checks apply as well. Challenge text includes purpose, origin, network, address and permanent IDs, while the session's hashed cookie binds the stored nonce to the browser. The browser cannot provide its own unsigned authoritative challenge. Changing an address requires a new signature. If disconnect cannot reach the server, a bounded scope-only sessionStorage preference prevents an old head from reappearing after closing the panel or reloading; it contains no address, proof or image and is cleared after confirmed disconnect or explicit successful reproof. A fresh lookup is required to select or preview art, and remote reads recheck the session before returning their result.

Wallet proof and chosen artwork are stored separately from `Town`. Exports, imports, forks, model prompts, memories and the local economy do not carry them. A restored ID can recover its own still-valid association only in the same private browser session after another server check. A new fork or a different browser must prove its own wallet. This is intentionally not cross-device identity recovery.

## Stampchain and media boundaries

The adapter uses only fixed HTTPS GETs to `stampchain.io`. It validates each row's address, CPID, quantity, divisibility, supply, artwork metadata, indexed block and pagination. Whole quantities remain decimal strings and unsafe JSON numbers are rejected. Pages contain 24 rows; a selected holding can be found through at most ten 100-row pages. An incomplete scan or changing pagination/index snapshot is an error, never proof that a stamp was sold.

The indexed block is displayed as an observation. This packet does not independently compare that index to the Bitcoin tip or establish transaction confirmation/settlement. These observations cannot become spendable balances. A missing holding removes the active cosmetic after a successful check; unavailable data leaves ownership uncertain and falls back to the original artwork. Historical private selection is retained for revalidation, without erasing the character or deciding the future persona-sale policy.

Only exact allowlisted `https://stampchain.io/stamps/<64-lowercase-hex>.(png|jpg|jpeg|webp)` URLs are fetched. Redirects, credentials, query strings, arbitrary hosts and non-raster types are rejected. Requests have an 8-second deadline and a 1 MiB response ceiling. The decoder checks magic bytes, MIME, format, dimensions (2048 per side and 4 million pixels), then re-encodes a metadata-free 256×256 contained PNG. The server caches at most 64 sanitized images and permits eight simultaneous decodes; browser decoded-image cache is capped at 24. Raw asset URLs and executable artwork never enter the page.

The renderer accepts only bounded PNG data, matching permanent scope and an unexpired lease. It crops at the existing 14×13 head anchor, uses pixel rendering and preserves the image's orientation as the body turns. Loading failures retain the authored head. Portrait mode changes only the small player portrait control; existing NPC conversation cards are unchanged.

## Storage and local verification

Production requires the existing shared SQL backend through `DATABASE_URL` and the additive `20261015_stamp_identity.sql` migration. It contains read-only scoped session records, no keys or balances. Without shared storage the feature reports unavailable on hosted servers; town play continues. The existing in-memory PGlite fallback is allowed only on loopback outside production, or with explicit `STAMP_IDENTITY_LOCAL_DEV=true`, and never when `VERCEL` or `GROK_PROJECT_ID` is set. It resets on process restart.

For local proof testing use Node 24, `npm ci`, a loopback origin, no production credentials and `npm run dev`. For a built local preview explicitly set `STAMP_IDENTITY_LOCAL_DEV=true`. `BETTER_AUTH_URL`, when present, must match the page's exact origin. Do not use development PGlite as production ownership storage.

`npm run test:browser:stamps` launches an isolated built loopback preview with a test-only Node fetch preload and synthetic Leather provider. It signs disposable messages with test keys and mocks Stampchain GET responses; the application contains no fixture-mode switch. It refuses a remote QA target. This verifies the real server-function, cookie, SQL, signature, image and canvas paths without accessing a personal wallet or moving funds. The ordinary `npm run test:browser` remains the gameplay regression gate. CI runs both.

## Review receipt

Node 24.19.0 validation passed: a fresh exact-lock offline install in a separate temporary directory (453 packages), typecheck, lint with zero errors and one inherited auth warning, 267 town regressions, 590 script tests plus 55 app/auth tests (645 total), 30-day diagnostics without world-audit issues and a production build with `DATABASE_URL` and `XAI_API_KEY` unset. No production migration ran.

The 86 new tests cover 19 proof/store cases, 23 service/HTTP cases, 19 adapter/media cases, 12 Leather connector cases, four renderer-cache cases and nine disconnect-intent and polling-opt-in cases. They include genuine disposable signatures, replay and scope isolation, strict witness framing, post-await expiry, pending selection/clear/disconnect/reproof races, large quantities, incomplete index scans, hostile media, size limits, cache limits and outage recovery. Independent review caught the expiry and disconnect races; their regressions pass.

Existing built-browser journeys at 1280×800 and 390×844 passed movement, pause, conversation, download/import, reload, competing tabs, legacy migration, restore/fork and funded library controls, with no page/console errors. The stamp browser gate passed 14 checks at each viewport: no wallet, decline, late cancellation, genuine proof, pagination, two safe raster previews, keyboard crop controls, head/portrait/original modes, reload, separate-browser save isolation, fork/reload isolation, disconnect and failed-disconnect recovery after close/reload. Pixel checks found 87 fixture-colored pixels in the 182-pixel player head region with the stamp, and zero in portrait mode, at both viewports. Cookie attributes and script inaccessibility were checked against the real built server. The 32 mocked Stampchain requests were GETs; the only wallet methods were getAddresses and signMessage. There were no unexpected page or console errors; intentional network-abort errors are recorded separately.

The unchanged delayed-AI browser gate also passes on both viewports, including replay, stale-response rejection, local-only cancellation and zero unexpected server requests. CI initially caught unwanted stamp polling before wallet use; the product now remembers an explicit per-scope polling opt-in, rather than relaxing that privacy assertion. [AI/privacy results](../review/stamp-wallet-2026-10-15/ai/results.json) record the rerun.

[Validation](../review/stamp-wallet-2026-10-15/validation.json), [stamp browser results](../review/stamp-wallet-2026-10-15/results.json), [diagnostics](../review/stamp-wallet-2026-10-15/diagnostics.json) and [gameplay results](../review/stamp-wallet-2026-10-15/gameplay/results.json) record the executed checks. [Desktop](../review/stamp-wallet-2026-10-15/desktop-stamp-head.png) and [phone](../review/stamp-wallet-2026-10-15/phone-stamp-head.png) screenshots were visually inspected for readable controls and viewport fit. Live extension compatibility, physical-device accessibility and hosted deployment remain untested until separately exercised. No funds, asset transfers, production migrations, merge or publication form part of this packet.

Packet 3 begins with an authenticated owner/character registry and a concrete custody/recovery design for per-agent receiving addresses. Public donation instructions must wait for that design and protocol-aware deposit reconciliation. Agent transfers continue to require owner approval of every exact outgoing transaction.
