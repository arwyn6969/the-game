import { useEffect, useRef, useState } from "react";
import { Eye, MessageCircle, Pin, X } from "lucide-react";
import type { Agent, AgentId, SocialEvent, Town } from "@/game/types";
import { characterProfile } from "@/game/characters";
import { paintPortrait } from "@/game/render";
import { publicReflections } from "@/game/social";
import { fundedWorkSummary } from "@/game/funded-work";
import { formatClock, mentionsSeed } from "@/game/text";
import { placeTitle, zoneAt } from "@/game/world";
import { inTalkRange } from "./talk";

const nameOf = (town: Town, id: AgentId) => town.agents.find((a) => a.id === id)?.name ?? id;
const dateOf = (event: { day: number; minute: number }) =>
  `Day ${event.day} · ${formatClock(event.minute)}`;

export function Portrait({ id }: { id: AgentId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) paintPortrait(ctx, id);
  }, [id]);
  return (
    <canvas className="resident-portrait" width={72} height={88} ref={ref} aria-hidden="true" />
  );
}

export function ResidentStrip({
  town,
  selected,
  pinned,
  onSelect,
  replay,
}: {
  town: Town;
  selected: AgentId | null;
  pinned: AgentId | null;
  onSelect: (id: AgentId) => void;
  replay: boolean;
}) {
  const stripRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pinned && stripRef.current) stripRef.current.scrollLeft = 0;
  }, [pinned]);
  const residents = [...town.agents].sort(
    (a, b) => Number(b.id === pinned) - Number(a.id === pinned),
  );
  return (
    <nav className="resident-strip" aria-label="Town residents" ref={stripRef}>
      {residents.map((agent) => (
        <button
          className="resident-chip"
          key={agent.id}
          type="button"
          aria-label={`View ${agent.name}${agent.id === "player" ? "'s journal" : "'s character card"}`}
          aria-pressed={selected === agent.id}
          disabled={replay}
          onClick={() => onSelect(agent.id)}
        >
          <Portrait id={agent.id} />
          <span>{agent.name}</span>
          {pinned === agent.id && <Pin size={12} aria-label="Pinned" />}
        </button>
      ))}
    </nav>
  );
}

export function Rapport({ score, known }: { score: number; known: boolean }) {
  const label = !known
    ? "No shared history yet"
    : score > 1
      ? "Warm"
      : score > 0
        ? "Warming"
        : score < -1
          ? "Strained"
          : score < 0
            ? "Cautious"
            : "Neutral";
  return (
    <div className="rapport">
      <svg
        className="rapport-dial"
        viewBox="0 0 120 76"
        role="img"
        aria-label={known ? `Rapport ${score}, on a scale from minus 3 to plus 3: ${label}` : label}
      >
        <path d="M10 66 A50 50 0 0 1 110 66" pathLength="70" strokeDasharray="8 2" />
        {known && (
          <path
            className="rapport-current"
            d="M10 66 A50 50 0 0 1 110 66"
            pathLength="70"
            strokeDasharray="8 62"
            strokeDashoffset={-(Math.max(-3, Math.min(3, score)) + 3) * 10}
          />
        )}
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function CharacterOverview({
  town,
  agent,
  watch,
  replay,
}: {
  town: Town;
  agent: Agent;
  watch: boolean;
  replay: boolean;
}) {
  const player = town.agents.find((a) => a.id === "player")!;
  const known =
    agent.id === "player" || agent.memories.some((m) => m.type === "chat" && m.with === "player");
  const nearby = inTalkRange(player.tile.x, player.tile.y, agent.tile.x, agent.tile.y);
  const profile = characterProfile(agent.id);
  return (
    <div className="character-overview">
      <p className="character-activity">
        {replay
          ? "Replay shows recorded positions. Current statistics are hidden."
          : watch || nearby || agent.id === "player"
            ? `${placeTitle(zoneAt(agent.tile.x, agent.tile.y))} · ${mentionsSeed(agent.status) ? "Keeping to their day" : agent.status}`
            : "Walk closer to see their current activity."}
      </p>
      <h3>Strengths</h3>
      <div className="expertise-tags">
        {profile.specialties.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      {agent.id !== "player" && !replay && (
        <section>
          <h3>How things stand with you</h3>
          <Rapport known={known} score={agent.relationships.player?.score ?? 0} />
        </section>
      )}
      <p className="character-note">
        Specialties describe their background. Skill levels have not been measured.
      </p>
    </div>
  );
}

export function CharacterStrengths({ id }: { id: AgentId }) {
  const profile = characterProfile(id);
  return (
    <section className="character-overview">
      <h3>Areas of expertise</h3>
      <div className="expertise-tags">
        {profile.specialties.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <p>{profile.publicInfo}</p>
      <h3>Known limits</h3>
      <ul>
        {profile.limitations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="character-note">Demonstrated skill ratings will need assessed tasks.</p>
    </section>
  );
}

export function CharacterProgress({
  town,
  agent,
  watch,
  replay,
}: {
  town: Town;
  agent: Agent;
  watch: boolean;
  replay: boolean;
}) {
  if (replay)
    return (
      <p className="character-note">Historical work statistics are not recorded in this replay.</p>
    );
  const person =
    agent.id === "player" || watch ? agent : town.agents.find((a) => a.id === "player")!;
  const projects = person.projects.filter((p) => !mentionsSeed(p.text));
  const funded = town.economy?.work ? fundedWorkSummary(town, person.id) : null;
  const favors = town.favors.filter(
    (f) =>
      (f.from === "player" || f.to === "player") &&
      (agent.id === "player" || f.from === agent.id || f.to === agent.id),
  );
  return (
    <section className="character-overview">
      <h3>{person.id === "player" ? "Your commitments" : "Recorded contributions"}</h3>
      {!projects.length && <p className="character-note">No contribution recorded.</p>}
      <ul className="contribution-list">
        {projects.map((p) => (
          <li key={p.id}>
            <span className="badge">{p.status}</span>
            {p.text}
          </li>
        ))}
      </ul>
      <h3>
        {funded ? "Funded work" : "Work today"} · {person.name}
      </h3>
      {funded ? (
        <>
          {!funded.agreements.length && (
            <p className="character-note">No funded agreement recorded.</p>
          )}
          <ul className="contribution-list">
            {funded.agreements
              .filter((agreement) => !mentionsSeed(agreement.task))
              .map((agreement) => (
                <li key={agreement.id}>
                  <span className="badge">{agreement.status}</span>
                  {agreement.task}
                  {agreement.kind === "cafe-shift" && (
                    <p>
                      {agreement.eligibleMinutes} of {agreement.requiredMinutes} eligible minutes.
                      Accrued progress carries across game days.
                    </p>
                  )}
                  <p>
                    {agreement.fee} agreed ·{" "}
                    {funded.holds.find((hold) => hold.id === agreement.holdId)?.remaining ?? 0}{" "}
                    still reserved
                  </p>
                </li>
              ))}
          </ul>
          <h3>Payment records</h3>
          {!funded.payables.length && (
            <p className="character-note">No earned payment recorded yet.</p>
          )}
          <ul className="contribution-list">
            {funded.payables.map((payable) => (
              <li key={payable.id}>
                {payable.amount}{" "}
                {payable.status === "settled" ? "paid" : "earned and still payable"}
                {payable.reason ? ` · ${payable.reason}` : ""}
              </li>
            ))}
          </ul>
          {funded.legacyClaims.some((claim) =>
            ["unresolved", "underfunded", "protected"].includes(claim.resolution),
          ) && (
            <p className="character-note">
              Earlier work evidence is preserved. Any unconfirmed attendance needs explicit employer
              terms; it is separate from new funded work.
            </p>
          )}
        </>
      ) : (
        <p>
          {person.shiftHours.toFixed(1)} attended hours ·{" "}
          {person.paidToday ? "Wages paid" : "No wage payment recorded today"}
        </p>
      )}
      <h3>Agreements involving you</h3>
      {!favors.length && <p className="character-note">Nothing written down between you.</p>}
      <ul className="contribution-list">
        {favors.map((f) => (
          <li key={f.id}>
            <span className="badge">{f.status}</span>
            {f.text}
            {f.amount ? ` · ${f.amount} coins` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CharacterReflections({
  town,
  id,
  replay,
}: {
  town: Town;
  id: AgentId;
  replay: boolean;
}) {
  if (replay) return null;
  const reflections = publicReflections(town, id);
  return (
    <details className="character-reflections">
      <summary>Latest recorded reflections</summary>
      <p className="character-note">Dated character reflections, rather than live thoughts.</p>
      {!reflections.length && (
        <p className="character-note">No non-secret reflection recorded yet.</p>
      )}
      {reflections.map((m) => (
        <article key={m.id}>
          <small>{dateOf(m)}</small>
          <p>{m.text}</p>
        </article>
      ))}
    </details>
  );
}

export function SocialPanel({
  town,
  events,
  watch,
  onWatch,
  onClose,
  onFollow,
  onProfile,
  replay,
}: {
  town: Town;
  events: SocialEvent[];
  watch: boolean;
  onWatch: (value: boolean) => void;
  onClose: () => void;
  onFollow: (id: AgentId) => void;
  onProfile: (id: AgentId) => void;
  replay: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [showReflections, setShowReflections] = useState(false);
  const conversations = events.filter((e) => e.kind === "conversation");
  const current = conversations.find((e) => e.id === chosen) ?? conversations[0];
  const reflections = current
    ? events
        .filter(
          (e) =>
            e.kind === "reflection" &&
            e.participants.some((id) => current.participants.includes(id)) &&
            (e.day > current.day || (e.day === current.day && e.minute >= current.minute)),
        )
        .slice(0, 3)
    : [];
  return (
    <aside className="mind social-panel" aria-label="Town life">
      <div className="mind-bar">
        <div>
          <p className="text-xs uppercase text-muted">Conversations and connections</p>
          <h2 className="font-display">Town life</h2>
        </div>
        <button className="btn" type="button" onClick={onClose} aria-label="Close town life">
          <X size={18} />
        </button>
      </div>
      <label className="watch-town-control">
        <input type="checkbox" checked={watch} onChange={(e) => onWatch(e.target.checked)} />
        Watch town conversations
      </label>
      <p className="social-scope">
        {watch
          ? "Watching public town life. This does not add knowledge to your resident."
          : "Your conversations and nearby exchanges you witnessed."}
      </p>
      <div className="mind-body social-body">
        {!conversations.length && (
          <div className="social-empty">
            <MessageCircle size={28} />
            <h3>No conversation recorded here yet</h3>
            <p>
              Spend time near the residents, or turn on Watch town conversations to follow public
              exchanges elsewhere.
            </p>
          </div>
        )}
        <div className="social-conversations" aria-label="Recent conversations">
          {conversations.slice(0, 12).map((event) => (
            <button
              type="button"
              className="social-conversation"
              key={event.id}
              aria-pressed={current?.id === event.id}
              onClick={() => setChosen(event.id)}
            >
              <strong>{event.participants.map((id) => nameOf(town, id)).join(" ↔ ")}</strong>
              <small>
                {dateOf(event)} · {event.place}
              </small>
              <span>{event.turns.at(-1)?.text.slice(0, 100) ?? event.text.slice(0, 100)}</span>
            </button>
          ))}
        </div>
        {current && (
          <section className="social-exchange">
            <h3>What they said</h3>
            <p className="character-note">
              {dateOf(current)} ·{" "}
              {current.mind === "offline"
                ? "Local dialogue"
                : current.mind === "grok"
                  ? "AI dialogue"
                  : "Recorded dialogue"}
            </p>
            {current.turns.length ? (
              current.turns.map((turn, index) => (
                <p className="social-line" key={`${current.id}-${index}`}>
                  <strong>{nameOf(town, turn.speaker)}</strong>
                  <span>{turn.text}</span>
                </p>
              ))
            ) : (
              <p>{current.text}</p>
            )}
            <div className="social-follow-actions">
              {current.participants
                .filter((id) => id !== "player")
                .map((id) => (
                  <div key={id}>
                    <button className="btn" type="button" onClick={() => onProfile(id)}>
                      View {nameOf(town, id)}
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={replay}
                      onClick={() => onFollow(id)}
                    >
                      <Eye size={14} aria-hidden />
                      Follow
                    </button>
                  </div>
                ))}
            </div>
            <section className="social-effects">
              <h3>What changed</h3>
              {current.changes.length ? (
                current.changes.map((change) => (
                  <article key={`${change.owner}:${change.about}`}>
                    <p>
                      <strong>
                        {nameOf(town, change.owner)} → {nameOf(town, change.about)}
                      </strong>
                      <span className="social-score">
                        {change.before} → {change.after}
                      </span>
                    </p>
                    <p>
                      {mentionsSeed(change.note)
                        ? "Their rapport changed after this exchange."
                        : change.note}
                    </p>
                  </article>
                ))
              ) : (
                <p className="character-note">
                  {current.id.startsWith("legacy-")
                    ? "Past relationship changes were not recorded for this exchange."
                    : "No relationship score changed in this exchange."}
                </p>
              )}
            </section>
            <section className="social-effects">
              <h3>Remembered</h3>
              <p>
                Recorded in {current.memories.map((m) => nameOf(town, m.agentId)).join(" and ")}'s
                conversation history.
              </p>
            </section>
            {Boolean(current.intentions?.length) && (
              <section className="social-effects">
                <h3>Plans updated</h3>
                {current.intentions?.map((intention) => (
                  <article key={intention.agentId}>
                    <small>
                      {nameOf(town, intention.agentId)} · planned from{" "}
                      {formatClock(intention.fromHour * 60)}
                    </small>
                    <p>
                      {intention.place} · {intention.activity}
                    </p>
                  </article>
                ))}
              </section>
            )}
            {watch && (
              <section className="social-effects">
                <label className="watch-town-control">
                  <input
                    type="checkbox"
                    checked={showReflections}
                    onChange={(e) => setShowReflections(e.target.checked)}
                  />
                  Show later reflections
                </label>
                {showReflections && (
                  <>
                    <p className="character-note">
                      Later reflections may draw on other experiences too.
                    </p>
                    {reflections.length ? (
                      reflections.map((event) => (
                        <article className="social-reflection" key={event.id}>
                          <small>
                            {nameOf(town, event.participants[0])} · {dateOf(event)}
                          </small>
                          <p>{event.text}</p>
                        </article>
                      ))
                    ) : (
                      <p className="character-note">
                        No later non-secret reflection recorded for these characters.
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

export function ConversationCaption({
  town,
  event,
  onOpen,
  onClose,
}: {
  town: Town;
  event?: SocialEvent;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const previous = useRef(event?.id);
  // A new exchange starts at its first spoken line; game speed does not determine reading speed.
  const shownIndex = previous.current === event?.id ? index : 0;
  useEffect(() => {
    previous.current = event?.id;
    setIndex(0);
  }, [event?.id]);
  if (!event) return null;
  const line = event.turns[shownIndex];
  return (
    <section className="conversation-caption" aria-label="Conversation captions">
      <button
        className="btn caption-close"
        type="button"
        onClick={onClose}
        aria-label="Close exchange caption"
      >
        Close
      </button>
      <button className="caption-pair" type="button" onClick={onOpen}>
        {event.participants.map((id) => nameOf(town, id)).join(" ↔ ")}
        <small>{dateOf(event)}</small>
      </button>
      <p>
        <strong>{line ? nameOf(town, line.speaker) : "Recorded exchange"}</strong>
        {line?.text ?? event.text}
      </p>
      <div className="caption-controls">
        <button
          className="btn"
          type="button"
          disabled={shownIndex === 0}
          onClick={() => setIndex(Math.max(0, shownIndex - 1))}
        >
          Previous
        </button>
        <span>
          {shownIndex + 1} / {Math.max(1, event.turns.length)}
        </span>
        <button
          className="btn"
          type="button"
          disabled={shownIndex >= event.turns.length - 1}
          onClick={() => setIndex(shownIndex + 1)}
        >
          Next
        </button>
        <button className="btn" type="button" onClick={onOpen}>
          Read exchange
        </button>
      </div>
    </section>
  );
}
