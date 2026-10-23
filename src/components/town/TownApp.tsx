import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  CharacterOverview,
  CharacterProgress,
  CharacterReflections,
  CharacterStrengths,
  ConversationCaption,
  Portrait,
  ResidentStrip,
  SocialPanel,
} from "./CharacterSocial";
import { visibleSocialEvents } from "@/game/social";
import type { Agent, AgentId, Face, NpcId, PlaceId, ThinkJob, Town } from "@/game/types";
import type {
  PhysicalActionResult,
  PhysicalDecision,
  PhysicalUsageSample,
} from "@/game/physical-types";
import {
  initializePhysicalItems,
  physicalItem,
  nearbyPhysicalItems,
  applyPhysicalCommand,
  startPhysicalSession,
  stopPhysicalSession,
  pausePhysicalSession,
  nextPhysicalJob,
  markPhysicalRequest,
  recordPhysicalUsage,
} from "@/game/physical-items";
import type { ManuscriptControls } from "./ManuscriptTools";
import { DiscussionPanel, type DiscussionControls, type DiscussionInput } from "./DiscussionPanel";
import {
  advanceDiscussions,
  applyDiscussionCommand,
  applyDiscussionResult,
  createLibraryDiscussion,
  discussionView,
  isDiscussionJobFresh,
  markDiscussionRequest,
  nextDiscussionJob,
  pauseDiscussion,
  recordDiscussionUsage,
  resumeDiscussion,
} from "@/game/discussions";

import { NPC_IDS } from "@/game/types";
import { applyLibraryAction, libraryActions, libraryView } from "@/game/community";
import { findPath } from "@/game/path";
import { PlayerTools, type ToolPage } from "./PlayerTools";
import { StampIdentityPanel } from "./StampIdentityPanel";
import { AgentWalletsPanel } from "./AgentWalletsPanel";
import { getStampIdentity } from "@/lib/stamps.functions";
import { isStampAppearance } from "@/lib/stamps/validation";
import {
  hasStampSession,
  isStampSuppressed,
  rememberStampSession,
} from "@/lib/stamps/client-session";
import type { StampAppearance } from "@/lib/stamps/types";
import { ReadingStatus } from "./LibraryProject";
import {
  applyPlayerAction,
  applyResult,
  BABA_LOAF,
  playerActions,
  spreadView,
} from "@/game/effects";
import { agentById } from "@/game/memory";
import { thinkTown } from "@/lib/mind.functions";
import { useMindAvailability } from "./use-mind-availability";
import {
  mindFailure,
  mindFailureFromResult,
  mindFailureMessage,
  type MindFailure,
} from "./mind-status";
import { offlineResult, prepareRetrievals } from "@/game/offline";
import { beatAt } from "@/game/plan";
import { buildPrompt, parseMind } from "@/game/prompt";
import {
  cameraFor,
  glideOf,
  onBoard,
  paint,
  pickAgents,
  pickPhysicalItem,
  resetGlide,
  syncGlide,
} from "@/game/render";
import {
  exportTown,
  MAX_TOWN_FILE_BYTES,
  parseTownFile,
  readTownFile,
  readTownSave,
  readTownConflicts,
  initializeTownSave,
  persistTownSave,
  replaceTownSave,
  type SaveResult,
} from "@/game/save";
import { forkTown } from "@/game/identity";
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
const LOCAL_DIALOGUE_KEY = "the-game-local-dialogue-only";
const MEETING_PROTOTYPE_KEY = "the-game-library-meeting-prototype";
const PHYSICAL_REQUEST_INTERVAL_MS = 31_000;

function physicalUsageSample(
  response: unknown,
  elapsedMs: number,
  success: boolean,
): PhysicalUsageSample {
  const object =
    response && typeof response === "object" ? (response as Record<string, unknown>) : null;
  const diagnostic =
    object?.diagnostics && typeof object.diagnostics === "object"
      ? (object.diagnostics as Record<string, unknown>)
      : null;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const input = count(diagnostic?.inputTokens),
    output = count(diagnostic?.outputTokens);
  return {
    elapsedMs: Math.round(elapsedMs),
    attempts: count(diagnostic?.attempts),
    totalTokens:
      count(diagnostic?.totalTokens) ?? (input !== null && output !== null ? input + output : null),
    success,
  };
}

function savedLocalPreference(): boolean {
  try {
    return localStorage.getItem(LOCAL_DIALOGUE_KEY) === "true";
  } catch {
    return false;
  }
}

function savedMeetingPreference(): boolean {
  try {
    return localStorage.getItem(MEETING_PROTOTYPE_KEY) === "true";
  } catch {
    return false;
  }
}

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
  const bootHold = useRef<string | null>(null);
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
  const replayRef = useRef<Replay | null>(null);
  const pendingRef = useRef(false);
  const foregroundPendingRef = useRef(false);
  const requestSerial = useRef(0);
  const activeJobRef = useRef<{ town: Town; job: ThinkJob } | null>(null);
  const localOnlyRef = useRef(savedLocalPreference());
  const routeRef = useRef<{
    title: string;
    target: { x: number; y: number };
    arrivalRadius: number;
  } | null>(null);
  const readingDestinationRef = useRef<{ title: string; target: { x: number; y: number } } | null>(
    null,
  );
  const stepInputRef = useRef<string | null>(null);
  const movementSaveRef = useRef<number | undefined>(undefined);
  const movementDirtyRef = useRef(false);
  const startOverRef = useRef(false);
  const toolOpenerRef = useRef<HTMLElement | null>(null);
  const boardOpenerRef = useRef<HTMLElement | null>(null);
  const socialOpenerRef = useRef<HTMLElement | null>(null);
  const toolsRef = useRef<ToolPage | "stamps" | "agent-wallets" | null>(null);
  const importTextRef = useRef<string | null>(null);
  const importKeepRef = useRef<HTMLButtonElement>(null);
  const hourLock = useRef(false);
  const mounted = useRef(true);
  const runMindRef = useRef<(live: Town, job: ThinkJob) => Promise<void>>(async () => {});
  const dispatchPhysicalRef = useRef<(live: Town) => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldFrameRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<"name" | "play" | "recover" | "unavailable">(
    townRef.current
      ? "play"
      : bootUnavailable.current
        ? "unavailable"
        : bootHold.current !== null
          ? "recover"
          : "name",
  );
  const [hold, setHold] = useState<string | null>(bootHold.current ?? null);
  const [name, setName] = useState("");
  const [recoverNote, setRecoverNote] = useState("");
  const [farNote, setFarNote] = useState("");
  const [tick, setTick] = useState(0);
  const [lastMind, setLastMind] = useState<"online" | null>(null);
  const [speed, setSpeed] = useState<0 | 1 | 4>(speedRef.current);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [panel, setPanel] = useState<AgentId | null>(null);
  const [pinned, setPinned] = useState<AgentId | null>(null);
  const [tools, setTools] = useState<ToolPage | "stamps" | "agent-wallets" | null>(null);
  const [crampedWorld, setCrampedWorld] = useState(false);
  const [stampAppearance, setStampAppearance] = useState<StampAppearance | null>(null);
  const stampAppearanceRef = useRef<StampAppearance | null>(null);
  const stampGeneration = useRef(0);
  const stampWorldId = townRef.current?.identityRegistry?.worldId;
  const stampCharacterId = townRef.current?.identityRegistry?.characters.player.characterId;
  const acceptStampAppearance = useCallback((next: StampAppearance | null) => {
    const registry = townRef.current?.identityRegistry;
    const safe =
      isStampAppearance(next) &&
      next.expiresAt > Date.now() &&
      next.worldId === registry?.worldId &&
      next.characterId === registry?.characters.player.characterId &&
      !isStampSuppressed(next)
        ? next
        : null;
    stampGeneration.current++;
    stampAppearanceRef.current = safe;
    setStampAppearance(safe);
  }, []);
  useEffect(() => {
    if (phase !== "play" || !stampWorldId || !stampCharacterId || tools === "stamps") return;
    let alive = true;
    const scope = { worldId: stampWorldId, characterId: stampCharacterId };
    async function refresh() {
      if (isStampSuppressed(scope) || !hasStampSession(scope)) {
        if (alive) acceptStampAppearance(null);
        return;
      }
      const generation = stampGeneration.current;
      let next: StampAppearance | null = null;
      let connected: boolean | null = null;
      try {
        const result = await getStampIdentity({ data: { scope } });
        if (result.ok) {
          connected = result.value.connected;
          if (connected) next = result.value.appearance;
        }
      } catch {
        /* Wallet tools are optional; keep local play available. */
      }
      if (alive && generation === stampGeneration.current) {
        if (connected !== null) rememberStampSession(scope, connected);
        acceptStampAppearance(next);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const expiry = window.setInterval(() => {
      if (stampAppearanceRef.current && stampAppearanceRef.current.expiresAt <= Date.now())
        acceptStampAppearance(null);
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.clearInterval(expiry);
    };
  }, [phase, stampWorldId, stampCharacterId, tools, acceptStampAppearance]);
  const [browserBackups, setBrowserBackups] = useState<{ key: string; raw: string }[]>([]);
  const [localOnly, setLocalOnly] = useState(localOnlyRef.current);
  const [preferenceNote, setPreferenceNote] = useState("");
  const [inspectorEnabled, setInspectorEnabled] = useState(false);
  const [watchTown, setWatchTown] = useState(false);
  const [watching, setWatching] = useState<AgentId | null>(null);
  const watchingRef = useRef<AgentId | null>(null);
  watchingRef.current = watching;
  const [socialOpen, setSocialOpen] = useState(false);
  const [dismissedCaption, setDismissedCaption] = useState<string | null>(null);
  const captionEventRef = useRef<string | null>(null);
  const [startTalking, setStartTalking] = useState(false);

  const [board, setBoard] = useState(false);
  const [thinking, setThinking] = useState("");
  const [replyFailure, setReplyFailure] = useState<MindFailure | null>(null);
  const {
    online,
    onlineRef,
    checked,
    checking,
    actionsAvailable,
    actionsAvailableRef,
    check: checkAI,
  } = useMindAvailability(localOnly, replyFailure !== null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"restore" | "fork">("restore");
  importTextRef.current = importText;
  toolsRef.current = tools;
  const [importError, setImportError] = useState("");
  const [drafts, setDrafts] = useState<Partial<Record<AgentId, string>>>({});
  const draft = drafts[panel ?? "player"] ?? "";
  const setDraft = (
    value: string | ((current: string) => string),
    id = panelRef.current ?? "player",
  ) =>
    setDrafts((previous) => ({
      ...previous,
      [id]: typeof value === "function" ? value(previous[id] ?? "") : value,
    }));
  const [hint, setHint] = useState(townRef.current ? !townRef.current.sawHint : true);
  const [inspect, setInspect] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [physicalNote, setPhysicalNote] = useState("");
  const [physicalRead, setPhysicalRead] = useState<PhysicalActionResult["content"] | null>(null);
  const [physicalSelected, setPhysicalSelected] = useState<string | null>(null);
  const physicalSelectedRef = useRef<string | null>(null);
  const physicalRequestStartedAtRef = useRef<number | null>(null);
  const [discussionEnabled, setDiscussionEnabled] = useState(savedMeetingPreference);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [discussionNote, setDiscussionNote] = useState("");
  const discussionStartedRef = useRef<number | null>(null);
  const pauseMeetingRef = useRef<(reason: string) => void>(() => {});
  const transportBusyRef = useRef(false);
  const [transportBusy, setTransportBusy] = useState(false);
  const [crowd, setCrowd] = useState<AgentId[] | null>(null);
  const [exportNote, setExportNote] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveResult | null>(null);
  const panelRef = useRef<AgentId | null>(null);
  const boardRef = useRef(false);

  function persistTown(live: Town) {
    void persistTownSave(live).then((result) => {
      if (mounted.current && townRef.current === live) {
        setSaveStatus(result);
        if (!result.ok && result.reason === "conflict") {
          speedRef.current = 0;
          live.paused = true;
          routeRef.current = null;
          setSpeed(0);
        }
      }
    });
  }

  function requestMind(kind: ThinkJob["kind"], user: string) {
    if (transportBusyRef.current)
      return Promise.reject(new Error("Previous AI request is still settling"));
    transportBusyRef.current = true;
    setTransportBusy(true);
    const settled = () => {
      transportBusyRef.current = false;
      if (mounted.current) setTransportBusy(false);
    };
    try {
      return thinkTown({ data: { kind, user } }).then(
        (result) => {
          settled();
          return result;
        },
        (error: unknown) => {
          settled();
          throw error;
        },
      );
    } catch (error) {
      settled();
      return Promise.reject(error);
    }
  }

  async function acceptImportedTown(next: Town, intent: "replace" | "load" = "replace") {
    if (intent === "replace") {
      const result = await replaceTownSave(next);
      if (!result.ok) {
        setImportError(
          "The saved town could not be safely replaced. Download the current copy and try again.",
        );
        setRecoverNote(
          "The saved town could not be safely replaced. Its original bytes have been kept.",
        );
        return;
      }
      setSaveStatus(result);
    } else setSaveStatus(null);
    requestSerial.current += 1;
    pendingRef.current = false;
    foregroundPendingRef.current = false;
    activeJobRef.current = null;
    if (movementSaveRef.current !== undefined) window.clearTimeout(movementSaveRef.current);
    movementSaveRef.current = undefined;
    movementDirtyRef.current = false;
    routeRef.current = null;
    stepInputRef.current = null;
    setThinking("");
    setTools(null);
    townRef.current = next;
    keysRef.current.clear();
    speedRef.current = next.paused ? 0 : 1;
    setSpeed(speedRef.current);
    setHint(!next.sawHint);
    setDrafts({});
    setSendNote("");
    setPhysicalNote("");
    setPhysicalRead(null);
    setPhysicalSelected(null);
    physicalSelectedRef.current = null;
    setDiscussionEnabled(savedMeetingPreference());
    setDiscussionDraft("");
    setDiscussionNote("");
    discussionStartedRef.current = null;
    setReplyFailure(null);
    setLastMind(null);
    setInspect(false);
    resetGlide(next);
    setImportText(null);
    setImportError("");
    setHold(null);
    setRecoverNote("");
    panelRef.current = null;
    setPanel(null);
    setPinned(null);
    setWatching(null);
    setWatchTown(false);
    setSocialOpen(false);

    boardRef.current = false;
    setBoard(false);
    setCrowd(null);
    setFarNote("");
    setExportNote("");
    replayRef.current = null;
    setReplay(null);
    setPhase("play");
    setTick((n) => n + 1);
  }

  function chooseAction(expectedTown: Town, target: AgentId, actionId: string) {
    if (
      townRef.current !== expectedTown ||
      (target !== "player" && panelRef.current !== target) ||
      foregroundPendingRef.current ||
      replayRef.current !== null
    )
      return;
    const result = applyPlayerAction(expectedTown, target, actionId);
    if (result.ok) persistTown(expectedTown);
    setSendNote(result.reply);
    setTick((n) => n + 1);
  }

  function chooseLibrary(expectedTown: Town, actionId: string) {
    if (townRef.current !== expectedTown || foregroundPendingRef.current || replayRef.current)
      return;
    const result = applyLibraryAction(expectedTown, actionId);
    if (result.ok) {
      persistTown(expectedTown);
      resetGlide(expectedTown);
    }
    setSendNote(result.reply);
    setTick((n) => n + 1);
  }

  function inspectManuscript(id: string) {
    const live = townRef.current;
    if (!live || replayRef.current || !physicalItem(live, id)) return;
    physicalSelectedRef.current = id;
    setPhysicalSelected(id);
    openTools("inventory");
  }

  function changeManuscript(decision?: PhysicalDecision) {
    const live = townRef.current;
    if (!live || replayRef.current || pendingRef.current || importTextRef.current !== null) return;
    let result: { ok: boolean; message: string };
    if (decision) {
      const applied = applyPhysicalCommand(live, "player", decision);
      if (decision.kind === "read" && applied.ok && applied.content)
        setPhysicalRead(applied.content);
      result = applied;
    } else result = initializePhysicalItems(live);
    setPhysicalNote(result.message);
    persistTown(live);
    setTick((n) => n + 1);
  }

  function watchManuscript(actor: NpcId) {
    const live = townRef.current;
    if (
      !live ||
      replayRef.current ||
      pendingRef.current ||
      importTextRef.current !== null ||
      !actionsAvailableRef.current ||
      localOnlyRef.current
    )
      return;
    if (!nearbyPhysicalItems(live, actor).length) {
      setPhysicalNote("Invite this resident when they are beside or holding the manuscript.");
      return;
    }
    const result = startPhysicalSession(live, actor, 8);
    setPhysicalNote(result.message);
    if (result.ok) {
      setRate(1);
      setWatching(actor);
      watchingRef.current = actor;
      closeTools();
    }
    persistTown(live);
    setTick((n) => n + 1);
  }

  function stopManuscript() {
    const live = townRef.current;
    if (!live || replayRef.current) return;
    stopPhysicalSession(live);
    setPhysicalNote("Resident trial stopped. The manuscript stays where it is.");
    persistTown(live);
    setTick((n) => n + 1);
  }

  function pauseMeeting(reason: string) {
    const live = townRef.current;
    if (!live) return;
    const pending = activeJobRef.current;
    if (pending?.town === live && pending.job.kind === "act" && pending.job.task === "discussion") {
      recordDiscussionUsage(
        live,
        pending.job,
        physicalUsageSample(
          null,
          discussionStartedRef.current === null
            ? 0
            : performance.now() - discussionStartedRef.current,
          false,
        ),
      );
      requestSerial.current += 1;
      activeJobRef.current = null;
      pendingRef.current = false;
      foregroundPendingRef.current = false;
      discussionStartedRef.current = null;
      setThinking("");
    }
    pauseDiscussion(live, reason);
    setDiscussionNote(reason);
    persistTown(live);
    setTick((n) => n + 1);
  }
  pauseMeetingRef.current = pauseMeeting;

  function changeDiscussion(decision: DiscussionInput) {
    const live = townRef.current;
    if (!live || !discussionEnabled || replayRef.current || importTextRef.current !== null) return;
    advanceDiscussions(live);
    const view = discussionView(live);
    if (!view.meeting) return;
    const result = applyDiscussionCommand(live, "player", {
      ...decision,
      meetingId: view.meeting.id,
      expectedRevision: view.actorRevision,
      commandId: crypto.randomUUID(),
    });
    setDiscussionNote(result.message);
    if (result.ok && decision.kind === "speak")
      setDiscussionDraft((current) => (current.trim() === decision.text.trim() ? "" : current));
    if (result.ok) persistTown(live);
    setTick((n) => n + 1);
  }

  function proposeDiscussion(topic: string) {
    const live = townRef.current;
    if (
      !live ||
      !discussionEnabled ||
      pendingRef.current ||
      replayRef.current ||
      importTextRef.current !== null
    )
      return;
    const result = createLibraryDiscussion(live, topic);
    setDiscussionNote(result.message);
    if (result.ok) persistTown(live);
    setTick((n) => n + 1);
  }

  async function checkDiscussionAvailability() {
    if (pendingRef.current || document.visibilityState !== "visible") return;
    const ready = await checkAI();
    setDiscussionNote(
      localOnlyRef.current
        ? "Local dialogue is selected. Turn it off in Help before requesting a meeting decision."
        : actionsAvailableRef.current && ready
          ? "Resident AI actions are configured. Request a decision when ready."
          : "Resident AI actions are unavailable. The meeting waits without generating dialogue.",
    );
  }

  function requestDiscussionDecision() {
    const live = townRef.current;
    if (
      !live ||
      !discussionEnabled ||
      pendingRef.current ||
      transportBusyRef.current ||
      replayRef.current ||
      importTextRef.current !== null ||
      document.visibilityState !== "visible"
    )
      return;
    if (!actionsAvailableRef.current || !onlineRef.current || localOnlyRef.current) {
      setDiscussionNote(
        "Resident AI actions are unavailable. The meeting waits; no local reply is substituted.",
      );
      return;
    }
    advanceDiscussions(live);
    const job = nextDiscussionJob(live);
    if (!job) {
      setDiscussionNote(
        "No resident decision is ready. Residents may need to arrive, read the invitation or receive a turn.",
      );
      return;
    }
    void runMindRef.current(live, job);
  }

  dispatchPhysicalRef.current = (live: Town) => {
    if (
      pendingRef.current ||
      transportBusyRef.current ||
      replayRef.current ||
      importTextRef.current !== null ||
      document.visibilityState !== "visible"
    )
      return;
    const job = nextPhysicalJob(live);
    if (!job) return;
    if (!actionsAvailableRef.current || localOnlyRef.current) {
      pausePhysicalSession(live, "AI actions are unavailable. Trial paused.");
      setPhysicalNote("AI actions are unavailable. Trial paused.");
      persistTown(live);
      setTick((n) => n + 1);
      return;
    }
    void runMindRef.current(live, job);
  };

  function openTools(page: ToolPage | "stamps" | "agent-wallets") {
    setSocialOpen(false);
    boardRef.current = false;
    setBoard(false);
    panelRef.current = null;
    setPanel(null);
    routeRef.current = null;
    stepInputRef.current = null;
    if (page === "help") setBrowserBackups(readTownConflicts());
    toolOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keysRef.current.clear();
    toolsRef.current = page;
    setTools(page);
  }

  function closeTools() {
    toolsRef.current = null;
    setTools(null);
    requestAnimationFrame(() => {
      if (toolOpenerRef.current?.isConnected) toolOpenerRef.current.focus();
      else canvasRef.current?.focus();
    });
  }

  function openSocial() {
    socialOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSocialOpen(true);
  }

  function closeSocial() {
    setSocialOpen(false);
    requestAnimationFrame(() => {
      if (socialOpenerRef.current?.isConnected) socialOpenerRef.current.focus();
      else canvasRef.current?.focus();
    });
  }

  function openBoard(opener?: HTMLElement) {
    boardOpenerRef.current =
      opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    routeRef.current = null;
    keysRef.current.clear();
    stepInputRef.current = null;
    panelRef.current = null;
    setPanel(null);
    toolsRef.current = null;
    setTools(null);
    setSocialOpen(false);
    setCrowd(null);
    boardRef.current = true;
    setBoard(true);
  }

  function closeBoard() {
    boardRef.current = false;
    setBoard(false);
    requestAnimationFrame(() => {
      if (boardOpenerRef.current?.isConnected) boardOpenerRef.current.focus();
      else canvasRef.current?.focus();
    });
  }

  function cancelAIRequest() {
    requestSerial.current += 1;
    activeJobRef.current = null;
    pendingRef.current = false;
    foregroundPendingRef.current = false;
    setThinking("");
    setSendNote("AI request cancelled. Your line is still here; no local reply was substituted.");
  }

  function setLocalPreference(value: boolean) {
    localOnlyRef.current = value;
    setLocalOnly(value);
    if (value) {
      const live = townRef.current;
      if (live && discussionView(live).meeting && discussionView(live).meeting?.status !== "closed")
        pauseMeeting("Meeting decisions paused while local dialogue is selected.");
      if (live?.physicalItems?.session?.enabled) {
        pausePhysicalSession(live, "Resident trial paused while local dialogue is selected.");
        persistTown(live);
      }
      cancelAIRequest();
      setReplyFailure(null);
    }
    try {
      localStorage.setItem(LOCAL_DIALOGUE_KEY, String(value));
      setPreferenceNote("Dialogue preference saved in this browser.");
    } catch {
      setPreferenceNote("The preference applies now, but this browser could not save it.");
    }
  }

  function goTo(place: PlaceId) {
    walkTo(placeTitle(place), ANCHORS[place]);
  }

  function walkTo(title: string, target: { x: number; y: number }, arrivalRadius = 1) {
    setWatching(null);
    watchingRef.current = null;
    const live = townRef.current;
    if (!live || replayRef.current) return;
    routeRef.current = { title, target: { ...target }, arrivalRadius };
    keysRef.current.clear();
    setFarNote(`Walking to ${title}. Use a direction or Escape to stop.`);
    closeTools();
  }

  function goToReading() {
    const live = townRef.current;
    if (!live || replayRef.current) return;
    const story = libraryView(live).story;
    if (story.gathering && story.scene.length === 0)
      walkTo(story.gathering.label, story.gathering.tile, 0);
  }

  function stepDirection(code: string) {
    if (replayRef.current !== null || importTextRef.current !== null) return;
    stepInputRef.current = code;
  }

  const importing = importText !== null;
  useEffect(() => {
    if (!importing) return;
    const live = townRef.current;
    if (live && discussionView(live).meeting)
      pauseMeetingRef.current("Meeting paused while reviewing an import.");
    if (live?.physicalItems?.session?.enabled) {
      pausePhysicalSession(live, "Resident trial paused while reviewing an import.");
      persistTown(live);
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const canvas = canvasRef.current;
    if (routeRef.current) setFarNote("Destination walk stopped while reviewing an import.");
    routeRef.current = null;
    keysRef.current.clear();
    stepInputRef.current = null;
    importKeepRef.current?.focus();
    return () => {
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
        else if (canvas?.isConnected) canvas.focus();
      });
    };
  }, [importing]);

  useEffect(() => {
    replayRef.current = replay;
    keysRef.current.clear();
    stepInputRef.current = null;
    if (replay) {
      const live = townRef.current;
      if (live && discussionView(live).meeting)
        pauseMeetingRef.current("Meeting paused for replay. Return to now and resume explicitly.");
      if (live?.physicalItems?.session?.enabled) {
        pausePhysicalSession(live, "Resident trial paused for replay.");
        persistTown(live);
      }
      const pendingPlayer = activeJobRef.current?.job.kind === "player";
      requestSerial.current += 1;
      activeJobRef.current = null;
      pendingRef.current = false;
      foregroundPendingRef.current = false;
      setThinking("");
      if (pendingPlayer)
        setSendNote("Return to now to send your line again; your draft is still here.");
      routeRef.current = null;
      keysRef.current.clear();
      stepInputRef.current = null;
      setPanel(null);
      setPinned(null);
      setBoard(false);
    }
  }, [replay]);

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "visible") {
        const pending = activeJobRef.current;
        if (pending?.job.kind === "act" && pending.job.task === "discussion")
          pauseMeetingRef.current(
            "Meeting paused while the browser is hidden. Resume explicitly to request another decision.",
          );
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
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
    if (phase !== "play" || !worldFrameRef.current) return;
    const frame = worldFrameRef.current;
    const measure = () => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setCrampedWorld(frame.clientHeight < rem * 22);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, [phase]);

  runMindRef.current = async (live, job) => {
    if (townRef.current !== live || pendingRef.current || transportBusyRef.current) return;
    if (localOnlyRef.current) return;
    if (job.kind === "act" && job.task === "discussion") {
      if (
        document.visibilityState !== "visible" ||
        !actionsAvailableRef.current ||
        !onlineRef.current ||
        !markDiscussionRequest(live, job)
      )
        return;
      pendingRef.current = true;
      foregroundPendingRef.current = false;
      activeJobRef.current = { town: live, job };
      const serial = ++requestSerial.current;
      const started = performance.now();
      discussionStartedRef.current = started;
      let timed: number | undefined;
      let response: unknown;
      let counted = false;
      let committed = false;
      const fresh = () =>
        mounted.current &&
        townRef.current === live &&
        requestSerial.current === serial &&
        replayRef.current === null &&
        importTextRef.current === null &&
        document.visibilityState === "visible" &&
        !localOnlyRef.current &&
        isDiscussionJobFresh(live, job);
      setThinking("discussion");
      setDiscussionNote(
        `Waiting for ${agentById(live, job.agentId).name}'s decision. No words have been added yet.`,
      );
      persistTown(live);
      setTick((n) => n + 1);
      try {
        const prompt = buildPrompt(live, job);
        const res = await new Promise<Awaited<ReturnType<typeof thinkTown>>>((resolve, reject) => {
          timed = window.setTimeout(() => reject(new Error("timeout")), 15_000);
          requestMind("act", prompt).then(resolve, reject);
        });
        response = res;
        if (!fresh()) return;
        if (!res.ok || res.text.length > 20_000) throw new Error("unavailable");
        const parsed = parseMind(job, res.text);
        if (!parsed || parsed.kind !== "act" || parsed.task !== "discussion")
          throw new Error("invalid discussion decision");
        advanceDiscussions(live);
        const result = applyDiscussionResult(live, parsed);
        recordDiscussionUsage(
          live,
          job,
          physicalUsageSample(res, performance.now() - started, result.ok),
        );
        counted = true;
        committed = result.ok;
        setDiscussionNote(result.message);
        if (!result.ok) pauseDiscussion(live, result.message);
      } catch {
        if (fresh()) {
          if (!counted) {
            recordDiscussionUsage(
              live,
              job,
              physicalUsageSample(response, performance.now() - started, false),
            );
            counted = true;
          }
          pauseDiscussion(
            live,
            "Resident decision failed or timed out. Meeting paused; no local dialogue was substituted.",
          );
          setDiscussionNote(
            "Resident decision failed or timed out. Your draft remains here. Resume and explicitly request another decision.",
          );
        }
      } finally {
        if (timed) window.clearTimeout(timed);
        if (requestSerial.current === serial) {
          if (!counted)
            recordDiscussionUsage(
              live,
              job,
              physicalUsageSample(response, performance.now() - started, false),
            );
          const currentMeeting = discussionView(live).meeting;
          if (
            !committed &&
            currentMeeting?.id === job.meetingId &&
            currentMeeting.status !== "closed" &&
            currentMeeting.status !== "paused"
          ) {
            pauseDiscussion(
              live,
              "The resident decision ended before it could be accepted. Resume explicitly.",
            );
            setDiscussionNote(
              "That resident decision is no longer current. The meeting is paused; no dialogue was added.",
            );
          }
          activeJobRef.current = null;
          pendingRef.current = false;
          foregroundPendingRef.current = false;
          discussionStartedRef.current = null;
          if (townRef.current === live) persistTown(live);
          if (mounted.current) {
            setThinking("");
            setTick((n) => n + 1);
          }
        }
      }
      return;
    }
    if (job.kind === "act") {
      if (document.visibilityState !== "visible" || !actionsAvailableRef.current) return;
      const previousStart = physicalRequestStartedAtRef.current;
      if (
        previousStart !== null &&
        performance.now() - previousStart < PHYSICAL_REQUEST_INTERVAL_MS
      ) {
        const note =
          "Waiting between free AI requests (up to 31 seconds). No request is used while waiting.";
        if (physicalNote !== note) setPhysicalNote(note);
        return;
      }
      if (!markPhysicalRequest(live, job)) return;
      pendingRef.current = true;
      activeJobRef.current = { town: live, job };
      const serial = ++requestSerial.current;
      const started = performance.now();
      let timed: number | undefined;
      let response: unknown;
      let counted = false;
      const fresh = () => {
        const session = live.physicalItems?.session;
        return (
          mounted.current &&
          townRef.current === live &&
          requestSerial.current === serial &&
          replayRef.current === null &&
          importTextRef.current === null &&
          !localOnlyRef.current &&
          session?.enabled === true &&
          session.actor === job.agentId &&
          session.revision === job.sessionRevision
        );
      };
      setThinking("act");
      persistTown(live);
      setTick((n) => n + 1);
      try {
        const prompt = buildPrompt(live, job);
        const res = await new Promise<Awaited<ReturnType<typeof thinkTown>>>((resolve, reject) => {
          timed = window.setTimeout(() => reject(new Error("timeout")), 15_000);
          physicalRequestStartedAtRef.current = performance.now();
          requestMind(job.kind, prompt).then(resolve, reject);
        });
        response = res;
        if (!fresh()) return;
        if (!res.ok || res.text.length > 20_000) throw new Error("unavailable");
        const parsed = parseMind(job, res.text);
        if (
          !parsed ||
          parsed.kind !== "act" ||
          parsed.task === "discussion" ||
          parsed.agentId !== job.agentId ||
          parsed.sessionRevision !== job.sessionRevision
        )
          throw new Error("invalid action");
        recordPhysicalUsage(live, job, physicalUsageSample(res, performance.now() - started, true));
        counted = true;
        const result = applyPhysicalCommand(live, parsed.agentId, parsed.decision);
        setPhysicalNote(result.message);
        if (!result.ok) pausePhysicalSession(live, result.message);
      } catch {
        if (fresh()) {
          if (!counted)
            recordPhysicalUsage(
              live,
              job,
              physicalUsageSample(response, performance.now() - started, false),
            );
          pausePhysicalSession(
            live,
            "AI action unavailable. Trial paused; no local reply was substituted.",
          );
          setPhysicalNote("AI action unavailable. Trial paused.");
        }
      } finally {
        if (timed) window.clearTimeout(timed);
        if (requestSerial.current === serial) {
          activeJobRef.current = null;
          pendingRef.current = false;
          foregroundPendingRef.current = false;
          if (townRef.current === live) persistTown(live);
          if (mounted.current) {
            setThinking("");
            setTick((n) => n + 1);
          }
        }
      }
      return;
    }
    pendingRef.current = true;
    foregroundPendingRef.current = job.kind === "player";
    activeJobRef.current = { town: live, job };
    const serial = ++requestSerial.current;
    const playerAtStart = agentById(live, "player").tile;
    let snapshot = {
      day: live.day,
      minute: live.minute,
      nextId: live.nextId,
      x: playerAtStart.x,
      y: playerAtStart.y,
    };
    const current = () =>
      mounted.current &&
      townRef.current === live &&
      requestSerial.current === serial &&
      !localOnlyRef.current;
    const fresh = () =>
      current() &&
      replayRef.current === null &&
      live.day === snapshot.day &&
      live.minute === snapshot.minute &&
      live.nextId === snapshot.nextId &&
      (job.kind === "player"
        ? inTalkRange(
            agentById(live, "player").tile.x,
            agentById(live, "player").tile.y,
            agentById(live, job.agentId).tile.x,
            agentById(live, job.agentId).tile.y,
          )
        : agentById(live, "player").tile.x === snapshot.x &&
          agentById(live, "player").tile.y === snapshot.y);
    if (mounted.current) setThinking(job.kind);
    let timed: number | undefined;
    let applied = false;
    let landed = false;
    let failed: MindFailure | null = null;
    const mark = () =>
      job.kind === "player" ? playerChatIds(agentById(live, job.agentId).memories ?? []) : [];
    try {
      prepareRetrievals(live, job);
      const prompt = buildPrompt(live, job);
      const playerBeforeRequest = agentById(live, "player").tile;
      snapshot = {
        day: live.day,
        minute: live.minute,
        nextId: live.nextId,
        x: playerBeforeRequest.x,
        y: playerBeforeRequest.y,
      };
      const res = await new Promise<Awaited<ReturnType<typeof thinkTown>>>((resolve, reject) => {
        timed = window.setTimeout(() => reject(new Error("timeout")), 15_000);
        requestMind(job.kind, prompt).then(resolve, reject);
      });
      if (!fresh()) return;
      if (!res.ok) {
        failed = mindFailureFromResult(res);
        throw new Error("AI request failed");
      }
      if (res.text.length > 20_000) throw new Error("huge");
      const parsed = parseMind(job, res.text);
      if (!parsed) throw new Error("invalid");
      const before = mark();
      applyResult(live, parsed);
      applied = true;
      if (job.kind === "player") {
        landed = exchangeLanded(before, mark());
        if (!landed) throw new Error("invalid");
        setLastMind("online");
        setReplyFailure(null);
      }
    } catch (error) {
      if (fresh()) {
        if (job.kind === "player") {
          failed ??= mindFailure(error);
          setReplyFailure(failed);
          // Keep the player's draft. A failed model request must never invent
          // an authored conversation or silently switch this browser to local.
        } else if (!applied) {
          try {
            applyResult(live, offlineResult(live, job));
          } catch {
            /* Background simulation may continue without a generated result. */
          }
        }
      }
    } finally {
      if (timed) window.clearTimeout(timed);
      if (requestSerial.current === serial) {
        activeJobRef.current = null;
        foregroundPendingRef.current = false;
        pendingRef.current = false;
        if (townRef.current === live) persistTown(live);
        if (mounted.current) {
          setThinking("");
          setTick((n) => n + 1);
          if (job.kind === "player" && current()) {
            const same = townRef.current === live && panelRef.current === job.agentId;
            setDraft((current) => nextDraft(current, job.text, true, landed), job.agentId);
            if (same) {
              setSendNote(
                landed
                  ? "They heard you."
                  : failed
                    ? `${mindFailureMessage(failed)} Your line is still here; no local reply was substituted.`
                    : "That did not land. Your line is still here.",
              );
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
    }
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (importTextRef.current !== null) {
        if (event.code === "Escape") {
          event.preventDefault();
          setImportText(null);
        }
        return;
      }
      if (event.code === "Escape") {
        const captionFocused =
          event.target instanceof Element && Boolean(event.target.closest(".conversation-caption"));
        setDismissedCaption(captionEventRef.current);
        if (routeRef.current) {
          routeRef.current = null;
          setFarNote("Destination walk stopped.");
        }
        stepInputRef.current = null;
        if (toolsRef.current) closeTools();
        else if (boardRef.current) closeBoard();
        else if (panelRef.current) requestAnimationFrame(() => canvasRef.current?.focus());
        else if (event.target instanceof Element && event.target.closest(".social-panel"))
          closeSocial();
        else if (captionFocused) requestAnimationFrame(() => canvasRef.current?.focus());
        if (panelRef.current) {
          setPanel(null);
        }
        setSocialOpen(false);

        setCrowd(null);
        return;
      }
      if (event.target instanceof Element && event.target.closest(".mind, [role='dialog']")) return;
      if (interactiveControl(focusOf(event.target))) return;
      if (replayRef.current !== null) return;
      if (opensTalk(event.code, false, Boolean(panelRef.current || boardRef.current))) {
        const live = townRef.current;
        if (!live || replayRef.current) return;
        const nearId = besideYou(live);
        if (!nearId) return;
        event.preventDefault();
        setTools(null);
        setSocialOpen(false);
        setPanel(nearId);
        setStartTalking(true);
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
      const minds =
        onlineRef.current && !localOnlyRef.current && document.visibilityState === "visible";
      if (minds && !pendingRef.current && !transportBusyRef.current) {
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
      if (!live || replayRef.current !== null || importTextRef.current !== null) return;
      let { x, y } = axis(keysRef.current);
      const stepCode = stepInputRef.current;
      if (!x && !y && (routeRef.current || stepCode) && moveCool > 0) return;
      if (stepCode && moveCool <= 0) {
        ({ x, y } = axis(new Set([stepCode])));
        stepInputRef.current = null;
      }
      if (x || y) routeRef.current = null;
      if (!x && !y && routeRef.current && moveCool <= 0) {
        const route = routeRef.current;
        const player = agentById(live, "player");
        if (
          Math.abs(player.tile.x - route.target.x) + Math.abs(player.tile.y - route.target.y) <=
          route.arrivalRadius
        ) {
          routeRef.current = null;
          persistTown(live);
          setFarNote(`You reached ${route.title}.`);
        } else {
          const blocked = new Set(
            live.agents.filter((a) => a.id !== "player").map((a) => `${a.tile.x},${a.tile.y}`),
          );
          const next = findPath(player.tile, route.target, blocked)[0];
          if (next) {
            x = next.x - player.tile.x;
            y = next.y - player.tile.y;
          } else {
            routeRef.current = null;
            setFarNote(
              `The way to ${route.title} is blocked. Try a direction or another destination.`,
            );
          }
        }
      }
      if ((x || y) && watchingRef.current) {
        watchingRef.current = null;
        setWatching(null);
      }
      if (!x && !y) {
        moveCool = 0;
        if (movementDirtyRef.current) {
          movementDirtyRef.current = false;
          if (movementSaveRef.current !== undefined) window.clearTimeout(movementSaveRef.current);
          movementSaveRef.current = undefined;
          persistTown(live);
        }
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
        if (stepCode) setFarNote("The way is blocked. Try another direction.");
        return;
      }
      player.face = x > 0 ? "e" : x < 0 ? "w" : y > 0 ? "s" : "n";
      player.tile = { x: nx, y: ny };
      const pending = activeJobRef.current;
      if (pending?.job.kind === "player") {
        const other = agentById(live, pending.job.agentId);
        if (!inTalkRange(nx, ny, other.tile.x, other.tile.y)) {
          requestSerial.current += 1;
          activeJobRef.current = null;
          pendingRef.current = false;
          foregroundPendingRef.current = false;
          setThinking("");
          setSendNote(
            "You walked out of earshot. Walk closer to send your line again; your draft is still here.",
          );
        }
      }
      movementDirtyRef.current = true;
      if (movementSaveRef.current === undefined)
        movementSaveRef.current = window.setTimeout(() => {
          movementSaveRef.current = undefined;
          movementDirtyRef.current = false;
          if (townRef.current === live) persistTown(live);
        }, 1000);
      player.status = `walking ${placeTitle(zoneAt(nx, ny))}`;
      if (stepCode)
        setFarNote(
          `Moved ${stepCode === "ArrowUp" ? "north" : stepCode === "ArrowDown" ? "south" : stepCode === "ArrowLeft" ? "west" : "east"}. ${placeTitle(zoneAt(nx, ny))}, tile ${nx}, ${ny}.`,
        );
      setTick((n) => n + 1);
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
          if (speedRef.current > 0 && replayRef.current === null && importTextRef.current === null)
            dispatchPhysicalRef.current(live);
          if (
            replayRef.current === null &&
            importTextRef.current === null &&
            speedRef.current > 0 &&
            !hourLock.current &&
            !foregroundPendingRef.current
          ) {
            clock += dt * 1000;
            const span = 1000 / speedRef.current;
            let guard = 0;
            let advanced = false;
            while (clock >= span && guard++ < 6) {
              clock -= span;
              const minds =
                onlineRef.current &&
                !localOnlyRef.current &&
                document.visibilityState === "visible";
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
          const panelTop = `${Math.round(canvas.getBoundingClientRect().top)}px`;
          if (parent && parent.style.getPropertyValue("--character-panel-top") !== panelTop)
            parent.style.setProperty("--character-panel-top", panelTop);
          if (w !== view.w || h !== view.h) {
            view.w = w;
            view.h = h;
          }
          const snap = speedRef.current === 4 || pendingRef.current;
          if (replayRef.current === null) syncGlide(live, dt, snap);
          const positions = positionsFor(live, replayRef.current);
          const playerPos = positions.player ?? glideOf("player");
          const focus =
            replayRef.current === null && watchingRef.current
              ? (positions[watchingRef.current] ?? playerPos)
              : playerPos;
          const cam = cameraFor(focus.x, focus.y, w, h);
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
              replay: replayRef.current !== null,
              selected: panelRef.current ?? watchingRef.current,
              selectedItem: physicalSelectedRef.current,
              stampAppearance: stampAppearanceRef.current,
              readingMarker: readingDestinationRef.current?.target,
              waypoint:
                replayRef.current !== null
                  ? null
                  : (routeRef.current ??
                    readingDestinationRef.current ??
                    ((live.guide ?? 0) < 3 ? { title: "Library", target: ANCHORS.library } : null)),
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
      if (movementSaveRef.current !== undefined) window.clearTimeout(movementSaveRef.current);
      movementSaveRef.current = undefined;
      movementDirtyRef.current = false;
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      delete window.__controlsTest;
      delete window.__game;
    };
  }, [phase, onlineRef]);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    const withStamp =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-stamp-entry") === "true";
    if (hold !== null) return;
    const town = createTown(name);
    town.paused = true;
    const result = startOverRef.current
      ? await replaceTownSave(town)
      : await initializeTownSave(town);
    if (!result.ok && result.reason === "conflict") {
      setSaveStatus(result);
      setRecoverNote(
        "Another tab created a saved town while you were choosing a name. Open that saved town to continue; your new copy has been preserved when browser storage allows it.",
      );
      return;
    }
    if (startOverRef.current && !result.ok) {
      setRecoverNote("The saved town could not be safely replaced. Import a backup or try again.");
      return;
    }
    startOverRef.current = false;
    townRef.current = town;
    setSaveStatus(result);
    speedRef.current = 0;
    setSpeed(0);
    setHint(true);
    setPhase("play");
    if (withStamp) openTools("stamps");
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
    if (!live || foregroundPendingRef.current || hourLock.current) return;
    hourLock.current = true;
    replayRef.current = null;
    setReplay(null);
    try {
      const minds =
        onlineRef.current && !localOnlyRef.current && document.visibilityState === "visible";
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
      if (job && minds && !pendingRef.current && !transportBusyRef.current)
        void runMindRef.current(live, job);
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

  function approach(id: AgentId, talk = false) {
    const live = townRef.current;
    if (!live) return;
    const target: AgentId = id;
    toolsRef.current = null;
    setTools(null);
    boardRef.current = false;
    setBoard(false);
    setSocialOpen(false);

    setFarNote("");
    setSendNote("");
    setStartTalking(talk);
    setPanel(target);
    const player = agentById(live, "player");
    const other = agentById(live, target);
    if (
      target === "kevin" &&
      (live.guide ?? 0) < 2 &&
      inTalkRange(player.tile.x, player.tile.y, other.tile.x, other.tile.y)
    ) {
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
    const focus = watchingRef.current ? (positions[watchingRef.current] ?? playerPos) : playerPos;
    const cam = cameraFor(focus.x, focus.y, rect.width, rect.height);
    const item = pickPhysicalItem(sx, sy, cam.camX, cam.camY, live);
    if (item) {
      inspectManuscript(item);
      return;
    }
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
      openBoard(canvas);
    }
  }

  async function sendLine() {
    const live = townRef.current;
    const who = panel;
    if (transportBusyRef.current) {
      setSendNote(
        "The previous AI request is still settling. Your line is kept; send it when the request finishes.",
      );
      return;
    }
    if (
      !live ||
      !who ||
      who === "player" ||
      foregroundPendingRef.current ||
      replayRef.current !== null
    )
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
    if (!localOnlyRef.current) {
      if (pendingRef.current || document.visibilityState !== "visible") {
        setSendNote(
          "AI is busy or this tab is inactive. Your line is still here; try again shortly.",
        );
        return;
      }
      if (!onlineRef.current) {
        setSendNote("Checking the AI connection. Your line is still here.");
        const ready = await checkAI();
        if (townRef.current !== live || panelRef.current !== who || replayRef.current !== null)
          return;
        if (!ready) {
          setSendNote(
            "AI is unavailable. Connection checks retry automatically. Your line is still here; no local reply was substituted.",
          );
          return;
        }
        const playerNow = agentById(live, "player");
        const residentNow = agentById(live, who);
        if (
          !inTalkRange(playerNow.tile.x, playerNow.tile.y, residentNow.tile.x, residentNow.tile.y)
        ) {
          setSendNote("Walk closer to send your line again. Your draft is still here.");
          return;
        }
      }
      if (
        localOnlyRef.current ||
        pendingRef.current ||
        foregroundPendingRef.current ||
        document.visibilityState !== "visible"
      ) {
        setSendNote("Return to this tab to send your line again. Your draft is still here.");
        return;
      }
      job.day = live.day;
      job.minute = live.minute;
      setSendNote("Waiting for an AI reply.");
      void runMindRef.current(live, job);
      return;
    }
    {
      try {
        const before = playerChatIds(agentById(live, who).memories ?? []);
        applyResult(live, offlineResult(live, job));
        persistTown(live);
        const landed = exchangeLanded(before, playerChatIds(agentById(live, who).memories ?? []));
        setDraft((current) => nextDraft(current, text, panelRef.current === who, landed), who);
        setSendNote(
          landed
            ? "They answered with local dialogue."
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
              if (report.status === "ready") void acceptImportedTown(report.town, "load");
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

  if (phase === "recover" && hold !== null) {
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
                startOverRef.current = true;
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
                void acceptImportedTown(next);
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
              {NPC_IDS.length} neighbors already call this town home. Now it’s your turn. Meet them,
              make a little trouble, see what tomorrow brings.
            </p>
            <PixelUniverse />
          </div>
          <form onSubmit={enter}>
            <div className="cartridge-label">
              <span>New resident</span>
              <span>Player {String(NPC_IDS.length + 1).padStart(2, "0")}</span>
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
            <label className="tool-option gate-dialogue-option">
              <input
                type="checkbox"
                checked={localOnly}
                onChange={(event) => setLocalPreference(event.target.checked)}
              />{" "}
              Use local dialogue only
            </label>
            <p className="gate-privacy-note">
              With AI enabled, your words and relevant town context are sent to the configured AI
              service. Local mode sends no AI requests.
            </p>
            {preferenceNote && <p role="status">{preferenceNote}</p>}
            <button className="btn" data-on="true" type="submit" disabled={!name.trim()}>
              Walk in <ArrowRight className="size-4" aria-hidden />
            </button>
            <button className="btn" type="submit" data-stamp-entry="true" disabled={!name.trim()}>
              Choose a stamp identity
            </button>
            <p className="gate-privacy-note">
              Optional: prove a supported wallet to choose a stamp portrait or head.
            </p>
            <p className="gate-save-note">
              <Save className="size-3" aria-hidden /> Your town saves in this browser.
            </p>
            {recoverNote && <p role="alert">{recoverNote}</p>}
            {saveStatus && !saveStatus.ok && saveStatus.reason === "conflict" && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const report = readTownSave();
                  if (report.status === "ready") void acceptImportedTown(report.town, "load");
                  else if (report.status === "unreadable") {
                    setHold(report.raw);
                    setRecoverNote("");
                    setPhase("recover");
                  } else
                    setRecoverNote(
                      "The saved town could not be read. Its original bytes have been kept.",
                    );
                }}
              >
                Open saved town
              </button>
            )}
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
  const library = libraryView(town);
  const reading = library.story.gathering;
  const readingPending = reading !== null && library.story.scene.length === 0;
  const joinReading =
    readingPending && reading.status === "ready"
      ? libraryActions(town).find((action) => {
          const [kind, argument] = JSON.parse(action.id) as [string, string];
          return kind === "evening-join" && argument === "listen";
        })
      : undefined;
  readingDestinationRef.current = readingPending
    ? { title: "The reading", target: reading.tile }
    : null;
  const shown = panel;

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
  const readingHere =
    reading !== null &&
    here === reading.place &&
    Math.abs(player.tile.x - reading.tile.x) + Math.abs(player.tile.y - reading.tile.y) <= 3;
  const planned = beatAt(player, town.minute);
  const guideLine = `${clockLine} WASD or arrows move one tile. On a phone, hold N W E S. Enter speaks to whoever is beside you. ${hobbsWay(player.tile.x, player.tile.y)} Open Choices with Kevin to agree a cafe shift, or with Baba to agree a bread tab. Read the terms before you choose. Or walk on.`;
  const yourOpenDebts = (town.favors ?? []).filter(
    (f) => f.status === "owed" && (f.from === "player" || f.to === "player"),
  );
  const nearby = town.agents
    .filter(
      (agent) =>
        agent.id !== "player" &&
        inTalkRange(player.tile.x, player.tile.y, agent.tile.x, agent.tile.y),
    )
    .map((agent) => agent.id);
  const talkChoices = crowd && crowd.length > 1 ? crowd : nearby;
  const aiUnavailable = !online || replyFailure !== null;
  const aiWarning = replyFailure
    ? `${mindFailureMessage(replyFailure)} No local reply was substituted. Your line is kept; send it again to retry.`
    : checked && !online
      ? "AI is unavailable. Messages stay unsent; no local replies will be substituted."
      : "";

  const connectionWarning =
    !localOnly && aiWarning ? (
      <div className="warn ai-warning" data-ai-warning role="alert">
        <p>{aiWarning}</p>
        <p>
          Connection checks retry automatically. A connection check does not resend your message.
        </p>
        <button className="btn" type="button" disabled={checking} onClick={() => void checkAI()}>
          {checking ? "Checking AI connection" : "Check AI connection"}
        </button>
      </div>
    ) : null;

  const events = visibleSocialEvents(town, watchTown, { day: clockDay, minute: clockMinute });
  const conversations = events.filter((event) => event.kind === "conversation");
  captionEventRef.current = conversations[0]?.id ?? null;
  const followCharacter = (id: AgentId) => {
    setWatchTown(true);
    setWatching(id);
    setPanel(null);
    setBoard(false);
    setTools(null);
  };
  const manuscriptControls: ManuscriptControls = {
    available: actionsAvailable && !localOnly && checked,
    busy: Boolean(thinking) || transportBusy || importing,
    replaying: replay !== null,
    selected: physicalSelected,
    note: physicalNote,
    readContent: physicalRead,
    onIntroduce: () => changeManuscript(),
    onStart: watchManuscript,
    onStop: stopManuscript,
    onCommand: changeManuscript,
  };
  const meetingControls: DiscussionControls = {
    view: discussionView(town),
    enabled: discussionEnabled,
    available: actionsAvailable && online && !localOnly && checked,
    busy: Boolean(thinking) || transportBusy || importing,
    decisionPending: thinking === "discussion",
    replaying: replay !== null,
    note:
      transportBusy && !thinking
        ? `${discussionNote} The previous AI request is still settling. No second request will start.`
        : discussionNote,
    draft: discussionDraft,
    onDraft: setDiscussionDraft,
    onEnable: (value) => {
      setDiscussionEnabled(value);
      try {
        localStorage.setItem(MEETING_PROTOTYPE_KEY, String(value));
      } catch {
        /* The preference still applies to this page. */
      }
      if (!value) pauseMeeting("Local meeting decisions disabled. The discussion is paused.");
    },
    onCreate: proposeDiscussion,
    onCommand: changeDiscussion,
    onGo: () => {
      closeSocial();
      goTo("library");
    },
    onDecision: requestDiscussionDecision,
    onCheck: () => void checkDiscussionAvailability(),
    onPause: () =>
      pauseMeeting(
        "Meeting decisions paused by the player. Listening and the saved transcript remain available.",
      ),
    onResume: () => {
      const live = townRef.current;
      if (!live || replayRef.current || importTextRef.current !== null || !discussionEnabled)
        return;
      const result = resumeDiscussion(live);
      setDiscussionNote(result.message);
      persistTown(live);
      setTick((n) => n + 1);
    },
  };
  const nearbyManuscript = nearbyPhysicalItems(town, "player")[0];

  return (
    <main
      className="town"
      data-talking={shown || board || socialOpen || tools ? "true" : "false"}
      data-cramped-world={crampedWorld ? "true" : "false"}
      onFocusCapture={(event) => {
        if (!(event.target instanceof Element) || event.target.closest(".mind")) return;
        const pane = event.currentTarget.querySelector(".mind");
        if (!pane) return;
        const destination = event.target;
        requestAnimationFrame(() => {
          if (destination !== document.activeElement || !pane.isConnected) return;
          const box = destination.getBoundingClientRect();
          const left = Math.max(0, box.left);
          const right = Math.min(innerWidth, box.right);
          const top = Math.max(0, box.top);
          const bottom = Math.min(innerHeight, box.bottom);
          if (right <= left || bottom <= top) return;
          const points = [
            [0.5, 0.5],
            [0.15, 0.15],
            [0.85, 0.15],
            [0.15, 0.85],
            [0.85, 0.85],
          ];
          if (
            !points.every(([x, y]) =>
              pane.contains(
                document.elementFromPoint(left + (right - left) * x, top + (bottom - top) * y),
              ),
            )
          )
            return;
          // Dismiss a pane that obscures focus; visible clock and reply controls
          // must remain usable without closing the active conversation.
          toolsRef.current = null;
          panelRef.current = null;
          boardRef.current = false;
          setTools(null);
          setPanel(null);
          setBoard(false);
          setSocialOpen(false);
          requestAnimationFrame(() => {
            if (destination === document.activeElement)
              destination.scrollIntoView({ block: "nearest", inline: "nearest" });
          });
        });
      }}
    >
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
            aria-pressed={speed === 0}
            type="button"
            onClick={() => setRate(0)}
            aria-label="Pause"
          >
            <Pause className="inline size-4" aria-hidden /> Pause
          </button>
          <button
            className="btn"
            data-on={speed === 1 ? "true" : "false"}
            aria-pressed={speed === 1}
            type="button"
            onClick={() => setRate(1)}
          >
            <Play className="inline size-4" aria-hidden /> 1×
          </button>
          <button
            className="btn"
            data-on={speed === 4 ? "true" : "false"}
            aria-pressed={speed === 4}
            type="button"
            onClick={() => setRate(4)}
          >
            4×
          </button>
          <button className="btn" type="button" onClick={nextHour} disabled={thinking === "player"}>
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
          <p className="status-message" role="status" aria-live="polite">
            {farNote}
          </p>
        )}
        <span
          className="badge"
          data-ai-status={
            localOnly
              ? "local"
              : !checked
                ? "checking"
                : aiUnavailable
                  ? "unavailable"
                  : lastMind === "online"
                    ? "responded"
                    : "ready"
          }
          data-off={
            localOnly || aiUnavailable ? "true" : lastMind === "online" ? "false" : undefined
          }
          title={
            localOnly
              ? "You chose authored local dialogue in Help & privacy."
              : aiUnavailable
                ? "AI has not completed a usable reply. Your message is kept for retry."
                : lastMind === "online"
                  ? "The latest player AI response was received and accepted."
                  : "AI is configured. Send a message to request a reply."
          }
        >
          {localOnly
            ? "Local dialogue selected"
            : !checked
              ? "Checking AI"
              : !online
                ? "AI reconnecting"
                : replyFailure
                  ? "AI reply failed"
                  : lastMind === "online"
                    ? "AI responded"
                    : "AI ready"}
        </span>
        {thinking && (
          <span className="status-message" role="status">
            {thinking === "player" ? "Waiting for your AI reply" : "Residents are thinking"}
          </span>
        )}
        {thinking === "player" && (
          <button className="btn" type="button" onClick={cancelAIRequest}>
            Cancel AI request
          </button>
        )}
        {town.physicalItems?.session && !replay && (
          <span className="status-message" role="status">
            {thinking === "act"
              ? "A resident is deciding what to do with the manuscript."
              : physicalNote ||
                town.physicalItems.session.lastResult?.message ||
                "The manuscript trial is ready."}
          </span>
        )}
        <div className="status-controls">
          <span>
            <kbd>WASD / ↑↓←→</kbd> move
          </span>
          <span>
            <kbd>ENTER</kbd> talk
          </span>
        </div>
      </div>
      <nav className="town-tools" aria-label="Your town tools">
        <button className="btn" type="button" onClick={() => openTools("agent-wallets")}>
          Agent wallets
        </button>
        <button className="btn" type="button" onClick={() => openTools("stamps")}>
          {stampAppearance &&
            stampAppearance.worldId === town.identityRegistry?.worldId &&
            stampAppearance.characterId === town.identityRegistry?.characters.player.characterId &&
            stampAppearance.expiresAt > Date.now() && (
              <span
                style={{
                  display: "inline-block",
                  width: 28,
                  height: 28,
                  overflow: "hidden",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <img
                  alt={stampAppearance.title}
                  src={stampAppearance.pngDataUrl}
                  style={{
                    position: "absolute",
                    maxWidth: "none",
                    width: `${100 / stampAppearance.crop.size}%`,
                    height: `${100 / stampAppearance.crop.size}%`,
                    left: `${(-100 * stampAppearance.crop.x) / stampAppearance.crop.size}%`,
                    top: `${(-100 * stampAppearance.crop.y) / stampAppearance.crop.size}%`,
                    imageRendering: "pixelated",
                  }}
                />
              </span>
            )}
          Stamp identity
        </button>
        <button className="btn" type="button" onClick={() => openTools("journal")}>
          Journal
        </button>
        <button className="btn" type="button" onClick={() => openTools("inventory")}>
          Inventory
        </button>
        {nearbyManuscript && (
          <button
            className="btn"
            type="button"
            disabled={replay !== null}
            onClick={() => inspectManuscript(nearbyManuscript.id)}
          >
            Inspect manuscript
          </button>
        )}
        <button
          className="btn"
          type="button"
          aria-label="Go somewhere"
          onClick={() => openTools("map")}
        >
          Go to
        </button>
        <button
          className="btn"
          type="button"
          aria-label="Library project"
          onClick={() => openTools("library")}
        >
          Library
        </button>
        <button
          className="btn"
          type="button"
          aria-label="Help & privacy"
          onClick={() => openTools("help")}
        >
          Help
        </button>
      </nav>
      <div className="social-toolbar">
        <ResidentStrip
          town={town}
          selected={shown}
          pinned={pinned}
          onSelect={approach}
          replay={replay !== null}
        />
        <button
          className="btn town-life-toggle"
          type="button"
          aria-expanded={socialOpen}
          onClick={() => {
            if (socialOpen) closeSocial();
            else openSocial();
            setTools(null);
            setPanel(null);
            setBoard(false);
          }}
        >
          Town life{" "}
          <span>
            {watchTown ? "Watch · " : ""}
            {conversations.length} exchanges
          </span>
        </button>
        {watching && (
          <button className="btn return-to-player" type="button" onClick={() => setWatching(null)}>
            Following {agentById(town, watching).name} · Return to me
          </button>
        )}
      </div>

      {saveStatus && !saveStatus.ok && (
        <p className="warn" role="alert">
          {saveStatus.reason === "conflict"
            ? "Another tab changed the saved town. This copy has not replaced it. Download this copy before switching or closing the page."
            : "This town has not saved in this browser. Download a copy before closing the page."}{" "}
          <button
            className="btn"
            type="button"
            onClick={() => {
              void saveCopy(town).then(setExportNote);
            }}
          >
            Download this copy
          </button>
          {saveStatus.reason === "conflict" && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                const report = readTownSave();
                if (report.status === "ready") void acceptImportedTown(report.town, "load");
                else
                  setExportNote(
                    "The saved town could not be read. Keep a downloaded copy of this town.",
                  );
              }}
            >
              Load saved town
            </button>
          )}
        </p>
      )}
      {localOnly && !shown && !tools && (
        <p className="warn offline-note" role="status">
          Local dialogue only is selected. Turn it off in Help & privacy to use AI.
        </p>
      )}
      {(!shown || tools) && connectionWarning}
      {hint && (town.guide ?? 0) < 3 && !shown && !tools && (
        <div className="welcome-tip">
          <Sparkles className="welcome-icon size-5" aria-hidden />
          <div>
            <strong>{library.story.title}</strong>
            <p>
              Northern wants to read a first page to his neighbors. Help find a place to begin, or
              explore on your own.
            </p>
          </div>
          <button className="btn" type="button" onClick={() => openTools("library")}>
            Library project
          </button>
          <details>
            <summary>How to play</summary>
            <p>{guideLine}</p>
          </details>
        </div>
      )}
      {yourOpenDebts.length > 0 && !shown && !tools && (
        <p className="warn" role="status">
          {yourOpenDebts.length} open{" "}
          {yourOpenDebts.length === 1 ? "tab or favor" : "tabs or favors"} involving you.{" "}
          <button className="btn" type="button" onClick={() => approach("player")}>
            View your journal
          </button>
        </p>
      )}
      <div className="world-frame" ref={worldFrameRef}>
        <canvas
          ref={canvasRef}
          className="town-canvas h-full"
          tabIndex={0}
          onClick={onCanvasClick}
          aria-label={`The town, home to ${town.agents.length - 1} neighbors and you. Use the nearby conversation buttons or press Enter to talk.`}
        />
        {readingPending && !shown && !tools && !board && !socialOpen && replay === null && (
          <div className="reading-invitation" aria-label="Reading invitation">
            <strong>{reading.label}</strong>
            <p>
              <ReadingStatus status={reading.status} />
            </p>
            {joinReading && !joinReading.disabledReason ? (
              <>
                <p id="reading-join-terms">{joinReading.terms}</p>
                <button
                  className="btn reading-main-action"
                  type="button"
                  aria-describedby="reading-join-terms"
                  disabled={thinking === "player"}
                  onClick={() => {
                    chooseLibrary(town, joinReading.id);
                    openTools("library");
                  }}
                >
                  {joinReading.label}
                </button>{" "}
              </>
            ) : !readingHere ? (
              <button className="btn reading-main-action" type="button" onClick={goToReading}>
                Go to the reading
              </button>
            ) : null}{" "}
            <button
              className={`btn${readingHere && !joinReading ? " reading-main-action" : ""}`}
              type="button"
              onClick={() => openTools("library")}
            >
              Reading details
            </button>
          </div>
        )}
        <div className="world-label" aria-hidden>
          <i />
          {replay
            ? "A moment from the town"
            : speed === 0
              ? "Town time · paused"
              : "A day in the town"}
        </div>
        <div className="world-caption" aria-hidden>
          {town.agents.length} residents · endless possibilities
        </div>
        {!shown &&
          !board &&
          !tools &&
          !socialOpen &&
          !(readingPending && readingHere) &&
          conversations[0]?.id !== dismissedCaption && (
            <ConversationCaption
              town={town}
              event={conversations[0]}
              onOpen={openSocial}
              onClose={() => {
                setDismissedCaption(conversations[0]?.id ?? null);
                requestAnimationFrame(() => canvasRef.current?.focus());
              }}
            />
          )}
        {!shown && !board && !tools && socialOpen && (
          <SocialPanel
            town={town}
            events={events}
            watch={watchTown}
            replay={replay !== null}
            onWatch={(value) => {
              setWatchTown(value);
              if (!value) setWatching(null);
            }}
            onClose={closeSocial}
            onFollow={followCharacter}
            onProfile={approach}
            discussion={<DiscussionPanel town={town} controls={meetingControls} />}
          />
        )}
        {!shown &&
          !board &&
          !tools &&
          !socialOpen &&
          replay === null &&
          !(readingPending && readingHere) &&
          talkChoices.length > 0 && (
            <div className="crowd" role="group" aria-label={crowd ? "Who is here" : "Talk nearby"}>
              <span className="crowd-label">{crowd ? "Who is here" : "Talk nearby"}</span>
              {talkChoices.map((id) => {
                const person = town.agents.find((agent) => agent.id === id);
                return (
                  <button
                    key={id}
                    className="btn"
                    type="button"
                    aria-label={
                      id === "player" ? "Your journal" : `Talk with ${person?.name ?? id}`
                    }
                    onClick={() => {
                      setCrowd(null);
                      approach(id, true);
                    }}
                  >
                    {person?.name ?? id}
                  </button>
                );
              })}
            </div>
          )}
        {!tools && !shown && here === "library" && replay === null && (
          <button className="btn library-board" type="button" onClick={() => openTools("library")}>
            Library board
          </button>
        )}
        <div className="dpad" aria-hidden={false}>
          <Pad
            code="ArrowUp"
            keys={keysRef}
            onStep={stepDirection}
            disabled={replay !== null || importing}
            className="u"
            label="North"
          >
            N
          </Pad>
          <Pad
            code="ArrowLeft"
            keys={keysRef}
            onStep={stepDirection}
            disabled={replay !== null || importing}
            className="l"
            label="West"
          >
            W
          </Pad>
          <Pad
            code="ArrowRight"
            keys={keysRef}
            onStep={stepDirection}
            disabled={replay !== null || importing}
            className="r"
            label="East"
          >
            E
          </Pad>
          <Pad
            code="ArrowDown"
            keys={keysRef}
            onStep={stepDirection}
            disabled={replay !== null || importing}
            className="d"
            label="South"
          >
            S
          </Pad>
        </div>
        {shown && !tools && (
          <Mind
            key={shown}
            town={town}
            agent={agentById(town, shown)}
            pinned={pinned === shown}
            startTalking={startTalking}
            watch={watchTown}
            replay={replay !== null}
            onWatch={() => followCharacter(shown)}

            draft={draft}
            setDraft={setDraft}
            busy={thinking === "player" || replay !== null}
            inspect={inspectorEnabled && inspect}
            sendNote={sendNote}
            localDialogue={localOnly}
            connectionWarning={connectionWarning}
            inspectorEnabled={inspectorEnabled}
            onInspect={setInspect}
            onClose={() => {
              setPanel(null);
              requestAnimationFrame(() => canvasRef.current?.focus());
            }}
            onPin={() => {
              setPinned((value) => (value === shown ? null : shown));
            }}
            onSend={() => void sendLine()}
            onAction={(id) => chooseAction(town, shown, id)}
            onLibrary={() => openTools("library")}
          />
        )}
        {tools === "stamps" && town.identityRegistry && (
          <StampIdentityPanel
            scope={{
              worldId: town.identityRegistry.worldId,
              characterId: town.identityRegistry.characters.player.characterId,
            }}
            onAppearance={acceptStampAppearance}
            onClose={closeTools}
          />
        )}
        {tools === "agent-wallets" && town.identityRegistry && (
          <AgentWalletsPanel
            world={{
              sourceWorldId: town.identityRegistry.worldId,
              title: `${player.name}'s town`,
              characters: town.agents.map((person) => ({
                role: person.id,
                sourceCharacterId: town.identityRegistry!.characters[person.id].characterId,
                name: person.name,
              })),
            }}
            onClose={closeTools}
          />
        )}
        {tools && tools !== "stamps" && tools !== "agent-wallets" && (
          <PlayerTools
            page={tools}
            town={town}
            manuscriptControls={manuscriptControls}
            localOnly={localOnly}
            preferenceNote={preferenceNote}
            inspectorEnabled={inspectorEnabled}
            inventoryActions={playerActions(town, "player")}
            busy={thinking === "player" || replay !== null}
            actionNote={sendNote}
            onClose={closeTools}
            onLocalOnly={setLocalPreference}
            onInspector={(value) => {
              setInspectorEnabled(value);
              setInspect(value);
            }}
            onGo={goTo}
            onStep={stepDirection}
            replaying={replay !== null}
            onAction={(id) => chooseAction(town, "player", id)}
            onLibrary={() => setTools("library")}
            onLibraryAction={(id) => chooseLibrary(town, id)}
            onGoReading={goToReading}
            backups={browserBackups}
            onBackup={(backup) => {
              try {
                downloadText(backup.raw, "the-game-preserved-town.json", "application/json");
                setPreferenceNote("Preserved copy download requested.");
              } catch {
                setPreferenceNote("The download could not start. This browser copy has been kept.");
              }
            }}
          />
        )}
        {board && <Board town={town} onClose={closeBoard} />}
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
          onClick={() => openBoard()}
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
            setImportMode("restore");
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
      {importText !== null && (
        <div
          className="gate absolute inset-0 z-10 bg-bg/90"
          role="dialog"
          aria-modal="true"
          aria-labelledby="town-import-title"
          aria-describedby="town-import-description"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setImportText(null);
            }
            if (event.key === "Tab") {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled)",
                ),
              ).filter(
                (control) =>
                  !(control instanceof HTMLInputElement && control.type === "radio") ||
                  control.checked,
              );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (!importText.trim()) return;
              const report = readTownFile(importText);
              if (report.status !== "ready") {
                setImportError(report.reason);
                return;
              }
              try {
                const next = importMode === "fork" ? forkTown(report.town) : report.town;
                void acceptImportedTown(next);
              } catch {
                setImportError(
                  "A separate town could not be created. The current town has been kept.",
                );
              }
            }}
          >
            <h2 id="town-import-title" className="font-display text-2xl">
              Replace the live town?
            </h2>
            <p id="town-import-description" className="mt-3 text-muted">
              The people here now will be overwritten in this browser.{" "}
              {(() => {
                const preview = previewDay(importText);
                if (!preview) return "The day in that file could not be read.";
                return preview.version != null
                  ? `The file is a version ${preview.version} town, day ${preview.day}.`
                  : `The file is day ${preview.day}.`;
              })()}{" "}
              Its story, possessions and debts will be loaded. A recovery copy of the current town
              is kept before replacement.
            </p>
            <fieldset className="mt-4 grid gap-3">
              <legend className="mb-2">How should this file be used?</legend>
              <label>
                <input
                  type="radio"
                  name="town-import-mode"
                  value="restore"
                  checked={importMode === "restore"}
                  onChange={() => setImportMode("restore")}
                />{" "}
                Restore this town — keep the same people and world.
              </label>
              <label>
                <input
                  type="radio"
                  name="town-import-mode"
                  value="fork"
                  checked={importMode === "fork"}
                  onChange={() => setImportMode("fork")}
                />{" "}
                Create a separate town — new people with copied histories.
              </label>
            </fieldset>
            {importError && (
              <p className="mt-3 text-primary" role="alert">
                {importError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn" data-on="true" type="submit">
                {importMode === "fork" ? "Create separate town" : "Replace"}
              </button>
              <button
                ref={importKeepRef}
                className="btn"
                type="button"
                onClick={() => setImportText(null)}
              >
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
    if (frame) {
      town.agents.forEach((agent, index) => {
        out[agent.id] = {
          x: frame[index * 2] ?? Number.NaN,
          y: frame[index * 2 + 1] ?? Number.NaN,
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
  let text: string;
  try {
    text = exportTown(town);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "This town could not be exported. The saved copy has been kept.";
  }
  const framed = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  let downloaded = false;
  if (!framed) {
    try {
      downloadText(text, `the-game-day-${town.day}.json`, "application/json");
      downloaded = true;
    } catch {
      /* Clipboard can still preserve a copy. */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return framed
      ? "Copied. This preview cannot save a file."
      : downloaded
        ? "Copied. File download requested."
        : "Copied. The file download could not start.";
  } catch {
    return framed
      ? "This preview cannot save a file or use the clipboard."
      : downloaded
        ? "File download requested."
        : "The file download and clipboard could not save a copy. Try again before closing this page.";
  }
}

function Pad({
  code,
  keys,
  className,
  label,
  children,
  onStep,
  disabled,
}: {
  code: string;
  keys: React.RefObject<Set<string>>;
  className: string;
  label: string;
  children: string;
  onStep: (code: string) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        if (event.detail === 0) onStep(code);
      }}
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
  startTalking,
  watch,
  replay,
  onWatch,
  draft,
  setDraft,
  busy,
  inspect,
  sendNote,
  localDialogue,
  connectionWarning,
  onInspect,
  inspectorEnabled,
  onClose,
  onPin,
  onSend,
  onAction,
  onLibrary,
}: {
  town: Town;
  agent: Agent;
  pinned: boolean;
  startTalking: boolean;
  watch: boolean;
  replay: boolean;
  onWatch: () => void;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  inspect: boolean;
  sendNote: string;
  localDialogue: boolean;
  connectionWarning: React.ReactNode;
  onInspect: (value: boolean) => void;
  inspectorEnabled: boolean;
  onClose: () => void;
  onPin: () => void;
  onSend: () => void;
  onAction: (id: string) => void;
  onLibrary: () => void;
}) {
  const lineRef = useRef<HTMLTextAreaElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const latestRef = useRef<HTMLLIElement | null>(null);
  const keyboardTabRef = useRef(false);
  const followRef = useRef(true);
  const [behind, setBehind] = useState(false);
  const [tab, setTab] = useState<"overview" | "strengths" | "together" | "progress">(
    startTalking || agent.id === "player" ? "together" : "overview",
  );
  useEffect(() => {
    followRef.current = true;
    if (!keyboardTabRef.current) {
      if (tab === "together" && lineRef.current) lineRef.current.focus();
      else tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    }
    keyboardTabRef.current = false;
  }, [agent.id, tab]);
  useEffect(() => {
    if (sendNote && document.activeElement === document.body) feedbackRef.current?.focus();
  }, [sendNote]);
  const player = agentById(town, "player");
  const canTalk = inTalkRange(player.tile.x, player.tile.y, agent.tile.x, agent.tile.y);
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
        <div className="character-heading">
          <Portrait id={agent.id} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">{agent.role}</p>
            <h2 className="font-display text-3xl leading-none">{agent.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {replay
                ? "Recorded positions"
                : agent.id === "player"
                  ? `${player.money} on you`
                  : canTalk
                    ? "Nearby · you can talk"
                    : "Walk closer to talk"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn" type="button" data-on={pinned ? "true" : "false"} onClick={onPin}>
            <Pin className="inline size-4" aria-hidden /> {pinned ? "Unpin" : "Pin"}
          </button>
          <button className="btn" type="button" onClick={onClose} aria-label="Close conversation">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={tabsRef}
        className="character-tabs"
        role="tablist"
        aria-label={`${agent.name} card sections`}
      >
        {(["overview", "strengths", "together", "progress"] as const).map((name) => (
          <button
            type="button"
            key={name}
            role="tab"
            id={`character-tab-${name}`}
            aria-controls={`character-section-${name}`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => {
              keyboardTabRef.current = false;
              setTab(name);
            }}
            onKeyDown={(event) => {
              const tabs = ["overview", "strengths", "together", "progress"] as const;
              const current = tabs.indexOf(name);
              const next =
                event.key === "ArrowRight"
                  ? (current + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (current + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              keyboardTabRef.current = true;
              setTab(tabs[next]);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            {name === "together" ? "Together" : name.charAt(0).toUpperCase() + name.slice(1)}
          </button>
        ))}
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
        <div
          id="character-section-overview"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="character-tab-overview"
          hidden={tab !== "overview"}
        >
          <CharacterOverview town={town} agent={agent} watch={watch} replay={replay} />
          {agent.id !== "player" && (
            <div className="character-overview-actions">
              <button className="btn" type="button" onClick={() => setTab("together")}>
                Talk with {agent.name}
              </button>
              <button className="btn" type="button" disabled={replay} onClick={onWatch}>
                Watch {agent.name}
              </button>
            </div>
          )}
          {watch && <CharacterReflections town={town} id={agent.id} replay={replay} />}
          {pinned && <p className="character-note">Pinned to the front of the resident strip.</p>}
        </div>
        <div
          id="character-section-strengths"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="character-tab-strengths"
          hidden={tab !== "strengths"}
        >
          <CharacterStrengths id={agent.id} />
        </div>
        <div
          id="character-section-progress"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="character-tab-progress"
          hidden={tab !== "progress"}
        >
          <CharacterProgress town={town} agent={agent} watch={watch} replay={replay} />
        </div>
        <div
          id="character-section-together"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="character-tab-together"
          hidden={tab !== "together"}
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
                const turns = m.turns?.length
                  ? m.turns.map((turn) => ({
                      who:
                        town.agents.find((person) => person.id === turn.speaker)?.name ??
                        turn.speaker,
                      line: turn.text,
                    }))
                  : spokenTurns(m.text);
                return (
                  <li key={m.id} ref={m.id === newest ? latestRef : undefined}>
                    <p className="text-muted">
                      Day {m.day} {formatClock(m.minute)}
                      {m.mind === "offline"
                        ? " · Local reply"
                        : m.mind === "grok"
                          ? " · AI reply"
                          : ""}
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
        </div>
        {inspectorEnabled && (
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
        )}

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
      {agent.id !== "player" && tab === "together" && (
        <form
          className="mind-say"
          onSubmit={(event) => {
            event.preventDefault();
            setTab("together");
            onSend();
          }}
        >
          {agent.id === "kevin" && (
            <button className="btn mb-2" type="button" onClick={onLibrary}>
              Library project
            </button>
          )}
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
          {connectionWarning}
          {localDialogue && (
            <p className="mb-2 text-xs text-muted" role="note">
              Local dialogue is active. Open-ended conversation needs a live AI connection.
            </p>
          )}
          {!canTalk && (
            <p className="character-note">Walk closer to speak. Your draft stays on this card.</p>
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
            <button
              className="btn"
              data-on="true"
              type="submit"
              disabled={busy || !draft.trim() || !canTalk}
            >
              {busy ? "Saying it" : "Say it"}
            </button>
            <p
              ref={feedbackRef}
              tabIndex={-1}
              className="mind-send-note text-sm text-muted"
              role="status"
              aria-live="polite"
            >
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
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <section className="mind" role="dialog" aria-label="Noticeboard">
      <div className="mind-bar">
        <h2 className="font-display text-3xl">Noticeboard</h2>
        <button
          ref={closeRef}
          className="btn"
          type="button"
          onClick={onClose}
          aria-label="Close board"
        >
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
    </section>
  );
}
