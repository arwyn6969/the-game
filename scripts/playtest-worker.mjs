#!/usr/bin/env node
import { createBuilder, preview } from "vite";

// The parent runs this against the sanitized snapshot, with no env files or
// inherited provider/database/wallet settings. Nitro also sees only that tree.
const [action, rawPort] = process.argv.slice(2);
if (!process.env.GAME_PLAYTEST_BUILD_ID || process.env.VITE_AUTH_ENABLED !== "true")
  throw new Error("Run this worker through scripts/playtest.mjs.");
const config = {
  root: process.cwd(),
  envDir: false,
  mode: "production",
  define: { __GAME_BUILD_ID__: JSON.stringify(process.env.GAME_PLAYTEST_BUILD_ID) },
};
if (action === "build") {
  const builder = await createBuilder(config);
  await builder.buildApp();
} else if (action === "preview") {
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 8181 || port > 8185)
    throw new Error("Invalid playtest session port.");
  const server = await preview({
    ...config,
    preview: { host: "127.0.0.1", port, strictPort: true, open: false },
  });
  console.log(`[playtest] Ready: http://127.0.0.1:${port}/`);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.once(signal, () => server.httpServer.close(() => process.exit(0)));
} else throw new Error("Invalid playtest worker action.");
