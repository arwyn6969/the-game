# Coffee station geometry probe

Result: **passed 52 assertions** against the actual `world.ts` and `path.ts` modules, loaded by Vite without application configuration. No runtime code changed.

| Role | Coordinates | Evidence |
| --- | --- | --- |
| Brewer fixture | (5,19) | Existing blocked café counter |
| Brew stand | (5,18) | Exact café floor, cardinal-adjacent to brewer |
| Shelf fixture | (6,19) | Existing blocked café counter; proposed two logical cup slots |
| Staff placement stand | (6,18) | Exact café floor, cardinal-adjacent to shelf and brew stand |
| Customer collection stand | (7,19) | Exact café floor, cardinal-adjacent to shelf |

All three entry routes from café door (17,20) reach their exact destination while the other two station positions are occupied. Door route lengths: 5,18: 16 steps; 6,18: 13 steps; 7,19: 11 steps. Outside door (18,20) also reaches the customer stand. Staff movement between brew and placement is one step in either direction. All recorded paths use cardinal walkable tiles and avoid the supplied occupied positions.

An occupied intermediate placement stand changes the probe approach (7,18) → brew (5,18) from 2 to 4 steps. An occupied destination requires waiting, then a fresh route after it clears. **Raw findPath permits a goal even when that goal is in the occupied set.** The probe's explicit destination gate waits at (7,18); this is a required future adapter guard, not production coffee behavior. Ordinary navigation already has separate occupant checks.

Blocked furniture is never used as a movement goal: findPath would normalize it to a nearby walkable tile. The probe checks exact floor endpoints before routing, exact destination after routing, and one-step fixture reach separately.

**Scope limit:** no complete simulation or real entity occupancy run was tested. These are static map/path checks with synthetic occupied sets. No staffing capacity, queue fairness, payment, custody, animation, movement arbitration, or collection behavior was integration-tested. One brew stand permits one simultaneous brewer; two logical shelf slots are a proposed item capacity, not evidence of doubled throughput.

Reproduce with Node 24: `node docs/implementation/a02-coffee-service-2026-11-01-evidence/geometry-probe.mjs`. Source hashes, all paths and checks are in [geometry-probe.json](geometry-probe.json).
