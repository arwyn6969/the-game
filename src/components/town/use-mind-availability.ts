import { useCallback, useEffect, useRef, useState } from "react";
import { mindAvailability } from "@/lib/mind.functions";
import { personalModelReady, type PersonalModelSettings } from "@/lib/personal-model";

/** Recheck configuration/connectivity only. Never replay a player's AI request. */
export function useMindAvailability(
  localOnly: boolean,
  replyFailed: boolean,
  personalModel?: PersonalModelSettings,
) {
  const onlineRef = useRef(false);
  const actionsAvailableRef = useRef(false);
  const retryingRef = useRef(replyFailed);
  retryingRef.current = replyFailed;
  const [online, setOnline] = useState(false);
  const [actionsAvailable, setActionsAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkRef = useRef<() => Promise<boolean>>(async () => false);
  const check = useCallback(() => checkRef.current(), []);

  useEffect(() => {
    let alive = true;
    let inFlight: Promise<boolean> | null = null;
    let timeout: number | undefined;
    const update = (value: boolean, actions = false) => {
      if (!alive) return;
      onlineRef.current = value;
      actionsAvailableRef.current = value && actions;
      setOnline(value);
      setActionsAvailable(value && actions);
      setChecked(true);
    };
    const probe = (): Promise<boolean> => {
      if (inFlight) return inFlight;
      if (!alive || localOnly || document.visibilityState !== "visible")
        return Promise.resolve(false);
      // Personal routes check configuration only, without contacting the hosted
      // service or spending a request. Loopback works without internet access.
      if (personalModel && personalModel.mode !== "hosted") {
        const ready =
          personalModelReady(personalModel) && (personalModel.mode === "local" || navigator.onLine);
        update(ready, ready);
        setChecking(false);
        return Promise.resolve(ready);
      }
      if (!navigator.onLine) {
        update(false);
        return Promise.resolve(false);
      }
      setChecking(true);
      inFlight = (async () => {
        try {
          const result = await Promise.race([
            Promise.resolve().then(() => mindAvailability()),
            new Promise<never>((_, reject) => {
              timeout = window.setTimeout(() => reject(new Error("timeout")), 8_000);
            }),
          ]);
          const ready = result.online && navigator.onLine;
          update(ready, "actions" in result && result.actions === true);
          return alive && ready;
        } catch {
          update(false);
          return false;
        } finally {
          window.clearTimeout(timeout);
          inFlight = null;
          if (alive) setChecking(false);
        }
      })();
      return inFlight;
    };
    checkRef.current = probe;
    const wake = () => void probe();
    const offline = () => {
      if (personalModel?.mode === "local") void probe();
      else update(false);
    };
    const interval = window.setInterval(() => {
      if (!onlineRef.current || retryingRef.current) void probe();
    }, 15_000);
    update(false);
    setChecking(false);
    void probe();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
      checkRef.current = async () => false;
    };
  }, [localOnly, personalModel]);

  return { online, onlineRef, actionsAvailable, actionsAvailableRef, checked, checking, check };
}
