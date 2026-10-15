import type { Town } from "@/game/types";
import { libraryActions, libraryView } from "@/game/community";
import { formatClock } from "@/game/text";
import { ActionCards } from "./ActionCards";

const GROUPS = [
  { id: "offer", title: "Choose your contribution" },
  { id: "evidence", title: "Inspect the records" },
  { id: "report", title: "Written reports" },
  { id: "draft", title: "Prepare the index" },
  { id: "lookup", title: "Test the index" },
  { id: "manage", title: "Project decisions" },
];

export function LibraryProject({
  town,
  busy,
  actionNote,
  onAction,
}: {
  town: Town;
  busy: boolean;
  actionNote: string;
  onAction: (id: string) => void;
}) {
  const view = libraryView(town);
  const actions = libraryActions(town);
  return (
    <>
      <p className="tool-next-step">{view.nextStep}</p>
      <p>{view.progress}</p>
      <section>
        <h3>Common project · {view.status}</h3>
        <p>
          The owner is {view.owner.toLowerCase()}. Attribution records who contributed; it gives no
          ownership of other people’s work.
        </p>
        <dl className="library-accounts">
          <div>
            <dt>Project budget</dt>
            <dd>{view.budget}</dd>
          </div>
          <div>
            <dt>In custody</dt>
            <dd>{view.custody}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{view.reserved}</dd>
          </div>
          <div>
            <dt>Paid out</dt>
            <dd>{view.spent}</dd>
          </div>
        </dl>
        <p>
          Money paid, work performed and lookup success are separate. Read each offer before
          choosing.
        </p>
      </section>
      {actions.length > 0 && (
        <section>
          <h3>Available choices</h3>
          {GROUPS.map((group) => {
            const grouped = actions.filter((action) => (action.category ?? "manage") === group.id);
            if (!grouped.length) return null;
            const mappings = grouped.filter(action=>JSON.parse(action.id)[0]==="map");
            return (
              <details
                className="library-choice-group"
                key={group.id}
                open={group.id === "offer" || group.id === "lookup" || group.id === "evidence"}
              >
                <summary>
                  {group.title} · {grouped.length}
                </summary>
                {mappings.length > 0 && <div className="library-draft">
                  <p>Choose a box for each record. Supported observations verify a location; a conflicting choice stays provisional. Submission freezes these selections.</p>
                  {view.entries.map(entry=>{
                    const options=mappings.filter(action=>JSON.parse(action.id)[1].startsWith(`${entry.id}:`));
                    return <label className="tool-option" key={entry.id}>
                      {entry.label}
                      <select aria-label={`Box for ${entry.label}`} value={entry.box??"unresolved"}
                        disabled={busy||options.every(action=>Boolean(action.disabledReason))}
                        onChange={event=>{const selected=options.find(action=>JSON.parse(action.id)[1]===`${entry.id}:${event.target.value}`);if(selected)onAction(selected.id);}}>
                        {options.map(action=>{const box=JSON.parse(action.id)[1].split(":")[1];return <option key={box} value={box}>{box==="unresolved"?"Unresolved":box}</option>;})}
                      </select>
                    </label>;
                  })}
                </div>}
                <ActionCards actions={grouped.filter(action=>!mappings.includes(action))} busy={busy} onAction={onAction} />
              </details>
            );
          })}
        </section>
      )}
      {actionNote && (
        <p className="tool-action-note" role="status" aria-live="polite">
          {actionNote}
        </p>
      )}
      <section>
        <h3>The index</h3>
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
        <ul>
          {view.evidence.map((record) => (
            <li key={record.id}>
              <p>{record.label}</p>
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
                  {report.worker} · {report.role}
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
