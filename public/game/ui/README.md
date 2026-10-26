# Retro UI icons

Original project-native vector artwork, created for THE GAME interface comparison.

`retro-icons.svg` is a reusable external SVG symbol sprite. Every icon uses a
24×24 integer pixel grid, currentColor fills and crisp edges, so it can share the
active interface palette without generating a separate image for each state.

Symbol IDs: journal, inventory, map, library, wallets, stamp, help, people,
speech, clock, coin, save, restore.

Use the `TownUiIcon` component. It resolves the sprite through `appPath`, so the
same asset works at the origin root and the `/thegame/` hosting mount point.
Icons are decorative. Keep the visible text label on their controls.

The sprite contains no game state, embedded fonts, scripts, remote resources or
images. No external artwork or bitmap generation was used.
