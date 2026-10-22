import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseDiscussionDecision,
  parseDiscussionEnvelope,
  parseDiscussionResponse,
  validDiscussionJob,
} from "../src/lib/discussion-actions.ts";
import { validMindJson } from "../src/lib/mind-pool/transport.ts";
import { defaultConfig } from "../src/lib/mind-pool/config.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";

const job = {
  kind: "act",
  task: "discussion",
  agentId: "northern",
  meetingId: "discussion:1",
  sessionRevision: 3,
  actorRevision: 2,
  turnId: null,
  day: 1,
  minute: 420,
};

test("discussion decisions cannot grant authority to act or speak for another resident", () => {
  for (const decision of [
    { kind: "speak", text: "I would like to discuss a walk." },
    { kind: "accept" },
    { kind: "listen" },
    { kind: "pass" },
  ]) {
    assert.deepEqual(parseDiscussionDecision(decision), decision);
    for (const extra of [
      { actor: "player" },
      { meetingId: "another-meeting" },
      { recipientIds: ["sub"] },
      { money: 100 },
      { confirmed: true },
    ])
      assert.equal(parseDiscussionDecision({ ...decision, ...extra }), null);
  }
  for (const decision of [
    { kind: "invite", invitee: "baba" },
    { kind: "pay", amount: 1 },
    { kind: "agree-for-everyone" },
    { kind: "speak", text: " " },
    { kind: "speak", text: "x".repeat(401) },
    { kind: "speak", text: "Hidden\u0000command" },
    { kind: "pass", text: "I decline on their behalf." },
    [{ kind: "accept" }, { kind: "listen" }],
  ])
    assert.equal(parseDiscussionDecision(decision), null);
});

test("all self-only invitation, attention and participation choices have bounded exact syntax", () => {
  for (const kind of [
    "read-invitation",
    "ignore",
    "accept",
    "decline",
    "listen",
    "participate",
    "stop-listening",
    "request-turn",
    "withdraw-turn",
    "pass",
    "leave",
    "close",
  ]) {
    const decision = { kind };
    assert.deepEqual(parseDiscussionDecision(decision), decision);
    assert.deepEqual(parseDiscussionEnvelope({ task: "discussion", decision }), decision);
  }
});

test("transport keeps discussion and physical action envelopes distinct and compatible", () => {
  const discussion = { task: "discussion", decision: { kind: "listen" } };
  const physical = { decision: { kind: "read", itemId: "manuscript:1", itemRevision: 2 } };
  assert.equal(validMindJson("act", JSON.stringify(discussion)), true);
  assert.equal(validMindJson("act", JSON.stringify(physical)), true);
  assert.equal(validMindJson("act", '{"decision":{"kind":"wait"}}'), true);
  assert.equal(validMindJson("act", '{"decision":{"kind":"speak","text":"hello"}}'), true);
  for (const invalid of [
    { decision: { kind: "listen" } },
    { task: "physical", ...physical },
    { task: "discussion", ...physical },
    { ...discussion, actor: "player" },
    { ...discussion, sessionRevision: 3 },
    { task: "discussion", decision: { kind: "listen", target: "all" } },
    { task: "discussion", decision: { kind: "wait" } },
  ])
    assert.equal(validMindJson("act", JSON.stringify(invalid)), false);
  assert.equal(validMindJson("player", '{"reply":"Hello"}'), true);
  assert.equal(validMindJson("talk", '{"lines":[{"speaker":"sub","text":"Hello"}]}'), true);
});

test("discussion response cannot smuggle commands through prose, extra envelopes or multiple actions", () => {
  const response = '{"task":"discussion","decision":{"kind":"speak","text":"A suggestion."}}';
  assert.deepEqual(parseDiscussionResponse(response), { kind: "speak", text: "A suggestion." });
  assert.deepEqual(parseDiscussionResponse("```json\n" + response + "\n```"), {
    kind: "speak",
    text: "A suggestion.",
  });
  for (const text of [
    "I also paid everyone. " + response,
    response + " And they all agreed.",
    response + response,
    '{"task":"discussion","decision":{"kind":"accept"},"decisions":[{"kind":"listen"}]}',
    '{"task":"discussion","decision":[]}',
    "x".repeat(20_001),
  ])
    assert.equal(parseDiscussionResponse(text), null);
});

test("discussion request identity is bound to an NPC and exact engine context", () => {
  assert.equal(validDiscussionJob(job), true);
  assert.equal(validDiscussionJob({ ...job, turnId: "turn:1" }), true);
  for (const mutation of [
    { agentId: "player" },
    { task: "physical" },
    { kind: "player" },
    { meetingId: " " },
    { meetingId: "discussion\n1" },
    { meetingId: "x".repeat(97) },
    { sessionRevision: -1 },
    { actorRevision: 1.5 },
    { turnId: undefined },
    { turnId: "turn\t1" },
    { day: 0 },
    { minute: 1440 },
  ])
    assert.equal(validDiscussionJob({ ...job, ...mutation }), false);
});

test("discussion envelopes use the existing single-attempt act transport without a new route", async () => {
  for (const extraAuthority of [false, true]) {
    const config = defaultConfig();
    config.providers = config.providers.filter((provider) => provider.id === "groq");
    const provider = config.providers[0];
    provider.enabled = provider.freeTierConfirmed = true;
    provider.routes.act = { ...provider.routes.player, maxTokens: 16000 };
    config.maxAttempts = 3;
    const completions = [];
    let calls = 0;
    const result = await routeMind({
      kind: "act",
      config,
      env: { [provider.apiKeyEnv]: "synthetic-discussion-key-never-transmitted" },
      system: "One resident decision",
      user: "Only actual permitted context",
      store: {
        reserve: async () => ({ id: "synthetic-discussion-lease", jsonMode: true }),
        finish: async (_candidate, _lease, completion) => completions.push(completion),
      },
      fetcher: async (_url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        assert.ok(body.max_tokens <= 1200);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  task: "discussion",
                  decision: { kind: "listen" },
                  ...(extraAuthority ? { actor: "player" } : {}),
                }),
              },
              finish_reason: "stop",
            },
          ],
          usage: { total_tokens: 42 },
        });
      },
    });
    assert.equal(result.ok, !extraAuthority);
    assert.equal(calls, 1);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].actualTokens, 42);
  }
});
