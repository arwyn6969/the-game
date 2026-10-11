import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Run the player-lane regressions with the same TS module resolution as the game.
test("player conversation and collision regressions", async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  t.after(() => server.close());
  await server.ssrLoadModule("/src/components/town/talk.test.ts");
  await server.ssrLoadModule("/src/game/collide.test.ts");
});
