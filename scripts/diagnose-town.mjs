// Offline diagnostics for the 11 October review. No network, keys, or player saves.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
try {
  const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
  const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
  const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
  const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
  const { exportTown, parseTownFile, saveTown } = await server.ssrLoadModule("/src/game/save.ts");
  const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
  const { makeMemory, pushMemory, retrieve } = await server.ssrLoadModule("/src/game/memory.ts");
  const { auditWorld } = await server.ssrLoadModule("/src/game/world.ts");
  const findings = {
    reviewedBaselineCommit: "ee5ff6575300bbe8a3ff6509ffb1bc2fcd1e85e3",
    mode: "deterministic offline observations of the current checkout; not a passing regression suite",
  };
  findings.worldAudit = auditWorld();

  const long = createTown("Ada");
  const longevity = [];
  for (let day = 1; day <= 30; day++) {
    if (day > 1) advanceTown(long, 1440);
    if ([1, 2, 5, 7, 14, 30].includes(day)) {
      const exported = exportTown(long);
      longevity.push({
        day: long.day,
        minute: long.minute,
        exportCharacters: exported.length,
        compactCharacters: JSON.stringify(long).length,
        importsOwnExport: parseTownFile(exported) !== null,
        memoryCount: long.agents.reduce((n, a) => n + a.memories.length, 0),
        northernMoney: long.agents.find((a) => a.id === "northern").money,
        northernWages: long.agents
          .find((a) => a.id === "northern")
          .memories.filter((m) => m.text.includes("paid me")).length,
      });
    }
  }
  findings.longevity = longevity;

  const debt = createTown("Ada");
  const debtor = debt.agents.find((a) => a.id === "player");
  const baba = debt.agents.find((a) => a.id === "baba");
  const say = (text) =>
    applyResult(
      debt,
      offlineResult(debt, {
        kind: "player",
        agentId: "baba",
        text,
        day: debt.day,
        minute: debt.minute,
      }),
    );
  say("Can I buy bread?");
  debtor.money = 20;
  say("I want to pay my tab of 2. Here is your money.");
  findings.offlineRepayment = {
    debt: debt.favors,
    playerMoney: debtor.money,
    babaMoney: baba.money,
  };

  const trust = createTown("Ada");
  for (let i = 0; i < 3; i++)
    applyResult(
      trust,
      offlineResult(trust, {
        kind: "player",
        agentId: "baba",
        text: "I hate you.",
        day: trust.day,
        minute: trust.minute,
      }),
    );
  findings.offlineHostileTrust = trust.agents.find((a) => a.id === "baba").relationships.player;

  const memory = createTown("Ada");
  const resident = memory.agents.find((a) => a.id === "baba");
  resident.memories = [];
  for (let i = 0; i < 5; i++)
    pushMemory(
      resident,
      makeMemory(memory, 1, 420, "observe", `The grocery ledger bread apples stock ${i}.`, 8),
    );
  pushMemory(
    resident,
    makeMemory(
      memory,
      1,
      420,
      "chat",
      "My missing emerald violin is hidden beside the fountain.",
      5,
    ),
  );
  const question = "Where is your missing emerald violin?";
  const prompt = buildPrompt(memory, {
    kind: "player",
    agentId: "baba",
    text: question,
    day: 1,
    minute: 420,
  });
  const packet = JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]);
  findings.retrieval = {
    queryAwareTop: retrieve(resident.memories, question, 420, 1)[0]?.memory.text,
    actualPromptMemories: packet.memories,
    hasRelevantMemory: packet.memories.some((m) => m.text.includes("violin")),
  };

  const cross = createTown("Ada");
  cross.favors.push({
    id: "foreign",
    from: "northern",
    to: "baba",
    amount: 2,
    status: "owed",
    text: "Bread",
    day: 1,
  });
  const balancesBefore = Object.fromEntries(cross.agents.map((a) => [a.id, a.money]));
  applyResult(cross, {
    kind: "player",
    mind: "grok",
    agentId: "kevin",
    playerText: "Pay",
    reply: "Paid.",
    delta: 0,
    note: "",
    favor: { action: "pay", id: "foreign", from: "player", to: "kevin", amount: 2, text: "Bread" },
  });
  findings.wrongDebtId = {
    favor: cross.favors[0],
    balancesBefore,
    balancesAfter: Object.fromEntries(cross.agents.map((a) => [a.id, a.money])),
  };

  const quota = createTown("Ada");
  const beforeQuota = quota.agents.reduce((n, a) => n + a.memories.length, 0);
  let attempts = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        attempts++;
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    },
  });
  const result = saveTown(quota);
  findings.failedSave = {
    attempts,
    result: String(result),
    memoryCountBefore: beforeQuota,
    memoryCountAfter: quota.agents.reduce((n, a) => n + a.memories.length, 0),
  };

  console.log(JSON.stringify(findings, null, 2));
} finally {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
  await server.close();
}
