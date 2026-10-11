# THE GAME

A pixel town. Five people already have days. You are the sixth, not the narrator. There is no ending.

## Play

Name yourself. The clock starts paused on the row.

1. Press 1× and walk to Hobbs Cafe.
2. Click Kevin.
3. Ask him who he is.

The question can travel onto the board and into other people's memories. Ask Baba for bread and she writes a tab of 2. Stand a shift at Hobbs or the grocery and the till pays you, or tells you it is empty.

The town saves in this browser. Download and import keep the debts, notes, and selves.

## What is in this repo

The full app source as of October 2026: the town (`src/game`), the screen (`src/components/town`), the mind call, styles, and the day-two check (`scripts/town-day.test.mjs`).

`node scripts/town-day.test.mjs` needs the Vite app beside it. It checks that after two days the question has traveled, the seed cannot be closed, money stays a number, and a later hour does not repeat the same line.
