import type { AgentId, Town } from "./types";
import { AGENT_IDS } from "./types";
import { absMinute } from "./memory";
import { mentionsSeed, periodName } from "./text";
import { MAP_H, MAP_W, TILE, cell, cellsAll, zoneAt } from "./world";

const PALETTE: Record<
  AgentId,
  { skin: string; hair: string; shirt: string; pants: string; shoe: string; extra: string }
> = {
  kevin: { skin: "#c68642", hair: "#241c14", shirt: "#f4efe4", pants: "#3d4452", shoe: "#221c16", extra: "#e08a3c" },
  arwyn: { skin: "#e0b088", hair: "#1b1e22", shirt: "#6e8b74", pants: "#2c3330", shoe: "#1a1612", extra: "#d5e0d8" },
  northern: { skin: "#8d5524", hair: "#140e0a", shirt: "#c4473a", pants: "#243044", shoe: "#16120e", extra: "#e6c15a" },
  baba: { skin: "#a56b3c", hair: "#6e655c", shirt: "#f3ecdf", pants: "#4a3b32", shoe: "#241c16", extra: "#7d9a6a" },
  sub: { skin: "#f0c7a0", hair: "#8a3e2a", shirt: "#2c3a52", pants: "#1c2430", shoe: "#14181f", extra: "#f3ead7" },
  player: { skin: "#d9a066", hair: "#3a2a4a", shirt: "#6b4c7a", pants: "#2a2433", shoe: "#1a1612", extra: "#e7c27a" },
};

type Glide = { x: number; y: number };
const glide = new Map<AgentId, Glide>();

export function resetGlide(town: Town) {
  glide.clear();
  for (const agent of town.agents) glide.set(agent.id, { x: agent.tile.x, y: agent.tile.y });
}

export function syncGlide(town: Town, dt: number, snap: boolean) {
  for (const agent of town.agents) {
    let g = glide.get(agent.id);
    if (!g) {
      g = { x: agent.tile.x, y: agent.tile.y };
      glide.set(agent.id, g);
    }
    if (!Number.isFinite(agent.tile.x) || !Number.isFinite(agent.tile.y)) continue;
    if (snap || Math.abs(g.x - agent.tile.x) + Math.abs(g.y - agent.tile.y) > 7) {
      g.x = agent.tile.x;
      g.y = agent.tile.y;
      continue;
    }
    const dx = agent.tile.x - g.x;
    const dy = agent.tile.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      g.x = agent.tile.x;
      g.y = agent.tile.y;
      continue;
    }
    const step = Math.min(dist, dt * 7);
    g.x += (dx / dist) * step;
    g.y += (dy / dist) * step;
  }
}

export function glideOf(id: AgentId): Glide {
  return glide.get(id) ?? { x: 26, y: 22 };
}

let baked: HTMLCanvasElement | null = null;

function hash(x: number, y: number) {
  return ((x * 374761393) ^ (y * 668265263)) >>> 0;
}

function bake() {
  if (baked) return baked;
  const c = document.createElement("canvas");
  c.width = MAP_W * TILE;
  c.height = MAP_H * TILE;
  const g = c.getContext("2d");
  if (!g) return c;
  g.imageSmoothingEnabled = false;
  const cells = cellsAll();
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = cells[y * MAP_W + x]!;
      const px = x * TILE;
      const py = y * TILE;
      const n = hash(x, y);
      let color = "#6e8f55";
      if (cell.ground === "grass") color = n % 3 === 0 ? "#64904c" : n % 3 === 1 ? "#73985a" : "#5d8646";
      else if (cell.ground === "path") color = "#cbb892";
      else if (cell.ground === "plaza") color = "#e4dccb";
      else if (cell.ground === "wood") color = n % 5 === 0 ? "#a8753e" : "#b5834a";
      else if (cell.ground === "stone") color = "#c5c9c2";
      else if (cell.ground === "tile") color = "#e7dcc4";
      else if (cell.ground === "floor") color = "#d4c8ad";
      else if (cell.ground === "water") color = "#3c7090";
      else if (cell.ground === "wall") color = "#6d5344";
      else if (cell.ground === "door") color = "#8d5a32";
      g.fillStyle = color;
      g.fillRect(px, py, TILE, TILE);
      if (cell.ground === "wall") {
        g.fillStyle = "#4e3b32";
        g.fillRect(px, py + TILE - 6, TILE, 6);
        g.fillStyle = "#8a6b58";
        g.fillRect(px + 2, py + 4, TILE - 4, 4);
        if ((x * 3 + y) % 5 === 0) {
          g.fillStyle = "#1b242c";
          g.fillRect(px + 10, py + 10, 12, 10);
        }
      }
      if (cell.ground === "door") {
        g.fillStyle = "#5c3a22";
        g.fillRect(px + 8, py + 6, 16, 22);
        g.fillStyle = "#e6c15a";
        g.fillRect(px + 20, py + 16, 3, 3);
      }
      if (cell.ground === "plaza" || cell.ground === "stone" || cell.ground === "tile") {
        g.fillStyle = "rgba(60, 48, 32, 0.08)";
        g.fillRect(px, py, TILE, 1);
        g.fillRect(px, py, 1, TILE);
      }
      if (cell.ground === "wood" || cell.ground === "floor") {
        g.fillStyle = "rgba(80, 48, 24, 0.18)";
        g.fillRect(px, py + 10, TILE, 2);
        g.fillRect(px, py + 22, TILE, 2);
      }
      if (cell.decor === "tree") {
        g.fillStyle = "#6a4a30";
        g.fillRect(px + 13, py + 16, 6, 14);
        g.fillStyle = n % 2 ? "#2f6b3a" : "#387848";
        g.beginPath();
        g.arc(px + 16, py + 14, 12, 0, Math.PI * 2);
        g.fill();
      } else if (cell.decor === "counter" || cell.decor === "shelf") {
        g.fillStyle = cell.decor === "shelf" ? "#6d5844" : "#efe6d4";
        g.fillRect(px + 2, py + 6, TILE - 4, TILE - 10);
        g.fillStyle = "#3a2a22";
        g.fillRect(px + 4, py + 10, TILE - 8, 3);
      } else if (cell.decor === "bed") {
        g.fillStyle = "#f3ead7";
        g.fillRect(px + 4, py + 6, TILE - 8, TILE - 10);
        g.fillStyle = "#c45c4a";
        g.fillRect(px + 4, py + 6, TILE - 8, 8);
      } else if (cell.decor === "table") {
        g.fillStyle = "#8a5a32";
        g.fillRect(px + 6, py + 8, 20, 16);
      } else if (cell.decor === "bench") {
        g.fillStyle = "#6b4a32";
        g.fillRect(px + 4, py + 12, 24, 8);
      } else if (cell.decor === "board") {
        g.fillStyle = "#5c3a22";
        g.fillRect(px + 12, py + 16, 4, 14);
        g.fillStyle = "#efe6d4";
        g.fillRect(px + 4, py + 4, 24, 18);
        g.fillStyle = "#c45c4a";
        g.fillRect(px + 7, py + 8, 14, 2);
        g.fillStyle = "#3a3128";
        g.fillRect(px + 7, py + 12, 10, 2);
      } else if (cell.decor === "plant") {
        g.fillStyle = "#3f6b45";
        g.beginPath();
        g.arc(px + 16, py + 14, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#8a5a32";
        g.fillRect(px + 12, py + 20, 8, 6);
      } else if (cell.decor === "lamp") {
        g.fillStyle = "#3a3128";
        g.fillRect(px + 14, py + 10, 4, 16);
        g.fillStyle = "#e6c15a";
        g.beginPath();
        g.arc(px + 16, py + 8, 5, 0, Math.PI * 2);
        g.fill();
      } else if (cell.decor === "stool") {
        g.fillStyle = "#6b4a32";
        g.fillRect(px + 10, py + 12, 12, 8);
      }
    }
  }
  const signs: [number, number, string][] = [
    [5, 14, "HOBBS"],
    [40, 13, "LIBRARY"],
    [5, 2, "DORMS"],
    [4, 32, "GROCERY"],
    [21, 32, "PARK"],
    [41, 31, "ROW"],
  ];
  g.font = "700 10px Outfit, sans-serif";
  g.textAlign = "left";
  for (const [x, y, text] of signs) {
    g.fillStyle = "rgba(28,23,18,0.78)";
    const w = g.measureText(text).width + 8;
    g.fillRect(x * TILE + 2, y * TILE + 8, w, 14);
    g.fillStyle = "#f3ead7";
    g.fillText(text, x * TILE + 6, y * TILE + 19);
  }
  baked = c;
  return c;
}

function drawPerson(
  g: CanvasRenderingContext2D,
  id: AgentId,
  x: number,
  y: number,
  face: "n" | "s" | "e" | "w",
  bob: number,
) {
  const p = PALETTE[id];
  if (!p) return;
  const wide = id === "baba" ? 2 : 0;
  g.save();
  g.translate(x, y + bob);
  if (face === "w") g.scale(-1, 1);
  g.fillStyle = "rgba(28,23,18,0.28)";
  g.beginPath();
  g.ellipse(0, 2, 8 + wide, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.pants;
  g.fillRect(-5 - wide / 2, -10, 4, 8);
  g.fillRect(1 + wide / 2, -10, 4, 8);
  g.fillStyle = p.shoe;
  g.fillRect(-5 - wide / 2, -3, 4, 3);
  g.fillRect(1 + wide / 2, -3, 4, 3);
  g.fillStyle = p.shirt;
  const bodyW = 14 + wide;
  g.fillRect(-bodyW / 2, -22, bodyW, 13);
  if (id === "kevin" || id === "baba") {
    g.fillStyle = p.extra;
    g.fillRect(-bodyW / 2, -16, bodyW, 8);
  }
  if (id === "northern") {
    g.fillStyle = p.extra;
    g.fillRect(-bodyW / 2 - 1, -20, bodyW + 2, 3);
  }
  if (id === "sub") {
    g.fillStyle = p.extra;
    g.fillRect(4, -18, 5, 7);
  }
  g.fillStyle = p.skin;
  g.fillRect(-5, -32, 10, 10);
  g.fillStyle = p.hair;
  if (id === "arwyn" || id === "baba") {
    g.fillRect(-6, -36, 12, 6);
    g.fillRect(-2, -40, 6, 5);
  } else if (id === "sub") {
    g.fillRect(-6, -35, 13, 8);
    g.fillRect(4, -30, 3, 8);
  } else if (id === "kevin") {
    g.fillRect(-6, -35, 12, 5);
    g.fillRect(-7, -32, 3, 4);
  } else {
    g.fillRect(-6, -34, 12, 5);
  }
  if (id === "player") {
    g.fillStyle = p.extra;
    g.fillRect(-2, -34, 3, 5);
  }
  if (face !== "n") {
    g.fillStyle = "#241c16";
    const ex = face === "e" ? 1 : 0;
    g.fillRect(-3 + ex, -29, 2, 2);
    g.fillRect(1 + ex, -29, 2, 2);
  }
  if (id === "arwyn") {
    g.strokeStyle = p.extra;
    g.lineWidth = 1;
    g.strokeRect(-4, -30, 8, 4);
  }
  g.restore();
}

export type PaintOpts = {
  viewW: number;
  viewH: number;
  town: Town;
  minute: number;
  day: number;
  camX: number;
  camY: number;
  positions: Record<AgentId, { x: number; y: number; face: "n" | "s" | "e" | "w" }>;
  selected?: AgentId | null;
  names: Record<AgentId, string>;
};

export function paint(ctx: CanvasRenderingContext2D, opts: PaintOpts) {
  const { viewW, viewH, town, minute, camX, camY, positions, selected, names } = opts;
  const base = bake();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-camX, -camY);
  ctx.drawImage(base, 0, 0);
  const period = periodName(minute);
  const t = performance.now() / 500;
  ctx.fillStyle = "rgba(186, 214, 232, 0.35)";
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = cell(x, y);
      if (c?.ground !== "water") continue;
      const shift = (x * 3 + Math.floor(t + y)) % 4;
      ctx.fillRect(x * TILE + 4 + shift, y * TILE + 10, 10, 2);
      ctx.fillRect(x * TILE + 8 - shift, y * TILE + 18, 12, 2);
    }
  }
  if (period === "Night" || period === "Dusk") {
    ctx.fillStyle = period === "Night" ? "rgba(230, 193, 90, 0.9)" : "rgba(230, 193, 90, 0.45)";
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = cell(x, y);
        if (c?.ground === "wall" && (x * 3 + y) % 5 === 0) {
          ctx.fillRect(x * TILE + 11, y * TILE + 11, 10, 8);
        }
        if (c?.decor === "lamp") ctx.fillRect(x * TILE + 12, y * TILE + 4, 8, 8);
        if (c?.zone === "house-player" || c?.zone === "house-baba" || c?.zone === "house-sub") {
          ctx.fillRect(x * TILE + 12, y * TILE + 10, 8, 8);
        }
      }
    }
  }
  if ((town.notices ?? []).length) {
    ctx.fillStyle = "#f3ead7";
    ctx.fillRect(22 * TILE + 8, 16 * TILE + 6, 14, 16);
    ctx.fillStyle = "#c4473a";
    ctx.fillRect(22 * TILE + 10, 16 * TILE + 9, 10, 2);
  }
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(8 * TILE + 4, 18 * TILE + 18, TILE * 3, 6);
  const order = [...AGENT_IDS].sort((a, b) => (positions[a]?.y ?? 0) - (positions[b]?.y ?? 0));
  const bob = Math.sin(performance.now() / 160) * 1.2;
  const showingNow = minute === town.minute;
  for (const id of order) {
    const pos = positions[id];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const px = pos.x * TILE + TILE / 2;
    const py = pos.y * TILE + TILE / 2 + 8;
    if (id === selected) {
      ctx.strokeStyle = "#e08a3c";
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x * TILE + 2, pos.y * TILE + 2, TILE - 4, TILE - 4);
    }
    drawPerson(ctx, id, px, py, pos.face, id === "player" ? 0 : bob);
    const label = names[id] || id;
    ctx.font = "600 11px Outfit, sans-serif";
    ctx.textAlign = "center";
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = "rgba(28,23,18,0.82)";
    ctx.fillRect(px - w / 2, py - 52, w, 14);
    ctx.fillStyle = id === "player" ? "#e7c27a" : "#f3ead7";
    ctx.fillText(label, px, py - 41);
    const agent = town.agents.find((a) => a.id === id);
    const holds = agent && id !== "kevin" && id !== "player" && (agent.memories ?? []).some((m) => m.seed || mentionsSeed(m.text));
    if (holds) {
      ctx.fillStyle = "#e08a3c";
      ctx.fillRect(px + w / 2 - 2, py - 50, 5, 5);
    }
    const playerPos = positions.player;
    const nearYou = playerPos && Math.abs(playerPos.x - pos.x) + Math.abs(playerPos.y - pos.y) <= 3;
    if (nearYou && agent?.selfSentence && id !== "player") {
      const sentence = agent.selfSentence.slice(0, 42);
      ctx.font = "500 10px Outfit, sans-serif";
      const sw = ctx.measureText(sentence).width + 8;
      ctx.fillStyle = "rgba(28,23,18,0.72)";
      ctx.fillRect(px - sw / 2, py - 36, sw, 12);
      ctx.fillStyle = "#f3ead7";
      ctx.fillText(sentence, px, py - 27);
    }
    const now = absMinute(opts.day, minute);
    if (showingNow && agent?.bubble && typeof agent.bubble.text === "string" && agent.bubble.until >= now) {
      const text = agent.bubble.text.slice(0, 78);
      ctx.font = "500 11px Outfit, sans-serif";
      const bw = Math.min(180, ctx.measureText(text).width + 12);
      ctx.fillStyle = "rgba(243,234,215,0.95)";
      ctx.fillRect(px - bw / 2, py - 74, bw, 28);
      ctx.fillStyle = "#1c1712";
      ctx.fillText(text.length > 42 ? `${text.slice(0, 40)}…` : text, px, py - 56);
    }
  }
  ctx.restore();
  const shade =
    period === "Night" ? "rgba(18, 28, 58, 0.42)" : period === "Dusk" ? "rgba(120, 58, 28, 0.18)" : period === "Dawn" ? "rgba(214, 140, 90, 0.16)" : "rgba(0,0,0,0)";
  if (period !== "Day") {
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

export function cameraFor(px: number, py: number, viewW: number, viewH: number) {
  const worldW = MAP_W * TILE;
  const worldH = MAP_H * TILE;
  const sx = Number.isFinite(px) ? px : 26;
  const sy = Number.isFinite(py) ? py : 22;
  let camX = sx * TILE + TILE / 2 - viewW / 2;
  let camY = sy * TILE + TILE / 2 - viewH / 2;
  camX = Math.max(0, Math.min(worldW - viewW, camX));
  camY = Math.max(0, Math.min(worldH - viewH, camY));
  if (worldW < viewW) camX = (worldW - viewW) / 2;
  if (worldH < viewH) camY = (worldH - viewH) / 2;
  return { camX, camY };
}

export function screenToWorld(sx: number, sy: number, camX: number, camY: number) {
  return { x: (sx + camX) / TILE, y: (sy + camY) / TILE };
}

export function pickAgent(
  sx: number,
  sy: number,
  camX: number,
  camY: number,
  positions: Record<AgentId, { x: number; y: number }>,
): AgentId | null {
  const world = screenToWorld(sx, sy, camX, camY);
  let best: AgentId | null = null;
  let dist = 0.7;
  for (const id of AGENT_IDS) {
    const p = positions[id];
    if (!p) continue;
    const d = Math.hypot(p.x + 0.5 - world.x, p.y + 0.5 - world.y);
    if (d < dist) {
      dist = d;
      best = id;
    }
  }
  return best;
}

export function onBoard(x: number, y: number): boolean {
  const z = zoneAt(Math.round(x), Math.round(y));
  if (z === "noticeboard") return true;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (zoneAt(Math.round(x) + dx, Math.round(y) + dy) === "noticeboard") return true;
    }
  }
  return false;
}
