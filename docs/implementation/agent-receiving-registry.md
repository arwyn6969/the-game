# Private owner registration and receiving-address drafts

Packet 3A of the approved [stamp and wallet roadmap](stamp-identity-tooling.md), based on stamp preview commit `8453443`. This packet supplies authenticated owner permissions, private registered world copies and externally controlled receiving-address drafts. It prepares the ownership boundary for later public receiving instructions, deposit reconciliation and shared worlds. Public funding, deposit reconciliation and transfers require the following packet's acceptance gates.

## Identity and authority

The portable Town registry identifies narrative provenance. It cannot prove who owns an uploaded file. Registering a private copy therefore creates a random server `registrationId` and eight random `residentId`/`profileId` records, linked to the source world and character IDs. It leaves the local town, names, histories and game money unchanged.

| Identity | Meaning |
| --- | --- |
| Existing world/character IDs | Portable source identity and lineage; public references, not credentials |
| Authenticated account ID | Verified by the application's existing Better Auth session |
| Private registration ID | Server-issued namespace owned by that account |
| Registered resident ID | A resident within that private namespace, linked to its source character |
| Receiving profile ID | Stable address-assignment record for that registered resident |

Alice and Bob can each import the same public world file. Alice's registered copy and Bob's copy receive different server IDs. Bob cannot read, replace or retire Alice's profiles, even if Bob knows all her public source IDs or her registration ID. Registering the copied file records no exclusive authorship claim over the original world. Future shared-world control must use authenticated registered identities rather than trust a portable file's claims.

Registration is idempotent for one account and source world ID. A changed source roster cannot remap an existing registered resident to a different local character; restore the original source or explicitly fork the town first. Different accounts receive separate private registrations. Each account may register ten source worlds. Names are display labels captured at registration, while source IDs and server authority remain separate.

## Account integration

The existing Better Auth configuration, broker providers, preview bearer transport and platform isolation remain in place. This checkout previously lacked the `/api/auth/*` route and root auth migration. The new catch-all dispatches GET/POST to the existing handler; `migrations/0001_auth.sql` is an exact copy of the generated source under `migrations/auth/`. It runs before the registry's account foreign keys. No provider secrets, global sign-in flag, password login or production settings are changed.

Owner tools accept only a real verified session. The offline shared `dev-user` fallback is rejected. Every server operation resolves the authenticated account independently; no client-supplied owner ID or cosmetic stamp cookie can satisfy that check. Owner verification disables Better Auth's short cookie cache and reads the live session record, so a revoked session cannot keep owner access through a previously valid signed session-data cookie. Other application auth callers retain their existing cache behavior.

The panel derives a public account reference from its displayed session and compares every owner/world response against it. Each private request also carries that expected reference; the server rejects a mismatch before accessing the registry. It is a stale-account precondition, never a credential. This prevents a cached account A label combined with a live account B token from displaying B's profiles or registering a copy under B. Explicit owner refresh bypasses the cookie cache and reconciles the current session before continuing.

The owner panel mounts only after **Agent wallets** is opened. Ordinary local play does not start account or owner-registry requests. Existing sign-in controls run inside the panel with cancellation/error handling; local play remains available. Account or source-roster changes immediately hide old private data and invalidate pending callbacks. A failed sign-out keeps private presentation hidden across panel close/reload through a bounded local latch; explicit verified refresh or fresh sign-in can reveal it again. That presentation preference grants no authority and contains only hashed account IDs.

Server requests retain exact Origin and Fetch Metadata isolation. Private responses use `Cache-Control: private, no-store`. Hosted use requires shared SQL, enabled real sign-in, a stable auth secret, the correct HTTPS auth origin and the application's own federation credentials. Loopback QA requires explicit `AGENT_REGISTRY_LOCAL_DEV=true`, enabled auth and a test secret; it is unavailable when hosted deployment markers are present. The local database is disposable and is not a production ownership store.

## Receiving drafts

Each registered resident starts with an unconfigured profile. Select a resident, select the active account in Leather, then choose **Verify external address**. The server issues a new five-minute, single-use challenge bound to:

- The authenticated account reference and exact current origin.
- Bitcoin mainnet, private world registration, registered resident and receiving profile.
- The exact Native SegWit address, expected profile revision, nonce and expiry.
- The distinct purpose of reserving a private watch-only receiving-address draft.

The server checks Leather's unprefixed BIP-322-simple P2WPKH signature using the same strict verifier as the appearance packet. A cosmetic proof cannot be promoted into receiving authority. Wrong, expired or replayed proofs fail; a failed attempt consumes its nonce. Reissue is limited to one per five seconds per profile. Completion rechecks the current origin and expiry, then reserves the address and updates the profile atomically.

Leather's documented message path signs the first receiving address of the selected account. This packet does not derive or generate wallets, private keys, seeds or xpub children. Use a distinct externally controlled Leather account/address per resident and switch accounts before linking another resident. The account/path returned by the extension is a compatibility hint; the signature supplies the address-control proof.

The private draft records when the address was proved, not a permanent guarantee of wallet control. The owner retains signing and backup/recovery responsibility in their external wallet. Every eventual outgoing transfer still requires that owner's approval of the exact transaction.

## Reservations, retirement and observations

One mainnet address is reserved to one receiving profile globally. A single SQL statement performs the reservation and revision update, so competing proofs cannot assign it twice. The database's composite foreign key also prevents a profile from pointing at another profile's reservation. Reproof and reactivation are allowed for the same profile after a fresh signature.

Replacement and retirement retain every old reservation. Retirement increments the profile revision, marks the draft inactive and clears its pending challenge. A delayed signature cannot reactivate it. Even deleting a game account leaves the address tombstone, preventing an old destination from being silently reused for another resident. This intentionally does not provide automatic address reassignment or account-recovery overrides. Establish audited recovery and reassignment rules before public funding.

An explicit **Refresh inventory** reads the currently supported classic stamp holdings through the existing validated Stampchain adapter. The result includes profile revision, address, observation time and indexed block. The server rechecks the profile after the remote read; rotation/retirement makes an in-flight observation stale. Failed lookups leave inventory unknown or mark the previous observation stale, rather than invent zero balances. BTC is labelled **not checked**. Snapshots are not confirmed deposit receipts, spendable funds or a transaction-fee budget.

`fundingPublished` is always false in both types and database constraints. There is no public donation profile, payment QR, BIP21 link, send, trade or transaction signer. Keeping instructions private cannot prevent someone independently transferring to an address; no such transfer is requested by this UI. Receiving drafts and inventory never enter Town exports, model prompts, memories or the local coin ledger.

## Next gate: supported receiving profiles and deposit reconciliation

Before inviting external deposits:

1. Exercise the actual Leather extension/version, account switching, retained keys, backup and recovery with the selected asset protocol.
2. Define account recovery and address reassignment without treating an imported save, matching email or a held stamp as ownership proof.
3. Add a chain observer with confirmed/pending/reorged observations, protocol-aware event identity and idempotent reconciliation. A holdings increase alone is not a settled deposit, and a transaction hash alone cannot distinguish every multi-send subevent.
4. Add BTC observations separately, keep asset-bearing/protected outputs safe, and prove the distinction between observed total and spendable fee funds.
5. Review and explicitly enable public receiving instructions only after those checks. This packet has no switch that publishes them.

Owner-approved proposals, transaction composition and tested trade settlement follow that work. Server-authoritative visits/PvP remain later; neither combat nor model output grants real-wallet signing permission.

## Validation receipt

Branch `codex/agent-receiving-registry` is stacked on appearance PR 32 at `8453443`. Node 24 validation passed:

- A clean offline `npm ci` from the exact committed dependency files: 453 packages. `better-call` is an exact direct development dependency for signing disposable QA cookies; its existing locked version and runtime dependencies are unchanged.
- TypeScript and ESLint, with one inherited unused-directive warning in `use-current-user.ts` and no new warnings.
- All **693 tests**: 638 script cases and 55 app/auth cases. The 48 new cases cover genuine account sessions and revocation, account-context mismatch, private SQL ownership, concurrent reservations, proof expiry/replay/origin, retirement and privacy-latch recovery. All 267 town regressions pass within that total.
- Town diagnostics through day 30, normal and explicitly auth-enabled builds, and the dev/build authentication-setting check. Builds had `DATABASE_URL` and `XAI_API_KEY` unset; the migration command skipped external SQL.
- Built gameplay and stamp journeys at 1280×800 and 390×844, plus the new owner-wallet gate: **11 desktop and 8 phone checks**, no page errors. The owner gate covers genuine A-cache/B-token mismatch, blocked registration and one-click account reconciliation; eight residents; distinct disposable address proofs; private inventory and outage handling; retirement, expired replay and reload; copied-save isolation; unsigned visitors; secure cookies; and no owner RPC before opening the optional tool.
- The unchanged delayed-AI/replay/privacy gate passes on desktop and phone with zero unexpected server requests. An initial local run timed out after import while other builds were running; rerunning the unchanged gate after builds settled passed. [Its final report](../review/agent-registry-2026-10-15/ai/results.json) records the passing run.

[Sanitized owner results](../review/agent-registry-2026-10-15/results.json), [desktop retirement](../review/agent-registry-2026-10-15/0-retired.png), [phone inventory](../review/agent-registry-2026-10-15/1-private-inventory.png) and [diagnostics](../review/agent-registry-2026-10-15/diagnostics.json) are committed with this packet. Existing gameplay and stamp reports are in the same evidence directory.

Auth tests use real Better Auth cookies/bearer sessions and disposable account rows. Registry tests use the actual PGlite schema and parallel operations. Browser QA seeds real isolated account sessions and signs disposable BIP-322 messages; only wallet prompts and public Stampchain GET data are simulated. Actual OAuth-provider sign-in, a real extension/version, external key backup/recovery, live deposits and reorg reconciliation remain untested gates. No personal wallet, production database, mainnet transfer, merge or publication was used for validation.

## Primary references

- [Better Auth TanStack Start installation](https://better-auth.com/docs/installation) and [TanStack server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes): catch-all handler integration.
- [Leather getAddresses](https://leather.gitbook.io/developers/methods/getaddresses), [signMessage schema](https://github.com/leather-io/mono/blob/dev/packages/rpc/src/methods/bitcoin/sign-message.ts) and [message signer](https://github.com/leather-io/mono/blob/dev/apps/extension/src/app/pages/rpc-sign-bip322-message/use-sign-bip322-message.ts): supported account/address path.
- [Counterparty API](https://apidocs.counterparty.io/) and [route definitions](https://github.com/CounterpartyXCP/counterparty-core/blob/master/counterparty-core/counterpartycore/lib/api/routes.py): later protocol observations and reconciliation.
- [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md): possible later BTC observations; it is not integrated by this packet.
