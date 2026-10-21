import { createServer } from "vite";
import { fileURLToPath } from "node:url";

export const ENGINE_SOURCE = "0bd3e3b1401ebf6b460d9d71f287c4b474b2452b";

// Local TypeScript transformation only: no application config, env files or listener.
export async function loadEngine() {
  const server = await createServer({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    configFile: false,
    envDir: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  try {
    const modules = {};
    // Sequential entry loading respects the engine's existing circular module graph.
    for (const name of [
      "town",
      "types",
      "save",
      "sim",
      "effects",
      "economy",
      "offline",
      "world",
      "identity",
    ])
      modules[name] = await server.ssrLoadModule(`/src/game/${name}.ts`);
    return {
      ...modules,
      loader: { envDir: server.config.envDir, hasHttpServer: server.httpServer !== null },
      close: () => server.close(),
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}
