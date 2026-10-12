# Kevin World: source vision and the next iteration

Arwyn supplied the original Kevin World character notes from 14 September 2023 and a proposal to tailor Kevin's event retrieval to technology. This document keeps that background available to the local and cloud project chats. These notes describe ambitions and fictional roles; they are not a record of features already running or an announcement of a deployed release.

## The world behind the town

The original concept is a virtual community and creative think tank with an intended cast of 25 AI residents. Its residents bring different interests to shared problems. They can wear several hats, take part in projects outside their main discipline, disagree, change their minds and leave a project. A role should influence what a resident notices without determining every opinion or interaction.

The supplied profiles include these possibilities:

| Resident or inspiration                            | Proposed contribution                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Kevin                                              | Information technology, infrastructure and network security                   |
| Bob Ross                                           | Art, public relations and content                                             |
| Luke Skywalker                                     | Archetypes, cultural research and discovery                                   |
| Manly P. Hall                                      | Creative science, interdisciplinary learning and the fictional FLOCKS society |
| Plato                                              | Philosophy, classical works and translation                                   |
| Perry Mason                                        | Fair dispute resolution and legal questions                                   |
| Martha Stewart, also written “Stuart” in the notes | Merchandise, design and community feedback                                    |
| Dr. Amelia Keynes                                  | Economics and community commerce                                              |
| Warren Buffett                                     | Data, media and public relations                                              |
| Steve Jobs                                         | Creative ideas and design                                                     |
| Robert Greene                                      | Power, relationships and ethical influence                                    |
| Data                                               | AI, science and blockchain research                                           |

Pepe, Alan Watts and Satoshi Nakamoto also appear in the supplied notes without a complete profile in this extract. The names describe proposed fictional agents or inspirations, rather than participation or endorsement by the named people. The extract does not define all 25 intended residents.

The press-release fragment frames Kevin World as a diverse AI think tank. That is useful direction for the project, but a future announcement needs to distinguish the proposed world from the playable features actually released.

## What is playable now

The current application is `arwyn6969/the-game`, the web game. It has Kevin, Arwyn, Northern, Baba, Sub and the player. Kevin currently runs Hobbs Cafe. The separate `arwyn6969/THE_GAME` repository is the older Python simulator.

Keep the current identities, personal history, persistent consequences and useful play without a model key. The immediate gameplay priority remains a first day where the player can make an agreement, act on it, earn money and return to a remembered consequence. The broader cast and research projects are future work, not a reason to postpone fixing that day. This retrieval change does not implement player shift agreements, account saves, outside internet access, autonomous publishing or token trading.

## Kevin's technology attention

The requested keyword comparison is implemented in [`src/game/interests.ts`](../src/game/interests.ts). It recognizes technology, technologies, information technology, data, software, hardware, network, networks and networking without regard to capitalization. It matches whole words or a complete phrase, including punctuation between phrase words. “IT” and “I.T.” are recognized as uppercase acronyms; lowercase “it” is treated as an ordinary pronoun.

The retrieval score becomes:

`recency + importance + current-question relevance + resident-interest bonus`

A technology-related memory gets a single **0.25 bonus for Kevin**. Repeating keywords cannot increase it. The original components remain in effect, ordinary memories stay eligible, and a relevant answer or important commitment can outrank a technology memory. This is a small preference for what he pays attention to, not a filter that removes the rest of his life or a change to his café identity.

The same preference reaches model prompt selection, retrieval diagnostics and the existing offline memory quotes. It uses only Kevin's own stored memories. It cannot retrieve another resident's private event unless Kevin already has a witnessed or communicated copy. Protected identity memories retain their existing selection safeguards.

The interest configuration lives in code rather than the town save. Older version-1 towns gain the preference when loaded without migration, replacement memories or a new API key. Other residents retain their current ranking; future interests can be added after their playable roles are agreed. The bonus is a tunable starting value, not a measured improvement in conversation quality.

## How to assess it

- At equal age and importance, Kevin notices a network failure before an unrelated observation.
- Asking about a remembered violin still selects the violin over unrelated technical events.
- Everyday “it”, embedded word fragments and repeated keywords do not create a larger bonus.
- NPC privacy, protected memories, old saves and the other residents' rankings still work.
- Prompt diagnostics describe the same selected memories and ordering sent to the model.
- The preference works without a key through the existing offline quoting path. The quality and variety of those replies still need the separate playability improvements.

These cases are exercised by the town regressions. A draft PR and passing checks establish a reviewable source change; they do not establish publication to `thegame.grok.me` or provider-backed dialogue quality.
