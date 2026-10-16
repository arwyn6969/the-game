import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { makeMemory, pushMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { sharedMemories } = await server.ssrLoadModule("/src/game/conversation.ts");
const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { initializeEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const {
  initialiseFundedWork,
  approvePayrollAgreement,
  cafeAgreementTerms,
  createFundedCafeAgreement,
  recordCafeAttendance,
  suspendWorkAgreement,
  CAFE_CANCELLATION,
} = await server.ssrLoadModule("/src/game/funded-work.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { libraryActions, applyLibraryAction } = await server.ssrLoadModule("/src/game/community.ts");
const { applyResult, playerActions, applyPlayerAction } =
  await server.ssrLoadModule("/src/game/effects.ts");
const { recentCafePaymentGreeting, everydayReply } = await server.ssrLoadModule(
  "/src/game/local-dialogue.ts",
);
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const ask = (town, id, text) =>
  offlineResult(town, { kind: "player", agentId: id, text, day: town.day, minute: town.minute });
const addChat = (town, agent, withId, index, text, importance = 6) => {
  const memory = makeMemory(town, 1, 420 + index, "chat", text, importance, {
    with: withId,
    source: "statement",
    turns: [{ speaker: withId, text }],
  });
  pushMemory(agent, memory);
  return memory;
};

test("both new specialists receive their actual player relationship before roster entries", () => {
  const town = createTown("Mira");
  for (const id of ["data", "amelia"]) {
    person(town, id).relationships.player = {
      score: 3,
      note: "Mira checked the reference carefully.",
    };
    const prompt = buildPrompt(town, {
      kind: "player",
      agentId: id,
      text: "Do you trust me?",
      day: 1,
      minute: 420,
    });
    const packet = JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]);
    assert.deepEqual(packet.relationships[0], {
      id: "player",
      score: 3,
      note: "Mira checked the reference carefully.",
    });
  }
});

test("archiving the oldest eight chats keeps the eighth fact, speaker, date and statement source", () => {
  const town = createTown("Mira");
  const agent = person(town, "arwyn");
  const originals = [];
  for (let index = 1; index <= 41; index++) {
    const text = `Report ${index}. ${"Details checked against the public card. ".repeat(7)}Final fact ${index}: the correct box is Cedar.`;
    originals.push(addChat(town, agent, "player", index, text, index === 8 ? 9 : 6));
  }
  for (const original of originals.slice(0, 8)) {
    const archived = agent.memories.find((memory) => memory.id === `archive-chat-${original.id}`);
    assert.ok(archived);
    assert.equal(archived.text, original.text);
    assert.equal(archived.with, "player");
    assert.equal(archived.type, "chat");
    assert.equal(archived.source, "statement");
    assert.equal(archived.day, original.day);
    assert.equal(archived.minute, original.minute);
    assert.deepEqual(archived.turns, original.turns);
  }
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored);
  assert.ok(
    person(restored, "arwyn").memories.some((memory) => memory.text.includes("Final fact 8:")),
  );
});

test("routine archives are bounded while salient facts and protected receipts remain", () => {
  const town = createTown("Mira");
  const agent = person(town, "kevin");
  const seed = agent.memories.find((memory) => memory.seed);
  const receipt = makeMemory(town, 1, 421, "favor", "A protected earned wage receipt.", 7, {
    protected: true,
    source: "event",
  });
  pushMemory(agent, receipt);
  const important = addChat(
    town,
    agent,
    "player",
    1,
    "The eighth checked public record belongs in Cedar, not Birch.",
    9,
  );
  for (let index = 2; index <= 360; index++) {
    addChat(town, agent, "player", index, `Routine conversation ${index}.`, 4);
    pushMemory(
      agent,
      makeMemory(town, 1, 420 + index, "observe", `Routine observation ${index}.`, 4),
    );
    pushMemory(agent, makeMemory(town, 1, 420 + index, "plan", `Planned intention ${index}.`, 4));
  }
  const chatArchives = agent.memories.filter((memory) => memory.id.startsWith("archive-chat-"));
  assert.ok(chatArchives.length <= 8);
  assert.ok(
    agent.memories.filter((memory) => memory.id.startsWith("archive-observe-")).length <= 16,
  );
  assert.ok(agent.memories.filter((memory) => memory.id.startsWith("archive-plan-")).length <= 8);
  assert.ok(agent.memories.includes(seed));
  assert.ok(agent.memories.includes(receipt));
  assert.ok(
    agent.memories.some(
      (memory) => memory.text === important.text && memory.source === "statement",
    ),
  );
});

test("archived shared statements stay available to their pair without third-party disclosure", () => {
  const town = createTown("Mira");
  const arwyn = person(town, "arwyn"),
    baba = person(town, "baba");
  const shared = "The brass reference card identifies Cedar; this is our recorded discussion.";
  addChat(town, arwyn, "baba", 1, shared, 9);
  addChat(town, baba, "arwyn", 1, shared, 9);
  addChat(town, arwyn, "kevin", 2, "PRIVATE_THIRD_PARTY_SENTINEL", 10);
  for (let index = 3; index <= 100; index++) {
    addChat(town, arwyn, "player", index, `Unrelated Arwyn exchange ${index}.`, 4);
    addChat(town, baba, "player", index, `Unrelated Baba exchange ${index}.`, 4);
  }
  assert.ok(sharedMemories(arwyn, baba).some((memory) => memory.text === shared));
  const prompt = buildPrompt(town, { kind: "talk", a: "arwyn", b: "baba", day: 1, minute: 520 });
  assert.match(prompt, /brass reference card/);
  assert.doesNotMatch(prompt, /PRIVATE_THIRD_PARTY_SENTINEL|Unrelated Arwyn|Unrelated Baba/);
  const other = buildPrompt(town, { kind: "talk", a: "arwyn", b: "sub", day: 1, minute: 520 });
  assert.doesNotMatch(other, /brass reference card|PRIVATE_THIRD_PARTY_SENTINEL/);
});

test("archiving cannot replace the latest follow-up subject with an older exchange in the same minute", () => {
  const town = createTown("Mira");
  const data = person(town, "data");
  for (let index = 0; index < 40; index++)
    addChat(town, data, "player", 0, `How should we improve education? Reading example ${index}.`);
  addChat(town, data, "player", 0, "How should we compare energy demand and solar generation?");
  const reply = ask(town, "data", "Why?");
  assert.match(reply.reply, /demand|production|storage/);
  assert.doesNotMatch(reply.reply, /learner|lesson/);
});

test("authored everyday paraphrases answer current activity without invented completion or affection", () => {
  const town = createTown("Mira");
  const before = structuredClone({
    tills: town.tills,
    favors: town.favors,
    people: town.agents.map(({ money, projects, relationships }) => ({
      money,
      projects,
      relationships,
    })),
  });
  for (const id of ["kevin", "arwyn", "northern", "baba", "sub", "data", "amelia"]) {
    for (const text of [
      "What are you up to?",
      "How's your day going?",
      "Any plans for today?",
      "What have you got on today?",
    ]) {
      const result = ask(town, id, text);
      assert.match(result.reply, /Right now I am/);
      assert.doesNotMatch(
        result.reply,
        /do not have a clear answer|completed|private|man under the apron/,
      );
      assert.equal(result.delta, 0);
      assert.equal(result.favor, null);
      assert.equal(result.project, null);
    }
    assert.match(ask(town, id, "Any plans for tomorrow?").reply, /not settled yet/);
    assert.match(
      ask(town, id, "What did you do yesterday?").reply,
      /do not have a completed-activity record/,
    );
    assert.match(ask(town, id, "What's the time?").reply, /07:00 on day 1/);
    assert.doesNotMatch(
      ask(town, id, "Tell me a bit about yourself.").reply,
      /do not have a clear answer/,
    );
  }
  assert.deepEqual(
    {
      tills: town.tills,
      favors: town.favors,
      people: town.agents.map(({ money, projects, relationships }) => ({
        money,
        projects,
        relationships,
      })),
    },
    before,
  );
});

test("bread purchase paraphrases explain an offer and do not pretend to consume a loaf", () => {
  const town = createTown("Mira");
  for (const text of ["Can I buy a loaf?", "Could I get a loaf?", "I'd like some bread."]) {
    const result = ask(town, "baba", text);
    assert.match(result.reply, /Bread is 2 on a tab/);
    assert.doesNotMatch(result.reply, /not carrying|you eat/);
    assert.equal(result.favor, null);
    assert.equal(result.project, null);
  }
  assert.equal(town.favors.length, 0);
  assert.equal(person(town, "player").projects.length, 0);
});

test("help paraphrases preserve who is offering and who is asking without inventing a task", () => {
  const town = createTown("Mira");
  for (const text of ["Could you lend me a hand?", "I could use a hand.", "Could I get some help?"])
    assert.match(ask(town, "baba", text).reply, /What do you need help with/);
  for (const text of [
    "Can I lend you a hand?",
    "Would you like a hand?",
    "Can I do anything useful?",
  ])
    assert.match(ask(town, "baba", text).reply, /Thanks for offering to help/);
  assert.equal(town.favors.length, 0);
  assert.equal(person(town, "player").projects.length, 0);
});

test("personal balance paraphrases report cash rather than promise an earning or private balance", () => {
  const town = createTown("Mira");
  for (const text of ["How much money do I have?", "What's my balance?", "Check my purse."])
    assert.match(
      ask(town, "amelia", text).reply,
      /Your purse shows 4 coins.*unpaid wage or a promise is separate/,
    );
  assert.equal(person(town, "player").money, 4);
});

test("library acknowledgments use the resident's actual participation or learned public event", () => {
  const town = createTown("Mira");
  person(town, "data").tile = { ...ANCHORS.library };
  const offer = libraryActions(town).find((action) =>
    action.label.startsWith("Accept source check"),
  );
  assert.ok(offer);
  const result = applyLibraryAction(town, offer.id);
  assert.equal(result.ok, true, result.reply);
  assert.match(
    ask(town, "kevin", "What happened with the library project?").reply,
    /Mira accepted the source check/,
  );
  assert.match(ask(town, "kevin", "Hello.").reply, /Mira accepted the source check/);
  assert.match(
    ask(town, "data", "What happened with the library project?").reply,
    /not learned what happened/,
  );
  assert.doesNotMatch(ask(town, "data", "Hello.").reply, /Mira accepted|committed 4/);
  const prompt = buildPrompt(town, {
    kind: "player",
    agentId: "data",
    text: "What happened with the index?",
    day: town.day,
    minute: town.minute,
  });
  assert.doesNotMatch(prompt, /Mira accepted the source check/);
});

const command = (kind, actor, terms, suffix) => ({
  id: `quality:${suffix}`,
  kind,
  actor,
  authority: "simulation",
  terms,
});
const fundedCafe = (fullPurse = false) => {
  const town = createTown("Mira");
  if (fullPurse) person(town, "player").money = 999;
  initializeEconomy(town);
  initialiseFundedWork(town);
  const approval = {
    id: "quality:approval",
    kind: "cafe-replacement",
    worker: "player",
    payer: "till:cafe",
    issuer: "kevin",
    claimId: null,
    confirmedMinutes: 0,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: 3, minute: 1439 },
    cancellation: CAFE_CANCELLATION,
  };
  assert.equal(
    approvePayrollAgreement(
      town,
      command("approve-payroll-agreement", "kevin", approval, "approve"),
      approval,
    ).ok,
    true,
  );
  const id = "quality:cafe";
  assert.equal(
    createFundedCafeAgreement(
      town,
      command(
        "accept-funded-cafe-shift",
        "player",
        cafeAgreementTerms(id, "player", approval.id),
        "accept",
      ),
      id,
      "player",
      approval.id,
    ).ok,
    true,
  );
  person(town, "player").tile = { ...ANCHORS.cafe };
  for (let hour = 16; hour < 19; hour++)
    person(town, "player").plan.beats[hour] = {
      hour,
      place: "cafe",
      spot: "out",
      status: "attending the cafe shift",
    };
  return { town, id };
};
const attend = (town, id, from, minutes) => {
  for (let index = 0; index < minutes; index++) {
    town.minute = from + index;
    const terms = { agreementId: id, day: town.day, minute: town.minute };
    assert.equal(
      recordCafeAttendance(
        town,
        command("record-cafe-attendance", "player", terms, `minute:${town.day}:${town.minute}`),
        id,
      ).ok,
      true,
    );
  }
};

test("authored funded work answers retain reserved progress after a day change and pause", () => {
  const { town, id } = fundedCafe();
  attend(town, id, 960, 90);
  assert.equal(
    suspendWorkAgreement(town, command("suspend-work", "player", { agreementId: id }, "pause"), id)
      .ok,
    true,
  );
  town.day = 2;
  town.minute = 420;
  const shift = ask(town, "kevin", "Can I work here?");
  assert.match(shift.reply, /paused.*90 eligible cafe minutes.*180/);
  assert.match(shift.reply, /survive midnight/);
  const wages = ask(town, "kevin", "Have I been paid today?");
  assert.match(wages.reply, /no Hobbs Cafe wage receipt for day 2/);
  assert.match(wages.reply, /90 worked minutes.*180/);
  assert.doesNotMatch(wages.reply, /Unpaid hours reset|paid you 5/);
});

test("work explanations use funded terms before books activate and leave previews read-only", () => {
  const town = createTown("Mira");
  const before = JSON.stringify(town);
  for (const question of ["Can I work here?", "How do I get a cafe shift?"]) {
    const reply = everydayReply(town, person(town, "kevin"), question);
    assert.match(reply, /one funded cafe work unit.*5 coins reserved.*180 eligible minutes/);
    assert.match(reply, /survive midnight/);
    assert.doesNotMatch(reply, /reset at midnight|until cancelled|if the till can pay/);
  }
  assert.equal(JSON.stringify(town), before);
  assert.equal(town.economy, undefined);
});

test("grocery work stays attributed to Baba and cannot become cafe progress in Kevin's answer", () => {
  const town = createTown("Mira");
  const player = person(town, "player");
  player.shiftHours = 1.5;
  player.projects.push({
    id: "preserved-grocery-work",
    owner: "player",
    kind: "shift",
    status: "open",
    place: "grocery",
    text: "A preserved grocery shift.",
    day: 1,
  });
  for (const beat of player.plan.beats)
    if (beat.hour >= 16 && beat.hour < 19)
      Object.assign(beat, { place: "grocery", spot: "out", status: "recorded grocery hours" });
  player.tile = { ...person(town, "baba").tile };
  const recognition = playerActions(town, "baba").find((action) =>
    /^Recognise grocery work/.test(action.label),
  );
  assert.ok(recognition);
  assert.equal(applyPlayerAction(town, "baba", recognition.id).ok, true);
  const before = JSON.stringify(town);
  const baba = everydayReply(town, person(town, "baba"), "What about my shift?");
  assert.match(baba, /grocery shift is paused.*90 eligible grocery minutes.*180.*fee is 4/);
  assert.match(baba, /Use Resume grocery shift/);
  assert.doesNotMatch(baba, /Ask Kevin|eligible cafe minutes/);
  const kevin = everydayReply(town, person(town, "kevin"), "What about my shift?");
  assert.doesNotMatch(kevin, /Your cafe shift is (?:open|paused)|90 eligible cafe minutes/);
  assert.match(kevin, /another funded workplace agreement open/);
  assert.equal(JSON.stringify(town), before);
});

test("authored wage answers distinguish completed work from delayed payment", () => {
  const { town, id } = fundedCafe(true);
  attend(town, id, 960, 180);
  const before = structuredClone({
    money: person(town, "player").money,
    tills: town.tills,
    work: town.economy.work,
  });
  const reply = ask(town, "kevin", "Where are my wages?");
  assert.match(reply.reply, /5 is earned and still payable.*reservation remains/);
  assert.match(reply.reply, /purse cannot receive/);
  assert.doesNotMatch(reply.reply, /paid you 5/);
  assert.deepEqual(
    { money: person(town, "player").money, tills: town.tills, work: town.economy.work },
    before,
  );
});

test("a wage greeting can read an actual settled transfer without a legacy prose receipt", () => {
  const { town, id } = fundedCafe();
  attend(town, id, 960, 180);
  assert.equal(
    person(town, "player").memories.some(
      (memory) => memory.type === "favor" && /paid me 5/.test(memory.text),
    ),
    false,
  );
  assert.match(recentCafePaymentGreeting(town), /paid you 5 on day 1 at 18:59/);
});

test("Northern's authored discussion cannot create a shift or promise unreserved wages", () => {
  const town = createTown("Mira");
  initializeEconomy(town);
  initialiseFundedWork(town);
  const before = structuredClone({
    money: town.agents.map((agent) => agent.money),
    tills: town.tills,
    plan: person(town, "northern").plan,
  });
  const result = offlineResult(town, {
    kind: "talk",
    a: "kevin",
    b: "northern",
    day: town.day,
    minute: town.minute,
  });
  assert.equal(result.project, null);
  assert.deepEqual(result.replan, []);
  assert.match(
    result.lines.map((line) => line.text).join(" "),
    /needs a funded agreement first.*have not taken a shift/,
  );
  applyResult(town, result);
  assert.equal(
    person(town, "northern").projects.filter((project) => project.kind === "shift").length,
    0,
  );
  assert.deepEqual(
    {
      money: town.agents.map((agent) => agent.money),
      tills: town.tills,
      plan: person(town, "northern").plan,
    },
    before,
  );
});
