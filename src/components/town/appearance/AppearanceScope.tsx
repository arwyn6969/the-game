import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { APPEARANCE_KEY, initialAppearance, SKINS, type SkinId } from "./skins";

/** Presentation state deliberately surrounds one stable, unkeyed game. */
export function AppearanceScope({ children }: { children: ReactNode }) {
  const [initial] = useState(initialAppearance);
  const [skin, setSkin] = useState<SkinId>(initial.skin);
  const scopeRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const selected = SKINS.find((candidate) => candidate.id === skin)!;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const scope = scopeRef.current;
    if (!toolbar || !scope) return;
    const measure = () => {
      scope.style.setProperty("--appearance-bar-height", `${toolbar.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [initial.preview]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    // Sheets follow the real HUD boundary, including wrapping and text zoom.
    // Watching child additions covers the transition from name entry to town.
    let hud: Element | null = null;
    const measure = () => {
      if (!hud) return;
      const minimum = (toolbarRef.current?.getBoundingClientRect().bottom ?? 0) + 8;
      const maximum = Math.max(
        minimum,
        Math.min(window.innerHeight * 0.3, window.innerHeight - 240),
      );
      const top = Math.min(maximum, Math.max(minimum, hud.getBoundingClientRect().bottom + 6));
      scope.style.setProperty("--ui-sheet-top", `${Math.round(top)}px`);
    };
    const resize = new ResizeObserver(measure);
    const attach = () => {
      const next = scope.querySelector(".town > .hud");
      if (next === hud) return;
      if (hud) resize.unobserve(hud);
      hud = next;
      if (hud) resize.observe(hud);
      measure();
    };
    const changes = new MutationObserver(attach);
    changes.observe(scope, { childList: true, subtree: true });
    attach();
    window.addEventListener("resize", measure);
    scope.addEventListener("scroll", measure, true);
    return () => {
      resize.disconnect();
      changes.disconnect();
      window.removeEventListener("resize", measure);
      scope.removeEventListener("scroll", measure, true);
    };
  }, []);

  const choose = useCallback((next: SkinId) => {
    setSkin(next);
    try {
      localStorage.setItem(APPEARANCE_KEY, next);
    } catch {
      // Never couple UI storage failure to saving a town.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("skin", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <div
      ref={scopeRef}
      className="game-appearance"
      data-ui-skin={skin}
      data-preview={initial.preview}
    >
      {initial.preview && (
        <header
          ref={toolbarRef}
          className="appearance-toolbar"
          aria-label="Compare game interfaces"
        >
          <div className="appearance-intro">
            <span className="appearance-eyebrow">CHOOSE YOUR INTERFACE</span>
            <p>{selected.description}</p>
          </div>
          <div className="appearance-options" role="group" aria-label="Interface layouts">
            {SKINS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={skin === candidate.id}
                onClick={() => choose(candidate.id)}
                className="appearance-option"
                data-motif={candidate.motif}
              >
                <span className="appearance-miniature" aria-hidden="true">
                  <i />
                  <b />
                </span>
                <span>{candidate.name}</span>
              </button>
            ))}
          </div>
        </header>
      )}
      <div className="appearance-stage">{children}</div>
    </div>
  );
}
