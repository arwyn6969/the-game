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
  return (
    <ul className="tool-actions">
      {actions.map((action) => (
        <li key={action.id}>
          <p>{action.terms}</p>
          <button
            className="btn"
            type="button"
            disabled={busy || Boolean(action.disabledReason)}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </button>
          {action.disabledReason && <p className="text-muted">{action.disabledReason}</p>}
        </li>
      ))}
    </ul>
  );
}
