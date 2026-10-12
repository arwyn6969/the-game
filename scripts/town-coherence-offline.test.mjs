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
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { characterProfile } = await server.ssrLoadModule("/src/game/characters.ts");
const { mentionsSeed } = await server.ssrLoadModule("/src/game/text.ts");

const roster = ["kevin", "arwyn", "northern", "baba", "sub", "data", "amelia"];
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const townWithArrivals = () => {
  const town = createTown("Ada");
  // Also exercises the offline module independently of the save/arrival migration.
  for (const id of ["data", "amelia"]) {
    if (person(town, id)) continue;
    const arrival = structuredClone(person(town, "arwyn"));
    Object.assign(arrival, {
      id,
      name: id === "data" ? "Data" : "Amelia",
      role: characterProfile(id).publicRole,
      identity: characterProfile(id).publicInfo,
      selfSentence: characterProfile(id).reflection,
      memories: [],
      threads: [],
      projects: [],
    });
    town.agents.push(arrival);
  }
  return town;
};
const ask = (town, agentId, text) =>
  offlineResult(town, {
    kind: "player",
    agentId,
    text,
    day: town.day,
    minute: town.minute,
  });
const remember = (town, id, question, answer) => {
  person(town, id).memories.push({
    id: `paired-${town.nextId++}`,
    day: town.day,
    minute: town.minute,
    type: "chat",
    with: "player",
    importance: 7,
    keywords: [],
    text: `Ada asked: ${question} ${id} answered: ${answer}`,
    source: "statement",
    turns: [
      { speaker: "player", text: question },
      { speaker: id, text: answer },
    ],
  });
};

test("all seven residents answer education and energy through distinct, bounded perspectives", () => {
  const town = townWithArrivals();
  for (const question of ["How could we improve education?", "How would solar energy work here?"]) {
    const replies = roster.map((id) => ask(town, id, question));
    assert.equal(new Set(replies.map((reply) => reply.reply)).size, roster.length);
    for (const result of replies) {
      assert.ok(result.reply.length < 500, `${result.agentId}: ${result.reply}`);
      assert.doesNotMatch(
        result.reply,
        /open thread|switch a mind|what I retrieved|man under the apron|Accept to take it/i,
      );
      assert.equal(result.delta, 0);
      for (const field of ["favor", "project", "thread", "notice"])
        assert.equal(result[field], null);
    }
  }
  assert.match(ask(town, "data", "How can we improve energy?").reply, /no local measurements/i);
  assert.match(ask(town, "amelia", "How can we improve energy?").reply, /costs|prices/i);
  assert.match(ask(town, "northern", "How can we improve education?").reply, /work|free time/i);
});

test("a short follow-up uses this resident's latest exchange and permits a new subject", () => {
  const town = townWithArrivals();
  const initial = ask(town, "data", "How would solar energy work here?");
  remember(town, "data", initial.playerText, initial.reply);
  const next = ask(town, "data", "Why?");
  assert.match(next.reply, /demand|production|storage/i);
  assert.notEqual(next.reply, initial.reply);
  remember(town, "data", "Why?", next.reply);
  assert.match(ask(town, "data", "Tell me more").reply, /demand|production|storage/i);
  const changed = ask(town, "data", "What about education?");
  assert.match(changed.reply, /learning|learner|lesson/i);
  assert.doesNotMatch(changed.reply, /storage|generation/i);
  remember(town, "data", "Do you know who won the match?", "I do not know.");
  assert.match(ask(town, "data", "Why?").reply, /which part/i);
});

test("legacy paired exchanges support a follow-up without exposing raw memory prose", () => {
  const town = createTown("Ada");
  const initial = ask(town, "arwyn", "What might improve education?");
  applyResult(town, initial);
  const next = ask(town, "arwyn", "Tell me more.");
  assert.match(next.reply, /learner|source|evidence/i);
  assert.doesNotMatch(next.reply, /said:|answered:|open thread|I keep turning/i);
  town.minute += 181;
  assert.match(ask(town, "arwyn", "Why?").reply, /which part/i);
});

test("another conversation does not provide the subject or facts for a follow-up", () => {
  const town = townWithArrivals();
  remember(town, "data", "How should energy work?", "We need demand measurements.");
  assert.match(ask(town, "amelia", "Why?").reply, /which part/i);
  const memory = person(town, "data").memories.at(-1);
  memory.with = "baba";
  assert.match(ask(town, "data", "Why?").reply, /which part/i);
});

test("ordinary greetings and generic NPC talk do not recycle private records or player statements", () => {
  const town = townWithArrivals();
  for (const id of roster) {
    person(town, id).memories.push({
      id: `secret-${id}`,
      day: 1,
      minute: town.minute,
      type: "chat",
      with: "player",
      text: "CONFIDENTIAL_SENTINEL Kevin does not know who he is, the man under the apron.",
      importance: 10,
      keywords: ["hello"],
      seed: true,
      protected: true,
    });
    const reply = ask(town, id, "Hello.").reply;
    assert.equal(mentionsSeed(reply), false, id);
    assert.doesNotMatch(reply, /CONFIDENTIAL_SENTINEL|open thread|switch a mind/i);
  }
  const exchange = offlineResult(town, {
    kind: "talk",
    a: "baba",
    b: "data",
    day: 1,
    minute: town.minute,
  });
  for (const line of exchange.lines) {
    assert.equal(mentionsSeed(line.text), false);
    assert.doesNotMatch(line.text, /CONFIDENTIAL_SENTINEL|Last time with|open thread/i);
  }
  assert.doesNotMatch(ask(town, "arwyn", "Who is Kevin?").reply, /man under|does not know who/i);
});

test("newcomers keep their specialties in weekly reflections and only the requested dawn batch changes", () => {
  const town = townWithArrivals();
  const planned = offlineResult(town, {
    kind: "plan",
    day: town.day,
    minute: town.minute,
    weekly: true,
    agents: ["data", "amelia"],
  });
  assert.deepEqual(
    planned.plans.map((plan) => plan.id),
    ["data", "amelia"],
  );
  assert.match(planned.plans[0].selfSentence, /hypothesis|explanation/i);
  assert.match(planned.plans[1].selfSentence, /pays|benefits|resources/i);
  for (const plan of planned.plans)
    assert.doesNotMatch(plan.selfSentence, /writer|confession|sanding/i);
  const reflected = offlineResult(town, {
    kind: "reflect",
    day: town.day,
    minute: town.minute,
    weekly: true,
    agents: ["data", "amelia"],
  });
  for (const agent of reflected.agents) {
    assert.doesNotMatch(agent.reflections.join(" "), /open thread|returning to|writer/i);
  }
});

test("unsupported live facts and unrelated questions produce honest limits, not imagined findings", () => {
  const town = townWithArrivals();
  assert.match(
    ask(town, "data", "What are today's solar energy prices?").reply,
    /do not have a current external source/i,
  );
  assert.match(
    ask(town, "amelia", "What are the latest energy statistics?").reply,
    /do not have a current external source/i,
  );
  const unknown = ask(town, "baba", "Who won yesterday's chess tournament?");
  assert.match(unknown.reply, /do not have a clear answer/i);
  assert.doesNotMatch(unknown.reply, /won|Kevin|private/i);
  assert.match(ask(town, "kevin", "How does education work?").reply, /lesson|teach/i);
  assert.doesNotMatch(
    ask(town, "kevin", "What are the origins of solar energy?").reply,
    /man under|who I am/i,
  );
});

test("public town questions use supported facts without inventing an action", () => {
  const town = townWithArrivals();
  assert.match(ask(town, "amelia", "Where is the library?").reply, /east of the plaza/i);
  assert.match(ask(town, "data", "What time is it?").reply, /07:00.*day 1/i);
  assert.match(ask(town, "kevin", "What is your job?").reply, /run Hobbs/i);
  assert.match(ask(town, "kevin", "Can I work at the cafe?").reply, /16:00–19:00/i);
  assert.match(ask(town, "baba", "Do you sell bread?").reply, /2 on a tab/i);
  assert.equal(town.favors.length, 0);
  assert.equal(person(town, "player").projects.length, 0);
});
