import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyPgliteAssets } from "./pglite-assets.mjs";
test("bundled PGlite receives every matching runtime binary beside its module", async () => {
  const root = await mkdtemp(join(tmpdir(), "pool-assets-"));
  try {
    const source = join(root, "package"),
      build = join(root, "server");
    await mkdir(source);
    await mkdir(join(build, "_libs"), { recursive: true });
    await writeFile(join(build, "_libs", "electric-sql__pglite.mjs"), "// bundled library");
    for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"])
      await writeFile(join(source, name), Buffer.from([0, 1, 2, name.length]));
    await copyPgliteAssets(build, source);
    for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"])
      assert.deepEqual(
        await readFile(join(build, "_libs", name)),
        await readFile(join(source, name)),
      );
    await rm(join(source, "initdb.wasm"));
    await assert.rejects(
      copyPgliteAssets(build, source),
      /ENOENT/,
      "a partial asset package must fail the build",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
