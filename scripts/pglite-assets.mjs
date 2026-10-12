import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Nitro bundles PGlite into _libs; its new URL() asset lookup stays relative to
// that generated module. Preserve the installed package's matching binaries.
export async function copyPgliteAssets(
  serverDir,
  sourceDir = dirname(fileURLToPath(import.meta.resolve("@electric-sql/pglite"))),
) {
  const target = join(serverDir, "_libs");
  try {
    await access(join(target, "electric-sql__pglite.mjs"));
  } catch {
    return;
  }
  await mkdir(target, { recursive: true });
  await Promise.all(
    ["pglite.data", "pglite.wasm", "initdb.wasm"].map((name) =>
      copyFile(join(sourceDir, name), join(target, name)),
    ),
  );
}
