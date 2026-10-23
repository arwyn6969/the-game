import { spawnSync } from "node:child_process";

// Building never connects to a database or runs migrations. Those are explicit
// release steps against a named Neon branch, after preview validation.
const env = {
  ...process.env,
  GAME_HOSTING_TARGET: "cloudflare",
  GAME_BASE_PATH: process.env.GAME_BASE_PATH || "/thegame",
  VITE_AUTH_ENABLED: "true",
  VITE_AUTH_MODE: "standalone",
  VITE_GROK_EXTENSIONS: "0",
};
delete env.DATABASE_URL;
const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
