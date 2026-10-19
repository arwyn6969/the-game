/** Synthetic offline diagnostic: never reads personal saves or calls a provider. */
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const option = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const checkpoints = [...new Set(option("days", "90,180,365").split(",").map(Number))].sort(
  (a, b) => a - b,
);
const talksPerDay = Number(option("talks-per-day", "56"));
if (
  !checkpoints.length ||
  checkpoints.some((day) => !Number.isInteger(day) || day < 1 || day > 730) ||
  !Number.isInteger(talksPerDay) ||
  talksPerDay < 0 ||
  talksPerDay > 280
)
  throw new Error("Use --days=90,180,365 (1–730) and --talks-per-day=56 (0–280).");

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
try {
  const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
  const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
  const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
  const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
  const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
  const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
  const { walkable } = await server.ssrLoadModule("/src/game/world.ts");
  const town = createTown("Longevity fixture");
  const roster = town.agents.filter((agent) => agent.id !== "player").map((agent) => agent.id);
  const questions = [
    "Hello.",
    "What are you up to?",
    "Tell me a bit about yourself.",
    "What is your advice about education?",
    "How should we assess energy costs?",
    "What time is it?",
    "Can I lend a hand?",
    "Any plans for tomorrow?",
  ];
  const money = (value) =>
    value.agents.reduce((sum, agent) => sum + agent.money, 0) +
    value.tills.cafe +
    value.tills.grocery +
    Object.values(value.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
  const openingTotal = money(town);
  const started = performance.now();
  let speech = 0;
  for (let elapsedDay = 1; elapsedDay <= checkpoints.at(-1); elapsedDay++) {
    // Many attributed conversations exercise compression. They are synthetic
    // requests, not a claim that the player physically visited every resident.
    for (let index = 0; index < talksPerDay; index++) {
      const agentId = roster[(index + elapsedDay) % roster.length];
      const text = questions[Math.floor(index / roster.length) % questions.length];
      const job = { kind: "player", agentId, text, day: town.day, minute: town.minute };
      applyResult(town, offlineResult(town, job));
      speech++;
    }
    advanceTown(town, 1440);
    if (elapsedDay % 30 === 0)
      process.stderr.write(`Simulated ${elapsedDay} days and ${speech} synthetic exchanges.\n`);
    if (!checkpoints.includes(elapsedDay)) continue;
    const exportStarted = performance.now();
    const raw = exportTown(town);
    const exportMs = performance.now() - exportStarted;
    const importStarted = performance.now();
    const restored = parseTownFile(raw);
    const importMs = performance.now() - importStarted;
    const issues = town.economy ? auditEconomy(town) : ["Funded economy was not activated."];
    if (!restored) issues.push("The exported synthetic town could not be imported.");
    if (money(town) !== openingTotal)
      issues.push("Total money changed without an explicit diagnostic issuance.");
    if (restored && money(restored) !== money(town)) issues.push("Import changed the total money.");
    if (town.agents.some((agent) => !walkable(agent.tile.x, agent.tile.y)))
      issues.push("A resident occupies an unwalkable tile.");
    const memoryRows = town.agents.map((agent) => ({
      id: agent.id,
      total: agent.memories.length,
      archive: agent.memories.filter((memory) => memory.id.startsWith("archive-")).length,
      protected: agent.memories.filter((memory) => memory.protected).length,
      rawChats: agent.memories.filter((memory) => memory.type === "chat" && !memory.protected)
        .length,
    }));
    console.log(
      JSON.stringify({
        elapsedDays: elapsedDay,
        gameDay: town.day,
        talksPerDay,
        syntheticExchanges: speech,
        elapsedSeconds: Math.round((performance.now() - started) / 100) / 10,
        exportBytes: Buffer.byteLength(raw),
        exportMs: Math.round(exportMs),
        importMs: Math.round(importMs),
        openingTotal,
        currentTotal: money(town),
        roundTrip: Boolean(restored),
        ledgerTransactions: town.economy?.transactions.length ?? 0,
        commandReceipts: town.economy?.commandReceipts.length ?? 0,
        workReceipts: town.economy?.work?.receipts.length ?? 0,
        memories: memoryRows,
        replayFrames: town.scrub.length,
        heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        issues,
      }),
    );
    if (issues.length) process.exitCode = 1;
  }
} finally {
  await server.close();
}
