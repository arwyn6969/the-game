import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  MapPin,
  Pause,
  Pin,
  Play,
  Save,
  SkipForward,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { ArcadeMark, PixelUniverse } from "./ArcadeArt";
import type { Agent, AgentId, Face, ThinkJob, Town } from "@/game/types";
import {
  applyPlayerAction,
  applyResult,
  BABA_LOAF,
  playerActions,
  spreadView,
} from "@/game/effects";
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
  pickAgents,
  resetGlide,
  syncGlide,
} from "@/game/render";
import {
  exportTown,
  MAX_TOWN_FILE_BYTES,
  parseTownFile,
  readTownSave,
  saveTownWithStatus,
  type SaveResult,
} from "@/game/save";
import { advanceTown, frameAt, stepMinute } from "@/game/sim";
import { formatClock, periodName } from "@/game/text";
import { createTown } from "@/game/town";
import {
  auditWorld,
  ANCHORS,
  cell,
  nearestWalkable,
  placeTitle,
  TILE,
  walkable,
  zoneAt,
} from "@/game/world";
import {
  activityStatus,
  exchangeLanded,
  followingLatest,
  inTalkRange,
  interactiveControl,
  nextDraft,
  opensTalk,
  playerChatIds,
  spokenTurns,
  type FocusLike,
} from "./talk";

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

function previewDay(text: string): { day: number; version: number | null } | null {
  try {
    const value = JSON.parse(text) as {
      day?: unknown;
      version?: unknown;
      town?: { day?: unknown };
    };
    const raw =
      value && typeof value === "object" && value.town && typeof value.town === "object"
        ? value.town.day
        : value.day;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    return { day: raw, version: typeof value.version === "number" ? value.version : null };
  } catch {
    return null;
  }
}

function hobbsWay(x: number, y: number): string {
  const dx = ANCHORS.cafe.x - x;
  const dy = ANCHORS.cafe.y - y;
  if (Math.abs(dx) + Math.abs(dy) <= 3) return "Hobbs is here.";
  const parts: string[] = [];
  if (dy < -1) parts.push("north");
  if (dy > 1) parts.push("south");
  if (dx > 1) parts.push("east");
  if (dx < -1) parts.push("west");
  return `Hobbs is ${parts.join(" and ")}.`;
}

function besideYou(town: Town): AgentId | null {
  const player = agentById(town, "player");
  let best: { id: AgentId; d: number } | null = null;
  for (const agent of town.agents) {
    if (agent.id === "player") continue;
    if (!inTalkRange(agent.tile.x, agent.tile.y, player.tile.x, player.tile.y)) continue;
    const d = Math.abs(agent.tile.x - player.tile.x) + Math.abs(agent.tile.y - player.tile.y);
    if (!best || d < best.d) best = { id: agent.id, d };
  }
  return best?.id ?? null;
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

function focusOf(target: EventTarget | null): FocusLike {
  if (!(target instanceof Element)) return null;
  return {
    tagName: target.tagName,
    role: target.getAttribute("role"),
    closest: (selector) => target.closest(selector),
  };
}

export function TownApp() {
  const boot = useRef<Town | null | undefined>(undefined);
  const bootHold = useRef<string | null | undefined>(undefined);
  const bootUnavailable = useRef(false);
  if (boot.current === undefined) {
    const report = readTownSave();
    const qa = new URLSearchParams(location.search).has("qa");
    if (report.status === "ready") boot.current = report.town;
    else if (report.status === "unreadable") {
      boot.current = null;
      bootHold.current = report.raw;
    } else if (report.status === "unavailable") {
      boot.current = null;
      bootUnavailable.current = true;
    } else {
      boot.current = qa ? createTown("Ada") : null;
      bootHold.current = null;
    }
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
  const [phase, setPhase] = useState<"name" | "play" | "recover" | "unavailable">(
    townRef.current
      ? "play"
      : bootUnavailable.current
        ? "unavailable"
        : bootHold.current
          ? "recover"
          : "name",
  );
  const [hold, setHold] = useState<string | null>(bootHold.current ?? null);
  const [name, setName] = useState("");
  const [recoverNote, setRecoverNote] = useState("");
  const [farNote, setFarNote] = useState("");
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
  const [inspect, setInspect] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [crowd, setCrowd] = useState<AgentId[] | null>(null);
  const [exportNote, setExportNote] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveResult | null>(null);
  const panelRef = useRef<AgentId | null>(null);
  const boardRef = useRef(false);

  function persistTown(live: Town) {
    const result = saveTownWithStatus(live);
    if (mounted.current) setSaveStatus(result);
  }

  function acceptImportedTown(next: Town) {
    townRef.current = next;
    keysRef.current.clear();
    speedRef.current = next.paused ? 0 : 1;
    setSpeed(speedRef.current);
    setHint(!next.sawHint);
    setDraft("");
    setSendNote("");
    setInspect(false);
    resetGlide(next);
    setImportText(null);
    setImportError("");
    setHold(null);
    setRecoverNote("");
    panelRef.current = null;
    setPanel(null);
    setPinned(false);
    boardRef.current = false;
    setBoard(false);
    setCrowd(null);
    setFarNote("");
    setExportNote("");
    replayRef.current = null;
    setReplay(null);
    persistTown(next);
    setPhase("play");
    setTick((n) => n + 1);
  }

  function chooseAction(expectedTown: Town, target: AgentId, actionId: string) {
    if (
      townRef.current !== expectedTown ||
      panelRef.current !== target ||
      pendingRef.current ||
      replayRef.current !== null
    )
      return;
    const result = applyPlayerAction(expectedTown, target, actionId);
    if (result.ok) persistTown(expectedTown);
    setSendNote(result.reply);
    setTick((n) => n + 1);
  }

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
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--vv-bottom", `${inset}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
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
    let landed = false;
    const mark = () =>
      job.kind === "player" ? playerChatIds(agentById(live, job.agentId).memories ?? []) : [];
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
        const before = mark();
        if (parsed) applyResult(live, parsed);
        else applyResult(live, offlineResult(live, job));
        if (job.kind === "player") landed = exchangeLanded(before, mark());
        applied = true;
        if (!parsed && mounted.current) setHiccup(true);
      } catch {
        applied = true;
      }
    } catch {
      if (townRef.current === live && !applied) {
        try {
          const before = mark();
          applyResult(live, offlineResult(live, job));
          if (job.kind === "player") landed = exchangeLanded(before, mark());
        } catch {
          /* The clock must resume even if the fallback cannot land. */
        }
        if (mounted.current) setHiccup(true);
      }
    } finally {
      if (timed) window.clearTimeout(timed);
      pendingRef.current = false;
      if (townRef.current === live) persistTown(live);
      if (mounted.current) {
        setThinking("");
        setTick((n) => n + 1);
        if (job.kind === "player") {
          const same = townRef.current === live && panelRef.current === job.agentId;
          setDraft((current) => nextDraft(current, job.text, same, landed));
          if (townRef.current === live) {
            setSendNote(landed ? "They heard you." : "That did not land. Your line is still here.");
          }
          if (landed && townRef.current === live && (live.guide ?? 0) < 3) {
            live.guide = 3;
            live.sawHint = true;
            setHint(false);
            persistTown(live);
          }
        }
      }
    }
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (panelRef.current) {
          setPinned(false);
          setPanel(null);
        }
        setCrowd(null);
        if (boardRef.current) setBoard(false);
        return;
      }
      if (interactiveControl(focusOf(event.target))) return;
      if (opensTalk(event.code, false, Boolean(panelRef.current || boardRef.current))) {
        const live = townRef.current;
        if (!live || replayRef.current) return;
        const nearId = besideYou(live);
        if (!nearId) return;
        event.preventDefault();
        setPanel(nearId);
        if (nearId === "kevin" && (live.guide ?? 0) < 2) {
          live.guide = 2;
          persistTown(live);
          setTick((n) => n + 1);
        }
        return;
      }
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
      if (!live || replayRef.current !== null || pendingRef.current) return;
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
      if (!walkable(player.tile.x, player.tile.y))
        player.tile = nearestWalkable(player.tile.x, player.tile.y);
      const nx = player.tile.x + x;
      const ny = player.tile.y + y;
      if (
        !walkable(nx, ny) ||
        live.agents.some(
          (agent) => agent.id !== "player" && agent.tile.x === nx && agent.tile.y === ny,
        )
      ) {
        moveCool = 0.16;
        return;
      }
      player.face = x > 0 ? "e" : x < 0 ? "w" : y > 0 ? "s" : "n";
      player.tile = { x: nx, y: ny };
      player.status = `walking ${placeTitle(zoneAt(nx, ny))}`;
      if ((live.guide ?? 0) < 1 && zoneAt(nx, ny) === "cafe") {
        live.guide = 1;
        persistTown(live);
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
          if (
            replayRef.current === null &&
            speedRef.current > 0 &&
            !hourLock.current &&
            !pendingRef.current
          ) {
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
              if (live.minute % 60 === 0) persistTown(live);
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
              names: Object.fromEntries(live.agents.map((a) => [a.id, a.name])) as Record<
                AgentId,
                string
              >,
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
      if (townRef.current) persistTown(townRef.current);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && townRef.current) persistTown(townRef.current);
    };
    window.addEventListener("pagehide", onLeave);
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
        if (pendingRef.current) return null;
        speedRef.current = 0;
        const live = townRef.current!;
        advanceTown(live, n);
        persistTown(live);
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
          favors: live.favors.map((f) => ({
            from: f.from,
            to: f.to,
            status: f.status,
            amount: f.amount,
            text: f.text,
          })),
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
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      delete window.__controlsTest;
      delete window.__game;
    };
  }, [phase]);

  function enter(event: React.FormEvent) {
    event.preventDefault();
    if (hold) return;
    const town = createTown(name);
    town.paused = true;
    townRef.current = town;
    persistTown(town);
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
    persistTown(live);
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
        persistTown(live);
      } catch {
        /* keep the hour */
      }
      resetGlide(live);
      if (job && minds) void runMindRef.current(live, job);
      else if (job) {
        try {
          applyResult(live, offlineResult(live, job));
          persistTown(live);
        } catch {
          /* the hour still ends */
        }
      }
    } finally {
      hourLock.current = false;
      setTick((n) => n + 1);
    }
  }

  function approach(id: AgentId) {
    const live = townRef.current;
    if (!live) return;
    const target: AgentId = pinned && id !== "player" ? "kevin" : id;
    if (target !== "player") {
      const player = agentById(live, "player");
      const other = agentById(live, target);
      if (!inTalkRange(player.tile.x, player.tile.y, other.tile.x, other.tile.y)) {
        setFarNote(`${other.name} is too far to hear you. Walk closer.`);
        return;
      }
    }
    setFarNote("");
    setPanel(target);
    if (target === "kevin" && (live.guide ?? 0) < 2) {
      live.guide = 2;
      persistTown(live);
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
    const hit = pickAgents(sx, sy, cam.camX, cam.camY, positions);
    if (hit.length > 1) {
      setCrowd(hit);
      return;
    }
    setCrowd(null);
    const one = hit[0];
    if (one) {
      approach(one);
      return;
    }
    const world = {
      x: (sx + cam.camX) / TILE,
      y: (sy + cam.camY) / TILE,
    };
    if (
      onBoard(world.x, world.y) ||
      onBoard(agentById(live, "player").tile.x, agentById(live, "player").tile.y)
    ) {
      setBoard(true);
    }
  }

  async function sendLine() {
    const live = townRef.current;
    const who = pinned ? "kevin" : panel;
    if (!live || !who || who === "player" || pendingRef.current || replayRef.current !== null)
      return;
    const text = draft.trim().slice(0, 400);
    if (!text) return;
    const player = agentById(live, "player");
    const other = agentById(live, who);
    if (!inTalkRange(player.tile.x, player.tile.y, other.tile.x, other.tile.y)) {
      setSendNote(`${other.name} is too far to hear you. Walk closer. Your line is still here.`);
      return;
    }
    if (
      who === "kevin" &&
      /who are you|who is he|who he is|who you are|man under|came from|your story|origin/i.test(
        text,
      )
    ) {
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
        const before = playerChatIds(agentById(live, who).memories ?? []);
        applyResult(live, offlineResult(live, job));
        persistTown(live);
        const landed = exchangeLanded(before, playerChatIds(agentById(live, who).memories ?? []));
        setDraft((current) => nextDraft(current, text, panelRef.current === who, landed));
        setSendNote(
          landed
            ? "They answered from what they already hold."
            : "That did not land. Your line is still here.",
        );
        if (landed && (live.guide ?? 0) < 3) {
          live.guide = 3;
          live.sawHint = true;
          setHint(false);
        }
      } catch {
        setSendNote("That did not land. Your line is still here.");
      }
      setTick((n) => n + 1);
      return;
    }
    setSendNote("Saying it.");
    void runMindRef.current(live, job);
  }

  if (phase === "unavailable") {
    return (
      <main className="gate">
        <form onSubmit={(event) => event.preventDefault()}>
          <p className="font-display text-4xl leading-none">THE GAME</p>
          <p className="mt-4 text-muted">
            This browser’s saved town could not be checked. Nothing has been replaced. Allow browser
            storage or try again.
          </p>
          <button
            className="btn mt-4"
            type="button"
            onClick={() => {
              const report = readTownSave();
              if (report.status === "ready") acceptImportedTown(report.town);
              else if (report.status === "unreadable") {
                setHold(report.raw);
                setRecoverNote("");
                setPhase("recover");
              } else if (report.status === "missing") {
                setRecoverNote("");
                setPhase("name");
              } else
                setRecoverNote(
                  "Browser storage is still unavailable. Your saved town has not been replaced.",
                );
            }}
          >
            Try reading the saved town again
          </button>
          <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">
            {recoverNote}
          </p>
        </form>
      </main>
    );
  }

  if (phase === "recover" && hold) {
    return (
      <main className="gate">
        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <p className="font-display text-4xl leading-none">THE GAME</p>
          <p className="mt-4 text-muted">
            This browser has a town that could not be read. Starting a new one would replace it.
            Download the complete save first, or import a backup you trust.
          </p>
          <textarea
            className="field mt-4 max-h-40"
            readOnly
            value={hold.length > 200_000 ? `${hold.slice(0, 200_000)}\n…` : hold}
            aria-label="Unreadable town save preview"
            aria-describedby="recovery-preview-note"
            name="damaged-town"
            id="damaged-town"
          />
          <p id="recovery-preview-note" className="mt-2 text-sm text-muted">
            {hold.length > 200_000
              ? `Preview only: showing the first 200,000 of ${hold.length.toLocaleString()} characters. This is not a complete backup.`
              : "Preview of the unreadable save."}{" "}
            Download the full save or use Copy the full save to preserve it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn"
              type="button"
              onClick={() => {
                try {
                  downloadText(hold, "the-game-unreadable-save.txt", "text/plain;charset=utf-8");
                  setRecoverNote(
                    "Download requested. Keep the complete file before replacing this town.",
                  );
                } catch {
                  setRecoverNote(
                    "The download could not start. Try Copy the full save before replacing this town.",
                  );
                }
              }}
            >
              Download the full unreadable save
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(hold);
                  setRecoverNote("Copied the full save. Keep it somewhere before you start over.");
                } catch {
                  setRecoverNote(
                    "Copy failed. Use Download the full unreadable save; the preview may be incomplete.",
                  );
                }
              }}
            >
              Copy the full save
            </button>
            <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
              Import a backup
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setHold(null);
                setPhase("name");
              }}
            >
              I have a copy. Start over.
            </button>
          </div>
          <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">
            {recoverNote}
          </p>
          <input
            ref={fileRef}
            id="recover-import"
            name="recover-import"
            aria-label="Import a town backup"
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > MAX_TOWN_FILE_BYTES) {
                setRecoverNote("That file is too large to be a town.");
                return;
              }
              try {
                const next = parseTownFile(await file.text());
                if (!next) {
                  setRecoverNote("That file is not a town this page can live in.");
                  return;
                }
                acceptImportedTown(next);
              } catch {
                setRecoverNote("That file could not be read.");
              }
            }}
          />
        </form>
      </main>
    );
  }

  if (phase === "name" || !townRef.current) {
    return (
      <main className="gate gate-home">
        <div className="gate-nav">
          <div className="brand">
            <ArcadeMark className="brand-icon" />
            <span className="brand-name">THE GAME</span>
          </div>
          <span className="badge">A persistent pixel town</span>
        </div>
        <div className="gate-layout">
          <div className="gate-hero">
            <div className="gate-kicker">
              <Sparkles className="size-4" /> Small town. Big universe.
            </div>
            <h1>
              THE <span>GAME</span>
            </h1>
            <p>
              Five lives are already unfolding here. You’re the sixth. Meet your neighbors, make a
              little trouble, see what tomorrow brings.
            </p>
            <PixelUniverse />
          </div>
          <form onSubmit={enter}>
            <div className="cartridge-label">
              <span>New resident</span>
              <span>Player 06</span>
            </div>
            <h2>
              Your next little
              <br />
              adventure starts here.
            </h2>
            <p>Hobbs Cafe is already open. There’s a place in town with your name on it.</p>
            <label className="mt-6 block text-sm text-muted" htmlFor="town-name">
              What do they call you?
            </label>
            <input
              id="town-name"
              name="town-name"
              className="field mt-2"
              placeholder="Your name, space traveler"
              maxLength={18}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button className="btn" data-on="true" type="submit" disabled={!name.trim()}>
              Walk in <ArrowRight className="size-4" aria-hidden />
            </button>
            <p className="gate-save-note">
              <Save className="size-3" aria-hidden /> Your town saves in this browser.
            </p>
          </form>
        </div>
        <div className="gate-bottom">
          <span>Talk. Wander. Make tomorrow different.</span>
          <span>No final level. Just life.</span>
        </div>
      </main>
    );
  }

  const town = townRef.current;
  void tick;
  const player = agentById(town, "player");
  const shown = pinned ? "kevin" : panel;
  panelRef.current = shown;
  boardRef.current = board;
  const near = onBoard(player.tile.x, player.tile.y);
  const clockMinute = replay?.m ?? town.minute;
  const clockDay = replay?.d ?? town.day;
  const yesterday =
    town.day > 1 && town.scrub.some((frame) => (frame.d ?? town.day) === town.day - 1);
  const clockLine =
    speed === 0
      ? "The clock is paused. Press 1× when you want the hour to move."
      : speed === 4
        ? "The clock is at 4×. Pause if you want to talk first."
        : "The clock is at 1×.";
  const here = zoneAt(player.tile.x, player.tile.y);
  const planned = beatAt(player, town.minute);
  const guideLine = `${clockLine} WASD or arrows move one tile. On a phone, hold N W E S. Enter speaks to whoever is beside you. ${hobbsWay(player.tile.x, player.tile.y)} Open Choices with Kevin to agree a cafe shift, or with Baba to agree a bread tab. Read the terms before you choose. Or walk on.`;
  const yourOpenDebts = (town.favors ?? []).filter(
    (f) => f.status === "owed" && (f.from === "player" || f.to === "player"),
  );

  return (
    <main className="town" data-talking={shown || board ? "true" : "false"}>
      <header className="hud">
        <div className="brand">
          <ArcadeMark className="brand-icon" />
          <div>
            <h1>THE GAME</h1>
            <p className="brand-caption">YOUR LITTLE UNIVERSE</p>
          </div>
        </div>
        <div className="hud-clock">
          <span className="day-chip">Day {String(clockDay).padStart(2, "0")}</span>
          <span>{formatClock(clockMinute)}</span>
          <span className="hud-period text-muted">{periodName(clockMinute)}</span>
          {replay !== null && <span className="text-purple">Replay</span>}
        </div>
        <p className="hud-wallet">
          <span className="pixel-coin" aria-hidden />
          {player.money} on you
        </p>
        <div className="transport" role="group" aria-label="Town clock controls">
          <button
            className="btn"
            data-on={speed === 0 ? "true" : "false"}
            type="button"
            onClick={() => setRate(0)}
            aria-label="Pause"
          >
            <Pause className="inline size-4" aria-hidden /> Pause
          </button>
          <button
            className="btn"
            data-on={speed === 1 ? "true" : "false"}
            type="button"
            onClick={() => setRate(1)}
          >
            <Play className="inline size-4" aria-hidden /> 1×
          </button>
          <button
            className="btn"
            data-on={speed === 4 ? "true" : "false"}
            type="button"
            onClick={() => setRate(4)}
          >
            4×
          </button>
          <button className="btn" type="button" onClick={nextHour} disabled={thinking !== ""}>
            <SkipForward className="inline size-4" aria-hidden /> Hour
          </button>
        </div>
      </header>
      <div className="status-strip">
        <p className="status-place">
          <MapPin className="size-3" aria-hidden />
          {placeTitle(here)}
        </p>
        <p className="status-activity">{activityStatus(here, planned.place, planned.status)}</p>
        {farNote && (
          <p className="status-message" role="status">
            {farNote}
          </p>
        )}
        {checked && (
          <span className="badge" data-off={online ? "false" : "true"}>
            {online ? "mind on" : "offline mind"}
          </span>
        )}
        {thinking && <span className="status-message">minds thinking</span>}
        {hiccup && <span className="status-message">A mind missed and spoke from memory.</span>}
        <div className="status-controls">
          <span>
            <kbd>WASD / ↑↓←→</kbd> move
          </span>
          <span>
            <kbd>ENTER</kbd> talk
          </span>
        </div>
      </div>
      {saveStatus && !saveStatus.ok && (
        <p className="warn" role="alert">
          This town has not saved in this browser. Download a copy before closing the page.{" "}
          <button
            className="btn"
            type="button"
            onClick={() => {
              void saveCopy(town).then(setExportNote);
            }}
          >
            Download a copy
          </button>
        </p>
      )}
      {checked && !online && !shown && (
        <p className="warn offline-note" role="status">
          The minds are offline. They still answer from what they already hold.
        </p>
      )}
      {hint && (town.guide ?? 0) < 3 && !shown && (
        <div className="welcome-tip">
          <Sparkles className="welcome-icon size-5" aria-hidden />
          <div>
            <strong>Next stop: Hobbs Cafe.</strong>
            <p>
              Say hello to Kevin, or see where the day takes you.{" "}
              {speed === 0
                ? "Press 1× to start the clock."
                : hobbsWay(player.tile.x, player.tile.y)}
            </p>
          </div>
          <details>
            <summary>How to play</summary>
            <p>{guideLine}</p>
          </details>
        </div>
      )}
      {yourOpenDebts.length > 0 && !shown && (
        <p className="warn" role="status">
          {yourOpenDebts.length} open{" "}
          {yourOpenDebts.length === 1 ? "tab or favor" : "tabs or favors"} involving you.{" "}
          <button className="btn" type="button" onClick={() => approach("player")}>
            View your journal
          </button>
        </p>
      )}
      <div className="world-frame">
        <canvas
          ref={canvasRef}
          className="town-canvas h-full"
          onClick={onCanvasClick}
          aria-label="The town"
        />
        <div className="world-label" aria-hidden>
          <i />
          {replay
            ? "A moment from the town"
            : speed === 0
              ? "Town time · paused"
              : "A day in the town"}
        </div>
        <div className="world-caption" aria-hidden>
          6 residents · endless possibilities
        </div>
        {crowd && crowd.length > 1 && (
          <div className="crowd" role="listbox" aria-label="Who is here">
            {crowd.map((id) => {
              const person = town.agents.find((agent) => agent.id === id);
              return (
                <button
                  key={id}
                  className="btn"
                  type="button"
                  onClick={() => {
                    setCrowd(null);
                    approach(id);
                  }}
                >
                  {person?.name ?? id}
                </button>
              );
            })}
          </div>
        )}
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
            busy={thinking !== "" || replay !== null}
            inspect={inspect}
            sendNote={sendNote}
            onInspect={setInspect}
            onClose={() => {
              setPinned(false);
              setPanel(null);
            }}
            onPin={() => {
              setPinned((v) => !v);
              setPanel("kevin");
            }}
            onSend={() => void sendLine()}
            onAction={(id) => chooseAction(town, shown, id)}
          />
        )}
      </div>
      <footer className="foot">
        <label className="foot-label" htmlFor="scrub">
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
          name="scrub"
          aria-label="Replay minute"
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
        <button
          className="btn"
          type="button"
          onClick={() => {
            void saveCopy(town).then((note) => setExportNote(note));
          }}
        >
          <Download className="inline size-4" aria-hidden /> Download town
        </button>
        {exportNote && <p className="text-sm text-muted">{exportNote}</p>}
        <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
          <Upload className="inline size-4" aria-hidden /> Import
        </button>
        <input
          ref={fileRef}
          id="town-import"
          name="town-import"
          aria-label="Import a town file"
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > MAX_TOWN_FILE_BYTES) {
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
        <span className="foot-note">
          {saveStatus?.ok ? "Saved in this browser" : "Your town lives in this browser"}
        </span>
      </footer>
      {board && <Board town={town} onClose={() => setBoard(false)} />}
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
              acceptImportedTown(next);
            }}
          >
            <h2 className="font-display text-2xl">Replace the live town?</h2>
            <p className="mt-3 text-muted">
              The people here now will be overwritten in this browser.{" "}
              {(() => {
                const preview = previewDay(importText);
                if (!preview) return "The day in that file could not be read.";
                return preview.version != null
                  ? `The file is a version ${preview.version} town, day ${preview.day}.`
                  : `The file is day ${preview.day}.`;
              })()}{" "}
              Debts, notes, and selves in it become the town.
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

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function saveCopy(town: Town) {
  const text = exportTown(town);
  const framed = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  if (!framed) {
    downloadText(text, `the-game-day-${town.day}.json`, "application/json");
  }
  try {
    await navigator.clipboard.writeText(text);
    return framed ? "Copied. This preview cannot save a file." : "Copied. File download requested.";
  } catch {
    return framed
      ? "This preview cannot save a file or use the clipboard."
      : "File download requested.";
  }
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

function Mind({
  town,
  agent,
  pinned,
  draft,
  setDraft,
  busy,
  inspect,
  sendNote,
  onInspect,
  onClose,
  onPin,
  onSend,
  onAction,
}: {
  town: Town;
  agent: Agent;
  pinned: boolean;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  inspect: boolean;
  sendNote: string;
  onInspect: (value: boolean) => void;
  onClose: () => void;
  onPin: () => void;
  onSend: () => void;
  onAction: (id: string) => void;
}) {
  const lineRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const latestRef = useRef<HTMLLIElement | null>(null);
  const followRef = useRef(true);
  const [behind, setBehind] = useState(false);
  useEffect(() => {
    followRef.current = true;
    lineRef.current?.focus();
  }, [agent.id]);
  const player = agentById(town, "player");
  const memories = Array.isArray(agent.memories) ? agent.memories : [];
  const heard =
    agent.id === "player"
      ? memories.filter((m) => m.type === "chat")
      : memories.filter((m) => m.type === "chat" && m.with === "player");
  const newest = heard.length ? heard[heard.length - 1]!.id : "";
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (!followRef.current) {
      setBehind(true);
      return;
    }
    revealLatest(el, latestRef.current);
    setBehind(false);
  }, [newest, sendNote, agent.id]);
  const favors = (town.favors ?? []).filter((f) => {
    const mine = f.from === "player" || f.to === "player";
    if (!mine) return false;
    if (agent.id === "player") return true;
    return f.from === agent.id || f.to === agent.id;
  });
  const actions = agent.id === "player" ? [] : playerActions(town, agent.id);
  return (
    <aside className="mind" aria-label={`Talk with ${agent.name}`}>
      <div className="mind-bar">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{agent.role}</p>
          <h2 className="font-display text-3xl leading-none">{agent.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {agent.id === "player" ? `${player.money} on you · ${agent.status}` : agent.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" type="button" data-on={pinned ? "true" : "false"} onClick={onPin}>
            <Pin className="inline size-4" aria-hidden /> {pinned ? "Unpin" : "Pin Kevin"}
          </button>
          <button className="btn" type="button" onClick={onClose} aria-label="Close conversation">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div
        className="mind-body"
        ref={logRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const latest = latestRef.current;
          const latestBottom = latest
            ? el.scrollTop + latest.getBoundingClientRect().bottom - el.getBoundingClientRect().top
            : 0;
          const follow = !latest || followingLatest(el.scrollTop, latestBottom, el.clientHeight);
          followRef.current = follow;
          setBehind(!follow);
        }}
      >
        <section>
          <h3 className="text-sm uppercase tracking-wide text-muted">
            {agent.id === "player" ? "Your journal" : "What you heard"}
          </h3>
          <ul className="mt-1 space-y-2 text-sm">
            {heard.length === 0 && (
              <li className="text-muted">
                {agent.id === "player"
                  ? "You have not spoken yet."
                  : "You have not spoken with them yet."}
              </li>
            )}
            {heard.slice(-8).map((m) => {
              const turns = spokenTurns(m.text);
              return (
                <li key={m.id} ref={m.id === newest ? latestRef : undefined}>
                  <p className="text-muted">
                    Day {m.day} {formatClock(m.minute)}
                  </p>
                  {turns.length === 0 ? (
                    <p>{m.text}</p>
                  ) : (
                    turns.map((turn, index) => (
                      <p key={`${m.id}-${index}`}>
                        <span className="text-muted">{turn.who}. </span>
                        {turn.line}
                      </p>
                    ))
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="mt-4">
          <h3 className="text-sm uppercase tracking-wide text-muted">What is still open</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {favors.length === 0 && (player.projects ?? []).every((p) => p.status !== "open") && (
              <li className="text-muted">Nothing written down between you.</li>
            )}
            {(player.projects ?? [])
              .filter((project) => project.status === "open")
              .map((project) => (
                <li key={project.id}>
                  {project.kind === "other" && project.text === BABA_LOAF
                    ? "Carrying"
                    : "Commitment"}
                  : {project.text}
                </li>
              ))}
            {favors.map((favor) => (
              <li key={favor.id}>
                {favor.status === "owed" ? "Still owed" : favor.status}: {favor.text}
                {favor.amount ? ` (${favor.amount})` : ""}
              </li>
            ))}
          </ul>
        </section>
        <label className="mt-4 flex items-center gap-2 text-sm text-muted" htmlFor="mind-inspect">
          <input
            id="mind-inspect"
            name="inspect"
            type="checkbox"
            checked={inspect}
            onChange={(event) => onInspect(event.target.checked)}
          />
          Developer inspector. Not part of the town.
        </label>
        {inspect && <Inspector town={town} agent={agent} />}
      </div>
      {behind && (
        <button
          className="btn mind-jump"
          type="button"
          onClick={() => {
            const el = logRef.current;
            if (!el) return;
            followRef.current = true;
            revealLatest(el, latestRef.current);
            setBehind(false);
          }}
        >
          Newest reply
        </button>
      )}
      {agent.id !== "player" && (
        <form
          className="mind-say"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          {actions.length > 0 && (
            <details
              className="mind-actions"
              onToggle={() => {
                if (followRef.current && logRef.current)
                  revealLatest(logRef.current, latestRef.current);
              }}
            >
              <summary>
                Choices with {agent.name} · {actions.length}
              </summary>
              <ul>
                {actions.map((action) => (
                  <li key={action.id}>
                    <p>{action.terms}</p>
                    <button
                      className="btn mt-2"
                      type="button"
                      disabled={busy || Boolean(action.disabledReason)}
                      onClick={() => onAction(action.id)}
                    >
                      {action.label}
                    </button>
                    {action.disabledReason && (
                      <p className="mt-1 text-muted">{action.disabledReason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <label className="text-sm text-muted" htmlFor="mind-line">
            Your line to {agent.name}
          </label>
          <textarea
            ref={lineRef}
            id="mind-line"
            className="field mt-2 min-h-20 py-2"
            value={draft}
            maxLength={400}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-2 flex items-center gap-2">
            <button className="btn" data-on="true" type="submit" disabled={busy || !draft.trim()}>
              {busy ? "Saying it" : "Say it"}
            </button>
            <p className="mind-send-note text-sm text-muted" role="status" aria-live="polite">
              {sendNote}
            </p>
          </div>
        </form>
      )}
    </aside>
  );
}

function revealLatest(log: HTMLDivElement, latest: HTMLLIElement | null) {
  if (!latest) return;
  const bottom =
    log.scrollTop + latest.getBoundingClientRect().bottom - log.getBoundingClientRect().top;
  log.scrollTop = Math.max(0, bottom - log.clientHeight + 8);
}

function Inspector({ town, agent }: { town: Town; agent: Agent }) {
  const threads = (agent.threads ?? []).filter((t) => t.open);
  const beats = agent.plan?.beats ?? [];
  const hour = Math.floor(town.minute / 60);
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
      <p>{agent.identity}</p>
      <p>{agent.selfSentence}</p>
      <p>Want: {agent.want}</p>
      <ul>
        {beats.map((beat) => (
          <li key={beat.hour} className={beat.hour === hour ? "text-fg" : "text-muted"}>
            {String(beat.hour).padStart(2, "0")}:00 {beat.place} — {beat.status}
          </li>
        ))}
      </ul>
      <ul>
        {threads.map((thread) => (
          <li key={thread.id}>
            {thread.hidden ? "Hidden. " : ""}
            {thread.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Board({ town, onClose }: { town: Town; onClose: () => void }) {
  return (
    <aside className="mind" aria-label="Noticeboard">
      <div className="mind-bar">
        <h2 className="font-display text-3xl">Noticeboard</h2>
        <button className="btn" type="button" onClick={onClose} aria-label="Close board">
          <X className="size-4" />
        </button>
      </div>
      <div className="mind-body">
        <p className="text-muted">
          By Hobbs Cafe. Notes stay until someone takes them down. No one has to.
        </p>
        <ul className="mt-4 space-y-3">
          {town.notices.length === 0 && (
            <li>The board is empty. The town has not decided to write on it.</li>
          )}
          {town.notices.map((note) => (
            <li key={note.id} className="border-b border-line pb-3">
              <p className="text-xs uppercase tracking-wide text-muted">
                {note.author} · day {note.day} {formatClock(note.minute)}
              </p>
              <p className="mt-1">{note.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
