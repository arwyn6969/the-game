import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import {
  DEFAULT_PERSONAL_MODEL,
  validatePersonalModelSettings,
  type PersonalModelSettings,
} from "@/lib/personal-model";

const fieldStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  marginBlock: "0.35rem 0.8rem",
  padding: "0.5rem",
  border: "1px solid var(--color-line)",
  borderRadius: "0.25rem",
  background: "var(--color-raised)",
  color: "var(--color-fg)",
  font: "inherit",
};

const SOURCE_LABELS: Record<PersonalModelSettings["mode"], string> = {
  hosted: "Game’s hosted AI",
  "api-key": "Your API key",
  local: "Your local model",
};

export function ModelSettings({
  settings,
  busy,
  onApply,
  note,
}: {
  settings: PersonalModelSettings;
  busy: boolean;
  onApply: (settings: PersonalModelSettings) => void;
  note?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(settings);
    setError("");
  }, [settings]);

  function changeMode(mode: PersonalModelSettings["mode"]) {
    setError("");
    setDraft(
      mode === settings.mode
        ? settings
        : {
            ...DEFAULT_PERSONAL_MODEL,
            mode,
            baseUrl: mode === "local" ? "http://127.0.0.1:11434/v1" : "https://api.openai.com/v1",
            model: "",
            apiKey: "",
          },
    );
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    try {
      const next = validatePersonalModelSettings(draft);
      setError("");
      onApply(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check your AI source settings.");
    }
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>AI source</h3>
      <p>Selected: {SOURCE_LABELS[settings.mode]}.</p>
      <form onSubmit={apply}>
        <fieldset disabled={busy} style={{ minWidth: 0 }}>
          <label htmlFor={`${id}-source`}>Use AI from</label>
          <select
            id={`${id}-source`}
            value={draft.mode}
            onChange={(event) => changeMode(event.target.value as PersonalModelSettings["mode"])}
            style={fieldStyle}
          >
            <option value="hosted">Game’s hosted AI</option>
            <option value="api-key">My own API key</option>
            <option value="local">My local model</option>
          </select>
          {draft.mode !== "hosted" && (
            <>
              <label htmlFor={`${id}-url`}>API base URL</label>
              <input
                id={`${id}-url`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={draft.baseUrl}
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                aria-describedby={`${id}-endpoint-note`}
                style={fieldStyle}
              />
              <p id={`${id}-endpoint-note`}>
                {draft.mode === "local"
                  ? "Use an OpenAI-compatible server on this device. Ollama commonly uses http://127.0.0.1:11434/v1; LM Studio uses http://127.0.0.1:1234/v1. Start its server, load a model and allow this game’s browser origin. Your browser may ask for local-network access."
                  : "Use your provider’s HTTPS OpenAI-compatible base URL, ending in /v1 when required. The provider must allow requests from this game’s browser origin."}
              </p>
              <label htmlFor={`${id}-model`}>Model name</label>
              <input
                id={`${id}-model`}
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={200}
                value={draft.model}
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                style={fieldStyle}
              />
              <label htmlFor={`${id}-key`}>
                API key{draft.mode === "local" ? " (optional)" : ""}
              </label>
              <input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required={draft.mode === "api-key"}
                value={draft.apiKey}
                onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                aria-describedby={`${id}-key-note`}
                style={fieldStyle}
              />
              <p id={`${id}-key-note`}>
                Your key stays in this tab’s memory. Re-enter it after reload. It is sent directly
                to your selected endpoint, never included in a town backup or saved by the game.
              </p>
              <p>
                {draft.mode === "api-key"
                  ? "Your provider bills your account under its own limits. This source handles replies and residents’ background AI while town time runs; the game’s hosted free allowance does not cover these requests."
                  : "Messages and relevant resident context go directly to the local server on this device, including residents’ background AI while town time runs."}
              </p>
              <p>
                The model must return the game’s requested JSON. Requests do not switch to hosted AI
                if this source fails.
              </p>
            </>
          )}
          {draft.mode === "hosted" && <p>The game’s existing AI service and allowance apply.</p>}
          {error && <p role="alert">{error}</p>}
          <button type="submit" className="btn">
            Save AI source
          </button>
        </fieldset>
      </form>
      {busy && (
        <p role="status">Wait for the current AI request to finish before changing source.</p>
      )}
      <p>
        Saving settings makes no model request. “Use local dialogue only” pauses every AI source.
      </p>
      {note && <p role="status">{note}</p>}
    </section>
  );
}
