import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../migration-plan.mjs";

// This isolated Node preload seeds genuine account sessions; product auth,
// account guards, SQL registry, BIP-322 verification and HTTP stay unchanged.
if (
  process.env.GAME_AGENT_QA_FIXTURE !== "1" ||
  process.env.VITE_AUTH_ENABLED !== "true" ||
  process.env.AGENT_REGISTRY_LOCAL_DEV !== "true" ||
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.GROK_PROJECT_ID ||
  !process.env.BETTER_AUTH_SECRET
)
  throw new Error("Agent QA requires an explicitly isolated local process.");
const sessions = JSON.parse(process.env.GAME_AGENT_QA_SESSIONS || "null");
const addresses = JSON.parse(process.env.GAME_AGENT_QA_ADDRESSES || "null");
if (
  !Array.isArray(sessions) ||
  sessions.length !== 2 ||
  sessions.some((s) => !/^[a-z0-9-]{1,80}$/.test(s.owner) || !/^[a-f0-9]{64}$/.test(s.token)) ||
  !Array.isArray(addresses) ||
  addresses.length !== 4 ||
  addresses.some((value) => !/^bc1q[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(value))
)
  throw new Error("Agent QA requires disposable session and address fixtures.");

const database = new PGlite({ parsers: { 20: Number } });
await database.waitReady;
await database.exec(
  "create table _migrations(name text primary key, applied_at timestamptz not null default now())",
);
const folder = new URL("../../migrations/", import.meta.url);
for (const { name } of pendingMigrations(await readdir(folder), [])) {
  await database.transaction(async (tx) => {
    await tx.exec(await readFile(new URL(name, folder), "utf8"));
    await tx.query("insert into _migrations(name) values($1)", [name]);
  });
}
for (const [index, session] of sessions.entries()) {
  await database.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,true)', [
    session.owner,
    `Disposable owner ${index + 1}`,
    `${session.owner}@example.invalid`,
  ]);
  await database.query(
    'insert into "session"(id,"expiresAt",token,"updatedAt","userId") values($1,$2,$3,$4,$5)',
    [
      randomBytes(16).toString("hex"),
      new Date(Date.now() + 3_600_000),
      session.token,
      new Date(),
      session.owner,
    ],
  );
}
globalThis.__pgliteInstance__ = Promise.resolve(database);

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const method = String(
    init?.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  if (url.origin !== "https://stampchain.io") {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      console.error(`[agent-fixture] ${JSON.stringify({ unexpectedNetwork: url.origin, method })}`);
      throw new Error("External requests are disabled in agent wallet QA.");
    }
    return realFetch(input, init);
  }
  if (method !== "GET") throw new Error("Agent wallet QA permits Stampchain GET only.");
  const match = /^\/api\/v2\/stamps\/balance\/(bc1q[a-z0-9]+)$/.exec(url.pathname);
  if (!match || !addresses.includes(match[1]))
    throw new Error("Unexpected agent QA Stampchain request.");
  const index = addresses.indexOf(match[1]);
  const page = Number(url.searchParams.get("page"));
  const limit = Number(url.searchParams.get("limit"));
  if (page !== 1 || limit !== 24) throw new Error("Unexpected agent QA pagination.");
  const outage = index % 2 === 1;
  console.log(`[agent-fixture] ${JSON.stringify({ method, inventory: true, outage })}`);
  if (outage) return new Response("Disposable indexer outage", { status: 503 });
  const bytes = JSON.stringify({
    page,
    limit,
    total: 1,
    totalPages: 1,
    last_block: 900_000,
    data: [
      {
        cpid: "ASTAMPQA4242",
        stamp: 4242,
        tx_hash: "a".repeat(64),
        stamp_url: `https://stampchain.io/stamps/${"a".repeat(64)}.png`,
        stamp_mimetype: "image/png",
        balance: "2",
        supply: "10",
        divisible: false,
        locked: true,
        address: match[1],
        unbound_quantity: "1",
        utxos: [],
      },
    ],
  });
  return new Response(bytes, {
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bytes)),
    },
  });
};
