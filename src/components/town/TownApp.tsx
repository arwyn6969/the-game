import { useEffect, useRef, useState } from "react";
import {
  Download,
  Pause,
  Pin,
  Play,
  SkipForward,
  Upload,
  X,
} from "lucide-react";
import type { Agent, AgentId, Face, ThinkJob, Town } from "@/game/types";
import { applyResult, spreadView } from "@/game/effects";
import { agentById } from "@/game/memory";
import { mindAvailability, thinkTown } from "@/lib/mind.functions";
import { offlineResult, prepareRetrievals } from "@/game/offline";
import { beatAt } from "@/game/plan";
import { buildPrompt, parseMind } from "@/game/prompt";
import {
  cameraFor,
  glideOf,
  onBoard,
  paint,
  pickAgent,
  resetGlide,
  syncGlide,
} from "@/game/render";
import { exportTown, loadTown, parseTownFile, saveTown } from "@/game/save";
import { advanceTown, frameAt, stepMinute } from "@/game/sim";
import { formatClock, periodName } from "@/game/text";
import { createTown } from "@/game/town";
import { auditWorld, cell, nearestWalkable, placeTitle, TILE, walkable, zoneAt } from "@/game/world";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      getY: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
    };
    __game?: {
      advanceMinutes: (n: number) => unknown;
      audit: () => string[];
      tile: (x: number, y: number) => { ground: string; zone: string; block: boolean } | null;
      open: (id: string) => void;
    };
  }
}

type Replay = { d: number; m: number };

function previewDay(text: string): number | null {
  try {
    const value = JSON.parse(text) as { day?: unknown };
    return typeof value.day === "number" && Number.isFinite(value.day) ? value.day : null;
  } catch {
    return null;
  }
}

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function faceYaw(face: Face) {
  if (face === "w") return Math.PI;
  if (face === "n") return -Math.PI / 2;
  if (face === "s") return Math.PI / 2;
  return 0;
}

function axis(keys: Set<string>) {
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  if (x && y) y = 0;
  return { x, y };
}

function typingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function TownApp() {
  const boot = useRef<Town | null | undefined>(undefined);
  if (boot.current === undefined) {
    const saved = loadTown();
    const qa = new URLSearchParams(location.search).has("qa");
    boot.current = saved ?? (qa ? createTown("Ada") : null);
  }
  const townRef = useRef<Town | null>(boot.current);
  const keysRef = useRef(new Set<string>());
  const speedRef = useRef<0 | 1 | 4>(townRef.current?.paused ? 0 : 1);
  const onlineRef = useRef(true);
  const replayRef = useRef<Replay | null>(null);
  const pendingRef = useRef(false);
  const hourLock = useRef(false);
  const mounted = useRef(true);
  const runMindRef = useRef<(live: Town, job: ThinkJob) => Promise<void>>(async () => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<"name" | "play">(townRef.current ? "play" : "name");
  const [name, setName] = useState("");
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState(true);
  const [checked, setChecked] = useState(false);
  const [speed, setSpeed] = useState<0 | 1 | 4>(speedRef.current);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [panel, setPanel] = useState<AgentId | null>(null);
  const [pinned, setPinned] = useState(false);
  const [board, setBoard] = useState(false);
  const [thinking, setThinking] = useState("");
  const [hiccup, setHiccup] = useState(false);
  const [importText, setImportText] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState(townRef.current ? !townRef.current.sawHint : true);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  useEffect(() => {
    replayRef.current = replay;
  }, [replay]);

  useEffect(() => {
    let gone = false;
    mindAvailability()
      .then((res) => {
        if (gone) return;
        setOnline(res.online);
        onlineRef.current = res.online;
        setChecked(true);
      })
      .catch(() => {
        if (gone) return;
        setOnline(false);
        onlineRef.current = false;
        setChecked(true);
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hiccup) return;
    const id = window.setTimeout(() => setHiccup(false), 4000);
    return () => window.clearTimeout(id);
  }, [hiccup]);

  runMindRef.current = async (live, job) => {
    if (townRef.current !== live || pendingRef.current) return;
    pendingRef.current = true;
    if (mounted.current) setThinking(job.kind);
    let timed: number | undefined;
    let applied = false;
    try {
      prepareRetrievals(live, job);
      const res = await new Promise<Awaited<ReturnType<typeof thinkTown>>>((resolve, reject) => {
        timed = window.setTimeout(() => reject(new Error("timeout")), 45_000);
        thinkTown({ data: { kind: job.kind, user: buildPrompt(live, job) } }).then(resolve, reject);
      });
      if (townRef.current !== live) return;
      if (!res.ok) throw new Error(res.error);
      if (res.text.length > 20_000) throw new Error("huge");
      const parsed = parseMind(job, res.text);
      try {
        if (parsed) applyResult(live, parsed);
        else applyResult(live, offlineResult(live, job));
        applied = true;
        if (!parsed && mounted.current) setHiccup(true);
      } catch {
        applied = true;
      }
    } catch {
      if (townRef.current === live && !applied) {
        try {
          applyResult(live, offlineResult(live, job));
        } catch {
          /* The clock must resume even if the fallback cannot land. */
        }
        if (mounted.current) setHiccup(true);
      }
    } finally {
      if (timed) window.clearTimeout(timed);
      pendingRef.current = false;
      if (townRef.current === live) saveTown(live);
      if (mounted.current) {
        setThinking("");
        setTick((n) => n + 1);
      }
    }
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (typingTarget(event.target)) return;
      if (!GAME_KEYS.has(event.code)) return;
      event.preventDefault();
      keysRef.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    const clear = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const town = townRef.current;
    if (!town) return;
    resetGlide(town);
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let moveCool = 0;
    let loopLogged = false;
    const view = { w: 800, h: 600 };

    const takeJob = (job: ThinkJob | null) => {
      const live = townRef.current;
      if (!live || !job) return false;
      const minds = onlineRef.current && document.visibilityState === "visible";
      if (minds && !pendingRef.current) {
        void runMindRef.current(live, job);
        return true;
      }
      try {
        applyResult(live, offlineResult(live, job));
      } catch {
        return false;
      }
      return false;
    };

    const stepPlayer = () => {
      const live = townRef.current;
      if (!live || replayRef.current !== null) return;
      const { x, y } = axis(keysRef.current);
      if (!x && !y) {
        moveCool = 0;
        const player = agentById(live, "player");
        const beat = beatAt(player, live.minute);
        if (!player.status.startsWith("walking")) player.status = beat.status;
        return;
      }
      if (moveCool > 0) return;
      const player = agentById(live, "player");
      if (!walkable(player.tile.x, player.tile.y)) player.tile = nearestWalkable(player.tile.x, player.tile.y);
      const nx = player.tile.x + x;
      const ny = player.tile.y + y;
      if (!walkable(nx, ny)) {
        moveCool = 0.16;
        return;
      }
      player.face = x > 0 ? "e" : x < 0 ? "w" : y > 0 ? "s" : "n";
      player.tile = { x: nx, y: ny };
      player.status = `walking ${placeTitle(zoneAt(nx, ny))}`;
      if ((live.guide ?? 0) < 1 && zoneAt(nx, ny) === "cafe") {
        live.guide = 1;
        saveTown(live);
        setTick((n) => n + 1);
      }
      moveCool = 0.16;
      if (replayRef.current !== null) {
        replayRef.current = null;
        setReplay(null);
      }
    };

    const loop = (now: number) => {
      try {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const live = townRef.current;
      const canvas = canvasRef.current;
      if (live && canvas) {
        moveCool = Math.max(0, moveCool - dt);
        stepPlayer();
        if (replayRef.current === null && speedRef.current > 0 && !hourLock.current) {
          clock += dt * 1000;
          const span = 1000 / speedRef.current;
          let guard = 0;
          let advanced = false;
          while (clock >= span && guard++ < 6) {
            clock -= span;
            const minds = onlineRef.current && document.visibilityState === "visible";
            let job: ThinkJob | null = null;
            try {
              job = stepMinute(live, minds);
            } catch {
              break;
            }
            if (live.minute % 60 === 0) saveTown(live);
            advanced = true;
            if (takeJob(job)) break;
          }
          if (advanced) setTick((n) => n + 1);
        }
        const parent = canvas.parentElement;
        const w = parent?.clientWidth || 800;
        const h = canvas.clientHeight || 600;
        if (w !== view.w || h !== view.h) {
          view.w = w;
          view.h = h;
        }
        const snap = speedRef.current === 4 || pendingRef.current;
        if (replayRef.current === null) syncGlide(live, dt, snap);
        const positions = positionsFor(live, replayRef.current);
        const playerPos = positions.player ?? glideOf("player");
        const cam = cameraFor(playerPos.x, playerPos.y, w, h);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const minute = replayRef.current?.m ?? live.minute;
          paint(ctx, {
            viewW: w,
            viewH: h,
            town: live,
            minute,
            day: replayRef.current?.d ?? live.day,
            camX: cam.camX,
            camY: cam.camY,
            positions,
            selected: null,
            names: Object.fromEntries(live.agents.map((a) => [a.id, a.name])) as Record<AgentId, string>,
          });
          canvas.dataset.camx = String(cam.camX);
          canvas.dataset.camy = String(cam.camY);
        }
      }
      } catch (error) {
        if (!loopLogged) {
          loopLogged = true;
          console.error(error);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onLeave = () => {
      if (townRef.current) saveTown(townRef.current);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && townRef.current) saveTown(townRef.current);
    };
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onHide);

    const player = () => agentById(townRef.current!, "player");
    window.__controlsTest = {
      getYaw: () => faceYaw(player().face),
      getSpeed: () => (keysRef.current.size > 0 ? 1 : 0),
      getX: () => player().tile.x,
      getY: () => player().tile.y,
      setKeys: (codes: string[]) => {
        keysRef.current = new Set(codes);
      },
      setSteer: () => {},
    };
    window.__game = {
      advanceMinutes: (n: number) => {
        speedRef.current = 0;
        const live = townRef.current!;
        advanceTown(live, n);
        saveTown(live);
        resetGlide(live);
        setSpeed(0);
        setTick((v) => v + 1);
        const spread = spreadView(live);
        return {
          day: live.day,
          minute: live.minute,
          holders: spread.holders.map((a) => a.name),
          notes: spread.notes.map((n) => n.text),
          missed: spread.missed.length,
          favors: live.favors.map((f) => ({ from: f.from, to: f.to, status: f.status, amount: f.amount, text: f.text })),
          selves: Object.fromEntries(live.agents.map((a) => [a.id, a.selfSentence])),
          money: Object.fromEntries(live.agents.map((a) => [a.id, a.money])),
        };
      },
      audit: () => auditWorld(),
      tile: (x: number, y: number) => {
        const found = cell(x, y);
        return found ? { ground: found.ground, zone: found.zone, block: found.block } : null;
      },
      open: (id: string) => setPanel(id as AgentId),
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      delete window.__controlsTest;
      delete window.__game;
    };
  }, [phase]);

  function enter(event: React.FormEvent) {
    event.preventDefault();
    const town = createTown(name);
    town.paused = true;
    townRef.current = town;
    saveTown(town);
    speedRef.current = 0;
    setSpeed(0);
    setHint(true);
    setPhase("play");
  }

  function setRate(next: 0 | 1 | 4) {
    speedRef.current = next;
    setSpeed(next);
    const live = townRef.current;
    if (!live) return;
    live.paused = next === 0;
    saveTown(live);
  }

  function nextHour() {
    const live = townRef.current;
    if (!live || pendingRef.current || hourLock.current) return;
    hourLock.current = true;
    replayRef.current = null;
    setReplay(null);
    try {
      const minds = onlineRef.current && document.visibilityState === "visible";
      let job: ThinkJob | null = null;
      for (let i = 0; i < 60; i++) {
        try {
          job = stepMinute(live, minds);
        } catch {
          break;
        }
        if (job) break;
      }
      try {
        saveTown(live);
      } catch {
        /* keep the hour */
      }
      resetGlide(live);
      if (job && minds) void runMindRef.current(live, job);
      else if (job) {
        try {
          applyResult(live, offlineResult(live, job));
          saveTown(live);
        } catch {
          /* the hour still ends */
        }
      }
    } finally {
      hourLock.current = false;
      setTick((n) => n + 1);
    }
  }

  function onCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const live = townRef.current;
    const canvas = canvasRef.current;
    if (!live || !canvas || replayRef.current !== null) return;
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const positions = positionsFor(live, null);
    const playerPos = positions.player ?? { x: 0, y: 0 };
    const cam = cameraFor(playerPos.x, playerPos.y, rect.width, rect.height);
    const hit = pickAgent(sx, sy, cam.camX, cam.camY, positions);
    if (hit) {
      if (!pinned) setPanel(hit);
      else setPanel("kevin");
      if (hit === "kevin" && (live.guide ?? 0) < 2) {
        live.guide = 2;
        saveTown(live);
        setTick((n) => n + 1);
      }
      return;
    }
    const world = {
      x: (sx + cam.camX) / TILE,
      y: (sy + cam.camY) / TILE,
    };
    if (onBoard(world.x, world.y) || onBoard(agentById(live, "player").tile.x, agentById(live, "player").tile.y)) {
      setBoard(true);
    }
  }

  async function sendLine() {
    const live = townRef.current;
    const who = pinned ? "kevin" : panel;
    if (!live || !who || who === "player" || pendingRef.current || replayRef.current !== null) return;
    const text = draft.trim().slice(0, 400);
    if (!text) return;
    if (who === "kevin" && /who are you|who is he|who he is|who you are|man under|came from|your story|origin/i.test(text)) {
      if ((live.guide ?? 0) < 3) {
        live.guide = 3;
        live.sawHint = true;
        setHint(false);
      }
    }
    const job: ThinkJob = {
      kind: "player",
      day: live.day,
      minute: live.minute,
      agentId: who,
      text,
    };
    const minds = onlineRef.current && document.visibilityState === "visible";
    if (!minds) {
      try {
        applyResult(live, offlineResult(live, job));
        saveTown(live);
        setDraft("");
      } catch {
        /* keep the typed line */
      }
      setTick((n) => n + 1);
      return;
    }
    setDraft("");
    void runMindRef.current(live, job);
  }

  if (phase === "name" || !townRef.current) {
    return (
      <main className="gate">
        <form onSubmit={enter}>
          <p className="font-display text-4xl leading-none">THE GAME</p>
          <p className="mt-4 text-muted">
            A town with five lives already in it. You are the sixth. Not the narrator. Hobbs Cafe is already open.
          </p>
          <label className="mt-6 block text-sm text-muted" htmlFor="town-name">
            What do they call you?
          </label>
          <input
            id="town-name"
            className="field mt-2"
            maxLength={18}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="btn mt-4" data-on="true" type="submit" disabled={!name.trim()}>
            Walk in
          </button>
        </form>
      </main>
    );
  }

  const town = townRef.current;
  void tick;
  const player = agentById(town, "player");
  const shown = pinned ? "kevin" : panel;
  const near = onBoard(player.tile.x, player.tile.y);
  const clockMinute = replay?.m ?? town.minute;
  const clockDay = replay?.d ?? town.day;
  const yesterday = town.day > 1 && town.scrub.some((frame) => (frame.d ?? town.day) === town.day - 1);

  return (
    <main className="town">
      <header className="hud">
        <h1 className="font-display text-2xl leading-none">THE GAME</h1>
        <p className="tabular-nums">
          Day {clockDay} · {formatClock(clockMinute)} · {periodName(clockMinute)}
          {replay !== null ? " · replay" : ""}
        </p>
        <p className="text-muted">{placeTitle(zoneAt(player.tile.x, player.tile.y))}</p>
        <p className="text-muted">{player.money} on you · {beatAt(player, town.minute).status}</p>
        {checked && (
          <span className="badge" data-off={online ? "false" : "true"}>
            {online ? "mind on" : "offline mind"}
          </span>
        )}
        {thinking && <span className="text-sm text-primary">minds thinking</span>}
        {hiccup && <span className="text-sm text-primary">A mind missed and spoke from memory.</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn" data-on={speed === 0 ? "true" : "false"} type="button" onClick={() => setRate(0)} aria-label="Pause">
            <Pause className="inline size-4" aria-hidden /> Pause
          </button>
          <button className="btn" data-on={speed === 1 ? "true" : "false"} type="button" onClick={() => setRate(1)}>
            <Play className="inline size-4" aria-hidden /> 1×
          </button>
          <button className="btn" data-on={speed === 4 ? "true" : "false"} type="button" onClick={() => setRate(4)}>
            4×
          </button>
          <button className="btn" type="button" onClick={nextHour} disabled={thinking !== ""}>
            <SkipForward className="inline size-4" aria-hidden /> Hour
          </button>
        </div>
      </header>
      {checked && !online && (
        <p className="warn" role="status">
          The minds are offline. They still speak from the place, the hour, a retrieved memory, and an open thread. They cannot think a new thought until a mind is switched on. Nothing outside this page can be fetched.
        </p>
      )}
      {hint && (town.guide ?? 0) < 3 && (
        <p className="warn" role="status">
          {(town.guide ?? 0) < 1
            ? "The clock is paused. Hobbs is open. Walk there. Press 1×."
            : (town.guide ?? 0) < 2
              ? "Click Kevin."
              : "Ask him who he is."}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="town-canvas h-full"
          onClick={onCanvasClick}
          aria-label="The town"
        />
        <div className="dpad" aria-hidden={false}>
          <Pad code="ArrowUp" keys={keysRef} className="u" label="North">
            N
          </Pad>
          <Pad code="ArrowLeft" keys={keysRef} className="l" label="West">
            W
          </Pad>
          <Pad code="ArrowRight" keys={keysRef} className="r" label="East">
            E
          </Pad>
          <Pad code="ArrowDown" keys={keysRef} className="d" label="South">
            S
          </Pad>
        </div>
        {shown && (
          <Mind
            town={town}
            agent={agentById(town, shown)}
            pinned={pinned}
            draft={draft}
            setDraft={setDraft}
            busy={thinking !== ""}
            onClose={() => {
              setPinned(false);
              setPanel(null);
            }}
            onPin={() => {
              setPinned((v) => !v);
              setPanel("kevin");
            }}
            onSend={() => void sendLine()}
          />
        )}
      </div>
      <footer className="foot">
        <label className="text-sm text-muted" htmlFor="scrub">
          {replay && replay.d < town.day ? "Yesterday" : "Today"}
        </label>
        {yesterday && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              const day = town.day - 1;
              const frames = town.scrub.filter((frame) => (frame.d ?? town.day) === day);
              const m = frames.length ? frames[frames.length - 1]!.m : 0;
              const next = { d: day, m };
              replayRef.current = next;
              setReplay(next);
              speedRef.current = 0;
              setSpeed(0);
            }}
          >
            Yesterday
          </button>
        )}
        <input
          id="scrub"
          className="scrub"
          type="range"
          min={0}
          max={Math.max(1, replay?.d === town.day || !replay ? town.minute : 1439)}
          value={replay?.m ?? town.minute}
          onChange={(event) => {
            const value = Number(event.target.value);
            const day = replay?.d ?? town.day;
            if (day === town.day && value >= town.minute) {
              replayRef.current = null;
              setReplay(null);
            } else {
              const next = { d: day, m: value };
              replayRef.current = next;
              setReplay(next);
              speedRef.current = 0;
              setSpeed(0);
            }
          }}
        />
        <span className="tabular-nums text-sm">{formatClock(clockMinute)}</span>
        {town.notices.length > 0 && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              const note = town.notices[0]!;
              const next = { d: note.day, m: note.minute };
              replayRef.current = next;
              setReplay(next);
              speedRef.current = 0;
              setSpeed(0);
            }}
          >
            Note day {town.notices[0]!.day}
          </button>
        )}
        {replay !== null && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              replayRef.current = null;
              setReplay(null);
            }}
          >
            Back to now
          </button>
        )}
        <button
          className="btn"
          type="button"
          disabled={!near && town.notices.length === 0}
          onClick={() => setBoard(true)}
        >
          {town.notices.length ? `Board · ${town.notices.length}` : "Board"}
        </button>
        <button className="btn" type="button" onClick={() => download(town)}>
          <Download className="inline size-4" aria-hidden /> Download town
        </button>
        <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
          <Upload className="inline size-4" aria-hidden /> Import
        </button>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 1_500_000) {
              setImportError("That file is too large to be a town.");
              setImportText("");
              return;
            }
            setImportError("");
            try {
              setImportText(await file.text());
            } catch {
              setImportError("That file could not be read.");
              setImportText("");
            }
          }}
        />
      </footer>
      {board && (
        <Board
          town={town}
          onClose={() => setBoard(false)}
        />
      )}
      {importText !== null && (
        <div className="gate absolute inset-0 z-10 bg-bg/90">
          <form
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (!importText.trim()) return;
              const next = parseTownFile(importText);
              if (!next) {
                setImportError("That file is not a town this page can live in.");
                return;
              }
              townRef.current = next;
              saveTown(next);
              resetGlide(next);
              setImportText(null);
              setPanel(null);
              setPinned(false);
              setReplay(null);
              replayRef.current = null;
              setTick((n) => n + 1);
            }}
          >
            <h2 className="font-display text-2xl">Replace the live town?</h2>
            <p className="mt-3 text-muted">
              The people here now will be overwritten in this browser. The file is day {previewDay(importText) ?? "?"}. Debts, notes, and selves in it become the town.
            </p>
            {importError && <p className="mt-3 text-primary">{importError}</p>}
            <div className="mt-5 flex gap-2">
              <button className="btn" data-on="true" type="submit">
                Replace
              </button>
              <button className="btn" type="button" onClick={() => setImportText(null)}>
                Keep this town
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function positionsFor(town: Town, replay: Replay | null) {
  const out = {} as Record<AgentId, { x: number; y: number; face: Face }>;
  if (replay) {
    const frame = frameAt(town, replay.m, replay.d);
    if (frame && frame.length >= town.agents.length * 2) {
      town.agents.forEach((agent, index) => {
        out[agent.id] = {
          x: frame[index * 2] ?? agent.tile.x,
          y: frame[index * 2 + 1] ?? agent.tile.y,
          face: agent.face,
        };
      });
      return out;
    }
  }
  for (const agent of town.agents) {
    const g = glideOf(agent.id);
    out[agent.id] = { x: g.x, y: g.y, face: agent.face };
  }
  return out;
}

function download(town: Town) {
  const blob = new Blob([exportTown(town)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `the-game-day-${town.day}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Pad({
  code,
  keys,
  className,
  label,
  children,
}: {
  code: string;
  keys: React.RefObject<Set<string>>;
  className: string;
  label: string;
  children: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        keys.current?.add(code);
      }}
      onPointerUp={() => keys.current?.delete(code)}
      onPointerCancel={() => keys.current?.delete(code)}
      onLostPointerCapture={() => keys.current?.delete(code)}
    >
      {children}
    </button>
  );
}

function Meter({ score }: { score: number }) {
  return (
    <span className="meter" aria-label={`relationship ${score}`}>
      {[-3, -2, -1, 0, 1, 2, 3].map((n) => (
        <i
          key={n}
          data-on={n > 0 && score >= n ? "true" : "false"}
          data-neg={n < 0 && score <= n ? "true" : "false"}
        />
      ))}
    </span>
  );
}

function Mind({
  town,
  agent,
  pinned,
  draft,
  setDraft,
  busy,
  onClose,
  onPin,
  onSend,
}: {
  town: Town;
  agent: Agent;
  pinned: boolean;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  onClose: () => void;
  onPin: () => void;
  onSend: () => void;
}) {
  const memories = Array.isArray(agent.memories) ? agent.memories : [];
  const threads = Array.isArray(agent.threads) ? agent.threads : [];
  const projects = Array.isArray(agent.projects) ? agent.projects : [];
  const favors = Array.isArray(town.favors) ? town.favors : [];
  const retrievals = Array.isArray(town.retrievals) ? town.retrievals : [];
  const beats = Array.isArray(agent.plan?.beats) ? agent.plan.beats : [];
  const spread = spreadView(town);
  const hour = Math.floor(town.minute / 60);
  const reflections = memories.filter((m) => m.type === "reflect" && !m.seed);
  const chats = memories.filter((m) => m.type === "chat");
  const mineFavors = favors.filter((f) => f.from === agent.id || f.to === agent.id);
  const missed = retrievals.filter((r) => r.agentId === agent.id && r.missed).slice(-8);
  return (
    <aside className="mind" aria-label={`${agent.name} mind`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{agent.role}</p>
          <h2 className="font-display text-3xl leading-none">{agent.name}</h2>
        </div>
        <div className="flex gap-2">
          <button className="btn" type="button" data-on={pinned ? "true" : "false"} onClick={onPin}>
            <Pin className="inline size-4" aria-hidden /> {pinned ? "Unpin" : "Pin Kevin"}
          </button>
          <button className="btn" type="button" onClick={onClose} aria-label="Close mind">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        {agent.money} held · {agent.status}
      </p>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Who I am</h3>
        <p className="mt-1">{agent.identity}</p>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Right now</h3>
        <p className="mt-1 font-display text-xl">{agent.selfSentence}</p>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Private want</h3>
        <p className="mt-1">{agent.want}</p>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Today</h3>
        <p className="mt-1">{agent.plan?.summary || "Between places."}</p>
        <ul className="mt-2 max-h-36 overflow-auto text-sm text-muted">
          {beats.map((beat) => (
            <li key={beat.hour} className={beat.hour === hour ? "text-fg" : ""}>
              {String(beat.hour).padStart(2, "0")}:00 {beat.place} — {beat.status}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Open threads</h3>
        <ul className="mt-1 space-y-1">
          {threads.filter((t) => t.open).map((thread) => (
            <li key={thread.id}>
              {thread.hidden ? "Private. " : ""}
              {thread.seed ? "Seed. " : ""}
              {thread.text}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Projects</h3>
        <ul className="mt-1 space-y-1">
          {projects.filter((p) => p.status === "open").length === 0 && <li className="text-muted">None open.</li>}
          {projects
            .filter((p) => p.status === "open")
            .map((p) => (
              <li key={p.id}>
                {p.kind}: {p.text}
              </li>
            ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Relationships</h3>
        <ul className="mt-2 space-y-2">
          {town.agents
            .filter((other) => other.id !== agent.id)
            .map((other) => {
              const rel = agent.relationships[other.id];
              return (
                <li key={other.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block">{other.name}</span>
                    <span className="block text-sm text-muted">{rel?.note}</span>
                  </span>
                  <Meter score={rel?.score ?? 0} />
                </li>
              );
            })}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Debts</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {mineFavors.length === 0 && <li className="text-muted">No tab.</li>}
          {mineFavors.map((favor) => (
            <li key={favor.id}>
              {favor.from} → {favor.to}: {favor.text}
              {favor.amount ? ` (${favor.amount})` : ""} · {favor.status}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Reflections</h3>
        <ul className="mt-1 space-y-2 text-sm">
          {reflections.length === 0 && <li className="text-muted">None yet.</li>}
          {reflections.slice(-6).map((m) => (
            <li key={m.id}>{m.text}</li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Transcript</h3>
        <ul className="mt-1 space-y-2 text-sm">
          {chats.length === 0 && <li className="text-muted">No one has spoken with them yet.</li>}
          {chats.slice(-8).map((m) => (
            <li key={m.id}>
              Day {m.day} {formatClock(m.minute)}. {m.text}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-sm uppercase tracking-wide text-muted">Did Kevin's question travel?</h3>
        {spread.holders.length === 0 && spread.notes.length === 0 ? (
          <div className="mt-1">
            <p>It has not left him. These retrievals missed it.</p>
            <Missed rows={town.retrievals.filter((r) => r.missed).slice(-8)} />
          </div>
        ) : (
          <div className="mt-1 space-y-2 text-sm">
            {spread.holders.map((holder) => {
              const memory = [...holder.memories].reverse().find((m) => m.seed || /who he is|man under the apron|came from|need help|make some money|who i am/i.test(m.text));
              return (
                <p key={holder.id}>
                  <span className="text-fg">{holder.name}</span> holds: {memory?.text}
                </p>
              );
            })}
            {spread.notes.map((note) => (
              <p key={note.id}>
                Board, day {note.day}: {note.text}
              </p>
            ))}
            {missed.length > 0 && (
              <details>
                <summary>Retrievals that missed</summary>
                <Missed rows={missed} />
              </details>
            )}
          </div>
        )}
      </section>
      {agent.id !== "player" && (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <label className="text-sm text-muted" htmlFor="mind-line">
            Your line to {agent.name}
          </label>
          <textarea
            id="mind-line"
            className="field mt-2 min-h-20 py-2"
            value={draft}
            maxLength={400}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="btn mt-2" data-on="true" type="submit" disabled={busy || !draft.trim()}>
            Say it
          </button>
        </form>
      )}
    </aside>
  );
}

function Missed({
  rows,
}: {
  rows: { id: string; agentId: string; day: number; minute: number; question: string; top: { text: string; score: number }[]; seedRank: number | null; seedInStream: boolean }[];
}) {
  if (!rows.length) return <p className="text-sm text-muted">No retrieval has been scored yet.</p>;
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="text-fg">
            {row.agentId} · day {row.day} {formatClock(row.minute)}
          </span>
          <span className="block text-muted">
            {row.seedInStream ? `Seed ranked ${row.seedRank}, outside the top 8.` : "Not in their stream."} Query: {row.question.slice(0, 140)}
          </span>
          <span className="block">Got: {row.top[0]?.text ?? "nothing"} ({row.top[0]?.score ?? 0})</span>
        </li>
      ))}
    </ul>
  );
}

function Board({ town, onClose }: { town: Town; onClose: () => void }) {
  return (
    <aside className="mind" aria-label="Noticeboard">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Noticeboard</h2>
        <button className="btn" type="button" onClick={onClose} aria-label="Close board">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-muted">By Hobbs Cafe. Notes stay until someone takes them down. No one has to.</p>
      <ul className="mt-4 space-y-3">
        {town.notices.length === 0 && <li>The board is empty. The town has not decided to write on it.</li>}
        {town.notices.map((note) => (
          <li key={note.id} className="border-b border-line pb-3">
            <p className="text-xs uppercase tracking-wide text-muted">
              {note.author} · day {note.day} {formatClock(note.minute)}
            </p>
            <p className="mt-1">{note.text}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

