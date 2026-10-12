import type { AgentId, Town } from "./types";
import { AGENT_IDS } from "./types";
import { absMinute } from "./memory";
import { periodName } from "./text";
import { ANCHORS, MAP_H, MAP_W, TILE, cell, cellsAll, zoneAt } from "./world";

type Appearance = {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoe: string;
  extra: string;
  accessory?: "tablet" | "scarf";
};

const PALETTE: Record<AgentId | "data" | "amelia", Appearance> = {
  kevin: {
    skin: "#c68642",
    hair: "#241c14",
    shirt: "#f4efff",
    pants: "#393149",
    shoe: "#1b1028",
    extra: "#f98aaf",
  },
  arwyn: {
    skin: "#e0b088",
    hair: "#1b1e22",
    shirt: "#91c96a",
    pants: "#29392e",
    shoe: "#171522",
    extra: "#e5ffe3",
  },
  northern: {
    skin: "#8d5524",
    hair: "#140e0a",
    shirt: "#dc4c83",
    pants: "#302943",
    shoe: "#171022",
    extra: "#d4ff76",
  },
  baba: {
    skin: "#a56b3c",
    hair: "#6e655c",
    shirt: "#f1e8ff",
    pants: "#493b52",
    shoe: "#22142a",
    extra: "#a6c884",
  },
  sub: {
    skin: "#f0c7a0",
    hair: "#8a3e2a",
    shirt: "#5669a8",
    pants: "#262237",
    shoe: "#161121",
    extra: "#f3eaff",
  },
  data: {
    skin: "#dbc9a4",
    hair: "#202336",
    shirt: "#69d8dc",
    pants: "#233446",
    shoe: "#141629",
    extra: "#ddfbff",
    accessory: "tablet",
  },
  amelia: {
    skin: "#ad754e",
    hair: "#382235",
    shirt: "#eaa769",
    pants: "#513b54",
    shoe: "#251329",
    extra: "#f4e2aa",
    accessory: "scarf",
  },
  player: {
    skin: "#d9a066",
    hair: "#3a2a4a",
    shirt: "#b16af2",
    pants: "#332247",
    shoe: "#191025",
    extra: "#c8ff6a",
  },
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
let bakedHasPixelFont = false;

function hash(x: number, y: number) {
  return ((x * 374761393) ^ (y * 668265263)) >>> 0;
}

function drawSpace(g: CanvasRenderingContext2D, viewW: number, viewH: number) {
  g.fillStyle = "#130b22";
  g.fillRect(0, 0, viewW, viewH);
  g.fillStyle = "rgba(157, 91, 226, 0.08)";
  for (let x = 0; x < viewW; x += 64) g.fillRect(x, 0, 1, viewH);
  for (let y = 0; y < viewH; y += 64) g.fillRect(0, y, viewW, 1);
  for (let y = 0; y < viewH; y += 48) {
    for (let x = 0; x < viewW; x += 48) {
      const n = hash(x, y);
      if (n % 3) continue;
      g.fillStyle = n % 5 ? "#8e6cb7" : "#c8ff6a";
      g.fillRect(x + (n % 37), y + ((n >>> 8) % 37), 2, 2);
    }
  }
}

function bake() {
  const hasPixelFont = document.fonts?.check("10px Silkscreen") ?? false;
  if (baked && bakedHasPixelFont === hasPixelFont) return baked;
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
      let color = "#32204a";
      if (cell.ground === "grass")
        color = n % 3 === 0 ? "#32204a" : n % 3 === 1 ? "#392351" : "#2b1c40";
      else if (cell.ground === "path") color = "#645083";
      else if (cell.ground === "plaza") color = n % 5 === 0 ? "#50386c" : "#4e346b";
      else if (cell.ground === "wood") color = n % 5 === 0 ? "#5d386f" : "#674179";
      else if (cell.ground === "stone") color = "#504568";
      else if (cell.ground === "tile") color = "#695082";
      else if (cell.ground === "floor") color = "#705789";
      else if (cell.ground === "water") color = "#292f68";
      else if (cell.ground === "wall") color = "#533071";
      else if (cell.ground === "door") color = "#80529a";
      g.fillStyle = color;
      g.fillRect(px, py, TILE, TILE);
      if (cell.ground === "grass" && n % 4 === 0) {
        g.fillStyle = "#62447b";
        g.fillRect(px + 6, py + 21, 2, 4);
        g.fillRect(px + 9, py + 23, 2, 2);
        if (n % 7 === 0) {
          g.fillStyle = "#a2c975";
          g.fillRect(px + 23, py + 8, 2, 2);
        }
      }
      if (cell.ground === "path" && n % 5 === 0) {
        g.fillStyle = "#927ba9";
        g.fillRect(px + 6, py + 10, 3, 2);
        g.fillRect(px + 21, py + 22, 2, 2);
      }
      if (cell.ground === "plaza" && !cell.decor) {
        if (n % 7 === 0) {
          g.fillStyle = "#79519a";
          g.fillRect(px + 6, py + 9, 4, 2);
          g.fillRect(px + 22, py + 22, 2, 2);
        }
        if (n % 41 === 0) {
          g.fillStyle = "#a5ce77";
          g.fillRect(px + 21, py + 8, 2, 2);
          g.fillRect(px + 19, py + 10, 2, 2);
        }
      }
      if (cell.ground === "wall") {
        g.fillStyle = "#291537";
        g.fillRect(px, py + TILE - 6, TILE, 6);
        g.fillStyle = "#9b5dc1";
        g.fillRect(px + 2, py + 4, TILE - 4, 4);
        if ((x * 3 + y) % 5 === 0) {
          g.fillStyle = "#1b1732";
          g.fillRect(px + 10, py + 10, 12, 10);
          g.fillStyle = "#889e6d";
          g.fillRect(px + 11, py + 11, 10, 2);
        }
      }
      if (cell.ground === "door") {
        g.fillStyle = "#352043";
        g.fillRect(px + 8, py + 6, 16, 22);
        g.fillStyle = "#c8ff6a";
        g.fillRect(px + 20, py + 16, 3, 3);
      }
      if (cell.ground === "plaza" || cell.ground === "stone" || cell.ground === "tile") {
        g.fillStyle = "rgba(30, 13, 49, 0.22)";
        g.fillRect(px, py, TILE, 1);
        g.fillRect(px, py, 1, TILE);
      }
      if (cell.ground === "wood" || cell.ground === "floor") {
        g.fillStyle = "rgba(29, 12, 44, 0.28)";
        g.fillRect(px, py + 10, TILE, 2);
        g.fillRect(px, py + 22, TILE, 2);
      }
      if (cell.decor === "tree") {
        g.fillStyle = "#66436e";
        g.fillRect(px + 13, py + 16, 6, 14);
        g.fillStyle = n % 2 ? "#548651" : "#639b59";
        g.beginPath();
        g.arc(px + 16, py + 14, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#94bc69";
        g.fillRect(px + 10, py + 7, 5, 3);
        g.fillRect(px + 17, py + 10, 3, 3);
      } else if (cell.decor === "counter" || cell.decor === "shelf") {
        g.fillStyle = cell.decor === "shelf" ? "#624071" : "#c9b5e7";
        g.fillRect(px + 2, py + 6, TILE - 4, TILE - 10);
        g.fillStyle = "#362044";
        g.fillRect(px + 4, py + 10, TILE - 8, 3);
        g.fillStyle = cell.decor === "shelf" ? "#cc83e0" : "#c8ff6a";
        g.fillRect(px + 4, py + 7, TILE - 8, 2);
      } else if (cell.decor === "bed") {
        g.fillStyle = "#f0e6ff";
        g.fillRect(px + 4, py + 6, TILE - 8, TILE - 10);
        g.fillStyle = "#db71bb";
        g.fillRect(px + 4, py + 6, TILE - 8, 8);
      } else if (cell.decor === "table") {
        g.fillStyle = "#94659e";
        g.fillRect(px + 6, py + 8, 20, 16);
      } else if (cell.decor === "bench") {
        g.fillStyle = "#8b609c";
        g.fillRect(px + 4, py + 12, 24, 8);
      } else if (cell.decor === "board") {
        g.fillStyle = "#352043";
        g.fillRect(px + 12, py + 16, 4, 14);
        g.fillStyle = "#e9dcff";
        g.fillRect(px + 4, py + 4, 24, 18);
        g.fillStyle = "#db71bb";
        g.fillRect(px + 7, py + 8, 14, 2);
        g.fillStyle = "#412852";
        g.fillRect(px + 7, py + 12, 10, 2);
      } else if (cell.decor === "plant") {
        g.fillStyle = "#8dc26b";
        g.beginPath();
        g.arc(px + 16, py + 14, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#94659e";
        g.fillRect(px + 12, py + 20, 8, 6);
      } else if (cell.decor === "lamp") {
        g.fillStyle = "#412852";
        g.fillRect(px + 14, py + 10, 4, 16);
        g.fillStyle = "#c8ff6a";
        g.beginPath();
        g.arc(px + 16, py + 8, 5, 0, Math.PI * 2);
        g.fill();
      } else if (cell.decor === "stool") {
        g.fillStyle = "#8b609c";
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
  g.font = "400 10px Silkscreen, monospace";
  g.textAlign = "left";
  for (const [x, y, text] of signs) {
    g.fillStyle = "rgba(20, 10, 35, 0.92)";
    const w = g.measureText(text).width + 8;
    g.fillRect(x * TILE + 2, y * TILE + 8, w, 14);
    g.fillStyle = "#c8ff6a";
    g.fillRect(x * TILE + 2, y * TILE + 8, 2, 14);
    g.fillText(text, x * TILE + 6, y * TILE + 19);
  }
  baked = c;
  bakedHasPixelFont = hasPixelFont;
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
  g.fillStyle = "rgba(14, 7, 24, 0.5)";
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
  if (p.accessory === "tablet") {
    g.fillStyle = p.pants;
    g.fillRect(4, -20, 7, 10);
    g.fillStyle = p.extra;
    g.fillRect(5, -19, 5, 6);
  } else if (p.accessory === "scarf") {
    g.fillStyle = p.extra;
    g.fillRect(-6, -23, 12, 3);
    g.fillRect(2, -20, 3, 9);
  }
  g.fillStyle = p.skin;
  g.fillRect(-5, -32, 10, 10);
  g.fillStyle = p.hair;
  if (id === "sub") {
    g.fillRect(-6, -35, 13, 8);
    g.fillRect(4, -30, 3, 8);
  } else if (id === "kevin") {
    g.fillRect(-6, -35, 12, 5);
    g.fillRect(-7, -32, 3, 4);
  } else if (p.accessory === "scarf") {
    g.fillRect(-6, -35, 12, 6);
    g.fillRect(-8, -33, 3, 7);
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
  drawSpace(ctx, viewW, viewH);
  ctx.save();
  ctx.translate(-camX, -camY);
  ctx.drawImage(base, 0, 0);
  const period = periodName(minute);
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t = reduced ? 0 : performance.now() / 500;
  ctx.fillStyle = "rgba(170, 145, 245, 0.55)";
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
    ctx.fillStyle = period === "Night" ? "rgba(200, 255, 106, 0.9)" : "rgba(200, 255, 106, 0.6)";
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
    ctx.fillStyle = "#f0e6ff";
    ctx.fillRect(22 * TILE + 8, 16 * TILE + 6, 14, 16);
    ctx.fillStyle = "#ff77cb";
    ctx.fillRect(22 * TILE + 10, 16 * TILE + 9, 10, 2);
  }
  ctx.fillStyle = "#94659e";
  ctx.fillRect(8 * TILE + 4, 18 * TILE + 18, TILE * 3, 6);
  const order = [...AGENT_IDS].sort((a, b) => (positions[a]?.y ?? 0) - (positions[b]?.y ?? 0));
  const bob = reduced ? 0 : Math.sin(performance.now() / 160) * 1.2;
  const showingNow = minute === town.minute;
  for (const id of order) {
    const pos = positions[id];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const px = pos.x * TILE + TILE / 2;
    const py = pos.y * TILE + TILE / 2 + 8;
    if (id === selected) {
      ctx.strokeStyle = "#c8ff6a";
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x * TILE + 2, pos.y * TILE + 2, TILE - 4, TILE - 4);
    }
    drawPerson(ctx, id, px, py, pos.face, id === "player" ? 0 : bob);
    const label = names[id] || id;
    ctx.font = "600 11px Space Grotesk, sans-serif";
    ctx.textAlign = "center";
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = "rgba(20, 10, 35, 0.94)";
    ctx.fillRect(px - w / 2, py - 52, w, 14);
    ctx.fillStyle = id === "player" ? "#c8ff6a" : "#f0e6ff";
    ctx.fillText(label, px, py - 41);
    const agent = town.agents.find((a) => a.id === id);
    const now = absMinute(opts.day, minute);
    if (
      showingNow &&
      agent?.bubble &&
      typeof agent.bubble.text === "string" &&
      agent.bubble.until >= now
    ) {
      const text = agent.bubble.text.slice(0, 78);
      ctx.font = "500 11px Space Grotesk, sans-serif";
      const bw = Math.min(180, ctx.measureText(text).width + 12);
      ctx.fillStyle = "rgba(37, 18, 58, 0.97)";
      ctx.fillRect(px - bw / 2, py - 74, bw, 28);
      ctx.fillStyle = "#c981ed";
      ctx.fillRect(px - bw / 2, py - 74, bw, 1);
      ctx.fillStyle = "#f0e6ff";
      ctx.fillText(text.length > 42 ? `${text.slice(0, 40)}…` : text, px, py - 56);
    }
  }
  ctx.restore();
  const playerPos = positions.player;
  if (playerPos && opts.day === 1) {
    const dx = ANCHORS.cafe.x - playerPos.x;
    const dy = ANCHORS.cafe.y - playerPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const ang = Math.atan2(dy, dx);
      const cx = viewW / 2 + Math.cos(ang) * 72;
      const cy = viewH / 2 + Math.sin(ang) * 48;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(200, 255, 106, 0.94)";
      ctx.fillRect(0, -3, 16, 6);
      ctx.beginPath();
      ctx.moveTo(16, -8);
      ctx.lineTo(28, 0);
      ctx.lineTo(16, 8);
      ctx.fill();
      ctx.restore();
      ctx.font = "600 11px Space Grotesk, sans-serif";
      ctx.fillStyle = "#f0e6ff";
      ctx.textAlign = "center";
      ctx.fillText("Hobbs", cx, cy - 14);
    }
  }
  const shade =
    period === "Night"
      ? "rgba(15, 8, 37, 0.26)"
      : period === "Dusk"
        ? "rgba(79, 20, 111, 0.16)"
        : period === "Dawn"
          ? "rgba(167, 81, 184, 0.1)"
          : "rgba(0,0,0,0)";
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

export function pickAgents(
  sx: number,
  sy: number,
  camX: number,
  camY: number,
  positions: Record<AgentId, { x: number; y: number }>,
): AgentId[] {
  const world = screenToWorld(sx, sy, camX, camY);
  const hits: { id: AgentId; d: number }[] = [];
  for (const id of AGENT_IDS) {
    const p = positions[id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const dx = world.x - (p.x + 0.5);
    const dy = world.y - (p.y + 0.75);
    if (Math.abs(dx) > 0.7 || dy > 0.25 || dy < -1.9) continue;
    hits.push({ id, d: Math.hypot(dx, dy) });
  }
  hits.sort((a, b) => a.d - b.d || AGENT_IDS.indexOf(a.id) - AGENT_IDS.indexOf(b.id));
  return hits.map((hit) => hit.id);
}

export function pickAgent(
  sx: number,
  sy: number,
  camX: number,
  camY: number,
  positions: Record<AgentId, { x: number; y: number }>,
): AgentId | null {
  return pickAgents(sx, sy, camX, camY, positions)[0] ?? null;
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
