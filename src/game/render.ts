import type { AgentId, Town } from "./types";
import { AGENT_IDS } from "./types";
import { absMinute } from "./memory";
import { periodName } from "./text";
import { ANCHORS, MAP_H, MAP_W, TILE, zoneAt } from "./world";
import {
  floorArt,
  propArt,
  glowArt,
  scenery,
  water,
  windows,
  hash,
} from "../components/town/WorldArt";
import type { Scenery } from "../components/town/WorldArt";

type Appearance = {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoe: string;
  extra: string;
  accessory?: "tablet" | "scarf";
};

const PALETTE: Record<AgentId, Appearance> = {
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
type Motion = { phase: number; moving: boolean };
const glide = new Map<AgentId, Glide>();
const motion = new Map<AgentId, Motion>();
let ambientTime = 0;
let lastPaint = 0;

export function resetGlide(town: Town) {
  glide.clear();
  motion.clear();
  ambientTime = 0;
  lastPaint = 0;
  for (const agent of town.agents) {
    glide.set(agent.id, { x: agent.tile.x, y: agent.tile.y });
    motion.set(agent.id, { phase: 0, moving: false });
  }
}

export function syncGlide(town: Town, dt: number, snap: boolean) {
  for (const agent of town.agents) {
    let g = glide.get(agent.id);
    if (!g) {
      g = { x: agent.tile.x, y: agent.tile.y };
      glide.set(agent.id, g);
    }
    const m = motion.get(agent.id) ?? { phase: 0, moving: false };
    motion.set(agent.id, m);
    m.moving = false;
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
    const step = Math.min(dist, Math.max(0, dt) * 7);
    g.x += (dx / dist) * step;
    g.y += (dy / dist) * step;
    m.moving = step > 0;
    // Legs follow distance travelled, so standing still never walks in place.
    m.phase = (m.phase + step * Math.PI * 2) % (Math.PI * 2);
  }
}

export function glideOf(id: AgentId): Glide {
  return glide.get(id) ?? { x: 26, y: 22 };
}

function rect(
  g: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function drawSpace(g: CanvasRenderingContext2D, viewW: number, viewH: number) {
  rect(g, "#130b22", 0, 0, viewW, viewH);
  for (let y = 0; y < viewH; y += 48) {
    for (let x = 0; x < viewW; x += 48) {
      const n = hash(x, y);
      if (n % 3 === 0)
        rect(g, n % 5 ? "#73598f" : "#b5cf91", x + (n % 37), y + ((n >>> 8) % 37), 2, 2);
    }
  }
}

type Face = "n" | "s" | "e" | "w";
type Activity = "cup" | "book" | "bread" | null;

function activityFor(id: AgentId, town: Town, x: number, y: number): Activity {
  const agent = town.agents.find((a) => a.id === id);
  if (!agent) return null;
  const zone = zoneAt(Math.round(x), Math.round(y));
  // These poses use the same public activity line visible in the resident card.
  const status = agent.status.toLowerCase();
  if (id === "kevin" && zone === "cafe" && /cup|coffee|wip|opening|counter/.test(status))
    return "cup";
  if (zone === "library" && /read|book|index|shelf|notes/.test(status)) return "book";
  if (id === "baba" && zone === "grocery" && /bread|stock|counter|opening/.test(status))
    return "bread";
  return null;
}

function drawPerson(
  g: CanvasRenderingContext2D,
  id: AgentId,
  x: number,
  y: number,
  face: Face,
  stride: number,
  idle: number,
  activity: Activity,
) {
  const p = PALETTE[id];
  if (!p) return;
  const wide = id === "baba" ? 2 : 0;
  const side = face === "e" || face === "w";
  const back = face === "n";
  const leg = Math.round(stride * 3);
  const arm = Math.round(stride * 2);
  const lift = Math.abs(stride) > 0.5 ? -1 : Math.round(idle);
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (face === "w") g.scale(-1, 1);
  // The foot shadow stays on the ground while the torso rises with each step.
  rect(g, "rgba(17, 14, 27, 0.24)", -10 - wide, 0, 20 + wide * 2, 4);
  rect(g, "rgba(17, 14, 27, 0.28)", -7 - wide, -1, 15 + wide * 2, 6);
  const bodyW = (side ? 12 : 16) + wide;
  const bx = -bodyW / 2;
  rect(g, "#30253c", -6 - wide / 2, -12, 5, 12 + leg);
  rect(g, "#30253c", 1 + wide / 2, -12, 5, 12 - leg);
  rect(g, p.pants, -5 - wide / 2, -12, 3, 9 + leg);
  rect(g, p.pants, 2 + wide / 2, -12, 3, 9 - leg);
  rect(g, p.shoe, -7 - wide / 2, -3 + leg, 7, 4);
  rect(g, p.shoe, wide / 2, -3 - leg, 7, 4);
  rect(g, "#a495aa", -6 - wide / 2, leg, 5, 1);
  rect(g, "#a495aa", 1 + wide / 2, -leg, 5, 1);
  g.translate(0, lift);
  rect(g, "#30253c", bx - 3, -26 + arm, 5, 15);
  rect(g, "#30253c", bx + bodyW - 2, -26 - arm, 5, 15);
  rect(g, p.shirt, bx - 2, -25 + arm, 4, 8);
  rect(g, p.shirt, bx + bodyW - 2, -25 - arm, 4, 8);
  rect(g, p.skin, bx - 2, -17 + arm, 3, 5);
  rect(g, p.skin, bx + bodyW - 1, -17 - arm, 3, 5);
  rect(g, "#30253c", bx - 1, -28, bodyW + 2, 17);
  rect(g, p.shirt, bx, -27, bodyW, 15);
  rect(g, "rgba(255, 235, 227, 0.18)", bx + 1, -26, 3, 12);
  rect(g, "rgba(31, 19, 43, 0.23)", bx + bodyW - 3, -24, 3, 12);
  rect(g, p.skin, -3, -30, 6, 4);
  if ((id === "kevin" || id === "baba") && !back) {
    rect(g, p.extra, bx + 2, -23, bodyW - 4, 11);
    rect(g, "rgba(245, 234, 222, 0.4)", bx + 3, -23, bodyW - 6, 2);
    rect(g, "#70515c", bx + 5, -17, 5, 3);
    rect(g, p.extra, -5, -28, 2, 7);
    rect(g, p.extra, 3, -28, 2, 7);
  } else if ((id === "kevin" || id === "baba") && back) {
    rect(g, p.extra, bx, -17, bodyW, 2);
    rect(g, p.extra, -1, -17, 3, 6);
  }
  if (id === "northern") {
    rect(g, p.extra, bx, -25, bodyW, 3);
    rect(g, "#f2c6d4", bx + 2, -21, 2, 8);
  }
  if (id === "sub") {
    rect(g, "#b69986", -5, -27, 2, 10);
    rect(g, "#755362", 4, -22, 7, 11);
    rect(g, p.extra, 5, -22, 5, 3);
    rect(g, "#c3ae91", 7, -17, 2, 2);
  }
  if (p.accessory === "tablet") {
    rect(g, p.pants, side ? 4 : 2, -22, 7, 10);
    if (!back) rect(g, p.extra, side ? 5 : 3, -21, 5, 6);
  } else if (p.accessory === "scarf") {
    rect(g, p.extra, bx, -27, bodyW, 3);
    rect(g, p.extra, side ? 3 : 2, -24, 3, 9);
  }
  if (id === "player") {
    rect(g, p.extra, bx + 2, -27, bodyW - 4, 2);
    rect(g, p.extra, side ? 3 : -4, -25, 3, 7);
  }
  // Every view has a distinct silhouette: profile nose/ear and a full hair back.
  rect(g, "#30253c", -7, -40, 14, 13);
  rect(g, p.skin, -6, -38, 12, 11);
  rect(g, "rgba(253, 225, 192, 0.22)", -5, -37, 3, 8);
  rect(g, "rgba(72, 31, 42, 0.25)", 4, -34, 2, 7);
  if (side) {
    rect(g, p.skin, 6, -33, 2, 4);
    rect(g, "#2d2333", 4, -34, 2, 2);
    rect(g, p.skin, -4, -33, 2, 4);
  } else if (!back) {
    rect(g, "#2d2333", -4, -34, 2, 2);
    rect(g, "#2d2333", 2, -34, 2, 2);
    rect(g, "rgba(111, 49, 54, 0.5)", -2, -29, 4, 1);
  }
  rect(g, p.hair, -7, -40, 14, 6);
  rect(g, p.hair, -6, -42, 11, 3);
  if (back) rect(g, p.hair, -6, -37, 12, 9);
  else rect(g, p.hair, -6, -36, side ? 5 : 2, 5);
  rect(g, "rgba(231, 207, 190, 0.13)", -4, -40, 7, 2);
  if (id === "arwyn") {
    rect(g, p.hair, -2, -45, 6, 5);
    if (!back) {
      rect(g, "#413e48", side ? 1 : -5, -35, side ? 6 : 11, 4);
      rect(g, "#d9edcc", side ? 2 : -4, -34, 3, 2);
      if (!side) rect(g, "#d9edcc", 2, -34, 3, 2);
    }
  } else if (id === "baba") {
    rect(g, p.hair, -7, -37, 2, 9);
    rect(g, "#a89887", -5, -41, 9, 2);
    if (!back) {
      rect(g, p.hair, -5, -30, 10, 4);
      rect(g, p.skin, -2, -30, 4, 1);
    }
  } else if (id === "kevin") {
    rect(g, p.hair, -7, -38, 3, 6);
    rect(g, p.hair, 4, -39, 3, 5);
  } else if (id === "sub") {
    rect(g, p.hair, -7, -37, 3, 7);
    rect(g, p.hair, 4, -38, 3, 9);
    rect(g, "#b37358", -4, -40, 6, 2);
  } else if (id === "player") {
    rect(g, p.extra, -2, -41, 3, 4);
  }
  if (activity && !back && stride === 0) {
    const handY = -19 - (activity === "cup" ? Math.round(Math.max(0, idle) * 2) : 0);
    rect(g, p.skin, side ? 5 : 2, handY, 6, 3);
    if (activity === "cup") {
      rect(g, "#f1dcc3", 5, handY - 2, 6, 6);
      rect(g, "#8c625b", 6, handY - 2, 4, 1);
      rect(g, "#f1dcc3", 11, handY - 1, 2, 3);
    } else if (activity === "book") {
      rect(g, "#6d526d", -3, handY - 2, 14, 9);
      rect(g, "#e4d5ba", -2, handY - 3, 12, 8);
      rect(g, "#a5a397", 4, handY - 3, 1, 8);
    } else {
      rect(g, "#b78157", 2, handY - 2, 10, 6);
      rect(g, "#ebc990", 3, handY - 3, 8, 4);
      rect(g, "#f8ddaa", 5, handY - 3, 2, 2);
    }
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
  positions: Record<AgentId, { x: number; y: number; face: Face }>;
  selected?: AgentId | null;
  names: Record<AgentId, string>;
  replay?: boolean;
};

function isVisible(x: number, y: number, opts: PaintOpts, margin = 96) {
  return (
    x > opts.camX - margin &&
    y > opts.camY - margin &&
    x < opts.camX + opts.viewW + margin &&
    y < opts.camY + opts.viewH + margin
  );
}

function drawWater(g: CanvasRenderingContext2D, opts: PaintOpts, t: number) {
  for (const { x, y } of water) {
    const px = x * TILE;
    const py = y * TILE;
    if (!isVisible(px, py, opts, 32)) continue;
    const shift = Math.floor(t * 1.7 + x * 0.7 + y) % 6;
    rect(g, "rgba(129, 187, 188, 0.32)", px + 5 + shift, py + 10, 10, 1);
    rect(g, "rgba(129, 187, 188, 0.18)", px + 7 - shift, py + 23, 17, 1);
    rect(g, "rgba(188, 216, 199, 0.28)", px + 9 + shift, py + 9, 4, 1);
  }
}

function drawAmbient(g: CanvasRenderingContext2D, opts: PaintOpts, t: number, reduced: boolean) {
  if (reduced) return;
  for (const prop of scenery) {
    if (prop.kind !== "tree" || !isVisible(prop.x * TILE, prop.y * TILE, opts)) continue;
    const phase = (t * 0.11 + (prop.seed % 17) / 17) % 1;
    if (phase > 0.58) continue;
    const x = prop.x * TILE + 15 + Math.sin(phase * 16 + prop.seed) * 11;
    const y = prop.y * TILE - 22 + phase * 90;
    rect(g, "rgba(193, 170, 109, 0.65)", Math.round(x), Math.round(y), 3, 2);
  }
  // Steam is attached to the cups and coffee machine drawn on real furniture.
  if (opts.minute >= 7 * 60 && opts.minute < 19 * 60) {
    for (const [x, y] of [
      [5 * TILE + 14, 19 * TILE],
      [8 * TILE + 12, 22 * TILE + 3],
      [12 * TILE + 12, 22 * TILE + 3],
    ]) {
      if (!isVisible(x!, y!, opts, 32)) continue;
      for (let i = 0; i < 2; i++) {
        const phase = (t * 0.45 + i * 0.5 + x! / 100) % 1;
        g.globalAlpha = (1 - phase) * 0.42;
        const sy = Math.round(y! - 5 - phase * 16);
        const sx = Math.round(x! + Math.sin(phase * 7 + i) * 3);
        rect(g, "#f6e6d2", sx, sy, 2, 4);
        rect(g, "#f6e6d2", sx + 2, sy - 3, 2, 3);
      }
      g.globalAlpha = 1;
    }
  }
}

function drawLighting(
  g: CanvasRenderingContext2D,
  opts: PaintOpts,
  period: ReturnType<typeof periodName>,
) {
  const shade =
    period === "Night"
      ? "rgba(12, 15, 37, 0.53)"
      : period === "Dusk"
        ? "rgba(96, 40, 83, 0.24)"
        : period === "Dawn"
          ? "rgba(160, 107, 127, 0.13)"
          : null;
  if (shade) rect(g, shade, opts.camX, opts.camY, opts.viewW, opts.viewH);
  if (period === "Day" || period === "Dawn") return;
  g.save();
  g.globalCompositeOperation = "screen";
  g.globalAlpha = period === "Night" ? 1 : 0.65;
  const light = (x: number, y: number, radius: number, warm: boolean) => {
    if (isVisible(x, y, opts, radius)) g.drawImage(glowArt(warm, radius), x - radius, y - radius);
  };
  for (const prop of scenery) {
    if (prop.kind === "lamp") light(prop.x * TILE + 16, prop.y * TILE - 19, 100, true);
    if (prop.kind === "counter" && prop.zone === "cafe")
      light(prop.x * TILE + 16, prop.y * TILE + 8, 70, true);
  }
  for (const win of windows) light(win.x, win.y, 48, win.warm);
  g.restore();
  for (const win of windows) {
    if (!isVisible(win.x, win.y, opts, 32)) continue;
    rect(g, win.warm ? "#e1b883" : "#9fcbc7", win.x - 7, win.y - 3, 6, 4);
    rect(g, win.warm ? "#d6a675" : "#88b7c0", win.x + 1, win.y - 3, 6, 4);
    rect(g, win.warm ? "#b88c70" : "#7c9fad", win.x - 7, win.y + 2, 6, 3);
    rect(g, win.warm ? "#b88c70" : "#7c9fad", win.x + 1, win.y + 2, 6, 3);
  }
  for (const prop of scenery) {
    if (prop.kind === "lamp" && isVisible(prop.x * TILE, prop.y * TILE, opts)) {
      rect(g, "#fff0bf", prop.x * TILE + 13, prop.y * TILE - 23, 6, 8);
    }
  }
}

function drawLabels(g: CanvasRenderingContext2D, opts: PaintOpts) {
  const { town, positions, names } = opts;
  const showingNow = !opts.replay && opts.minute === town.minute && opts.day === town.day;
  const now = absMinute(opts.day, opts.minute);
  type Box = { x: number; y: number; w: number; h: number };
  const occupied: Box[] = [];
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.w + 3 && a.x + a.w + 3 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;
  const place = (box: Box, below: number, step: number) => {
    for (let i = 0; i < AGENT_IDS.length * 2 && occupied.some((other) => overlaps(box, other)); i++)
      box.y -= step;
    if (box.y < opts.camY + 4 && below >= opts.camY + 4) {
      box.y = below;
      for (
        let i = 0;
        i < AGENT_IDS.length * 2 && occupied.some((other) => overlaps(box, other));
        i++
      )
        box.y += step;
    }
    occupied.push(box);
    return box;
  };
  const tags: { id: AgentId; px: number; py: number; label: string; box: Box }[] = [];
  g.font = "600 11px Space Grotesk, sans-serif";
  g.textAlign = "center";
  for (const id of AGENT_IDS) {
    const pos = positions[id];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const px = Math.round(pos.x * TILE + TILE / 2);
    const py = Math.round(pos.y * TILE + TILE / 2 + 8);
    if (!isVisible(px, py, opts)) continue;
    const label = names[id] || id;
    const width = Math.min(opts.viewW - 8, Math.ceil(g.measureText(label).width) + 10);
    const cx = Math.max(
      opts.camX + width / 2 + 4,
      Math.min(opts.camX + opts.viewW - width / 2 - 4, px),
    );
    const box = place({ x: cx - width / 2, y: py - 60, w: width, h: 16 }, py + 10, 18);
    tags.push({ id, px, py, label, box });
  }
  // All name boxes are reserved first, so speech can never cover a neighbour's name.
  for (const { id, px, py, label, box } of tags) {
    if (box.y < py - 60)
      rect(g, "rgba(172, 144, 184, 0.55)", px, box.y + 16, 1, py - 44 - box.y - 16);
    rect(g, "rgba(25, 18, 38, 0.92)", box.x, box.y, box.w, box.h);
    rect(g, id === "player" ? "#c8ff6a" : "#ad92bb", box.x, box.y, box.w, 1);
    g.font = "600 11px Space Grotesk, sans-serif";
    g.fillStyle = id === "player" ? "#d8ff9a" : "#f0e6dc";
    g.fillText(label, box.x + box.w / 2, box.y + 12, box.w - 8);
  }
  for (const { id, px, py, box: tag } of tags) {
    const agent = town.agents.find((a) => a.id === id);
    if (
      !showingNow ||
      !agent?.bubble ||
      typeof agent.bubble.text !== "string" ||
      agent.bubble.until < now
    )
      continue;
    const text = agent.bubble.text;
    const line = text.length > 42 ? `${text.slice(0, 40)}…` : text;
    g.font = "500 11px Space Grotesk, sans-serif";
    const width = Math.min(260, opts.viewW - 8, Math.ceil(g.measureText(line).width) + 14);
    const cx = Math.max(
      opts.camX + width / 2 + 4,
      Math.min(opts.camX + opts.viewW - width / 2 - 4, px),
    );
    const box = place(
      { x: cx - width / 2, y: tag.y - 26, w: width, h: 22 },
      Math.max(tag.y + tag.h + 4, py + 28),
      26,
    );
    rect(g, "rgba(31, 22, 44, 0.97)", box.x, box.y, box.w, box.h);
    rect(g, "#ba97c0", box.x, box.y, box.w, 1);
    rect(
      g,
      "#49354f",
      Math.max(box.x + 3, Math.min(box.x + box.w - 7, px - 2)),
      box.y < tag.y ? box.y + 22 : box.y - 4,
      4,
      4,
    );
    g.fillStyle = "#f0e6dc";
    g.fillText(line, cx, box.y + 15, box.w - 10);
  }
}

export function paint(ctx: CanvasRenderingContext2D, opts: PaintOpts) {
  const { viewW, viewH, town, minute, camX, camY, positions, selected } = opts;
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = performance.now();
  const dt = lastPaint ? Math.max(0, Math.min(0.05, (now - lastPaint) / 1000)) : 0;
  lastPaint = now;
  if (!town.paused && !opts.replay && !reduced) ambientTime += dt;
  const t = reduced ? 0 : ambientTime;
  const period = periodName(minute);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, viewW, viewH);
  drawSpace(ctx, viewW, viewH);
  ctx.save();
  ctx.translate(-camX, -camY);
  ctx.drawImage(floorArt(), 0, 0);
  drawWater(ctx, opts, t);
  if (selected && positions[selected]) {
    const pos = positions[selected];
    ctx.strokeStyle = "#c8ff6a";
    ctx.lineWidth = 2;
    ctx.strokeRect(pos.x * TILE + 2, pos.y * TILE + 2, TILE - 4, TILE - 4);
  }
  // Objects and residents share a foot-depth order. Ground remains cached;
  // only visible sprites are drawn on each frame.
  const layers: { depth: number; prop?: Scenery; id?: AgentId }[] = [];
  for (const prop of scenery) {
    if (isVisible(prop.x * TILE, prop.y * TILE, opts))
      layers.push({ depth: prop.y * TILE + 29, prop });
  }
  for (const id of AGENT_IDS) {
    const pos = positions[id];
    if (
      pos &&
      Number.isFinite(pos.x) &&
      Number.isFinite(pos.y) &&
      isVisible(pos.x * TILE, pos.y * TILE, opts)
    )
      layers.push({ depth: pos.y * TILE + 24, id });
  }
  layers.sort((a, b) => a.depth - b.depth);
  for (const layer of layers) {
    if (layer.prop) {
      const prop = layer.prop;
      ctx.drawImage(propArt(prop), prop.x * TILE - 16, prop.y * TILE - 64);
      if (prop.kind === "board" && (town.notices ?? []).length) {
        rect(ctx, "#f7e6c9", prop.x * TILE + 10, prop.y * TILE - 6, 10, 14);
        rect(ctx, "#bf818b", prop.x * TILE + 12, prop.y * TILE - 3, 6, 2);
      }
    } else if (layer.id) {
      const id = layer.id;
      const pos = positions[id];
      const m = motion.get(id);
      const moving = !opts.replay && !reduced && m?.moving;
      const stride = moving ? Math.sin(m.phase) : 0;
      const idle =
        reduced || opts.replay ? 0 : Math.sin(t * 1.6 + AGENT_IDS.indexOf(id) * 1.3) * 0.55;
      const activity = !opts.replay && !moving ? activityFor(id, town, pos.x, pos.y) : null;
      drawPerson(
        ctx,
        id,
        pos.x * TILE + TILE / 2,
        pos.y * TILE + TILE / 2 + 8,
        pos.face,
        stride,
        idle,
        activity,
      );
    }
  }
  drawAmbient(ctx, opts, t, reduced);
  drawLighting(ctx, opts, period);
  if (!reduced && (period === "Night" || period === "Dusk")) {
    for (let i = 0; i < 7; i++) {
      const x = (22 + i * 2) * TILE + Math.round(Math.sin(t * 0.7 + i) * 10);
      const y = (34 + (i % 4)) * TILE + Math.round(Math.cos(t * 0.6 + i) * 7);
      if (isVisible(x, y, opts, 16)) {
        ctx.globalAlpha = 0.3 + (Math.sin(t * 1.4 + i) + 1) * 0.25;
        rect(ctx, "#d6e6a0", x, y, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
  drawLabels(ctx, opts);
  ctx.restore();
  const playerPos = positions.player;
  if (playerPos && opts.day === 1) {
    const dx = ANCHORS.cafe.x - playerPos.x;
    const dy = ANCHORS.cafe.y - playerPos.y;
    if (Math.hypot(dx, dy) > 4) {
      const ang = Math.atan2(dy, dx);
      const cx = viewW / 2 + Math.cos(ang) * 72;
      const cy = viewH / 2 + Math.sin(ang) * 48;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      rect(ctx, "rgba(200, 255, 106, 0.94)", 0, -3, 16, 6);
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
