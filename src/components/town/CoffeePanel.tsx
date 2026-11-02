import { useEffect, useId, useRef } from "react";

export type CoffeeChoice = {
  id: string;
  label: string;
  disabledReason?: string | null;
  run: () => void;
};

export type CoffeeControls = {
  enabled: boolean;
  status: string;
  note: string;
  enable: CoffeeChoice | null;
  buy: CoffeeChoice | null;
  laterBuy: CoffeeChoice | null;
  staff: CoffeeChoice | null;
  staffNotice: string | null;
  work: {
    phase: string;
    progress: string;
    active: boolean;
    notice: string | null;
    actions: CoffeeChoice[];
  } | null;
  orders: { id: string; title: string; description: string; actions: CoffeeChoice[] }[];
  cups: { id: string; title: string; description: string; drink: CoffeeChoice }[];
  onCounter: () => void;
  onKevin: () => void;
  travelDisabled: boolean;
};

function Choice({ choice }: { choice: CoffeeChoice }) {
  const reasonId = useId();
  return (
    <div className="tool-next-step">
      <button
        className="btn"
        type="button"
        disabled={Boolean(choice.disabledReason)}
        aria-describedby={choice.disabledReason ? reasonId : undefined}
        onClick={choice.run}
      >
        {choice.label}
      </button>
      {choice.disabledReason && (
        <p id={reasonId} className="text-muted">
          {choice.disabledReason}
        </p>
      )}
    </div>
  );
}

export function CoffeePanel({
  controls,
  inventoryOnly = false,
}: {
  controls: CoffeeControls;
  inventoryOnly?: boolean;
}) {
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (controls.note && document.activeElement === document.body) feedback.current?.focus();
  }, [controls.note, controls.cups.length]);

  if (inventoryOnly && !controls.enabled && controls.cups.length === 0) return null;

  return (
    <section aria-label={inventoryOnly ? "Your coffee" : "Hobbs café service"}>
      <h3>{inventoryOnly ? "Your coffee" : "Hobbs café"}</h3>
      <p ref={feedback} role="status" aria-live="polite" tabIndex={-1} data-tool-feedback>
        {controls.note}
      </p>
      {!inventoryOnly && (
        <>
          <p>{controls.status}</p>
          {!controls.enabled && (
            <p>
              Try seven game days of café service in this town. Coffee costs 2 coins. Completed
              sales support funded staff shifts; no new money is added. Starting the trial does not
              buy coffee or accept work for you.
            </p>
          )}
          {controls.enable && <Choice choice={controls.enable} />}
          <button
            className="btn"
            type="button"
            disabled={controls.travelDisabled}
            onClick={controls.onCounter}
          >
            Walk to the coffee counter
          </button>
          <section>
            <h4>Working for Kevin</h4>
            <p>
              Accept a funded café shift through Kevin’s Choices: 5 coins for 180 eligible game
              minutes, normally 16:00–19:00. Quiet periods still count. Then choose Start serving
              once to let your character walk, brew and place orders automatically.
            </p>
            <p>
              You can pause immediately or finish the current coffee first. Moving yourself pauses
              the shift. Partial minutes remain; a new shift needs a new agreement. Service advances
              with town time, so a paused clock or a pending AI reply also pauses progress.
            </p>
            <button
              className="btn"
              type="button"
              disabled={controls.travelDisabled}
              onClick={controls.onKevin}
            >
              Find Kevin
            </button>
            {controls.work && (
              <>
                <p>{controls.work.phase}</p>
                <p>{controls.work.progress}</p>
                {controls.work.notice && <p>{controls.work.notice}</p>}
                {controls.work.actions.map((choice) => (
                  <Choice key={choice.id} choice={choice} />
                ))}
              </>
            )}
            {controls.staff && (
              <>
                <p>
                  If you want to be a customer, ask Kevin whether another resident can take a funded
                  shift. They can decline; available cash and existing commitments matter.
                </p>
                {controls.staffNotice && <p>{controls.staffNotice}</p>}
                <Choice choice={controls.staff} />
              </>
            )}
          </section>
          {controls.enabled && (
            <section>
              <h4>Buy a coffee</h4>
              <p>
                Pay at the counter, then collect your own cup when it is ready. You may leave while
                it is prepared. The full 2 coins are refundable until ready, including after work
                has begun. A ready cup belongs to you and has no automatic expiry.
              </p>
              <p>
                If the trial closes without funded service for an unfinished order, its full price
                is refunded. A full purse keeps that refund pending. Coffee already ready stays
                yours.
              </p>
              {controls.buy && <Choice choice={controls.buy} />}
              {controls.laterBuy && (
                <>
                  <p>
                    This order may need a later funded service window. Choose later pickup only if
                    you accept that wait; you can cancel before it is ready.
                  </p>
                  <Choice choice={controls.laterBuy} />
                </>
              )}
            </section>
          )}
          {controls.orders.length > 0 && (
            <section>
              <h4>Your tickets</h4>
              {controls.orders.map((order) => (
                <article key={order.id}>
                  <h5>{order.title}</h5>
                  <p>{order.description}</p>
                  {order.actions.map((choice) => (
                    <Choice key={choice.id} choice={choice} />
                  ))}
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {controls.cups.length > 0 ? (
        <section>
          {!inventoryOnly && <h4>Cups you carry</h4>}
          <p>You may keep a cup or drink it once. Drinking does not change anyone’s wages.</p>
          {controls.cups.map((cup) => (
            <article key={cup.id}>
              <h5>{cup.title}</h5>
              <p>{cup.description}</p>
              <Choice choice={cup.drink} />
            </article>
          ))}
        </section>
      ) : (
        inventoryOnly && <p>You are not carrying a coffee. Ready cups wait at the café counter.</p>
      )}
    </section>
  );
}
