import type { Town } from "@/game/types";
import { libraryActions, libraryView } from "@/game/community";
import { formatClock } from "@/game/text";
import { placeTitle } from "@/game/world";
import { ActionCards } from "./ActionCards";

const GROUPS = [
  { id: "offer", title: "Choose your contribution" },
  { id: "evidence", title: "Inspect the records" },
  { id: "report", title: "Written reports" },
  { id: "draft", title: "Prepare the index" },
  { id: "lookup", title: "Test the index" },
  { id: "manage", title: "Project decisions" },
];

export function ReadingStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    invited: "An invitation is taking shape",
    waiting: "Waiting for Baba’s dated note",
    routing: "Guests are on their way",
    ready: "Everyone has arrived · ready to begin",
    done: "The reading is finished",
  };
  return <>{labels[status] ?? "Reading invitation"}</>;
}

export function LibraryProject({
  town,
  busy,
  actionNote,
  onAction,
  onGoReading,
}: {
  town: Town;
  busy: boolean;
  actionNote: string;
  onAction: (id: string) => void;
  onGoReading: () => void;
}) {
  const view = libraryView(town);
  const actions = libraryActions(town).map((action) => {
    const [kind, argument] = JSON.parse(action.id) as [string, string];
    return { action, kind, argument };
  });
  const storyActions = actions.filter(({ action }) => action.category === "story");
  const refreshmentActions = storyActions.filter(({ kind }) => kind === "evening-refreshments");
  const readingActions = storyActions.filter(({ kind }) => kind !== "evening-refreshments");
  const currentGroup =
    storyActions.length > 0 && view.lookupCompleted
      ? null
      : view.stage === "offer"
        ? "offer"
        : view.canPrepareDraft
          ? "draft"
          : view.stage === "travel" && actions.some(({ kind }) => kind === "test")
            ? "lookup"
            : view.stage === "travel" || view.stage === "inspect"
              ? "evidence"
              : view.stage === "report"
                ? "report"
                : actions.some(({ kind }) => kind === "correct")
                  ? "report"
                  : view.stage === "aftermath"
                    ? null
                    : "lookup";
  const requiredIds = new Set(view.requiredEvidence.map((item) => item.id));
  const evidenceHeading = view.playerTask?.earned
    ? "Required for the other report"
    : "Required for your check";
  return (
    <>
      <p
        className="tool-action-note"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
        data-tool-feedback
      >
        {actionNote}
      </p>
      <section className="library-story" aria-labelledby="library-story-title">
        <h3 id="library-story-title">{view.story.title}</h3>
        {!view.lookupCompleted && <p className="library-story-voice">{view.story.hook}</p>}
        {view.lookupCompleted && <p>{view.story.nextStep}</p>}
        {view.story.gathering && (
          <div className="library-gathering">
            <h4>{view.story.gathering.label}</h4>
            <p>
              {placeTitle(view.story.gathering.place)} · Invited Day {view.story.gathering.day},{" "}
              {formatClock(view.story.gathering.minute)}
            </p>
            <p>
              <ReadingStatus status={view.story.gathering.status} />
            </p>
            <ul className="library-guests" aria-label="Reading guests">
              {view.story.gathering.guests.map((guest) => (
                <li key={guest.name} data-arrived={guest.arrived}>
                  {guest.name}
                  {view.story.scene.length === 0
                    ? ` · ${guest.arrived ? "here" : view.story.phase === "waiting" ? "invited" : "on the way"}`
                    : ""}
                </li>
              ))}
            </ul>
            {view.story.scene.length === 0 && (
              <button className="btn" type="button" onClick={onGoReading}>
                Go to the reading
              </button>
            )}
          </div>
        )}
        {view.story.refreshments.length > 0 && (
          <p>On the table: {view.story.refreshments.join("; ")}.</p>
        )}
        {readingActions.length > 0 && (
          <div className="library-story-choices">
            <h4>{view.story.gathering ? "Your invitation" : "Choose how the reading happens"}</h4>
            <ActionCards
              actions={readingActions.map(({ action }) => action)}
              busy={busy}
              onAction={onAction}
            />
          </div>
        )}
        {refreshmentActions.length > 0 && (
          <details className="library-funding">
            <summary>Optional refreshments</summary>
            <ActionCards
              actions={refreshmentActions.map(({ action }) => action)}
              busy={busy}
              onAction={onAction}
            />
          </details>
        )}
        {view.story.scene.length > 0 && (
          <div className="library-scene" role="region" aria-labelledby="library-scene-title">
            <h4 id="library-scene-title">The first page</h4>
            <ul>
              {view.story.scene.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {view.story.outcome && <p className="library-story-outcome">{view.story.outcome}</p>}
      </section>
      {!view.lookupCompleted ? (
        <section className="tool-next-step" aria-labelledby="library-next-step">
          <h3 id="library-next-step">Next step</h3>
          <p>{view.nextStep}</p>
          {view.stage !== "offer" && (
            <p className="text-muted">
              {view.atLibrary ? "You are at the library." : "Use Go to → Library to walk here."}
            </p>
          )}
        </section>
      ) : (
        <details className="library-funding">
          <summary>Library records & correction</summary>
          <p>{view.nextStep}</p>
        </details>
      )}
      {view.playerTask && (
        <section className="library-player-task" aria-labelledby="library-your-check">
          <h3 id="library-your-check">Your check · {view.playerTask.label}</h3>
          <p className="library-fee">
            {view.playerTask.paid
              ? `${view.playerTask.fee} coins paid to you · check completed`
              : view.playerTask.earned
                ? `${view.playerTask.fee} coins earned · payment pending`
                : view.stage === "closed"
                  ? "Check not completed · no fee earned"
                  : `${view.playerTask.fee} coins when you submit your completed check`}
          </p>
          {(["travel", "inspect", "report"] as string[]).includes(view.stage) &&
            view.evidenceProgress.total > 0 && (
              <>
                <p>
                  {evidenceHeading} · {view.evidenceProgress.completed} of{" "}
                  {view.evidenceProgress.total} inspected
                </p>
                <ul className="library-checklist" aria-label={evidenceHeading}>
                  {view.requiredEvidence.map((item) => (
                    <li key={item.id} data-done={item.done}>
                      <span aria-hidden="true">{item.done ? "✓" : "○"}</span>
                      <span>
                        {item.label}{" "}
                        <span className="text-muted">
                          · {item.done ? "inspected" : "to inspect"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          {view.playerTask.completed && (
            <p>
              Your fee is earned for this check. Preparing the index and its later test are separate
              steps.
            </p>
          )}
        </section>
      )}
      {actions.length > 0 && (
        <section>
          <h3>Available choices</h3>
          {GROUPS.map((group) => {
            const grouped = actions.filter(
              ({ action }) => (action.category ?? "manage") === group.id,
            );
            if (!grouped.length) return null;
            const mappings = grouped.filter(({ kind }) => kind === "map");
            const otherActions = grouped.filter(({ kind }) => kind !== "map");
            const requiredActions = otherActions.filter(
              ({ kind, argument }) => kind === "inspect" && requiredIds.has(argument),
            );
            const remainingActions = otherActions.filter((item) => !requiredActions.includes(item));
            return (
              <details
                className="library-choice-group"
                key={group.id}
                open={group.id === currentGroup || (view.lookupCompleted && group.id === "lookup")}
              >
                <summary>
                  {group.id === "lookup" && view.lookupCompleted ? "Use the index" : group.title}{" "}
                  <span className="text-muted">· {grouped.length}</span>
                  {group.id === currentGroup && (
                    <span className="library-current-step">Current step</span>
                  )}
                </summary>
                {mappings.length > 0 && (
                  <div className="library-draft">
                    <p>
                      Locations from your inspections carry into this draft. Review the references,
                      then submit for Northern to try or let Arwyn prepare hers.
                    </p>
                    <ul className="library-draft-locations" aria-label="Draft locations">
                      {view.entries.map((entry) => (
                        <li key={entry.id}>
                          <span>{entry.label}</span>
                          <strong>{entry.box ? `Box ${entry.box}` : "Unresolved"}</strong>
                        </li>
                      ))}
                    </ul>
                    <details
                      className="library-draft-review"
                      open={view.entries.some((entry) => !entry.box)}
                    >
                      <summary>Review or change locations</summary>
                      <p className="text-muted">
                        A supported location is verified; a conflicting choice stays provisional.
                        Leave a location unresolved if you do not know. Submission saves exactly
                        these references.
                      </p>
                      {view.entries.map((entry) => {
                        const options = mappings.filter(({ argument }) =>
                          argument.startsWith(`${entry.id}:`),
                        );
                        return (
                          <label className="tool-option" key={entry.id}>
                            {entry.label}
                            <select
                              aria-label={`Box for ${entry.label}`}
                              value={entry.box ?? "unresolved"}
                              disabled={
                                busy ||
                                options.every(({ action }) => Boolean(action.disabledReason))
                              }
                              onChange={(event) => {
                                const selected = options.find(
                                  ({ argument }) =>
                                    argument === `${entry.id}:${event.target.value}`,
                                );
                                if (selected) onAction(selected.action.id);
                              }}
                            >
                              {options.map(({ action, argument }) => {
                                const box = argument.split(":")[1];
                                return (
                                  <option
                                    key={box}
                                    value={box}
                                    disabled={Boolean(action.disabledReason)}
                                  >
                                    {box === "unresolved" ? "Unresolved" : `Box ${box}`}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        );
                      })}
                    </details>
                    {!view.atLibrary && (
                      <p className="tool-action-reason">
                        Walk to the library to change or submit your draft.
                      </p>
                    )}
                  </div>
                )}
                {requiredActions.length > 0 && (
                  <>
                    <h4>{evidenceHeading}</h4>
                    <ActionCards
                      actions={requiredActions.map(({ action }) => action)}
                      busy={busy}
                      onAction={onAction}
                    />
                  </>
                )}
                {group.id === "evidence" && remainingActions.length > 0 && (
                  <>
                    <h4>Other project evidence</h4>
                    <p className="text-muted">
                      Optional for your paid check. These records can support the other report and
                      your index.
                    </p>
                  </>
                )}
                <ActionCards
                  actions={remainingActions.map(({ action }) => action)}
                  busy={busy}
                  onAction={onAction}
                />
              </details>
            );
          })}
        </section>
      )}
      <section>
        <h3>Project progress · {view.status}</h3>
        <p>{view.progress}</p>
        <details className="library-funding">
          <summary>Project money & ownership · {view.budget}-coin budget</summary>
          <dl className="library-accounts">
            <div>
              <dt>Total funding</dt>
              <dd>{view.budget} coins</dd>
            </div>
            <div>
              <dt>Held by the project</dt>
              <dd>{view.custody} coins</dd>
            </div>
            <div>
              <dt>Set aside for work</dt>
              <dd>{view.reserved} coins</dd>
            </div>
            <div>
              <dt>Paid to workers</dt>
              <dd>{view.spent} coins</dd>
            </div>
          </dl>
          <p>
            Set-aside money is part of the money held by the project. It has not been paid yet. Read
            each offer before choosing.
          </p>
          <p>
            The owner is {view.owner.toLowerCase()}. Contributor credit records who did the work; it
            gives no ownership of other people’s work.
          </p>
          {view.closePreview && (
            <p>
              Closing now: {view.closePreview.earnedUnpaid} coins earned but unpaid;{" "}
              {view.closePreview.reservedUnfinished} coins reserved for unfinished work. After
              settling earned fees, {view.closePreview.refundPerDonor} coins would return to each
              funder.
            </p>
          )}
        </details>
      </section>
      <section>
        <h3>The index</h3>
        <p className="text-muted">
          Verified: supported by recorded evidence. Provisional: selected without that support.
          Unresolved: no box selected. A lookup tests the submitted index separately.
        </p>
        <ul className="tool-events">
          {view.entries.map((entry) => (
            <li key={entry.id}>
              <p>
                {entry.label} · {entry.status}
              </p>
              <p>
                {entry.box ? `Box ${entry.box}` : "No box selected"} · {entry.date}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Public evidence</h3>
        <p className="text-muted">
          Inspected records remain here for you to consult while preparing the index.
        </p>
        <ul className="tool-events">
          {view.evidence.map((record) => (
            <li key={record.id}>
              <p>
                {record.label} · {record.read ? "inspected" : "not inspected"}
              </p>
              <p>
                {record.read
                  ? record.text
                  : "Visit the library and inspect this record to read it."}
              </p>
            </li>
          ))}
        </ul>
      </section>
      {view.reports.length > 0 && (
        <section>
          <h3>Attributed reports</h3>
          <ul className="tool-events">
            {view.reports.map((report, index) => (
              <li key={`${report.role}-${index}`}>
                <p>
                  {report.worker} · {report.role} check
                </p>
                <p>{report.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>Lookup result</h3>
        <p>{view.outcome}</p>
        {view.waitPreview && <p>{view.waitPreview.warning}</p>}
        <ul>
          {view.finds.map((find) => (
            <li key={find.id}>
              {find.label}: {find.result}
            </li>
          ))}
        </ul>
      </section>
      {view.events.length > 0 && (
        <section>
          <h3>Project history</h3>
          <ul className="tool-events">
            {view.events
              .slice(-8)
              .reverse()
              .map((event) => (
                <li key={event.id}>
                  <p className="text-muted">
                    Day {event.day}, {formatClock(event.minute)}
                  </p>
                  <p>{event.text}</p>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}
