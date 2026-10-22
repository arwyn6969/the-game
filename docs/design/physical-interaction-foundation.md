# Physical interaction foundation — one manuscript before a theatre system

Planning revision: 22 October 2026. This narrows the immediate next task in [Northern's Park Players](northern-park-players.md). The community brief describes the programme; **CP0 below is the next technical proof**, not a commitment to implement every programme packet at once. This file changes planning only. No runtime, live platform or provider check was performed.

## What was missing from the earlier plan

The creative direction is usable, but the earlier brief moved from intentions to a whole community event without specifying how game state becomes visible action. It also combined several independent efforts: AI runtime, creative collaboration, physical props, inventory and continuous server operation. They should not be one first implementation packet.

The missing foundation is the connection between a supported action, the object's saved location and what the renderer/inventory display. It does not require a new graphics engine or a complete crafting game.

## Actual current implementation

| Area | Existing capability | Missing connection |
| --- | --- | --- |
| Resident art | Procedural Canvas pixel drawings, per-resident palettes/accessories, four facing directions and animated arms/legs | A physical held item and carrying pose driven by actual item state |
| Movement | Tile pathfinding, collision, resident avoidance/yielding, visual interpolation and distance-driven stride | An item action must approach and recheck its target; an intention is not arrival |
| Book/bread/cup poses | Small stationary hand drawings selected from location/status text | They are not proof of custody, disappear while moving/back-facing and cannot represent a transferable object |
| Furniture | Cached procedural scenery derived from a static collision map | A table is not a movable object or an inventory container; do not expose unsupported pickup |
| Reading marker | A visible open-book destination marker | It is a meeting indicator, not a book someone can take |
| Inventory | Mainly the player-specific loaf, stored as an open project with exact identifying text | No general per-resident item registry, ground location or shared pickup/put-down action |
| Save/recovery | Validated v1/v2 towns and protected financial/identity history | Any new physical-item state needs an optional validated extension and backward-compatible loading |

Source: [renderer and hand poses](../../src/game/render.ts), [static world art](../../src/components/town/WorldArt.ts), [map and furniture](../../src/game/world.ts), [navigation](../../src/game/navigation.ts), [loaf actions](../../src/game/effects.ts) and [inventory panel](../../src/components/town/PlayerTools.tsx).

## Recommended first milestone: CP0

**One AI resident can handle one real manuscript, carry it to the park and use its actual text. The player can see where it is, and a reload preserves that state.** Another resident can use the same commands on the same manuscript; no resident-specific item implementation is needed.

The following is a capability demonstration, not a compulsory story:

1. A distinctive manuscript lies on a clear, legal library floor tile. Inspection reveals its title, source label and revision; reading its actual text requires pickup in this first proof.
2. Northern decides to approach and take it. After reaching it, a successful pickup removes the ground drawing and attaches that same manuscript to Northern.
3. Northern walks toward the park. The held manuscript remains visible in every facing direction, with existing walking motion.
4. Northern can read it or put it on a legal floor tile. Putting it down empties Northern's hand and displays the same manuscript there. Sub can independently approach and pick it up.

These steps can also be exercised with direct test commands to verify mechanics. That is not evidence of AI initiative. The real-AI demonstration uses model-selected intentions and speech; the engine validates the resulting actions. No authored conversation substitutes for an unavailable AI reply.

Start with ground placement. Putting books on tables requires supported surface slots, attachment heights and reach rules; add that only after the ground/held loop works. This avoids pretending every static table is already a container. The existing furnishings remain visually and mechanically consistent.

## Small state model

Keep one Town-level item collection as the source of truth. A manuscript needs:

- Stable item ID, kind and title.
- Reference to its actual saved text and revision.
- Owner/access policy, kept separate from whoever is carrying it. Start with one communal manuscript; borrowing it does not transfer ownership or authorship.
- Exactly one location: **on a legal ground tile** or **held by one resident**.
- A revision used to detect actions proposed against stale state.

Inventory is a view of this state: “which objects are held by this person?” Do not maintain a second mutable inventory array with copied item records. A held object derives its visual position from the holder; it does not pathfind independently or need coordinates updated every frame.

Initialize this one manuscript once, when deliberately entering the feature in a town with no physical-item extension. After initialization, a missing or invalid item is a state/recovery issue, not permission to respawn it. Do not create duplicate copies during reload or hide damaged data by replacing it.

For the proof, each resident has at most one carried physical prop. This is an explicit small capability limit, not a weight system or equipment grid. The new manuscript is nonconsumable. Leave the existing loaf/debt representation intact until a separate compatibility decision; do not create a second physical loaf or claim the old abstract loaf already follows this system. Display the legacy loaf and the new physical item honestly in the existing inventory panel.

## Commands and spatial rules

| Command | Required behaviour |
| --- | --- |
| Inspect | Return the actual item title, location and available actions. Inspection of a closed/held object does not automatically disclose private text. The proof manuscript is public. |
| Approach | Reuse the existing pathfinder to reach the item or an adjacent reachable tile. A blocked route reports waiting/failure; no teleportation. |
| Pick up | Recheck item ID/revision, public access, empty hand and legal same-tile/cardinal-adjacent reach at execution. Transfer location once. Two residents cannot both take it. |
| Put down | Require actual custody. Place on the actor's current legal floor tile, with no other physical item there; reject forbidden/door tiles. The paper is nonblocking. Do not silently move it to another tile. |
| Read | Resolve the actual content revision. Initially require holding the manuscript; provide that text to the AI and record only actual reading/speech actions. A status line cannot invent a book or establish that its contents were read. |

Start with pickup, put-down and read. Defer direct hand-to-hand giving: visible put-down/pickup already proves custody changes. Add giving later if people find that cumbersome, with adjacent willing recipient and capacity checks. Do not implement trading, theft, lending contracts, item weight or material crafting in CP0.

Action result, item location and resulting activity must agree. Reuse the existing validation/revision approach to prevent repeated transfers; a repeated or stale request returns a truthful current-state result without moving another copy. CP0 does not require a new general durable command ledger. Add only a bounded per-item receipt if a concrete integration demonstrates that need. A stale target, changed holder or invalid destination produces a reason and leaves the item unchanged.

## Exact visual work

The current renderer can be extended; no replacement sprite-sheet pipeline is required.

| Visual | Minimum art/renderer work |
| --- | --- |
| Ground manuscript | One small, distinct closed-manuscript drawing with a simple shadow and selection outline, drawn in the same depth system as the world |
| Carried manuscript | Shared hand attachment and four directional offsets, rendered while walking and standing; use the holder's interpolated position |
| Reading | Reuse/adapt the existing open-book drawing, now triggered by a valid reading action on a held manuscript rather than text matching |
| Pickup/put-down | A short shared reach/hold pose; no new bespoke animation set for each resident. State changes atomically, and animation reflects the committed transition |
| Inspection | Readable item name/highlight plus keyboard/touch action access; an action must not depend on accurately clicking tiny pixels |
| Inventory | A plain list or “Carrying: [title]” using the same state, visible for the player and inspectable residents |

Avoid a phantom copy: the manuscript must appear once, either in the world or with its holder. If a later version puts it on a table, do not leave a baked decorative drawing of the same manuscript behind. Decorative books elsewhere can remain scenery but must not advertise unsupported actions.

The real held-item drawing takes precedence over decorative status-based cup/book/bread poses. Do not stack a fake held book or cup onto the same occupied hand. Likewise, the existing reading-destination icon is a location indicator, not another copy of the manuscript; distinguish its presentation from pickable items.

Preserve palette, existing silhouettes and optional player Stamp heads. A carried prop cannot disappear merely because the resident turns north or starts walking. Respect pause and reduced motion. Historical position replay must not display current item locations as historical facts: initially omit physical-item overlays from replay with an explanation, or separately implement item history before claiming replay support.

```mermaid
flowchart LR
    A[AI chooses an intention] --> B[Game checks reach and permissions]
    B --> C[One saved item location changes]
    C --> D[Ground or held sprite updates]
    C --> E[Inventory and action result update]
    E --> F[AI observes what actually happened]
```

## Practical packets and stopping point

| Packet | Deliverable | Difficulty |
| --- | --- | --- |
| CP0.1 State/command contract | Agree ground/held union, shared access, content reference, one-hand limit and pickup/put-down/read results. Freeze the small interface before parallel work. | 2/10 design |
| CP0.2 Mechanics/save | Optional item state, action validation, approach integration, atomic custody changes and validated save/reload. No event scheduler or construction system. | 4/10 |
| CP0.3 Art/UI | Ground/held/read manuscript drawings, directional carrying while walking, simple inspection and carried-item list. Parallel with CP0.2 after its interface is agreed. | 3–4/10 |
| CP0.4 AI tool connection | Give a real AI resident the small tools and their actual results. Reuse the gateway/accounting; inference failure remains pending. Do not require completing the entire all-AI release migration to verify item mechanics. | 4–5/10, dependent on a usable qualified AI route |
| CP0.5 Integrated review | Demonstrate the same manuscript through pickup, carrying, reading, put-down, another resident's pickup and reload. Review what is readable and worthwhile before adding objects. | 3/10 |

**Overall CP0 estimate: 4–5/10**, subject to the existing AI route being usable. The earlier 7–8/10 estimate describes the broader AI-led community programme; it should not describe this first object proof. Sustained all-AI service and 24-hour server operation remain separately measured work.

The immediate implementation boundary is CP0, plus a small AI-runtime feasibility review in parallel. A whole performance, all proposed community interfaces, every furniture type and release-wide runtime migration are not prerequisites for this mechanical proof. CP0 itself is not a public claim that the whole game already meets the all-AI promise.

## Evidence that matters

- Pickup/carry/put-down is visually readable without a narration claiming it occurred.
- The manuscript exists in exactly one place after two residents target it, after a repeated command and after reload.
- Its contents and custody survive saving; ownership, authorship and holding are not conflated.
- A changed target, wall/blocked route, full hand or invalid placement leaves state unchanged with an understandable reason.
- Turning, walking, stopping, pause and reduced-motion modes preserve a truthful display.
- Existing towns, loaf/debt handling, identities and finances remain valid.
- Direct command tests establish mechanics; a separate real-AI observation establishes that an agent can choose and use the capability.

## What follows only if useful

First use the manuscript capability in a small AI-led reading with actual responses and memories. The residents may develop it into a performance. Show them moving to places, facing a speaker and speaking actual AI-generated words; do not promise sophisticated acting animations before those are implemented.

Then consider one useful surface slot or second item. A reusable cue-board could use the same object identity/location/inspection patterns, but Baba making one still requires a separately specified work/source action. Movable tables and a general stage-building system remain later features.

There is no new inventory or construction implementation to undo from this planning branch. The correction is to reduce the first packet and make its visual/mechanical success concrete before extending the programme.
