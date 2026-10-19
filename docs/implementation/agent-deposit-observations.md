# Private chain observations for receiving drafts

Implemented read-only continuation of [packet 3A](agent-receiving-registry.md), 16 October 2026. It adds explicit private observations for current and historical reserved receiving addresses. It does not complete the live-wallet, recovery or public-receiving gate in the [approved tooling plan](stamp-identity-tooling.md). The [validation receipt below](#validation-and-remaining-acceptance) records the code and browser checks; the original packet 3A receipt remains unchanged.

`fundingPublished` remains `false`. There are no public payment instructions, donation links, deposit credits, wallet balances, transaction builders, signing or broadcast methods. Observations never become town coins, memories, model permissions, trading balances or PvP awards. Every eventual outgoing transaction still requires owner approval of its exact terms.

## What the owner can inspect

Open **Agent wallets**, choose a registered resident and use **Load observations**. This reads stored private records and the profile's reserved addresses; it does not query a chain provider. **Refresh chain observations** explicitly requests a new scan for the selected address. There is no background chain polling, and ordinary local play makes no observer requests.

The selector includes retained addresses after replacement and retirement. Addresses stay associated with their original profile; a later arrival cannot be reassigned to a replacement resident, another account or a copied town. The newest linked address appears first, followed by retained addresses ordered by their verification time. Each page contains at most 20 addresses, and a selected address must belong to the returned page.

Each source shows its last successful observation, last attempt, chain anchor, parsed height and coverage. Each event shows its raw quantity, last observed state and optional transaction/block evidence. The view contains the latest 100 stored observations and reports when older retained entries are omitted. Closing the panel, changing owner/resident/revision or cancelling waiting prevents a late response from updating a different context. Cancelling the browser wait does not retract a submitted server scan; load its stored result to check whether it finished.

## Separate protocols and exact event identity

| Source | Observed scope | Event key | Explicit limitations |
| --- | --- | --- | --- |
| Bitcoin / Esplora | Positive transaction outputs whose script and decoded destination exactly match the watched address | `bitcoin:<txid>:<vout>` | Includes change/self payments; does not identify an outside donor, available UTXOs or spendable funds |
| Counterparty | Valid direct sends to the watched address, including ordinary, enhanced and MPMA legs | `counterparty:<tx_hash>:<msg_index>` | Raw assets remain unclassified; this is not a complete history of Bitcoin Stamp deposits |

Counterparty quantities remain raw protocol integer strings, including divisible assets; the game does not guess display decimals. Distinct MPMA legs retain distinct message indexes. Transaction indexes, global event indexes, stamp numbers and quantities are not substitutes for the per-leg identity. Payload fields are compared independently of block inclusion: a conflicting quantity, asset, source or destination for an existing key preserves the earlier payload, marks its state unknown and makes source coverage partial.

The Counterparty feed deliberately excludes dispenser receipts, issuance, dividends, sweeps, order settlement and UTXO attach/move/detach. A historical asset cannot be classified by intersecting it with current holdings, because it may already have been sent away. A separate bounded metadata/classification design is needed before calling these events stamp receipts. Stampchain's balance snapshots remain a different inventory feature.

## Provider contracts and limits

Only fixed mainnet HTTPS origins are allowed:

- Esplora: `https://blockstream.info/api/`. The reader obtains a tip hash and block details, address confirmed/mempool history, canonical hashes by height, and an uncached final anchor check.
- Counterparty: `https://api.counterparty.io:4000/v2/`. The adapter checks root network/readiness/parsed height, queries direct receives and filtered mempool events, and compares Counterparty block hashes with the Bitcoin reader's canonical hashes. It rechecks the Counterparty root and parsed anchor after scanning. There is no HTTP downgrade or client-supplied provider URL.

| Bound | Implemented behavior |
| --- | --- |
| One provider response | At most 2 MiB, strict expected MIME and UTF-8/JSON parsing, no redirects, omitted credentials, no-store requests |
| One provider request | At most six seconds |
| Whole refresh | At most 25 seconds of observation work, followed by guarded storage completion |
| Bitcoin confirmed history | Two pages of 25 transactions; a full final page leaves history coverage incomplete |
| Bitcoin mempool history | At most 50 transactions; hitting that limit leaves pending coverage incomplete |
| Counterparty feeds | Two cursor pages of at most 100 rows per confirmed/pending feed; nonterminal or cycling cursors leave coverage incomplete |
| Canonical block work | At most 12 distinct checked heights per protocol; hash results are cached only within that refresh |
| Scan events | At most 200 per protocol |
| Durable refresh control | One 45-second lease and a 30-second cooldown per profile/address |
| Durable event history | At most 256 observations per address; new overflow makes the source partial and does not delete unseen history |

Each source can fail independently. Public Esplora and Stampchain read-only shapes were checked during research on 16 October. The documented Counterparty HTTPS endpoint timed out from this environment; its current schema/source contract was verified, but live Counterparty reachability was not established. That condition is reported as unavailable, not as empty history. Public-provider uptime, quotas and indexing behavior remain external dependencies.

These are provider observations, not independent full-node or SPV verification. A successful response is not a service-level guarantee or proof of final settlement.

## Coverage, outages and reorganization handling

The Bitcoin tip hash and its canonical height mapping must remain unchanged across the refresh. Fresh confirmed events require matching canonical block hashes. Counterparty must remain ready on mainnet with an unchanged parsed anchor; its confirmed rows are accepted only through its parsed height. A one-block parsed lag can still meet Counterparty readiness, but the stored source status is partial when its parsed height is below the Bitcoin anchor. Terminal pagination flags describe coverage through that parsed height, not coverage of a higher Bitcoin tip.

Pending observations have no confirmed block. Counterparty's synthetic mempool height is never treated as a real inclusion. Missing pending events become unknown; disappearance alone does not prove replacement, confirmation, failure or a reorg. No dropped/replaced state is inferred without supporting evidence.

Previously recorded block inclusions are checked within the height/event budgets even when their events have aged beyond the newest history pages; reaching those budgets leaves coverage partial. Only a positive mismatch with the canonical hash can mark an old inclusion reorged. A known block above a lower current anchor is incomplete coverage, not evidence of a reorg. A confirmed event that returns to pending receives the prior-reorg marker only when its old inclusion is positively disproved. A later canonical inclusion can confirm the same immutable event again while retaining that marker.

An outage or a moving anchor preserves older payloads, checkpoints and observation times. Source status becomes unavailable, pending status becomes unknown, and the last attempt is recorded. Missing confirmed rows alone do not delete them or fabricate reorg evidence. Partial scans and storage overflow are visible. An unavailable source or empty bounded view must never be presented as a zero balance or proof of no deposits.

Here, **confirmed** means a canonical block inclusion was observed. No confirmation-count policy, settlement guarantee, asset-output protection, spendability calculation or transaction-fee budget is implemented.

## Private persistence and race handling

Every private request resolves the live authenticated account, checks the panel's expected-owner reference and scopes through that account's registration, profile, exact revision and reserved address. Imported public IDs and cosmetic stamp proofs grant no observer authority. Private responses retain Origin/Fetch Metadata isolation and `Cache-Control: private, no-store`.

The [observation migration](../../migrations/20261017_agent_observations.sql) stores bounded source/event JSON with the per-address refresh lease. Its profile and reservation foreign keys prevent association with another profile's address. Account deletion cascades private observations while preserving the existing permanent reservation tombstones.

Completion updates both source records and their events atomically. It rechecks owner, profile revision, reservation, unexpired lease and random token; a replay, replacement lease or concurrent retirement/reproof cannot install an old result. Provider work has no storage mutation path. A timeout chooses unavailable results once; late work cannot submit a second completion or restore a completed response.

Coherent backups must preserve authentication identity, registrations, profiles, all reservations and observations together. The bounded history is not an unlimited financial audit ledger; archival, stronger reconciliation and recovery procedures remain necessary before relying on it for real receiving operations.

## Validation and remaining acceptance

The implementation has focused mocked-provider tests, actual PGlite persistence/race tests and service tests. They cover protocol event identity, quantities, pagination/bounds, malformed responses, canonical mismatches, indexer lag, timeout, outages, replay, owner/revision isolation, retained addresses, immutable payload conflicts and storage overflow. The built owner/observer browser gate passes **19 desktop and 15 phone checks** at 1280×800 and 390×844 with no page errors: explicit load performs no indexer reads; refresh distinguishes pending/confirmed Bitcoin outputs and independent source outages; stored observations survive reload/retirement; failed sign-out remains hidden through close/reload; and delayed/cancelled proofs cannot link the wrong resident. [Results](../review/agent-observations-2026-10-16/results.json), [desktop Bitcoin observations](../review/agent-observations-2026-10-16/0-bitcoin-observations.png), [phone Bitcoin observations](../review/agent-observations-2026-10-16/1-bitcoin-observations.png) and [phone Counterparty outage](../review/agent-observations-2026-10-16/1-counterparty-unknown.png) are committed fixture evidence. Browser sessions, SQL and disposable signatures are real; extension prompts and provider GET responses are fixtures. Screenshots were inspected for readable quantities, statuses and viewport fit. These local checks do not establish a live release.

Node 24 integration checks passed after the final source fixes:

- **786 tests**: 731 script cases and 55 app/auth cases, with no failures or skips. The 93 additions beyond the original 693-case packet are OAuth policy (19), credential transport (3), Counterparty (18), observation storage (20), Esplora/request boundaries (18), observation service (14), and nearest-neighbour raster scaling (1). All **267 town regressions** pass within that total.
- Typecheck and lint pass, with only the inherited unused-directive warning in `use-current-user.ts`. Day-30 town diagnostics pass. No dependency or lockfile changes were needed for this continuation.
- Normal and explicitly auth-enabled production builds pass without live database or provider credentials; the migration command skips external SQL. The final auth-enabled build includes the final Counterparty pending-suppression fix. The normal development/build auth-setting check also passes.
- The other three browser gates pass in desktop/phone emulation: [ordinary gameplay](../review/agent-observations-2026-10-16/gameplay/results.json), [stamp appearance](../review/agent-observations-2026-10-16/stamps/results.json), and [delayed AI/replay/privacy](../review/agent-observations-2026-10-16/ai/results.json). The stamp gate retains all fourteen checks per viewport. Its real decoder and renderer use fixture art; the separate palette regression proves enlargement introduces no blended colours.
- The final owner gate uses the rebuilt frozen source, including the Counterparty pending-suppression and Authorization-header fixes. Its journeys use genuine cookie sessions; three captured-fetch regressions separately prove genuine bearer-header and cookie authentication, rejection of signed-out/revoked requests and absence of credentials from serialized GET URLs. CI reruns all four browser gates from the committed source.

The complete human and operator checklist remains in [Agent wallet recovery and acceptance policy](agent-wallet-recovery.md#acceptance-evidence-and-remaining-checks). Genuine OAuth/provider behavior, stable identity/recovery guarantees, remaining real Leather receiving-message/account selection, retained-key backup restoration and a coherent server backup/restore rehearsal cannot be replaced by mocks. The successful real Chrome/Leather appearance proof is recorded separately with exact versions and scope. A successful address signature does not prove classic Stamp/Counterparty asset compatibility or safe coin selection.

Before inviting deposits, review those receipts, classify the intended asset protocols, establish complete protocol-aware reconciliation and protected-output rules, and separately authorize public receiving instructions. This packet has no switch that publishes them. No personal wallet seed/key, live deposit, outgoing transaction, paid provider call, production migration, merge or publication is needed for these local checks.

## Primary contracts

- [Esplora HTTP API](https://github.com/Blockstream/esplora/blob/master/API.md): transaction outputs/status, address pagination, canonical hashes and mainnet HTTPS base.
- [Counterparty OpenAPI schema](https://github.com/CounterpartyXCP/counterparty-core/blob/8aab989157019e62423cd959b8571c7daf748d56/openapi.json), [queries](https://github.com/CounterpartyXCP/counterparty-core/blob/8aab989157019e62423cd959b8571c7daf748d56/counterparty-core/counterpartycore/lib/api/queries.py) and [send-index assignment](https://github.com/CounterpartyXCP/counterparty-core/blob/8aab989157019e62423cd959b8571c7daf748d56/counterparty-core/counterpartycore/lib/ledger/other.py): direct-send/mempool fields, cursors, block anchors and message indexes.
- [Stampchain send mapping](https://github.com/stampchain-io/stampchain.io/blob/69689f9c18bda00bd341f2cad3eafa54927ae6c3/server/services/counterpartyApiService.ts): its per-asset explorer history drops identifiers needed by this observer and is not used as a replacement deposit feed.
