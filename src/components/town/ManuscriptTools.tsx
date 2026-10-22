import { useState } from "react";
import type { NpcId, Town } from "@/game/types";
import { NPC_IDS } from "@/game/types";
import type { PhysicalActionResult, PhysicalDecision, PhysicalItem } from "@/game/physical-types";
import { heldItem, nearbyPhysicalItems } from "@/game/physical-items";
import { placeTitle, zoneAt } from "@/game/world";

export type ManuscriptControls = {
  available: boolean;
  busy: boolean;
  replaying: boolean;
  selected: string | null;
  note: string;
  readContent: PhysicalActionResult["content"] | null;
  onIntroduce: () => void;
  onStart: (actor: NpcId) => void;
  onStop: () => void;
  onCommand: (decision: PhysicalDecision) => void;
};

/** One readable object, without turning the existing loaf into a new inventory format. */
export function ManuscriptTools({ town, controls }: { town: Town; controls: ManuscriptControls }) {
  const [actor, setActor] = useState<NpcId>("northern");
  const item = town.physicalItems?.items[0];
  const session = town.physicalItems?.session;
  const carried = heldItem(town, "player");
  const nearby = nearbyPhysicalItems(town, "player");
  const canReach = Boolean(
    item && (carried?.id === item.id || nearby.some((row: PhysicalItem) => row.id === item.id)),
  );
  const disabled = controls.busy || controls.replaying;
  const holderId = item?.location.kind === "held" ? item.location.holder : null;
  const holder = holderId
    ? (town.agents.find((person) => person.id === holderId)?.name ?? "a resident")
    : null;
  const name = town.agents.find((person) => person.id === actor)?.name ?? actor;
  const player = town.agents.find((person) => person.id === "player")!;
  const canPickUp =
    item?.location.kind === "ground" &&
    Math.abs(player.tile.x - item.location.tile.x) +
      Math.abs(player.tile.y - item.location.tile.y) <=
      1;
  const parked = Boolean(session?.enabled && session.waiting && !session.intent && !controls.busy);
  return (
    <section className="manuscript-tools" aria-labelledby="manuscript-title">
      <h3 id="manuscript-title">The shared manuscript</h3>
      <p
        className="tool-action-note"
        role="status"
        aria-live="polite"
        data-tool-feedback
        tabIndex={-1}
      >
        {controls.note}
      </p>
      {!item ? (
        <>
          <p>
            Introduce one blank manuscript on the library floor. A resident can write something of
            their own.
          </p>
          <button className="btn" type="button" disabled={disabled} onClick={controls.onIntroduce}>
            Introduce manuscript
          </button>
        </>
      ) : (
        <>
          <p>
            <strong>{item.title}</strong> ·{" "}
            {holder
              ? `Carried by ${holder}`
              : item.location.kind === "ground"
                ? `${placeTitle(zoneAt(item.location.tile.x, item.location.tile.y))} floor`
                : ""}
          </p>
          {canReach ? (
            <details
              key={`${item.id}:${controls.selected === item.id}`}
              open={controls.selected === item.id || undefined}
            >
              <summary>Inspect manuscript</summary>
              <p>
                {controls.readContent?.revision === item.contentRevision
                  ? controls.readContent.text ||
                    "The pages are blank. Nobody has written in it yet."
                  : "Hold the manuscript and choose Read to inspect its pages."}
              </p>
              {item.author && (
                <p className="text-muted">
                  Written by{" "}
                  {town.agents.find((person) => person.id === item.author)?.name ?? item.author} ·
                  revision {item.contentRevision}
                </p>
              )}
              <div className="manuscript-buttons">
                {carried?.id !== item.id && item.location.kind === "ground" && (
                  <button
                    className="btn"
                    type="button"
                    disabled={disabled || !canPickUp}
                    onClick={() =>
                      controls.onCommand({
                        kind: "pick-up",
                        itemId: item.id,
                        itemRevision: item.revision,
                      })
                    }
                  >
                    Pick up manuscript
                  </button>
                )}
                {carried?.id === item.id && (
                  <button
                    className="btn"
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      controls.onCommand({
                        kind: "put-down",
                        itemId: item.id,
                        itemRevision: item.revision,
                      })
                    }
                  >
                    Put down manuscript
                  </button>
                )}
                <button
                  className="btn"
                  type="button"
                  disabled={disabled || carried?.id !== item.id}
                  onClick={() =>
                    controls.onCommand({
                      kind: "read",
                      itemId: item.id,
                      itemRevision: item.revision,
                    })
                  }
                >
                  Read manuscript
                </button>
              </div>
            </details>
          ) : (
            <p className="text-muted">Walk beside it to inspect the pages.</p>
          )}
          <div className="manuscript-trial">
            <label>
              Invite a resident to try{" "}
              <select
                value={actor}
                disabled={disabled || Boolean(session?.enabled && !parked)}
                onChange={(event) => setActor(event.target.value as NpcId)}
              >
                {NPC_IDS.map((id) => (
                  <option key={id} value={id}>
                    {town.agents.find((person) => person.id === id)?.name ?? id}
                  </option>
                ))}
              </select>
            </label>
            <p>
              They choose what to write and how to use the manuscript. Starting runs town time at
              1×, for up to eight decisions. You can watch or walk away.
            </p>
            {session?.enabled && !parked ? (
              <button
                className="btn"
                type="button"
                disabled={controls.replaying}
                onClick={controls.onStop}
              >
                Stop resident trial
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                disabled={disabled || !controls.available}
                onClick={() => controls.onStart(actor)}
              >
                {session ? "Start another bounded trial" : `Watch ${name} try`}
              </button>
            )}
            {!controls.available && (
              <p role="status">AI actions are unavailable. The manuscript stays as it is.</p>
            )}
            {session?.lastResult && <p>{session.lastResult.message}</p>}
          </div>
          {session && (
            <details className="manuscript-diagnostics">
              <summary>Prototype details</summary>
              <p>
                {session.decisions} of {session.maxDecisions} decisions ·{" "}
                {session.enabled ? (session.waiting ? "Waiting" : "Active") : "Stopped"}
              </p>
              <p>
                {session.usage.requests} requests · {session.usage.providerAttempts} known provider
                attempts · {session.usage.attemptsUnknown} unknown attempt counts
              </p>
              <p>
                {session.usage.knownTokens} known tokens across {session.usage.tokenSamples} samples
                · {session.usage.tokensUnknown} unknown token samples
              </p>
              <p>
                {Math.round(session.usage.elapsedMs)} ms waiting for requests ·{" "}
                {session.usage.failures} failures
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
