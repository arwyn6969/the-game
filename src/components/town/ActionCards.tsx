import { useId } from "react";
import type { PlayerAction } from "@/game/effects";

export function ActionCards({
  actions,
  busy,
  onAction,
}: {
  actions: PlayerAction[];
  busy: boolean;
  onAction: (id: string) => void;
}) {
  const descriptionId = useId();
  return (
    <ul className="tool-actions">
      {actions.map((action, index) => (
        <li key={action.label}>
          <p id={`${descriptionId}-terms-${index}`}>{action.terms}</p>
          <button
            className="btn"
            type="button"
            disabled={busy || Boolean(action.disabledReason)}
            aria-describedby={`${descriptionId}-terms-${index}${action.disabledReason ? ` ${descriptionId}-reason-${index}` : ""}`}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </button>
          {action.disabledReason && (
            <p className="tool-action-reason" id={`${descriptionId}-reason-${index}`}>
              {action.disabledReason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
