# Current manuscript options — AI lane

22 October 2026. Owner: `platform_inventory`, `codex/manuscript-ai-20261022`.
Explicit dependency: parent `d27e455` and core `564f007` (already integrated by the parent; cherry-pick only this AI commit).

The action prompt now chooses from the engine's current `availableActions` templates, copying exact item IDs and revisions. It explains the generated fields for speech/writing and converts a bring option's destination list into one selected destination. Nearby ground reading requires no pickup; writing still requires holding. The engine revalidates custody, reach and revisions. Empty options fail before inference. Duplicate static examples and instructions were shortened, preserving authoritative actor facts, document provenance, unknown values and free fiction.

Focused evidence: **33 passed**, covering held/same-tile/cardinal-adjacent/distant/unseen/other-held options; actual put-down → exact ground read; stale reach rejection; active journey without a new request; parser authority; privacy; grounding and fiction. Typecheck, targeted ESLint, formatting and whitespace checks passed. The dense stress case includes seven nearby residents, held read/write/put-down/bring options, long own records and a real 1,200-character read. It measured **7,949 characters before the final duplicate-sentence trim**; the final prompt is smaller and the unchanged **8,000-character fail-closed cap** remains. All 33 checks passed again after that trim.

No schema, provider route, budget, configuration or production changes. No live requests. Integration owns full checks and the separately authorized bounded real trial; this handoff makes no real-model qualification claim.
