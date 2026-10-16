# Stamp identity and agent wallet tooling

Approved direction, 15 October 2026. Implementation starts from the quality candidate `codex/game-quality-review` at `80ee299`, in `codex/stamp-identity-tooling`. The permanent identity packet is implemented and validated for review; [the receipt](#implementation-receipt) records its checks and limits. The [read-only stamp selection packet](stamp-wallet-selection.md) is implemented on `codex/stamp-wallet-selection` for review; its receipt records its validation and remaining live-wallet gate. [Packet 3A: private owner registration and receiving drafts](agent-receiving-registry.md) is implemented on `codex/agent-receiving-registry`; [draft PR 33](https://github.com/arwyn6969/the-game/pull/33) and its [validation receipt](agent-receiving-registry.md#validation-receipt) record the delivered foundation. The [private chain-observation continuation](agent-deposit-observations.md) and [recovery policy](agent-wallet-recovery.md) add explicit read-only observations and account-linking protections while live funding gates stay open. The [current quality delivery](game-quality-delivery.md) is the gameplay baseline. The 12 October consolidation notes describe an earlier snapshot: the current candidate already has an active eight-actor economy, funded library work, wages, inventory and validated financial saves.

## Outcome and order

Give every world and resident a permanent identity before introducing externally owned assets. A player can prove control of a Bitcoin address, select an eligible stamp and optionally use its artwork as the character's head in the appearance preview. Agents will eventually have published receiving instructions, accept outside BTC and stamp deposits, and propose transfers or trades. Packet 3A first establishes private authenticated ownership and watch-only address drafts. The owner must approve every eventual outgoing transaction. Shared worlds and server-authoritative PvP follow this tooling; they are not part of the initial identity change.

| Packet                               | Deliverable                                                                                                                                 | Gate before continuing                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Permanent identities              | Additive world/character registry, deterministic migration, restore/fork distinction and recovery                                           | Identity and save-integrity acceptance checks below                                                                                     |
| 2. Stamp selection and optional head | Wallet compatibility spike, server-verified login challenge, read-only holdings, eligible stamp picker and safe cached artwork/crop preview | Address/signature and API contracts verified before receiving funds; desktop/phone readability, accessibility and image safety verified |
| 3. Agent receiving wallets           | 3A: private owner namespaces and signed watch-only drafts; 3B: verified receiving instructions, deposit reconciliation and separate BTC observations | Actual extension/protocol compatibility and recovery verified before deposits; no keys in towns or model context; funding unpublished in 3A |
| 4. Proposed transfers                | Agent intent, owner review, validated unsigned transaction, owner signature and receipt reconciliation                                      | Every outgoing transfer requires approval; rejected/expired/replaced transactions are handled                                           |
| 5. Tested trading                    | A supported asset and settlement mechanism, independently checked transaction semantics and cancellation                                    | Prove settlement and asset delivery before claiming an exchange or enabling broader trading                                             |
| 6. Shared worlds and PvP             | Dynamic roster/reference migration, authoritative server, permissions, synchronization and combat                                           | Identity collisions, economy invariants, anti-cheat and wallet isolation verified across worlds                                         |

These are implementation dependencies, not release promises. No paid service, mainnet transaction, deployment or publication is authorized by this document.

## Packet 1: additive identities on Town version 2

Keep `Town.version === 2`, version-1 imports, the existing roster and exported game contracts. Add a versioned `identityRegistry` extension. Existing local role keys such as `kevin`, `baba` and `northern` remain scoped to one world and continue serving the simulation, dialogue, renderer, social references and current economy. Permanent IDs are the new boundary for tools and future cross-world records.

The registry's first schema records:

| Field                                         | Meaning                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `schemaVersion: 1`                            | Version of this extension, independent of Town version                                        |
| `worldId`                                     | Permanent identity of this world                                                              |
| `rootWorldId`                                 | Earliest recorded world in this explicit fork lineage                                         |
| Optional `parentWorldId`                      | Immediate world from which this world was explicitly forked                                   |
| Character map keyed by existing local role ID | Resolves a world-scoped engine role into its permanent character identity                     |
| `characterId`                                 | Permanent identity of this particular resident                                                |
| `archetypeId`                                 | Its authored role/template, so many worlds may contain different Kevins                       |
| `originWorldId`                               | Historical origin of the resident's lineage, retained when the resident is copied into a fork |
| Optional `forkedFromCharacterId`              | Identity copied when an explicit fork created this character                                  |

Names remain editable presentation. A stamp, BTC address, image, archetype or local role key is not the permanent character ID. Two characters called Kevin can coexist in future tools because their permanent IDs differ. This registry alone does not let the current fixed-roster engine simulate both Kevins in one town. A later dynamic-roster migration must remap every relationship, memory, conversation, debt, account, agreement, location reference and pending action before worlds can merge.

### Creation, legacy migration and recovery

- New towns use independent cryptographically secure random 256-bit IDs for their world and each character. Names, clock time and local counters are not identity sources. A missing secure random source must fail explicitly rather than silently use weak randomness.
- A town that already has a valid registry retains its exact IDs through save, reload and ordinary import/export. Validate the registry before accepting it; duplicate, malformed or partial identities must not be silently regenerated.
- An older town without IDs receives a deterministic SHA-256 migration derived from canonical parsed source content, before runtime normalization can modify that content. Equivalent formatting and object-key ordering must produce the same result. Every array retains its original order, including the roster, replay and history; array reordering may change the derived identity. The migration's canonicalization rules and fixtures must define this precisely.
- The same historical source imported twice must acquire the same IDs. Two different pre-ID snapshots cannot prove that they came from the same original town. Do not infer lineage from matching names, similar stories or a snapshot timestamp; retain the originals so later explicit reconciliation remains possible.
- Preserve an exact source-raw recovery copy before replacing an older browser save with its migrated version. If that recovery copy cannot be written, retain the source and show the existing recovery path instead of silently overwriting it.
- Preserve valid prose, names, memories, debts, ownership, balances, journal/social records, ledger entries, holds and agreements. Identity migration must not rewrite financial history or manufacture money. Existing disposable replay/path export behavior remains governed by the save contract.

Canonical hashing must be deterministic across supported environments and independent of storage wrappers where those wrappers contain the same supported town payload. It is a migration mechanism, not a cryptographic proof of historical ownership, authorship or world uniqueness.

### Restore and explicit fork

**Restore/import** resumes the same world: retain its world, root, parent, origin and character IDs. Preserve the existing replacement confirmation, current-town backup, conflict guards and raw recovery behavior. Importing a save does not grant wallet control, an authenticated session or spending permission.

**Fork as a new world** is a separate explicit action, not an implicit side effect of import. Export a copied town with a new random `worldId` and new random character IDs. Retain the source's `rootWorldId`, set `parentWorldId` to its `worldId`, record each prior character ID in `forkedFromCharacterId`, and preserve each resident's historical `originWorldId`. The root, parent and previous character references record the copied lineage; the newly assigned IDs identify this particular copy. Preserve the story and validated local financial state as a clearly separate simulation. Forking must not mutate the source town.

Neither path imports wallet authority. A future wallet link requires fresh proof from the wallet owner and an explicit server-side authorization record. Copied public addresses or stamp metadata must not authorize sending, ownership claims, agent control or duplicate asset-backed balances. A forked simulation's local coins are not BTC and do not create another real deposit.

## Acceptance for the first packet

The implementation receipt must record the actual checks and results. Until that receipt is filled, the following are acceptance criteria, not completed work:

1. Two fresh towns have different world IDs and noncolliding character IDs; every local role resolves through its own world's registry.
2. Existing registry IDs survive reload, ordinary export/import and repeated restore without being regenerated.
3. Equivalent pre-ID v1/v2 inputs produce identical migrated IDs despite formatting or object-key order changes. Every array retains its original order; array reordering may produce a distinct migration result. A material source change produces a distinct migration result.
4. Version-1 loading still adds the later residents once, preserves the original residents and history, and assigns a complete valid registry without changing existing financial guarantees.
5. A valid developed town retains its prose, memories, debts, journal/social records, inventory and financial records through migration, restore and export/import. Include the current funded-library and durable-wage cases.
6. A duplicate or malformed registry fails visibly with original bytes recoverable; unsupported schemas are not silently downgraded or stripped.
7. An explicit fork changes only identity/lineage as intended, preserves its copied simulation history, does not alter its source, and survives export/import with the new IDs intact. Repeated forks create distinct identities.
8. Migration keeps the original raw browser save before replacement. Simulated storage failure cannot destroy the only recoverable copy. Existing stale-tab and import-backup protections still work.
9. No import or fork supplies credentials, signing keys, authenticated ownership or spending authority. No wallet operation, network transaction or new external service is needed to play or migrate.
10. Relevant type, lint, save/identity/economy regressions and full tests pass. Check the actual restore/fork controls at 1280×800 and 390×844, including keyboard access, source preservation, downloaded-file import and reload. Build locally without production database/provider credentials.

## Implementation receipt

Packet 1 is implemented on `codex/stamp-identity-tooling`, based on `80ee299`, in [draft PR 31](https://github.com/arwyn6969/the-game/pull/31). Its implementation commit is `7ab79da`; the draft is stacked on the [gameplay candidate PR 30](https://github.com/arwyn6969/the-game/pull/30) and must be retargeted after that dependency is integrated. The feature is not merged or published. The first packet keeps Town version 2 and the eight local gameplay keys; the registry and new helper references are additive. `@noble/hashes` is now a direct pinned dependency at its already locked version 2.4.0 for portable SHA-256 migration hashing; no dependency version was upgraded.

New worlds receive secure random world/resident IDs. Existing valid registries are preserved; legacy content is hashed before narrative, roster or economy normalization. Import defaults to restoring the same world and offers a separate explicit fork that assigns new IDs and records historical origin, root, parent and source-character lineage. This choice replaces the browser town only through the existing backup/conflict guards. Malformed identities retain their original bytes and cannot silently acquire replacements.

The first successful migration of a pre-identity v2 browser save preserves its exact original raw file. A saved recovery copy is reused after a quota failure and page reload. Legacy v1 originals already remain under their old key, so their migration does not consume quota with a redundant backup.

Validation used Node 24.19.0, a fresh locked offline install and isolated synthetic towns. No provider credentials or live database were used.

| Check                                   | Result                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --offline --no-audit --no-fund` | Passed; 425 packages                                                                                                                                                   |
| `npm run typecheck`                     | Passed                                                                                                                                                                 |
| `npm run lint`                          | Zero errors; one inherited unused auth directive warning                                                                                                               |
| `npm run test:town`                     | 267 passed, zero failures                                                                                                                                              |
| `npm test`                              | 504 script plus 55 app/auth tests; 559 passed, zero failures/skips                                                                                                     |
| New identity regressions                | 20 passed, including duplicate IDs, nested fork lineage, original-byte recovery, quota retries/reloads, stale tabs and v1 quota preservation                           |
| `npm run diagnose:town`                 | No world-audit issues; all six measured exports through day 30 imported                                                                                                |
| `npm run build`                         | Passed with `DATABASE_URL` unset; production database migration skipped                                                                                                |
| Built browser at 1280×800 and 390×844   | Keyboard/touch movement, pause, conversation, download/import, reload, competing tabs, v1 migration, repeat restore, fork, fork reload and invalid-ID rejection passed |
| Ordinary library controls               | Successful and failed lookup paths retained valid fees, custody and 90 total game coins through portable saves and reload                                              |

[Validation summary](../review/stamp-identity-2026-10-15/validation.json) and [browser results](../review/stamp-identity-2026-10-15/browser-results.json) record the checks. [Desktop import](../review/stamp-identity-2026-10-15/desktop-identity-import.png) and [phone import](../review/stamp-identity-2026-10-15/phone-identity-import.png) were visually inspected for readable choices and unclipped buttons. The browser contexts reported no page or console errors.

Two historical regression fixtures built version-1 data from the current constructor. They now remove the new registry when simulating that older format; their original gameplay and migration assertions remain. A genuine historical file continues to be exercised separately.

Permanent IDs here are local portable provenance, not proof of an authenticated controller. The fixed roster, browser simulation and world-scoped engine references remain; live visits and merged worlds need the later dynamic-roster and server-authority work. A different historical pre-ID snapshot cannot prove identical lineage. Physical-device checks, live wallet compatibility, stamp selection, blockchain transfers and hosted publication have not been performed by this packet.

## Packet 2: prove wallets and read holdings before funds

Use a narrow backend adapter for Stampchain rather than coupling the game to every explorer response. Pin the API contract, validate returned values, handle pagination, and distinguish an empty balance, an unavailable indexer and stale data. Keep BTC/stamp data outside the local town's coin ledger.

Product direction updated 16 October 2026: [Wonder Wallet](https://wonder-wallet.com) is the preferred wallet recommendation and the next compatibility target. The implemented connector remains Leather, with a successful real appearance proof recorded separately; Wonder Wallet support is not implemented or verified yet. Validate Wonder Wallet connection/discovery, address and network selection, message-signing format, rejection/cancellation, account changes and recovery against the existing proof boundary before making it the default onboarding path. Later transfer support also requires unsigned transaction inspection and asset-aware coin selection. Keep the wallet adapter separate from permanent identities and private ownership records. UniSat and Horizon remain other candidates rather than the preferred onboarding path.

The [official Wonder Wallet developer API](https://www.wonder-wallet.com/developers.html) documents `window.wonderWallet`, `requestAccounts`, custom BIP-322 `signMessage` and account/disconnect events. Its connection proof uses a wallet-generated message; keep the game's server-issued, purpose-bound challenge for identity and receiving proofs. Validate the actual returned signature encoding and supported address type rather than assuming the existing Leather verifier accepts it.

The server must issue a short-lived, single-use challenge bound to the game origin, network, wallet address, session and requested action. Verify the signature server-side and then query indexed asset holdings, retaining their observation time and indexed block. A holdings snapshot alone does not establish a confirmed deposit or spendability. A wallet connection or client-side list of addresses is not authentication. Account changes, logout, ownership loss and replayed/expired challenges must invalidate the relevant authorization. The current appearance preview uses a separate scoped read-only session alongside local name entry. It preserves existing auth safeguards and grants no canonical character/account control; see the [implemented scope](stamp-wallet-selection.md). Packet 3A adds a distinct authenticated private owner registry before any receiving funds or transfer capability.

Asset references use Bitcoin network, protocol and CPID as appropriate. A stamp number and image URL are display metadata. Classic stamps may have many editions and holders; SRC-721 may also allow repeated traits. A selector cannot promise a globally unique head merely because its owner holds a stamp. SRC-20 is fungible and needs a separate token/balance model. Initially support a small documented set of asset/content types rather than implying every Stampchain protocol is interchangeable.

Read-only research on 15 October returned successful public health, metadata, holdings, holder and send-history responses. Detail responses nested the stamp under `data.stamp`; a no-holder query returned 404. These observations are fixtures for a compatibility spike, not a service-level guarantee. API keys/quotas, indexing freshness, supported wallet versions and complete test-network availability still require confirmation. No send/PSBT POST, signature, broadcast or transfer was tested during planning.

### Optional heads

Keep the original authored sprite available and let the player preview, crop and choose whether to use the stamp head. Convert eligible artwork to bounded cached raster assets in an isolated decoder; never execute stamp HTML, scripts, recursive content or embedded instructions in the game or agent. Reject unsupported or oversized inputs gracefully. Apply consistent head anchors, direction behavior, scaling and pixel rendering while preserving readable silhouettes, hitboxes and movement. Artwork does not change combat statistics or permissions.

## Packet 3: private receiving drafts before deposits

### 3A: authenticated owner registration and watch-only drafts

The [packet 3A implementation](agent-receiving-registry.md) creates a private server namespace for a genuinely authenticated account, with eight registered residents and receiving profiles. Portable world/character IDs supply provenance, not authority: two accounts can register the same imported source as independent private copies. No copied save, cosmetic stamp proof or offline `dev-user` can claim another account's profiles.

Each profile starts unconfigured. A fresh single-use BIP-322 proof can reserve a supported mainnet Native SegWit address controlled in the owner's external wallet. The game generates no wallet keys. One address is reserved to one profile globally; replacement and retirement retain historical reservations, and a delayed proof cannot undo a newer revision. Inventory reads are private observations through the existing Stampchain adapter. The 16 October continuation adds separate explicit chain observations; neither observations nor addresses enter portable saves, model context or the town coin ledger.

`fundingPublished` is constrained to `false`. There are no public donation instructions, payment links, confirmed deposit credits, spending methods or live PvP in this packet. Branch `codex/agent-receiving-registry` is ready for draft-PR review, stacked on appearance PR 32. Its [validation receipt](agent-receiving-registry.md#validation-receipt) records 693 passing tests, both viewport journeys and all four browser gates. Mocked extension prompts and public indexer data in automated checks do not satisfy the actual wallet/recovery gate.

### 3B: external wallet, recovery and deposit gate

The [private observation implementation](agent-deposit-observations.md) now records Bitcoin output IDs and Counterparty direct-send message IDs with pending, confirmed and positively evidenced reorg transitions. Explicit refreshes retain exact raw quantities and historical addresses, preserve prior evidence during outages and never claim balances or spendability. Counterparty sends remain unclassified and omit other transfer mechanisms; complete Stamp reconciliation and protected-output rules remain open. The [recovery policy and acceptance checklist](agent-wallet-recovery.md) records the successful real Chrome/Leather appearance proof, conservative account/address rules and automated linking/privacy checks. Before inviting deposits, complete genuine OAuth and receiving-message acceptance, distinct accounts/addresses, selected protocol compatibility, external-key restoration and coherent server backup/restore. Distinguish observations from spendable miner-fee funds. Publish receiving instructions only after those checks and explicit enablement; packet 3A has no publication switch. BTC pays miner transaction fees and remains separate from town coins. External donors may send unexpected assets.

## Packet 4: owner-approved proposals

In the first release, an agent can inspect permitted holdings and submit a typed proposal. The owner reviews the exact asset, amount, destination, network, BTC fee, expiry and effect on the agent's remaining funds. A policy validator checks balances, reserved UTXOs, permissions, fees and the decoded unsigned transaction. The owner then approves and signs that exact transaction. Any changed recipient, amount, inputs, outputs or fee requires renewed review. The model never receives a seed/private key and cannot sign or broadcast from prose alone.

Track proposal, approval, signature, broadcast, pending, confirmed, rejected, expired, replaced and failed states with an audit trail and idempotent processing. Never record settlement merely because a wallet returned a transaction ID. Ownership and authorizations need fresh verification at transfer and session boundaries. Higher agent intelligence does not automatically expand spending permissions; later bounded autonomy requires a separately agreed policy.

## Open decisions and later gates

**What transfers with a stamp remains undecided.** The simplest initial option is for the current owner to gain the cosmetic/selection entitlement while the existing character keeps its private history, relationships and accounts. A collectible-persona option would transfer selected public character state under explicit rules, with more complex privacy, consent, edition and recovery behavior. A permanently bound identity would restrict later reuse and needs a dispute/recovery policy. The implementation must not silently decide among these while adding IDs.

**Trading requires a settlement design.** Counterparty sends, dispensers, UTXO-attached assets and bilateral swaps are different operations. Stampchain's generic seller-PSBT source currently includes a commented ownership check and placeholder fee/size values; the endpoint's existence is not proof of safe atomic stamp settlement. Do not implement a two-legged asset-for-BTC exchange that can finish one side and fail the other. Use a proven supported path, verify final transaction semantics and test double spends, stale quotes, fee changes, cancellations and reorganization handling before enabling real trading.

**Shared worlds and PvP need authority beyond identifiers.** Build a dynamic roster and complete reference remapper, then define authenticated character control, one active authority for each character, authoritative actions/clock/combat, anti-replay rules, persistence, transfer reconciliation and privacy boundaries. Two browser saves claiming the same IDs must not independently control the same hosted character or spend the same funds. A saved world ID is a name, not proof that its uploader owns the original world. Real BTC/stamps are never lost, awarded or wagered because a client claims a PvP result; any future asset stakes need their own explicit design and authorization.

## Primary integration references

- [Stampchain explorer/API repository](https://github.com/stampchain-io/stampchain.io) and [OpenAPI schema](https://github.com/stampchain-io/stampchain.io/blob/main/schema.yml): holdings, metadata, sends, SRC-20 and transaction composition.
- [Counterparty asset model](https://docs.counterparty.io/docs/basics/assets/counterparty-assets/) and [SRC-721 specification](https://github.com/stampchain-io/src-721/blob/master/README.md): balances, editions, CPID references and layered artwork.
- [Leather message signing](https://app.leather.io/posts/signmessage-api-method), [Leather PSBT signing](https://leather.gitbook.io/developers/bitcoin-methods/signpsbt) and [UniSat wallet API](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet): candidate wallet capabilities to verify.
- [Stampchain seller-PSBT implementation](https://github.com/stampchain-io/stampchain.io/blob/main/routes/api/v2/trx/create_psbt.ts): incomplete validation/response details that need review before exchange integration.
