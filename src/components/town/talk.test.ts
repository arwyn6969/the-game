import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityStatus, exchangeLanded, followingLatest, inTalkRange, interactiveControl, nextDraft, opensTalk, playerChatIds, spokenTurns } from "./talk.ts";

const sent = "Hello\nKevin, nice morning.";
const stored = `In the cafe at 07:00, Ada said: "${sent.replace(/\s+/g, " ")}" Kevin answered: "Morning."`;

describe("a reply that collapses whitespace still counts", () => {
  it("does not search the memory for the raw line", () => {
    assert.equal(stored.includes(sent.slice(0, 24)), false);
    const before = playerChatIds([]);
    const after = playerChatIds([{ id: "m-1", type: "chat", with: "player" }]);
    assert.equal(exchangeLanded(before, after), true);
    assert.equal(nextDraft(sent, sent.trim(), true, true), "");
  });

  it("stays a failure when no new chat was written", () => {
    const ids = ["m-old"];
    assert.equal(exchangeLanded(ids, ids), false);
    assert.equal(nextDraft(sent, sent.trim(), true, false), sent);
  });
});

describe("a delayed reply keeps a newer unsent draft", () => {
  it("clears only the line that was submitted, in the same conversation", () => {
    const newer = "A different message";
    assert.equal(nextDraft(newer, sent.trim(), true, true), newer);
    assert.equal(nextDraft(sent, sent.trim(), false, true), sent);
    assert.equal(nextDraft(sent, sent.trim(), true, true), "");
  });
});

describe("a far click is not a conversation", () => {
  it("uses the same two-tile reach as Enter", () => {
    assert.equal(inTalkRange(0, 0, 2, 0), true);
    assert.equal(inTalkRange(0, 0, 3, 0), false);
    assert.equal(activityStatus("plaza", "townhouses", "asleep in the last townhouse"), "on foot, not where that hour planned");
    assert.equal(activityStatus("cafe", "cafe", "behind the counter"), "behind the counter");
  });
});

describe("the newest reply stays readable", () => {
  it("splits the two speakers and only follows when the reader is at the bottom", () => {
    const turns = spokenTurns(stored);
    assert.deepEqual(turns, [
      { who: "Ada", line: sent.replace(/\s+/g, " ") },
      { who: "Kevin", line: "Morning." },
    ]);
    assert.equal(followingLatest(0, 904, 294), false);
    assert.equal(followingLatest(600, 904, 294), true);
    assert.equal(followingLatest(0, 200, 294), true);
  });
});
describe("Enter on a control does not open talk", () => {
  it("lets a focused button keep Enter", () => {
    const button = interactiveControl({ tagName: "BUTTON" });
    assert.equal(opensTalk("Enter", button, false), false);
    assert.equal(opensTalk("Enter", interactiveControl({ tagName: "CANVAS" }), false), true);
    assert.equal(opensTalk("Enter", interactiveControl({ tagName: "SPAN", closest: () => ({}) }), false), false);
    assert.equal(opensTalk("KeyE", interactiveControl(null), false), true);
    assert.equal(opensTalk("Enter", false, true), false);
  });
});
