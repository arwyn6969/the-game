# Ground manuscript reading and current action options — core lane

22 October 2026. Coordinator baseline `d27e455` integrated before this follow-up. The change is limited to physical-item rules, their focused regression suite and this handoff. No provider call, operator configuration, database, types, save contract or publication is changed.

`canReadPhysicalItem(town, actor, item)` is the shared pure predicate for UI and executor. A resident may read a current-revision manuscript they hold, or one on a legal ground tile at the same/cardinal-adjacent tile in the same zone. Diagonal, distant, across-zone and another resident's held item are denied. An actor's active bring/pickup journey still excludes a conflicting read. The executor first rechecks its normal item revision and then uses this helper; a rejected stale quote returns no content.

Ground reading preserves location, holder, item revision, content revision, author and actual words. It records private factual completion plus the existing quoted/unverified statement provenance for the body. It does not pick up, transfer, rewrite or censor the manuscript; finances and bystander memories are unchanged. Reading poses and result handling use the existing optional structures.

`physicalObservation.availableActions` contains concise current decision templates:

- `speak` and `wait` carry only `kind`; speech text remains a model choice.
- Item options carry `kind`, `itemId` and the exact `itemRevision`.
- `write` omits title/text so the model supplies original words.
- `bring` adds `destinations: PlaceId[]`; the model selects one supported destination.

Only visible item metadata is used. Reading text is not disclosed by the options. The list is empty for an actor with an active journey or an unavailable/invalid prototype; pickup/bring remain bounded resident-controller intentions when distant. Put-down requires the holder's legal floor tile. Current offers are revalidated on execution and are not promises of future path completion. The redundant global destination-label list was removed from the observation: static prompt descriptions already name places, while the bring option now contains the actual allowed IDs. This keeps the packet footprint modest.

Validation with bundled Node 24: scoped ESLint, Prettier, full TypeScript typecheck and whitespace checks passed. **30** core, integration, grounding and prompt/parser tests passed without provider calls. Four new core cases cover all five allowed ground-read positions, diagonal/distant/cross-zone/other-held rejection, stale-content isolation, option/executor agreement (including held options and active journeys), private provenance, unchanged custody/revisions/finances and current save round trips. Existing v1/v2 fiction preservation remains covered. The first combined run exceeded the old prompt stress budget with a duplicated destination list; removing that duplication restored the bounded stress check. The AI lane owns its corresponding prompt instructions and expanded stress coverage; the UI lane owns button reuse and browser checks.
