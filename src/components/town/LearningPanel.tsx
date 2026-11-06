import { useState } from "react";
import type { Town } from "@/game/types";
import type { LearningPurpose } from "@/game/learning-types";
import { currentLearning, learningPurposes } from "@/game/learning-controller";
import { learningEligibility } from "@/game/learning-runtime";
import { currentFollow } from "@/game/following";
import { LEARNING_GOAL, learningComparison, practiceObservation } from "@/game/learning-practice";

const labels: Record<LearningPurpose, string> = {
  "baseline-plan": "Inspect before instruction",
  "baseline-submit": "Submit before-instruction attempt",
  invite: "Ask about teaching",
  question: "Generate next question",
  answer: "Request the resident’s answer",
  "after-plan": "Inspect fresh practice case",
  "after-submit": "Submit fresh practice attempt",
  "transfer-plan": "Inspect changed case",
  "transfer-submit": "Submit changed-case attempt",
  reflection: "End lesson and reflect",
};
export function LearningPanel({
  town,
  available,
  disabled,
  busy,
  note,
  onEnable,
  onResume,
  onStop,
  onRequest,
}: {
  town: Town;
  available: boolean;
  disabled: boolean;
  busy: boolean;
  note: string;
  onEnable: (pauseTime: boolean) => void;
  onResume: () => void;
  onStop: () => void;
  onRequest: (purpose: LearningPurpose) => void;
}) {
  const [pauseTime, setPauseTime] = useState(true);
  const s = currentLearning(town.followerLearning),
    f = currentFollow(town.following);
  const same = s?.followId === f?.id;
  const reason = learningEligibility(town);
  const name = town.agents.find((a) => a.id === f?.target)?.name ?? "the resident";
  const used = s?.calls.length ?? 0;
  return (
    <details className="learning-panel">
      <summary>Ask and learn{s ? ` · ${s.consent} · ${used}/12 requests` : ""}</summary>
      <div className="learning-content">
        <p>
          Invite {name} to teach one library method. They may accept, decline or defer. Following
          alone asks nothing.
        </p>
        <p>
          <strong>Learning goal:</strong> {LEARNING_GOAL}.
        </p>
        <p className="companion-note">
          Each button requests one AI action from your existing allowance. At most two generated
          questions, one private reflection and twelve requests total. Each practice case has the
          same two-request limit. No automatic retries or skill points.
        </p>
        {!available && (
          <p role="status">
            AI action capacity is unavailable. Accompanying and listening still use no follower
            inference.
          </p>
        )}
        {(!s || !same) && (
          <>
            <label className="companion-listen">
              <input
                type="checkbox"
                checked={pauseTime}
                onChange={(e) => setPauseTime(e.target.checked)}
              />{" "}
              Pause town time for this lesson
            </label>
            <p className="companion-note">
              This keeps the session’s game-minute deadline still while you study. You can change
              town speed at any time.
            </p>
            {reason && <p>{reason}</p>}
            <button
              className="btn"
              type="button"
              disabled={disabled || busy || !available || Boolean(reason)}
              onClick={() => onEnable(pauseTime)}
            >
              Enable Ask and learn
            </button>
          </>
        )}
        {s && (
          <>
            {s.status === "paused" && reason && (
              <p className="companion-note">
                {reason} Resume the companion and its discussion before restoring learning
                permission.
              </p>
            )}
            <div className="learning-actions">
              {s.status === "paused" && same && (
                <button
                  className="btn"
                  type="button"
                  disabled={disabled || busy || !available}
                  onClick={onResume}
                >
                  Resume Ask and learn
                </button>
              )}
              {s.status !== "ended" && (
                <button className="btn" type="button" onClick={onStop}>
                  Stop asking and learning
                </button>
              )}
              {same &&
                s.status === "active" &&
                learningPurposes(s).map((p) => (
                  <button
                    key={p}
                    className="btn"
                    type="button"
                    disabled={disabled || busy || !available}
                    onClick={() => onRequest(p)}
                  >
                    {labels[p]}
                  </button>
                ))}
            </div>
            <p role="status">
              {busy
                ? "Waiting for a bounded lesson decision. Stop and manual movement remain available."
                : note || s.reason}
            </p>
            <p>
              {s.questions}/2 questions actually asked · {s.answers} answers received ·{" "}
              {s.reflected ? "Reflection recorded" : "No end reflection recorded"}.
            </p>
            <p className="companion-note">
              An existing discussion keeps its own floor and six-turn limit. Another speaker’s turn
              or a closed discussion can leave this lesson incomplete.
            </p>
            {s.method && (
              <section aria-label="Method received">
                <h3>Method received: verify a reference</h3>
                <ol>
                  {s.method.procedure.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <details>
                  <summary>Prerequisites, permitted actions and limits</summary>
                  <p>{s.method.prerequisites.join("; ")}.</p>
                  <p>Allowed: {s.method.permittedActions.join("; ")}.</p>
                  <p>{s.method.limitations.join(". ")}.</p>
                  <p>Source: {s.method.sourceIds.join(", ")}</p>
                </details>
              </section>
            )}
            <section aria-label="Practice comparison">
              <h3>Practice comparison</h3>
              <p>{learningComparison(s.trials, s.calls)}</p>
              <div className="learning-trials">
                {s.trials.map((trial) => {
                  const observation = practiceObservation(trial);
                  return (
                    <article key={trial.caseId}>
                      <h4>
                        {trial.phase === "baseline"
                          ? "Before instruction"
                          : trial.phase === "after"
                            ? "Fresh case after instruction"
                            : "Changed, misleading case"}
                      </h4>
                      <p>{observation.request}</p>
                      <p>{observation.shelfHint}</p>
                      <p>
                        {trial.attempts}/2 request slots used ·{" "}
                        {trial.result
                          ? trial.result.correct
                            ? "Succeeded on this case"
                            : "Did not pass this case"
                          : trial.finished
                            ? "Incomplete attempt"
                            : "Not completed"}
                        .
                      </p>
                      {trial.result && <p>{trial.result.explanation}</p>}
                      <details>
                        <summary>Actual inspections and submission</summary>
                        {!trial.observations.length && <p>No box contents have been inspected.</p>}
                        {trial.observations.map((o) => (
                          <p key={o.id}>{o.text}</p>
                        ))}
                        {trial.result && (
                          <p>
                            Submitted {trial.result.box}; date {trial.result.historicalDate}.
                          </p>
                        )}
                      </details>
                    </article>
                  );
                })}
              </div>
            </section>
            <details>
              <summary>Teaching and learning journal ({s.receipts.length})</summary>
              {s.receipts.map((receipt) => (
                <blockquote key={receipt.id}>
                  <small>
                    {receipt.kind === "event"
                      ? "Recorded action"
                      : receipt.kind === "claim"
                        ? "Attributed speech"
                        : "Private interpretation — unverified"}{" "}
                    · {town.agents.find((a) => a.id === receipt.actor)?.name}
                  </small>
                  <p>{receipt.text}</p>
                  <details>
                    <summary>Source evidence</summary>
                    <small>{receipt.sourceIds.join(", ")}</small>
                  </details>
                </blockquote>
              ))}
            </details>
            <details>
              <summary>Speaker and learner request receipts</summary>
              <p>
                The existing account budget reserves every request. These local receipts attribute
                each speaker/learner attempt; unknown usage stays unknown.
              </p>
              {(["speaker", "learner"] as const).map((role) => {
                const calls = s.calls.filter((c) => c.role === role);
                return (
                  <p key={role}>
                    {role}: {calls.length} requests ·{" "}
                    {calls.reduce((n, c) => n + c.usage.providerAttempts, 0)} known provider
                    attempts · {calls.reduce((n, c) => n + c.usage.attemptsUnknown, 0)} unknown
                    attempts · {calls.reduce((n, c) => n + c.usage.knownTokens, 0)} known tokens.
                  </p>
                );
              })}
              {s.calls.map((call) => (
                <p key={call.id}>
                  {call.role} · {call.purpose} · {call.status}
                </p>
              ))}
            </details>
          </>
        )}
        {town.followerLearning && town.followerLearning.sessions.length > 1 && (
          <details>
            <summary>Earlier local lessons</summary>
            {town.followerLearning.sessions.slice(0, -1).map((old) => (
              <article key={old.id}>
                <h3>
                  {old.target} · {old.consent}
                </h3>
                <p>{old.reason}</p>
                <p>{learningComparison(old.trials, old.calls)}</p>
                {old.receipts.map((r) => (
                  <p key={r.id}>
                    {r.kind}: {r.text}
                  </p>
                ))}
              </article>
            ))}
          </details>
        )}
        <p className="companion-note">
          Up to eight ended lessons and one current lesson are retained. Export your town to keep
          older history. These short practice cases do not establish general mastery.
        </p>
      </div>
    </details>
  );
}
