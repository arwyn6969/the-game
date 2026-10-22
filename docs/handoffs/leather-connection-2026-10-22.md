# Leather connection simplification — 22 October 2026

Owner: chat **Fix stamp profile image freeze**, `01a16380-1daf-71a0-9fb1-08d0c512d7cc`.
Checkout: `work/game-stamp-fix`, branch `codex/stamp-panel-recovery`, continuing [PR #43](https://github.com/arwyn6969/the-game/pull/43). The follow-up incorporates current hosting parent `adb1f47` from PR #41 so the newer AI recovery delivery is preserved together with the stamp-panel fix. Main remains `dab257b`; main integration is separate.

The user requested fewer Leather approval prompts. The old helper called `getAddresses` three times around one `signMessage` request. Leather documents that every address request opens a new connection approval; it is not a silent account query. The client now requests addresses once when the user explicitly connects, then requests one verification signature.

The connection is bound to the selected address/account. The returned derivation account is supplied to signing when available; missing paths do not cause an account number to be guessed. The signature response must echo the exact selected address and server-issued message. Frozen selection identity, provider identity, observed account/disconnect revisions, cancellation, expiry, challenge consumption and authoritative server signature verification remain in place. A silent change to the account displayed in Leather does not redefine the account already connected to the app; a different returned signer is rejected.

The same helper serves optional stamp appearance and authenticated watch-only receiving proofs. This change does not add transaction methods, alter receiving ownership checks, or change the Town schema. Holdings refresh and appearance selection do not request wallet approvals.

Primary contracts: [Leather getAddresses](https://leather.gitbook.io/developers/methods/getaddresses), [Leather signMessage](https://leather.gitbook.io/developers/bitcoin-methods/signmessage).

Node 24 validation: **965 application tests passed** (910 script tests plus 55 TypeScript tests), including seven new Leather dispatcher regression groups. The focused Leather/Wonder/privacy run passed 48 tests. Exact RPC counts, real disposable signatures, pinned accounts, missing-path signer validation, account/disconnect events, provider replacement, cancellation, expiry and forged selections are covered. Browser regressions additionally assert two Leather calls in appearance and receiving proofs, with no new prompts during artwork edits or holdings refreshes; their current-head CI execution is separate.

Typecheck passed; lint passed with the inherited unused auth-directive warning. All 349 town tests passed and diagnostics completed. The Node build passed with `DATABASE_URL` unset and skipped migrations. The Cloudflare build, packaging and live reduced-prompt check are next. Existing production Worker `e7893cf2-9c08-4cb8-9f94-cd82a38b15f0` is the rollback point observed before this follow-up.
