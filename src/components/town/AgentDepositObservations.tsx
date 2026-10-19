import { useEffect, useId, useRef, useState } from "react";
import {
  getAgentReceivingObservations,
  refreshAgentReceivingObservations,
} from "@/lib/agent-wallets.functions";
import type {
  KnownObservation,
  ObservationProtocol,
  ObservationSource,
  ReceivingObservations,
} from "@/lib/agent-wallets/observations";
import type { RegistryErrorCode, RegistryResult } from "@/lib/agent-wallets/types";

type Props = {
  expectedOwnerRef: string;
  registrationId: string;
  profileId: string;
  revision: number;
  onOwnerFailure: (code: RegistryErrorCode, message: string) => void;
};
type Snapshot = { scope: string; value: ReceivingObservations; stale: boolean };
type Request = { serial: number; scope: string };

class ObservationError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function valueOf<T>(result: RegistryResult<T>): T {
  if (!result.ok) throw new ObservationError(result.error, result.message);
  return result.value;
}

function when(value: number | null): string {
  return value !== null && Number.isFinite(value)
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Not checked";
}

function status(source: ObservationSource | undefined): string {
  switch (source?.status) {
    case "ready":
      return "Observed";
    case "partial":
      return "Partial observation";
    case "unavailable":
      return "Current status unknown · source unavailable";
    default:
      return "Not checked";
  }
}

function EventRow({ event, stale }: { event: KnownObservation; stale: boolean }) {
  const label = {
    pending: "Pending",
    confirmed: "Confirmed · observed block inclusion",
    reorged: "Reorged · previous inclusion no longer matches",
    unknown: "Current status unknown",
  }[event.state];
  return (
    <li className="mind-actions" style={{ overflowWrap: "anywhere" }}>
      <strong>
        {event.protocol === "bitcoin"
          ? `${event.quantity} satoshis`
          : `${event.asset} · ${event.quantity} raw units`}
      </strong>
      <p className="mt-1 text-sm">
        {stale ? "Previous observation: " : "Last observed state: "}
        {label}
      </p>
      {event.wasReorged && (
        <p className="mt-1 text-sm">This event has previously been reorganized.</p>
      )}
      {event.protocol === "counterparty" && (
        <p className="mt-1 text-sm text-muted">
          Asset classification unknown; this send has not been identified as a Bitcoin Stamp.
        </p>
      )}
      <p className="mt-1 text-sm text-muted">Last observed {when(event.lastObservedAt)}</p>
      <details className="mt-2 text-sm">
        <summary>Transaction evidence</summary>
        <p className="mt-1">Transaction {event.txid}</p>
        <p>
          {event.protocol === "bitcoin" ? "Output" : "Protocol event"} {event.eventIndex}
        </p>
        <p>Destination {event.destination}</p>
        {event.source && <p>Source {event.source}</p>}
        {event.block ? (
          <p>
            Recorded block {event.block.height}: {event.block.hash}
          </p>
        ) : (
          <p>No block inclusion recorded.</p>
        )}
        <p>First observed {when(event.firstObservedAt)}</p>
      </details>
    </li>
  );
}

function SourceHistory({
  protocol,
  value,
  stale,
}: {
  protocol: ObservationProtocol;
  value: ReceivingObservations;
  stale: boolean;
}) {
  const source = value.sources.find((item) => item.protocol === protocol);
  const events = value.events.filter((event) => event.protocol === protocol);
  const title = protocol === "bitcoin" ? "Bitcoin outputs" : "Counterparty direct sends";
  const uncertain =
    stale || source?.status === "unavailable" || source?.status === "not-checked" || !source;
  return (
    <section className="mt-4" aria-label={title}>
      <h4>{title}</h4>
      <p className="mt-1 text-sm">{status(source)}</p>
      {source && (
        <>
          <p className="mt-1 text-sm text-muted">
            Last successful observation: {when(source.observedAt)}. Last attempt:{" "}
            {when(source.attemptedAt)}.
          </p>
          {source.anchor && (
            <p className="mt-1 text-sm text-muted">
              Chain anchor: block {source.anchor.height}. Indexed through{" "}
              {source.indexedHeight ?? "unknown"}.
            </p>
          )}
          <p className="mt-1 text-sm text-muted">
            History coverage: {source.historyComplete ? "complete" : "incomplete"}. Pending
            transaction coverage: {source.mempoolComplete ? "complete" : "incomplete"}.
          </p>
        </>
      )}
      {events.length ? (
        <ul className="mt-3 space-y-2" style={{ listStyle: "none", padding: 0 }}>
          {events.map((event) => (
            <EventRow key={`${event.protocol}:${event.eventId}`} event={event} stale={uncertain} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm">
          {uncertain
            ? "No current observations are available. This does not mean zero deposits."
            : "No incoming events were observed in this scan. Incomplete coverage can omit events."}
        </p>
      )}
    </section>
  );
}

/** Explicit, private reads only. Observations never change Town or authorize a transaction. */
export function AgentDepositObservations({
  expectedOwnerRef,
  registrationId,
  profileId,
  revision,
  onOwnerFailure,
}: Props) {
  const addressId = useId();
  const scope = `${expectedOwnerRef}:${registrationId}:${profileId}:${revision}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const ownerFailure = useRef(onOwnerFailure);
  ownerFailure.current = onOwnerFailure;
  const mounted = useRef(false);
  const serial = useRef(0);
  const active = useRef<Request | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const [notice, setNotice] = useState<{ scope: string; error: boolean; text: string } | null>(
    null,
  );
  const view = snapshot?.scope === scope ? snapshot : null;
  const busy = request?.scope === scope;
  const note = notice?.scope === scope ? notice : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current = null;
    };
  }, []);

  function current(operation: Request): boolean {
    return (
      mounted.current &&
      operation.scope === currentScope.current &&
      operation.serial === serial.current
    );
  }

  async function load(refresh: boolean, address?: string, addressPage?: number): Promise<void> {
    if (active.current?.scope === scope) return;
    const operation = { serial: ++serial.current, scope };
    active.current = operation;
    setRequest(operation);
    setNotice({
      scope,
      error: false,
      text: refresh
        ? "Checking private chain observations…"
        : "Loading recorded private observations…",
    });
    try {
      const args = {
        data: {
          expectedOwnerRef,
          input: {
            registrationId,
            profileId,
            revision,
            ...(address ? { address } : {}),
            ...(addressPage ? { addressPage } : {}),
          },
        },
      };
      const next = valueOf<ReceivingObservations>(
        await (refresh
          ? refreshAgentReceivingObservations(args)
          : getAgentReceivingObservations(args)),
      );
      if (!current(operation)) return;
      if (next.ownerRef !== expectedOwnerRef)
        throw new ObservationError(
          "owner-mismatch",
          "Your account changed. Refresh owner status before viewing private observations.",
        );
      if (
        next.registrationId !== registrationId ||
        next.profileId !== profileId ||
        next.revision !== revision ||
        next.fundingPublished !== false ||
        (address !== undefined && next.address !== address) ||
        (next.address !== null && !next.addresses.some((item) => item.address === next.address)) ||
        next.events.some((event) => event.destination !== next.address)
      )
        throw new ObservationError(
          "stale",
          "This profile changed while loading observations. Refresh owner status to check its latest record.",
        );
      setSnapshot({ scope, value: next, stale: false });
      setNotice({
        scope,
        error: false,
        text: refresh
          ? "Observation attempt complete. Check each source's coverage and last successful observation."
          : "Recorded observations loaded. Refresh chain observations to request a new scan.",
      });
    } catch (cause) {
      if (!current(operation)) return;
      setSnapshot((previous) =>
        previous?.scope === scope ? { ...previous, stale: true } : previous,
      );
      const message =
        cause instanceof ObservationError
          ? cause.message.slice(0, 400)
          : "Observations could not be reached. Current status is unknown; earlier observations are retained.";
      setNotice({ scope, error: true, text: message });
      if (
        cause instanceof ObservationError &&
        ["owner-mismatch", "unauthenticated", "stale"].includes(cause.code)
      )
        ownerFailure.current(cause.code, message);
    } finally {
      if (current(operation)) {
        active.current = null;
        setRequest(null);
      }
    }
  }

  function cancel(): void {
    serial.current++;
    active.current = null;
    setRequest(null);
    setSnapshot((previous) =>
      previous?.scope === scope ? { ...previous, stale: true } : previous,
    );
    setNotice({
      scope,
      error: false,
      text: "Stopped waiting. A submitted scan may still finish; load observations to check its stored result.",
    });
  }

  return (
    <section className="mt-5" aria-label="Private chain observations" aria-busy={busy}>
      <h3>Deposit observations</h3>
      <p className="mt-2 text-sm">
        Private records of incoming Bitcoin outputs and Counterparty direct sends. These records do
        not become town coins, a wallet balance or spendable transaction-fee funds.
      </p>
      <p className="mt-2 text-sm text-muted">
        Confirmed means observed block inclusion, not final settlement. Pending and reorganized
        records can change. Funding remains unpublished.
      </p>
      <p className="mt-2 text-sm text-muted">
        Refreshing sends the selected public address to Blockstream and Counterparty indexers.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() =>
            void load(false, view?.value.address ?? undefined, view?.value.addressPage)
          }
        >
          Load observations
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy || !view?.value.address}
          onClick={() => void load(true, view?.value.address ?? undefined, view?.value.addressPage)}
        >
          Refresh chain observations
        </button>
        {busy && (
          <button className="btn" type="button" onClick={cancel}>
            Cancel observation request
          </button>
        )}
      </div>
      <p className="mt-2 text-sm" role={note?.error ? "alert" : "status"} aria-live="polite">
        {note?.text ??
          "Load saved observations to choose a current or former verified address. Nothing is fetched until you ask."}
      </p>
      {view && (
        <>
          {view.stale && (
            <p className="mt-2 text-sm">Previous observations · current status unknown.</p>
          )}
          {view.value.addresses.length > 0 ? (
            <>
              <label className="mt-3 block text-sm" htmlFor={addressId}>
                Observed address
              </label>
              <select
                id={addressId}
                className="field mt-1 w-full"
                value={view.value.address ?? ""}
                disabled={busy}
                onChange={(event) => void load(false, event.target.value, view.value.addressPage)}
              >
                {view.value.addresses.map((address) => (
                  <option key={address.address} value={address.address}>
                    {address.current ? "Latest linked" : "Former / retired"} · {address.address}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-muted">
                Former addresses remain reserved to this resident. These are private records, not
                payment instructions.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm">No verified addresses are recorded for this profile.</p>
          )}
          {view.value.addressPages > 1 && (
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Observed address pages"
            >
              <button
                className="btn"
                type="button"
                disabled={busy || view.value.addressPage <= 1}
                onClick={() => void load(false, undefined, view.value.addressPage - 1)}
              >
                Previous address page
              </button>
              <span className="text-sm">
                Address page {view.value.addressPage} of {view.value.addressPages}
              </span>
              <button
                className="btn"
                type="button"
                disabled={busy || view.value.addressPage >= view.value.addressPages}
                onClick={() => void load(false, undefined, view.value.addressPage + 1)}
              >
                Next address page
              </button>
            </div>
          )}
          {view.value.address && (
            <>
              <SourceHistory protocol="bitcoin" value={view.value} stale={view.stale} />
              <SourceHistory protocol="counterparty" value={view.value} stale={view.stale} />
              {view.value.hasMoreEvents && (
                <p className="mt-3 text-sm">
                  This view shows up to 100 stored events. Older events are omitted.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
