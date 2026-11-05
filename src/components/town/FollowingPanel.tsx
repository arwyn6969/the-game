import { useState } from "react";
import type { AgentId, NpcId, Town } from "@/game/types";
import { currentFollow } from "@/game/following";
import { followConflict, observableCompanion } from "@/game/following-runtime";
import { formatClock } from "@/game/text";

export function CompanionChoice({
  town,
  target,
  disabled,
  onStart,
}: {
  town: Town;
  target: AgentId;
  disabled: boolean;
  onStart: (target: NpcId, duration: number, listen: boolean) => void;
}) {
  const [duration, setDuration] = useState(60);
  const [listen, setListen] = useState(true);
  if (target === "player") return null;
  const reason = !observableCompanion(town, target)
    ? "Walk within six tiles in a public area or the library to start."
    : followConflict(town, target);
  return (
    <section className="companion-choice" aria-label="Spend time together">
      <h3>Spend time with</h3>
      <p className="character-note">
        Your resident walks at ordinary speed. Runs while this local game is open and active.
      </p>
      <label>
        Time together{" "}
        <select
          aria-label="Time together"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        >
          {[30, 60, 120].map((n) => (
            <option value={n} key={n}>
              {n} game minutes
            </option>
          ))}
        </select>
      </label>
      <label className="companion-listen">
        <input type="checkbox" checked={listen} onChange={(e) => setListen(e.target.checked)} />{" "}
        Listen to public discussions they join
      </label>
      <p className="character-note">
        Specific discussions still need your invitation and presence. Movement keys, touch or a
        destination take control immediately.
      </p>
      {reason && <p className="character-note">{reason}</p>}
      <button
        className="btn"
        type="button"
        disabled={disabled || Boolean(reason)}
        onClick={() => onStart(target, duration, listen)}
      >
        Spend time with {town.agents.find((a) => a.id === target)?.name}
      </button>
    </section>
  );
}
const date = (at: number) => `Day ${Math.floor(at / 1440) + 1} · ${formatClock(at % 1440)}`;
export function FollowingPanel({
  town,
  disabled,
  note,
  onResume,
  onStop,
}: {
  town: Town;
  disabled: boolean;
  note: string;
  onResume: () => void;
  onStop: () => void;
}) {
  const s = currentFollow(town.following);
  if (!s && !note) return null;
  const name = town.agents.find((a) => a.id === s?.target)?.name;
  const label =
    s?.state === "paused"
      ? `Paused — ${name}`
      : s?.state === "ended"
        ? `Time with ${name} ended`
        : s?.state === "listening"
          ? "Listening at the library"
          : s?.state === "waiting"
            ? `Waiting near ${name}`
            : `Walking with ${name}`;
  return (
    <section className="following-panel" aria-label="Companion session">
      {s && (
        <>
          <div className="following-controls">
            <strong role="status">{label}</strong>
            {s.state !== "ended" && (
              <button className="btn" type="button" onClick={onStop}>
                Stop spending time
              </button>
            )}
            {s.state === "paused" && (
              <button className="btn" type="button" disabled={disabled} onClick={onResume}>
                Resume spending time
              </button>
            )}
          </div>
          <p>{s.reason}</p>
          <p className="companion-note">
            {s.duration} game minutes · until {date(s.deadline)}. Watching a character only moves
            the camera.
          </p>
        </>
      )}
      {note && <p role="status">{note}</p>}
      {town.following && (
        <details className="following-journal">
          <summary>Companion journal ({town.following.sessions.length})</summary>
          <p>
            Up to eight completed sessions and one current session are kept, with 128 entries each.
            Export your town to keep an older journal.
          </p>
          {[...town.following.sessions].reverse().map((session) => (
            <article key={session.id}>
              <h3>
                {town.agents.find((a) => a.id === session.target)?.name} · {date(session.startedAt)}{" "}
                · {session.state}
              </h3>
              <p>{session.reason}</p>
              {!session.evidence.some((e) => e.kind === "speech") && (
                <p>No discussion words were received during this session.</p>
              )}
              {session.evidence.map((e) => (
                <blockquote key={`${e.recipient}:${e.eventId}`}>
                  <p>
                    {e.kind === "speech"
                      ? `${town.agents.find((a) => a.id === e.speaker)?.name ?? e.speaker} said: “${e.text}”`
                      : e.text}
                  </p>
                  <small>
                    {date(e.at)} · {e.place}
                  </small>
                  <details>
                    <summary>Source event</summary>
                    <small>{e.eventId}</small>
                  </details>
                </blockquote>
              ))}
              <p className="companion-note">
                Received speech is an attributed claim. Time nearby does not prove friendship or
                skill.
              </p>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
