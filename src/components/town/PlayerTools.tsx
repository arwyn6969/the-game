import { useEffect, useRef } from "react";
import { ActionCards } from "./ActionCards";
import { LibraryProject, ReadingStatus } from "./LibraryProject";
import { libraryView } from "@/game/community";
import { GAME_BUILD_ID } from "@/game/build";
import { X } from "lucide-react";
import type { PlaceId, Town } from "@/game/types";
import { PLACE_IDS } from "@/game/types";
import type { PlayerAction } from "@/game/effects";
import { BABA_LOAF } from "@/game/effects";
import { memorySource } from "@/game/conversation";
import { agentById } from "@/game/memory";
import { formatClock } from "@/game/text";
import { fundedWorkSummary } from "@/game/funded-work";
import type { FundedTown } from "@/game/economy-types";
import { placeTitle, zoneAt } from "@/game/world";
import { ManuscriptTools, type ManuscriptControls } from "./ManuscriptTools";
import { heldItem } from "@/game/physical-items";

export type ToolPage = "help" | "journal" | "inventory" | "map" | "library";
const TITLES: Record<ToolPage, string> = {
  help: "Help & privacy",
  journal: "Your journal",
  inventory: "What you carry",
  map: "Go somewhere",
  library: "Library project",
};

export function PlayerTools({
  page,
  town,
  localOnly,
  preferenceNote,
  inspectorEnabled,
  inventoryActions,
  busy,
  actionNote,
  onClose,
  onLocalOnly,
  onInspector,
  onGo,
  onStep,
  onAction,
  backups,
  onBackup,
  onLibrary,
  onLibraryAction,
  onGoReading,
  replaying,
  manuscriptControls,
}: {
  page: ToolPage;
  town: Town;
  localOnly: boolean;
  preferenceNote: string;
  inspectorEnabled: boolean;
  inventoryActions: PlayerAction[];
  busy: boolean;
  actionNote: string;
  onClose: () => void;
  onLocalOnly: (value: boolean) => void;
  onInspector: (value: boolean) => void;
  onGo: (place: PlaceId) => void;
  onStep: (code: string) => void;
  onAction: (id: string) => void;
  backups: { key: string; raw: string }[];
  onBackup: (backup: { key: string; raw: string }) => void;
  onLibrary: () => void;
  onLibraryAction: (id: string) => void;
  onGoReading: () => void;
  replaying: boolean;
  manuscriptControls: ManuscriptControls;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, [page]);
  useEffect(() => {
    if (!actionNote || (page !== "inventory" && page !== "library")) return;
    // A completed one-use choice can remove its focused button. Keep keyboard
    // and screen-reader users in this panel instead of dropping focus to the map.
    if (document.activeElement === document.body) {
      panelRef.current?.querySelector<HTMLElement>("[data-tool-feedback]")?.focus();
    }
  }, [actionNote, page]);
  const player = agentById(town, "player");
  const reading = page === "map" ? libraryView(town).story : null;
  const carried = player.projects.filter((p) => p.status === "open" && p.text === BABA_LOAF);
  const manuscript = heldItem(town, "player");
  const agreements = player.projects.filter((p) => p.status === "open" && p.text !== BABA_LOAF);
  const debts = town.favors.filter((f) => f.from === "player" || f.to === "player");
  const events = player.memories
    .filter((m) => memorySource(m) === "event" && m.type !== "plan")
    .slice(-12)
    .reverse();
  const fundedTown = town as FundedTown;
  const funded = fundedTown.economy ? fundedWorkSummary(fundedTown, "player") : null;
  const shift = agreements.find((p) => p.kind === "shift");
  const wageReceipt = player.memories
    .filter(
      (m) =>
        memorySource(m) === "event" &&
        m.type === "favor" &&
        m.day === town.day &&
        /paid me \d+ for a shift I actually worked\./.test(m.text),
    )
    .at(-1);
  const directions = [
    { code: "ArrowUp", label: "North" },
    { code: "ArrowLeft", label: "West" },
    { code: "ArrowRight", label: "East" },
    { code: "ArrowDown", label: "South" },
  ];
  return (
    <section
      ref={panelRef}
      className="mind player-tools"
      role="dialog"
      aria-labelledby="tools-title"
    >
      <div className="mind-bar">
        <h2 id="tools-title" className="font-display">
          {TITLES[page]}
        </h2>
        <button
          ref={closeRef}
          className="btn"
          type="button"
          onClick={onClose}
          aria-label={`Close ${TITLES[page]}`}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div
        className="mind-body tool-body"
        role="region"
        aria-label={`${TITLES[page]} content`}
        tabIndex={0}
      >
        {replaying && (
          <p className="tool-next-step" role="status">
            Replay is view-only. Return to now to walk or make a choice. These tools show your
            current town.
          </p>
        )}
        {page === "library" && (
          <>
            <ManuscriptTools town={town} controls={manuscriptControls} />
            <LibraryProject
              town={town}
              busy={busy}
              actionNote={actionNote}
              onAction={onLibraryAction}
              onGoReading={onGoReading}
              replaying={replaying}
            />
          </>
        )}
        {page === "help" && (
          <>
            <section>
              <h3>Start a day</h3>
              <p>
                Walk west from the plaza to Hobbs Cafe and talk to Kevin. Or explore the library,
                grocery, park and noticeboard. You can ask questions, take work, decline or walk on.
              </p>
              <p>
                Northern wants to share a favorite first page with his neighbors. Help find the
                library record he needs, then choose a small outdoor reading or a later gathering at
                the library. Read the project to choose a paid contribution or decline it.
              </p>
              <button className="btn" type="button" onClick={onLibrary}>
                Library project
              </button>
            </section>
            <section>
              <h3>Move and talk</h3>
              <p>
                Use WASD or arrow keys to walk. On a phone, hold a direction on the map. Go
                somewhere offers destination buttons and single-step directions. Press Enter beside
                a resident, click their sprite, or use Talk nearby.
              </p>
              <p>
                The clock starts paused. You can walk while paused. Press 1× or 4× to move town
                time; Hour skips forward. Pause gives you time to read. A direction stops a
                destination walk.
              </p>
            </section>
            <section>
              <h3>Your choices</h3>
              <p>
                Read the terms in Choices before accepting bread, work or payment. Conversation
                alone cannot move your money or commit your time. Journal keeps agreements, recorded
                events and tabs; Inventory keeps carried items. A loaf can be eaten once and its tab
                is paid separately.
              </p>
            </section>
            <section>
              <h3>Dialogue & privacy</h3>
              <label className="tool-option">
                <input
                  type="checkbox"
                  checked={localOnly}
                  onChange={(event) => onLocalOnly(event.target.checked)}
                />{" "}
                Use local dialogue only
              </label>
              <p>
                Local dialogue works without a provider and sends no AI requests, including
                residents’ background conversations. It uses authored responses, so open-ended
                subjects are limited.
              </p>
              <p>
                With AI enabled, your message, relevant memories, recent dialogue and resident
                profiles are sent to the game’s configured AI service to generate a reply. Replies
                can be mistaken. Recorded events and explicit choices determine what actually
                happened.
              </p>
              {preferenceNote && <p role="status">{preferenceNote}</p>}
            </section>
            <section>
              <h3>Your saved town</h3>
              <p>
                The town saves in this browser. Download town keeps a portable backup; Import lets
                you restore the same people or create a separate town with copied histories. Both
                replace this browser’s current town after keeping a recovery copy. Downloads include
                conversation history and private resident notes. Keep backups somewhere private.
                There is no account-based cross-device sync yet.
              </p>
            </section>
            {backups.length > 0 && (
              <section>
                <h3>Preserved browser copies</h3>
                <p>
                  These copies were kept when a town was replaced, permanent identities were added,
                  or another tab changed it. Download a copy before importing it. No copy is removed
                  here.
                </p>
                <ul>
                  {backups.map((backup, index) => (
                    <li key={backup.key}>
                      <button className="btn" type="button" onClick={() => onBackup(backup)}>
                        Download {backup.key.includes(":conflict:") ? "conflicting" : "previous"}{" "}
                        town {index + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <details>
              <summary>Developer tools</summary>
              <label className="tool-option">
                <input
                  type="checkbox"
                  checked={inspectorEnabled}
                  onChange={(event) => onInspector(event.target.checked)}
                />{" "}
                Show resident inspector
              </label>
              <p>
                Shows private simulation notes and can spoil personal stories. This is outside
                ordinary play.
              </p>
            </details>
            <p className="text-muted">Build {GAME_BUILD_ID}</p>
          </>
        )}
        {page === "journal" && (
          <>
            <p>
              Day {town.day}, {formatClock(town.minute)} · {player.money} on you
            </p>
            <section>
              <h3>Agreements</h3>
              {agreements.length ? (
                <ul>
                  {agreements.map((p) => (
                    <li key={p.id}>{p.text}</li>
                  ))}
                </ul>
              ) : (
                <p>No open work or project agreements.</p>
              )}
            </section>
            {!funded && shift && (
              <section>
                <h3>Today’s work</h3>
                <p>{Math.round(player.shiftHours * 60)} of 180 game minutes recorded.</p>
                <progress
                  aria-label="Today's recorded shift attendance"
                  value={Math.min(180, Math.round(player.shiftHours * 60))}
                  max={180}
                />
                <p>
                  {wageReceipt
                    ? wageReceipt.text
                    : "No verified wage receipt for today yet. Read your agreement for the payment terms."}
                </p>
              </section>
            )}
            {funded && (
              <section>
                <h3>Funded work & payment</h3>
                {funded.agreements.length === 0 && funded.payables.length === 0 && (
                  <p>No funded work accepted yet.</p>
                )}
                <ul>
                  {funded.agreements.map((agreement) => (
                    <li key={agreement.id}>
                      <p>
                        {agreement.task} · {agreement.status}
                      </p>
                      <p>
                        {agreement.fee} agreed ·{" "}
                        {funded.holds.find((hold) => hold.agreementId === agreement.id)
                          ?.remaining ?? 0}{" "}
                        reserved
                      </p>
                      {agreement.kind === "cafe-shift" && (
                        <>
                          <p>
                            {agreement.eligibleMinutes} of {agreement.requiredMinutes} game minutes
                            recorded.
                          </p>
                          <progress
                            aria-label="Recorded cafe attendance"
                            value={agreement.eligibleMinutes}
                            max={agreement.requiredMinutes}
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <ul>
                  {funded.payables.map((payable) => (
                    <li key={payable.id}>
                      {payable.amount}{" "}
                      {payable.status === "settled" ? "paid" : "earned and still payable"}
                      {payable.reason ? ` · ${payable.reason}` : ""}
                    </li>
                  ))}
                </ul>
                {funded.receipts.length > 0 && (
                  <>
                    <h3>Work receipts</h3>
                    <ul>
                      {funded.receipts
                        .slice(-6)
                        .reverse()
                        .map((receipt) => (
                          <li key={receipt.id}>
                            Day {receipt.at.day}, {formatClock(receipt.at.minute)} ·{" "}
                            {receipt.report}
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </section>
            )}
            <section>
              <h3>Tabs & favors</h3>
              {debts.length ? (
                <ul>
                  {debts.map((f) => (
                    <li key={f.id}>
                      {f.status === "owed" ? "Still owed" : f.status}: {f.text} · {f.amount} ·{" "}
                      {agentById(town, f.from).name} to {agentById(town, f.to).name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No tabs or favors involving you.</p>
              )}
            </section>
            <section>
              <h3>Recent recorded events</h3>
              {events.length ? (
                <ul className="tool-events">
                  {events.map((m) => (
                    <li key={m.id}>
                      <p className="text-muted">
                        Day {m.day}, {formatClock(m.minute)}
                      </p>
                      <p>{m.text}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No recorded events yet. Conversations stay in each resident’s What you heard
                  panel.
                </p>
              )}
            </section>
          </>
        )}
        {page === "inventory" && (
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
            <section className="inventory-summary">
              <h3>
                {carried.length
                  ? "Baba’s loaf"
                  : manuscript
                    ? manuscript.title
                    : "Your bag is empty"}
              </h3>
              <p>
                {carried.length
                  ? `You carry ${carried.length} ${carried.length === 1 ? "loaf" : "loaves"}. Choose how to use it below.`
                  : manuscript
                    ? `You carry the shared manuscript: ${manuscript.title}.`
                    : "Accepted items appear here. You can get a loaf from Baba at the grocery."}
              </p>
              <p className="text-muted">
                Eating or sharing uses one whole loaf. Any unpaid tab stays open; Journal keeps the
                payment record.
              </p>
            </section>
            {carried.length > 0 && (
              <section>
                <h3>Use your loaf</h3>
                <p>
                  You can eat it now. After Northern completes a library test, a nearby Baba or
                  Northern can accept a shared meal; read their acceptance below before choosing.
                </p>
                <ActionCards actions={inventoryActions} busy={busy} onAction={onAction} />
              </section>
            )}
            <ManuscriptTools town={town} controls={manuscriptControls} />
          </>
        )}
        {page === "map" && (
          <>
            <p aria-live="polite">
              You are in {placeTitle(zoneAt(player.tile.x, player.tile.y))}, tile {player.tile.x},{" "}
              {player.tile.y}.
            </p>
            <section>
              <h3>Destinations</h3>
              <p>Walk along a clear route. You can travel while town time is paused.</p>
              {reading?.gathering && reading.scene.length === 0 && (
                <div className="library-gathering">
                  <p>
                    {reading.gathering.label} · {placeTitle(reading.gathering.place)}
                  </p>
                  <p>
                    <ReadingStatus status={reading.gathering.status} />
                  </p>
                  <button className="btn" type="button" onClick={onGoReading} disabled={replaying}>
                    Go to the reading
                  </button>
                </div>
              )}
              <div className="tool-destinations">
                {PLACE_IDS.filter((place) => place !== "street").map((place) => (
                  <button
                    className="btn"
                    key={place}
                    type="button"
                    onClick={() => onGo(place)}
                    disabled={replaying}
                  >
                    {placeTitle(place)}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3>Move one tile</h3>
              <div className="tool-directions">
                {directions.map((d) => (
                  <button
                    className="btn"
                    type="button"
                    key={d.code}
                    onClick={() => onStep(d.code)}
                    disabled={replaying}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p>Blocked tiles do not move you. Your location updates above.</p>
            </section>
            <section>
              <h3>People nearby</h3>
              <p>
                Close this panel and use Talk nearby or press Enter to speak. Residents keep their
                own schedules.
              </p>
            </section>
          </>
        )}
      </div>
    </section>
  );
}
