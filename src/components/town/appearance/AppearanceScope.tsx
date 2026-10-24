import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APPEARANCE_KEY, initialAppearance, isSkin, SKINS, type SkinId } from "./skins";

/** Presentation state deliberately surrounds one stable, unkeyed game. */
export function AppearanceScope({ children }: { children: ReactNode }) {
  const [skin, setSkin] = useState<SkinId>(() => initialAppearance().skin);
  const [selectorHost, setSelectorHost] = useState<HTMLElement | null>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLLabelElement>(null);
  const selected = SKINS.find((candidate) => candidate.id === skin)!;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const scope = scopeRef.current;
    if (!toolbar || !scope) return;
    const measure = () => {
      const fallback = toolbar.closest<HTMLElement>(".appearance-fallback");
      scope.style.setProperty("--appearance-bar-height", `${fallback?.offsetHeight ?? 0}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [selectorHost]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    // Sheets follow the real HUD boundary, including wrapping and text zoom.
    // Watching child additions covers the transition from name entry to town.
    let hud: Element | null = null;
    let host: HTMLElement | null = null;
    let navigation: HTMLElement | null = null;
    let residents: HTMLElement | null = null;
    const measure = () => {
      if (!hud) return;
      const navigationBox = navigation?.getBoundingClientRect();
      const residentsBox = residents?.getBoundingClientRect();
      const worldBox = scope.querySelector(".world-frame")?.getBoundingClientRect();
      const topNavigation =
        navigationBox && worldBox && navigationBox.bottom <= worldBox.top
          ? navigationBox.bottom
          : 0;
      const topResidents =
        residentsBox && worldBox && residentsBox.bottom <= worldBox.top ? residentsBox.bottom : 0;
      const minimum =
        Math.max(
          0,
          toolbarRef.current?.getBoundingClientRect().bottom ?? 0,
          topNavigation,
          topResidents,
        ) + 8;
      const maximum = Math.max(
        minimum,
        Math.min(window.innerHeight * 0.3, window.innerHeight - 240),
      );
      const top = Math.min(maximum, Math.max(minimum, hud.getBoundingClientRect().bottom + 6));
      scope.style.setProperty("--ui-sheet-top", `${Math.round(top)}px`);
    };
    const resize = new ResizeObserver(measure);
    const attach = () => {
      const nextHost = scope.querySelector<HTMLElement>(".town > .status-strip");
      if (nextHost !== host) {
        if (host) resize.unobserve(host);
        host = nextHost;
        if (host) resize.observe(host);
        setSelectorHost(host);
      }
      const nextNavigation = scope.querySelector<HTMLElement>(".town > .town-tools");
      if (nextNavigation !== navigation) {
        if (navigation) resize.unobserve(navigation);
        navigation = nextNavigation;
        if (navigation) resize.observe(navigation);
      }
      const nextResidents = scope.querySelector<HTMLElement>(".town > .social-toolbar");
      if (nextResidents !== residents) {
        if (residents) resize.unobserve(residents);
        residents = nextResidents;
        if (residents) resize.observe(residents);
      }
      const next = scope.querySelector(".town > .hud");
      if (next !== hud) {
        if (hud) resize.unobserve(hud);
        hud = next;
        if (hud) resize.observe(hud);
      }
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

  const selector = (
    <label ref={toolbarRef} className="appearance-toolbar" title={`Interface: ${selected.name}`}>
      <span aria-hidden="true">Interface</span>
      <svg aria-hidden="true" viewBox="0 0 12 8" width="10" height="7">
        <path d="m2 2 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <select
        aria-label="Interface"
        value={skin}
        onChange={(event) => {
          if (isSkin(event.currentTarget.value)) choose(event.currentTarget.value);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {SKINS.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div ref={scopeRef} className="game-appearance" data-ui-skin={skin}>
      {selectorHost ? (
        // React ownership remains outside TownApp's focus/dismissal boundary.
        createPortal(selector, selectorHost)
      ) : (
        <header className="appearance-fallback" aria-label="Game interface">
          {selector}
        </header>
      )}
      <div className="appearance-stage">{children}</div>
    </div>
  );
}
