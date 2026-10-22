import { useEffect, useRef, useState } from "react";
import type { AgentId, Town } from "@/game/types";
import type { DiscussionDecision, DiscussionView } from "@/game/discussion-types";
import { formatClock } from "@/game/text";

export type DiscussionInput = DiscussionDecision | { kind: "invite"; invitee: AgentId };

export type DiscussionControls = {
  view: DiscussionView;
  enabled: boolean;
  available: boolean;
  busy: boolean;
  decisionPending: boolean;
  replaying: boolean;
  note: string;
  draft: string;
  onDraft: (value: string) => void;
  onEnable: (value: boolean) => void;
  onCreate: (topic: string) => void;
  onCommand: (decision: DiscussionInput) => void;
  onGo: () => void;
  onDecision: () => void;
  onCheck: () => void;
  onPause: () => void;
  onResume: () => void;
};

/** Viewing this panel never joins a meeting or grants character knowledge. */
export function DiscussionPanel({ town, controls }: { town: Town; controls: DiscussionControls }) {
  const { view } = controls;
  const meeting = view.meeting;
  const [topic, setTopic] = useState("What activity would we like to share at the library?");
  const [proposing, setProposing] = useState(false);
  const [following, setFollowing] = useState(true);
  const [composeOpen, setComposeOpen] = useState(view.ownTurn);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lastLineRef = useRef<HTMLLIElement>(null);
  const previousMeeting = useRef(meeting?.id);
  const newest = meeting?.utterances.at(-1)?.id;
  const name = (id: AgentId) => town.agents.find((agent) => agent.id === id)?.name ?? id;
  useEffect(() => {
    if (previousMeeting.current !== meeting?.id) {
      previousMeeting.current = meeting?.id;
      setFollowing(true);
      setProposing(false);
    }
  }, [meeting?.id]);
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (following && transcript && lastLineRef.current)
      transcript.scrollTop = transcript.scrollHeight;
  }, [newest, following]);
  useEffect(() => {
    setComposeOpen(view.ownTurn);
  }, [view.ownTurn]);
  const readOnly = controls.replaying;
  if (readOnly)
    return (
      <section className="discussion-panel" aria-label="Library meeting">
        <div className="discussion-body mind-body">
          <h3>Library meeting</h3>
          <p>
            Return to now to view the current meeting or make a choice. Meeting history is not part
            of the map replay.
          </p>
        </div>
      </section>
    );
  return (
    <section className="discussion-panel" aria-label="Library meeting">
      <div className="discussion-body mind-body">
        <h3>Library meeting</h3>
        <p className="character-note">
          A small, nonbinding discussion. Watching the transcript does not mean your resident is
          listening. Joining is free; speaking creates no work or payment agreement.
        </p>
        <label className="discussion-option">
          <input
            type="checkbox"
            checked={controls.enabled}
            disabled={readOnly}
            onChange={(event) => controls.onEnable(event.target.checked)}
          />
          Enable the local meeting prototype
        </label>
        {readOnly && (
          <p className="warn">Replay is view-only. Return to now to join or make a choice.</p>
        )}
        <p className="discussion-feedback" role="status" aria-live="polite" aria-atomic="true">
          {controls.note}
        </p>
        {!meeting || (meeting.status === "closed" && proposing) ? (
          <form
            className="discussion-proposal"
            onSubmit={(event) => {
              event.preventDefault();
              controls.onCreate(topic.trim());
            }}
          >
            <label htmlFor="discussion-topic">Propose one topic</label>
            <textarea
              id="discussion-topic"
              className="field"
              value={topic}
              maxLength={160}
              onChange={(event) => setTopic(event.target.value)}
            />
            <p className="character-note">One topic, up to 160 characters.</p>
            <p className="character-note">
              Northern, Arwyn and Sub may read the library invitation and decide for themselves. A
              proposal does not promise their attendance or choose their words.
            </p>
            <button
              className="btn"
              type="submit"
              disabled={!controls.enabled || readOnly || controls.busy || !topic.trim()}
            >
              Propose library meeting
            </button>
          </form>
        ) : (
          <>
            <h4 className="discussion-topic">{meeting.topic}</h4>
            <p className="discussion-state">
              {meeting.status === "active"
                ? "Meeting in progress"
                : meeting.status === "gathering"
                  ? "Gathering at the library"
                  : meeting.status === "paused"
                    ? "Meeting paused"
                    : "Meeting finished"}
              {meeting.reason && ` · ${meeting.reason}`}
            </p>
            <p className="character-note">
              {view.isListening
                ? "Your resident is deliberately listening here. Only future eligible speech is heard."
                : view.isPresent
                  ? "You are at the meeting place. You are not listening to this discussion."
                  : "You are viewing this discussion. Go to the library to join and listen."}
            </p>
            <div className="discussion-actions">
              <button className="btn" type="button" onClick={controls.onGo} disabled={readOnly}>
                Go to library
              </button>
              {view.actions
                .filter((action) => action.kind !== "speak")
                .map((action) => (
                  <button
                    key={action.kind}
                    className="btn"
                    type="button"
                    disabled={readOnly || !controls.enabled}
                    onClick={() => controls.onCommand({ kind: action.kind } as DiscussionDecision)}
                  >
                    {action.label}
                  </button>
                ))}
            </div>
            <details className="discussion-roster">
              <summary>Your invitations</summary>
              <ul>
                {view.invitations.map((invitation) => (
                  <li key={invitation.id}>
                    {invitation.name} ·{" "}
                    {invitation.delivered ? "invitation delivered" : "not yet delivered"}
                  </li>
                ))}
              </ul>
              <p className="character-note">
                Speak to an invitee nearby, or let them discover the invitation at the library. They
                decide whether to accept.
              </p>
              <div className="discussion-actions">
                {view.canInviteIds.map((id) => (
                  <button
                    className="btn"
                    type="button"
                    key={id}
                    disabled={!controls.enabled}
                    onClick={() => controls.onCommand({ kind: "invite", invitee: id })}
                  >
                    Invite {name(id)}
                  </button>
                ))}
              </div>
            </details>
            <details className="discussion-roster">
              <summary>Public joins and arrivals · {view.roster.length}</summary>
              <p className="character-note">
                Observable meeting choices; this is not a list of everyone who can hear.
              </p>
              <ul>
                {view.roster.map((member) => (
                  <li key={member.id}>
                    <strong>{member.name}</strong> ·{" "}
                    {member.choice === "accepted"
                      ? member.arrived
                        ? "arrived"
                        : "accepted, travelling"
                      : member.choice === "declined"
                        ? "declined"
                        : member.choice === "left"
                          ? "left"
                          : "invitation received"}
                    {member.mode !== "off" &&
                      ` · ${member.mode === "participating" ? "joined to participate" : "joined to listen"}`}
                  </li>
                ))}
              </ul>
            </details>
            {meeting.floor && (
              <p className="discussion-floor">Turn offered to {name(meeting.floor.actor)}.</p>
            )}
            {meeting.queue.length > 0 && (
              <p className="character-note">
                Requested turns: {meeting.queue.map(name).join(", ")}.
              </p>
            )}
            <h4 id="discussion-transcript-title">Recorded discussion</h4>
            <div
              className="discussion-transcript"
              ref={transcriptRef}
              role="region"
              aria-labelledby="discussion-transcript-title"
              tabIndex={0}
              onScroll={(event) => {
                const el = event.currentTarget;
                setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 32);
              }}
            >
              {!meeting.utterances.length && (
                <p className="character-note">No one has spoken in this meeting yet.</p>
              )}
              <ol>
                {meeting.utterances.map((line) => (
                  <li key={line.id} ref={line.id === newest ? lastLineRef : undefined}>
                    <p>
                      <strong>{name(line.speaker)}</strong>{" "}
                      <small>
                        Day {line.at.day} · {formatClock(line.at.minute)}
                      </small>
                    </p>
                    <p>{line.text}</p>
                  </li>
                ))}
              </ol>
            </div>
            {!following && (
              <button className="btn" type="button" onClick={() => setFollowing(true)}>
                Follow latest turn
              </button>
            )}
            {meeting.status !== "closed" && (
              <div className="discussion-decisions">
                <p className="character-note">
                  Residents choose their own actions through AI. Each click asks one resident to
                  decide and may use the town's AI allowance. No local reply is substituted.
                </p>
                {!controls.available && (
                  <p className="character-note">
                    Resident AI actions are unavailable. The meeting waits.
                  </p>
                )}
                {controls.decisionPending && (
                  <p role="status">
                    Waiting for a resident decision. Listening and leaving remain available.
                  </p>
                )}
                <div className="discussion-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={controls.onDecision}
                    disabled={
                      readOnly ||
                      !controls.enabled ||
                      !controls.available ||
                      controls.busy ||
                      meeting.status === "paused"
                    }
                  >
                    Request next AI decision
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={controls.onCheck}
                    disabled={controls.busy || readOnly}
                  >
                    Check AI availability
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={meeting.status === "paused" ? controls.onResume : controls.onPause}
                    disabled={readOnly || !controls.enabled}
                  >
                    {meeting.status === "paused" ? "Resume meeting" : "Pause meeting decisions"}
                  </button>
                </div>
                <p className="character-note">
                  {meeting.decisions} of 16 resident decisions used · {meeting.utterances.length} of
                  6 spoken turns.
                </p>
              </div>
            )}
            {meeting.status === "closed" && (
              <button className="btn" type="button" onClick={() => setProposing(true)}>
                Propose another meeting
              </button>
            )}
          </>
        )}
      </div>
      {meeting && meeting.status !== "closed" && !composeOpen && (
        <button
          className="btn discussion-compose-toggle"
          type="button"
          aria-expanded={composeOpen}
          aria-controls="discussion-compose"
          onClick={() => setComposeOpen((open) => !open)}
        >
          Prepare a line
          {controls.draft.trim() && <span> · draft kept</span>}
        </button>
      )}
      {meeting && meeting.status !== "closed" && (
        <form
          id="discussion-compose"
          className="discussion-compose"
          hidden={!composeOpen}
          onSubmit={(event) => {
            event.preventDefault();
            controls.onCommand({ kind: "speak", text: controls.draft.trim() });
          }}
        >
          <label htmlFor="discussion-line">Your line to this library discussion</label>
          <textarea
            id="discussion-line"
            className="field"
            maxLength={400}
            value={controls.draft}
            onChange={(event) => controls.onDraft(event.target.value)}
          />
          <p className="character-note">
            {view.ownTurn
              ? "Your turn · attentive residents in earshot may hear this line."
              : "Join as a speaker and request a turn. Your draft stays here."}
          </p>
          <div className="discussion-actions">
            <button
              className="btn"
              type="submit"
              disabled={readOnly || !controls.enabled || !view.ownTurn || !controls.draft.trim()}
            >
              Say to meeting
            </button>
            <button
              className="btn"
              type="button"
              aria-expanded={composeOpen}
              aria-controls="discussion-compose"
              onClick={() => setComposeOpen(false)}
            >
              Hide draft
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
