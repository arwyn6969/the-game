# Game quality playtest guide

Use five uncoached human sessions to decide whether the funded library loop is understandable and worth revisiting. Automated browser journeys test correctness and access; they do not count as these sessions.

Run the reviewed candidate locally or use the exact authorized release. Record its commit/build identifier. Create a fresh synthetic town for each participant; never replace their personal town. Use at least two desktop and two phone sessions, with the fifth on either. Include a physical phone and a keyboard or screen reader session where available. Keep AI mode consistent and record it. Local-only dialogue is sufficient for the whole project.

## Session instructions

Allow 10–15 minutes for the first session. Give only this prompt:

> Find something you want to help with, or decline it.

Let the participant read and choose without steering them toward a preferred answer. Do not fix a draft for them. Record hesitation, mistaken expectations and the participant's own words. If they become stuck, record where and why before giving assistance; the assisted result does not meet the uncoached completion gate.

After their chosen action, ask:

1. What did you choose, and what changed because of it?
2. Who funded the work? Who was paid, and for what?
3. Did the result actually help anyone? How can you tell?
4. Who owns the index? Does being credited give anyone control over another person's work?
5. Is there anything you would want to do on a further visit?

For the first-reading story, also record who the player believed they were helping, why they chose the park or library, and whether the gathering felt worth arranging. Ask whether optional bread or tea felt useful and whether free attendance was clear. Do not explain these answers for them.

Reopen the same saved town on the next **game** day, using ordinary clock controls. Leaving the browser overnight does not advance this local simulation. Ask the participant what they recognize and what they would do next. Do not promise a reward for returning.

## Session record

Copy this record for each participant. Use anonymous session identifiers; keep personal details outside Git.

| Field                                                | Observation       |
| ---------------------------------------------------- | ----------------- |
| Session                                              | 1 / 2 / 3 / 4 / 5 |
| Date and local timezone                              |                   |
| Exact build                                          |                   |
| Device and browser                                   |                   |
| Input and accessibility settings                     |                   |
| Local-only or AI mode                                |                   |
| Starting town day and time                           |                   |
| First action discovered without help                 |                   |
| Chosen contribution or refusal                       |                   |
| Time to decision and result                          |                   |
| Hesitation and any assistance                        |                   |
| Player's explanation of the consequence              |                   |
| Understanding of funding and payment                 |                   |
| Understanding of usefulness and ownership            |                   |
| Understanding of Northern's purpose and chosen venue |                   |
| Reaction to the reading and optional spending        |                   |
| Recognition after reopening                          |                   |
| Voluntary further visit                              |                   |
| Player's words and suggested change                  |                   |
| Defect, if any                                       |                   |

## Decision gate

Four of five participants should make a chosen contribution or refusal and explain its consequence. Four should recognize their own consequence after reopening. At least three should choose another visit without a directed reward. Record the counts and underlying observations; five sessions diagnose a prototype and do not establish retention at scale.

Any unintended obligation, lost earned payment, unreconciled money, private disclosure or unrecoverable save fails the gate regardless of the counts. Reproduce and fix the defect, then repeat the affected path. Confusing terms need clearer presentation; an uninteresting consequence needs better stakes. Do not solve either by adding more residents or more generated chatter.
