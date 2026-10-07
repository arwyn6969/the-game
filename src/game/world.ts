import type { PlaceId } from "./types";

export const MAP_W = 56;
export const MAP_H = 42;
export const TILE = 32;

export type Ground =
  | "grass"
  | "path"
  | "plaza"
  | "wood"
  | "stone"
  | "tile"
  | "water"
  | "wall"
  | "door"
  | "floor";

export type Decor =
  | "tree"
  | "counter"
  | "shelf"
  | "bed"
  | "bench"
  | "board"
  | "table"
  | "plant"
  | "lamp"
  | "stool";

export type Cell = {
  ground: Ground;
  block: boolean;
  zone: string;
  decor?: Decor;
};

const cells: Cell[] = Array.from({ length: MAP_W * MAP_H }, () => ({
  ground: "grass",
  block: false,
  zone: "green",
}));

function at(x: number, y: number): Cell {
  return cells[y * MAP_W + x]!;
}

export function inMap(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function cell(x: number, y: number): Cell | undefined {
  if (!inMap(x, y)) return undefined;
  return at(x, y);
}

export function walkable(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const c = cell(Math.round(x), Math.round(y));
  return !!c && !c.block;
}

function fill(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  patch: Partial<Cell>,
  onlyIf?: (c: Cell) => boolean,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inMap(x, y)) continue;
      const c = at(x, y);
      if (onlyIf && !onlyIf(c)) continue;
      Object.assign(c, patch);
    }
  }
}

function building(
  x: number,
  y: number,
  w: number,
  h: number,
  zone: string,
  floor: Ground,
) {
  for (let iy = y; iy < y + h; iy++) {
    for (let ix = x; ix < x + w; ix++) {
      const edge = ix === x || iy === y || ix === x + w - 1 || iy === y + h - 1;
      const c = at(ix, iy);
      c.zone = zone;
      if (edge) {
        c.block = true;
        c.ground = "wall";
        c.decor = undefined;
      } else {
        c.block = false;
        c.ground = floor;
        c.decor = undefined;
      }
    }
  }
}

function door(x: number, y: number) {
  const c = at(x, y);
  c.block = false;
  c.ground = "door";
  c.decor = undefined;
}

function blockDecor(x: number, y: number, decor: Decor) {
  if (!inMap(x, y)) return;
  const c = at(x, y);
  if (c.ground === "wall" || c.ground === "door" || c.ground === "water") return;
  c.block = true;
  c.decor = decor;
}

// Border.
for (let x = 0; x < MAP_W; x++) {
  for (const y of [0, MAP_H - 1]) {
    const c = at(x, y);
    c.block = true;
    c.ground = "wall";
    c.zone = "wall";
  }
}
for (let y = 0; y < MAP_H; y++) {
  for (const x of [0, MAP_W - 1]) {
    const c = at(x, y);
    c.block = true;
    c.ground = "wall";
    c.zone = "wall";
  }
}

// Streets and connectors, carved before buildings overwrite them.
fill(1, 1, MAP_W - 2, MAP_H - 2, { ground: "grass", block: false, zone: "green" });
fill(1, 27, MAP_W - 2, 31, { ground: "path", block: false, zone: "street" });
fill(18, 12, 19, 31, { ground: "path", block: false, zone: "street" });
fill(32, 12, 33, 31, { ground: "path", block: false, zone: "street" });

// College dorms, northwest.
building(2, 2, 16, 11, "dorms", "floor");
door(9, 12);
fill(1, 13, 18, 13, { ground: "path", block: false, zone: "street" });

// River, northeast. Does not seal the library approach.
fill(42, 2, 53, 8, { ground: "water", block: true, zone: "water" });

// Hobbs Cafe, west of the plaza.
building(2, 14, 16, 12, "cafe", "wood");
door(17, 20);
fill(18, 14, 18, 26, { ground: "path", block: false, zone: "street" });

// Plaza between cafe and library.
fill(19, 14, 31, 26, {
  ground: "plaza",
  block: false,
  zone: "plaza",
});

// Noticeboard just east of the cafe door.
at(22, 16).block = true;
at(22, 16).decor = "board";
at(22, 16).ground = "plaza";
at(22, 16).zone = "noticeboard";
for (const [x, y] of [
  [21, 16],
  [23, 16],
  [22, 17],
  [21, 17],
  [23, 17],
  [22, 15],
] as const) {
  const c = at(x, y);
  if (c.ground === "wall") continue;
  c.block = false;
  c.zone = "noticeboard";
  c.ground = "plaza";
}

// Library, east.
building(34, 13, 20, 13, "library", "stone");
door(34, 20);
fill(33, 18, 33, 22, { ground: "path", block: false, zone: "street" });

// Grocery, southwest.
building(2, 32, 16, 8, "grocery", "tile");
door(8, 32);

// Park.
fill(19, 32, 38, 39, { ground: "grass", block: false, zone: "park" });
fill(26, 34, 32, 37, { ground: "water", block: true, zone: "park" });

// Townhouse row.
building(40, 32, 5, 8, "house-baba", "wood");
door(42, 32);
building(46, 32, 5, 8, "house-sub", "wood");
door(48, 32);
building(51, 32, 4, 8, "house-player", "wood");
door(52, 32);

// Furniture that must not seal doors or anchors.
blockDecor(4, 4, "bed");
blockDecor(4, 8, "bed");
blockDecor(13, 4, "bed");
blockDecor(13, 8, "bed");
blockDecor(6, 6, "table");

blockDecor(4, 16, "bed");
blockDecor(5, 19, "counter");
blockDecor(5, 20, "counter");
blockDecor(6, 19, "counter");
blockDecor(8, 22, "table");
blockDecor(12, 22, "table");
blockDecor(8, 23, "stool");
blockDecor(12, 23, "stool");

blockDecor(36, 15, "shelf");
blockDecor(38, 15, "shelf");
blockDecor(40, 15, "shelf");
blockDecor(42, 15, "shelf");
blockDecor(44, 15, "shelf");
blockDecor(46, 15, "shelf");
blockDecor(48, 15, "shelf");
blockDecor(50, 15, "shelf");
blockDecor(46, 17, "bed");
blockDecor(40, 22, "table");

blockDecor(4, 35, "counter");
blockDecor(5, 35, "counter");
blockDecor(6, 35, "counter");
blockDecor(11, 36, "shelf");

blockDecor(41, 35, "bed");
blockDecor(47, 35, "bed");
blockDecor(52, 35, "bed");

blockDecor(21, 33, "bench");
blockDecor(23, 36, "bench");

const treeSpots: [number, number][] = [
  [20, 3],
  [24, 5],
  [28, 3],
  [36, 4],
  [22, 9],
  [28, 10],
  [38, 10],
  [20, 34],
  [24, 38],
  [35, 33],
  [36, 38],
  [21, 38],
  [15, 28],
];
for (const [x, y] of treeSpots) {
  const c = at(x, y);
  if (c.zone === "green" || c.zone === "park") blockDecor(x, y, "tree");
}

blockDecor(25, 18, "plant");
blockDecor(28, 22, "lamp");
blockDecor(24, 24, "plant");

export const ANCHORS: Record<PlaceId, { x: number; y: number }> = {
  cafe: { x: 10, y: 21 },
  library: { x: 40, y: 20 },
  dorms: { x: 9, y: 7 },
  park: { x: 22, y: 35 },
  townhouses: { x: 44, y: 31 },
  grocery: { x: 9, y: 35 },
  noticeboard: { x: 22, y: 17 },
  plaza: { x: 26, y: 21 },
  street: { x: 24, y: 29 },
};

export const HOMES = {
  kevin: { x: 6, y: 17 },
  arwyn: { x: 48, y: 18 },
  northern: { x: 8, y: 6 },
  baba: { x: 42, y: 35 },
  sub: { x: 48, y: 36 },
  player: { x: 52, y: 36 },
} as const;

export function zoneAt(x: number, y: number): string {
  return cell(x, y)?.zone ?? "wall";
}

export function placeOfZone(zone: string): PlaceId {
  switch (zone) {
    case "cafe":
      return "cafe";
    case "library":
      return "library";
    case "dorms":
      return "dorms";
    case "park":
      return "park";
    case "grocery":
      return "grocery";
    case "noticeboard":
      return "noticeboard";
    case "plaza":
      return "plaza";
    case "house-baba":
    case "house-sub":
    case "house-player":
    case "row":
      return "townhouses";
    default:
      return "street";
  }
}

export function placeTitle(zone: string): string {
  switch (zone) {
    case "cafe":
      return "Hobbs Cafe";
    case "library":
      return "Library";
    case "dorms":
      return "College Dorms";
    case "park":
      return "Park";
    case "grocery":
      return "Grocery";
    case "noticeboard":
      return "Noticeboard";
    case "plaza":
      return "Plaza";
    case "house-baba":
    case "house-sub":
    case "house-player":
      return "Townhouse Row";
    case "water":
      return "The water";
    default:
      return "The street";
  }
}

export function placeTitleOf(place: PlaceId): string {
  switch (place) {
    case "cafe":
      return "Hobbs Cafe";
    case "library":
      return "Library";
    case "dorms":
      return "College Dorms";
    case "park":
      return "Park";
    case "townhouses":
      return "Townhouse Row";
    case "grocery":
      return "Grocery";
    case "noticeboard":
      return "Noticeboard";
    case "plaza":
      return "Plaza";
    default:
      return "The street";
  }
}

const TALK = new Set([
  "cafe",
  "library",
  "dorms",
  "park",
  "grocery",
  "noticeboard",
  "plaza",
  "house-baba",
  "house-sub",
  "house-player",
]);

export function canConverse(zone: string): boolean {
  return TALK.has(zone);
}

export function nearestWalkable(x: number, y: number): { x: number; y: number } {
  const ix = Number.isFinite(x) ? Math.round(x) : 1;
  const iy = Number.isFinite(y) ? Math.round(y) : 1;
  if (walkable(ix, iy)) return { x: ix, y: iy };
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        if (walkable(ix + dx, iy + dy)) return { x: ix + dx, y: iy + dy };
      }
    }
  }
  return { x: 26, y: 22 };
}

export function cellsAll(): Cell[] {
  return cells;
}

export function auditWorld(): string[] {
  const errors: string[] = [];
  const points: [string, { x: number; y: number }][] = [
    ...Object.entries(ANCHORS),
    ...Object.entries(HOMES),
    ["player-start", { x: 26, y: 22 }],
    ["cafe-door-out", { x: 18, y: 20 }],
    ["library-door-out", { x: 33, y: 20 }],
  ];
  for (const [name, p] of points) {
    if (!walkable(p.x, p.y)) errors.push(`${name} blocked at ${p.x},${p.y} zone ${zoneAt(p.x, p.y)}`);
  }
  const start = { x: 26, y: 22 };
  const seen = new Uint8Array(MAP_W * MAP_H);
  const q = [start];
  seen[start.y * MAP_W + start.x] = 1;
  let walk = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    walk++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!walkable(x, y)) continue;
      const k = y * MAP_W + x;
      if (seen[k]) continue;
      seen[k] = 1;
      q.push({ x, y });
    }
  }
  if (walk < 48 * 20) errors.push(`walkable component small: ${walk}`);
  for (const [name, p] of points) {
    const spot = nearestWalkable(p.x, p.y);
    if (!seen[spot.y * MAP_W + spot.x]) errors.push(`${name} unreachable`);
  }
  return errors;
}
