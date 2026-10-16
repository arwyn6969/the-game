# Private observation acceptance evidence

Local checks on 16 October 2026 at 1280×800 and 390×844. The [owner report](results.json) records 19 desktop and 15 phone checks with no failures or page errors. Screenshot prefixes `0-` and `1-` identify desktop and phone. The screenshots were inspected for readable amounts, source uncertainty and viewport fit.

These journeys use real disposable Better Auth cookie sessions, PGlite migrations and BIP-322 signatures. Wallet prompts, Stampchain holdings and chain-provider GET responses are fixtures. The browser account-switch check retains account A's signed cache while account B's session token is active. Preview bearer-header transport has separate captured-fetch and authoritative-session tests; the owner browser journeys use cookies.

Bitcoin fixture outputs deliberately include two confirmed outputs in one transaction and one pending output. Counterparty returns an unavailable response, and another resident's Bitcoin source also fails. Unknown records must remain unknown and never change game money. No external transfer or real receiving-wallet acceptance is established by these images.

The additional [gameplay](gameplay/results.json), [stamp appearance](stamps/results.json), and [AI/replay/privacy](ai/results.json) reports retain the other passing gates. The gameplay report's phone library `result: failure` is the intentionally exercised in-game failure outcome; its assertions pass and the report's `failures` array is empty. Only synthetic test data and disposable public addresses appear in automated evidence. No personal wallet screenshot, address, proof, account cookie or key is included.

The separate human-assisted Chrome/Leather appearance proof and remaining receiving/recovery gates are recorded in [the recovery policy](../../implementation/agent-wallet-recovery.md). It identifies the tested versions without personal wallet data. The [observer guide](../../implementation/agent-deposit-observations.md) records code scope, bounds, quantities, reconciliation semantics and final verification.
