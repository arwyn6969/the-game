# Wonder Wallet connector

Implemented 18–19 October 2026, on `codex/agent-receiving-registry`, continuing [draft PR 33](https://github.com/arwyn6969/the-game/pull/33). Wonder Wallet is the preferred wallet choice; Leather remains an explicit alternative. This packet adds only connection and exact-message signing for the existing appearance and private receiving-proof flows. It adds no wallet keys, transfers, PSBT methods, broadcast methods, balances, public funding or game-coin credits.

## Provider and proof contract

The [official developer guide](https://www.wonder-wallet.com/developers.html) and public source at [`3d1091129cee2f193b287250e4623f5f78f9b9b7`](https://github.com/StampBlaster5000/wonder-wallet/tree/3d1091129cee2f193b287250e4623f5f78f9b9b7) define the reviewed contract. The source package reports version 0.54.36; that is not a record of an installed extension or a release compatibility guarantee.

- Discovery uses `window.wonderWallet`; the initialization event is `wonder-wallet#initialized`. Discovery never prompts or proves wallet authenticity.
- Fresh `requestAccounts()` approval returns `{accounts, proof}` and emits `accountsChanged` around that response. An already authorized site receives an accounts array. The game handles both source-defined responses.
- The automatic connection proof contains a wallet-generated message. The game ignores it and obtains its own short-lived, single-use challenge, bound to the exact origin, address, purpose and current identity/profile context.
- `signMessage(message, address)` returns a plain Base64 signature string in the inspected source. The optional address argument does not change the grant's signer. The adapter accepts only the unprefixed BIP-322-simple witness form compatible with the existing strict server verifier.
- Only Bitcoin mainnet Native SegWit P2WPKH addresses are supported. Legacy, Taproot and test-network addresses fail closed. Wonder's source network getter is static and is not treated as proof of the selected network.
- `getAccounts()` reports the site's connected grant. Switching the wallet's active account alone does not change that grant; disconnect/reconnect the site in Wonder Wallet to select a different account, then prove the new address. The appearance panel's Disconnect clears the game check; manage Wonder's site permission in its Connected sites controls to change the pinned signer.
- Account and disconnect events use `on` and `removeListener`. A connection's own initial account event must not cancel its proof; subsequent changes invalidate pending work. No event initiates a connection or signature automatically.

Provider objects and selected addresses remain local and are pinned together. A copied selection, changed provider, changed account, cancelled operation or expired challenge cannot submit a late proof. Address/account checks before and after signing complement the authoritative server signature check. The server verifier, ownership model, reservations and Town schema remain unchanged.

## Player controls and local state

Both panels default to Wonder Wallet and offer Leather through an accessible selector. There is no automatic fallback to another installed wallet. A restored server proof is labelled by its verified address, without guessing which wallet created it.

Changing the cosmetic signer hides the previous appearance and requires fresh verification. A bounded, per-scope session flag preserves that choice across close/reload without storing wallet IDs, addresses or signatures. This flag is separate from a failed-disconnect latch: a wallet change permits a fresh Connect, while an unconfirmed disconnect still requires its explicit recovery action.

Choosing another receiving signer does not change the authenticated game account, character identities, private registration or existing address reservations. Recorded receiving addresses remain watch-only history; switching a signer is not reassignment or migration. Actual account/disconnect events invalidate pending work and hide stale private presentation until explicit recovery.

## Verification and remaining acceptance

Node 24 checks pass: all **810 tests** (755 script cases plus 55 app/auth cases), including 21 new provider/dispatch tests and three new scoped-session tests. The existing 267 town regressions, typecheck, lint (one inherited unused-directive warning), day-30 diagnostics, normal/auth-enabled builds without live credentials, and the dev/build sign-in invariant pass. No dependency or lockfile change is needed.

The [gameplay](../review/wonder-wallet-2026-10-18/gameplay/results.json) and [delayed-AI/privacy](../review/wonder-wallet-2026-10-18/ai/results.json) gates pass at 1280×800 and 390×844. Both [Wonder](../review/wonder-wallet-2026-10-18/stamps/wonder/results.json) and explicit [Leather](../review/wonder-wallet-2026-10-18/stamps/leather/results.json) pass **17 stamp checks per viewport**: the previous fourteen plus pending provider selection, account-change and disconnect cancellation with hidden presentation preserved through reload. The built private receiving gate passes **22 desktop / 18 phone checks with [Wonder](../review/wonder-wallet-2026-10-18/agents/wonder/results.json)** and **20 desktop / 16 phone checks with [Leather](../review/wonder-wallet-2026-10-18/agents/leather/results.json)**. It retains the earlier ownership, replay, reservation, outage and retirement checks and adds pending provider-switch cancellation for both wallets plus Wonder account/disconnect invalidation. Screenshots were inspected for readable statuses, pixel rendering and viewport fit. CI repeats both wallet variants explicitly.

Automated browser checks use the built game, real disposable BIP-322 signatures and private SQL/account sessions. Wonder/Leather extension prompts and public indexer responses are fixtures; they cannot establish actual extension compatibility. No user wallet, live funds, paid calls, production migration, merge or publication is used.

For a real extension check, record the actual browser and installed Wonder version, use mainnet Native SegWit, review the game's fresh challenge, sign without transferring funds, and verify holdings/address agreement. Exercise initial and cached connection, rejection/cancellation, site disconnect/reconnect to another account, and unsupported address/network rejection. Apply the [external-key and server recovery checklist](agent-wallet-recovery.md#preferred-wallet-and-external-backup-acceptance) before public receiving. No seed or key is entered into the game, chat, test fixture or receipt.

## Source references

- [Injected provider](https://github.com/StampBlaster5000/wonder-wallet/blob/3d1091129cee2f193b287250e4623f5f78f9b9b7/extension/src/provider/inpage.js)
- [Site grant and account handling](https://github.com/StampBlaster5000/wonder-wallet/blob/3d1091129cee2f193b287250e4623f5f78f9b9b7/extension/src/provider/background-provider.js)
- [Approval and signature result](https://github.com/StampBlaster5000/wonder-wallet/blob/3d1091129cee2f193b287250e4623f5f78f9b9b7/extension/src/provider/approval.js)
- [Native signature encoding](https://github.com/StampBlaster5000/wonder-wallet/blob/3d1091129cee2f193b287250e4623f5f78f9b9b7/wallet-src/index.js)
