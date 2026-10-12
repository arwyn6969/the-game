import { MAP_H, MAP_W, TILE, cell, cellsAll } from "../../game/world";
import type { Cell, Decor } from "../../game/world";

// All art follows the existing collision map. Rugs and markings are flat;
// raised objects are drawn only on the map's existing furniture/tree cells.
export type Scenery = { x: number; y: number; kind: Decor; zone: string; seed: number };
export const hash = (x: number, y: number) => ((x * 374761393) ^ (y * 668265263)) >>> 0;
export const scenery: Scenery[] = [];
export const water: { x: number; y: number }[] = [];
export const windows: { x: number; y: number; warm: boolean }[] = [];
const sprites = new Map<string, HTMLCanvasElement>();
const glows = new Map<string, HTMLCanvasElement>();
let floor: HTMLCanvasElement | null = null;
let pixelFont = false;

function hasWindow(c: Cell, x: number, y: number) {
  const covered =
    (y === 14 && ((x >= 5 && x <= 8) || (x >= 10 && x <= 12))) ||
    (y === 13 && ((x >= 36 && x <= 40) || (x >= 43 && x <= 45))) ||
    (y === 2 && x >= 5 && x <= 8) ||
    (y === 32 && x >= 4 && x <= 11);
  return c.ground === "wall" && c.zone !== "wall" && !covered && (x * 3 + y) % 5 === 0;
}

for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const c = cell(x, y)!;
    if (c.decor) scenery.push({ x, y, kind: c.decor, zone: c.zone, seed: hash(x, y) });
    if (c.ground === "water") water.push({ x, y });
    if (hasWindow(c, x, y))
      windows.push({ x: x * TILE + 16, y: y * TILE + 13, warm: c.zone !== "library" });
  }
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

function ground(g: CanvasRenderingContext2D, c: Cell, x: number, y: number) {
  const n = hash(x, y);
  const px = x * TILE;
  const py = y * TILE;
  const warm = c.zone === "cafe" || c.zone.startsWith("house-");
  const colors = {
    grass: ["#293c3a", "#2c403a", "#30443d"][n % 3]!,
    path: ["#68637a", "#645f75", "#6d667d"][n % 3]!,
    plaza: ["#63556f", "#685974", "#60526d"][n % 3]!,
    wood: warm ? ["#987568", "#927063", "#9c796d"][n % 3]! : "#836774",
    stone: ["#596475", "#5e687a", "#566172"][n % 3]!,
    tile: (x + y) % 2 ? "#a18c80" : "#877587",
    floor: (x + y) % 2 ? "#706575" : "#756a7c",
    water: ["#274a61", "#2a5066", "#2c5267"][n % 3]!,
    wall: c.zone === "cafe" ? "#76616d" : c.zone === "library" ? "#60647f" : "#6d587c",
    door: "#9b7c6d",
  };
  rect(g, colors[c.ground], px, py, TILE, TILE);
  if (c.ground === "grass") {
    // Small clusters rather than a checkerboard of full-tile color changes.
    if (n % 3 === 0) {
      const gx = px + 4 + (n % 20);
      const gy = py + 8 + ((n >>> 8) % 18);
      rect(g, "#56705a", gx, gy, 2, 5);
      rect(g, "#718463", gx + 3, gy + 2, 2, 3);
      rect(g, "#233834", gx - 2, gy + 5, 9, 2);
    }
    if (n % 11 === 0) {
      rect(g, "#d0a3b3", px + 23, py + 9, 3, 3);
      rect(g, "#dbcb90", px + 24, py + 10, 1, 1);
    }
  } else if (c.ground === "wood") {
    for (const sy of [0, 10, 22]) {
      rect(g, "#654d56", px, py + sy, TILE, 1);
      rect(g, "#b6917b", px, py + sy + 1, TILE, 1);
    }
    rect(g, "#765a58", px + (y % 2 ? 8 : 24), py + 1, 1, 9);
    rect(g, "#b08871", px + 4 + (n % 12), py + 15, 9, 1);
  } else if (["path", "plaza", "stone", "tile", "floor"].includes(c.ground)) {
    rect(g, "rgba(23, 17, 39, 0.22)", px, py, TILE, 1);
    rect(g, "rgba(23, 17, 39, 0.22)", px, py, 1, TILE);
    rect(g, "rgba(238, 211, 223, 0.12)", px + 1, py + 1, TILE - 2, 1);
    if (c.ground === "path") {
      rect(g, "#514d64", px, py + 16, TILE, 1);
      rect(g, "#514d64", px + 16, py + (y % 2 ? 0 : 17), 1, 15);
    }
    if (n % 7 === 0) rect(g, "rgba(211, 191, 216, 0.18)", px + 6, py + 8, 5, 1);
  } else if (c.ground === "water") {
    if (n % 13 === 0) {
      rect(g, "#426b5c", px + 12, py + 16, 10, 4);
      rect(g, "#6b8f69", px + 14, py + 14, 6, 7);
      rect(g, "#294d53", px + 17, py + 14, 3, 2);
      rect(g, "#d1a0b1", px + 14, py + 15, 3, 2);
    }
    // A shoreline is drawn only against land, retaining the true water boundary.
    for (const [dx, dy, sx, sy, w, h] of [
      [-1, 0, 0, 0, 4, 32],
      [1, 0, 28, 0, 4, 32],
      [0, -1, 0, 0, 32, 4],
      [0, 1, 0, 28, 32, 4],
    ]) {
      if (cell(x + dx!, y + dy!)?.ground !== "water") {
        rect(g, "#69817b", px + sx!, py + sy!, w!, h!);
        rect(g, "rgba(175, 207, 172, 0.24)", px + sx!, py + sy!, w!, 1);
      }
    }
  } else if (c.ground === "wall") {
    rect(g, "#352b45", px, py + 24, TILE, 8);
    rect(g, "#4b3b5e", px + 2, py + 19, TILE - 4, 5);
    rect(g, "#b7a0b6", px, py + 2, TILE, 3);
    rect(g, "#8f799b", px, py + 5, TILE, 2);
    rect(g, "rgba(33, 23, 49, 0.24)", px, py + 16, TILE, 1);
    rect(g, "rgba(33, 23, 49, 0.24)", px + (y % 2) * 16, py + 7, 1, 9);
    if (hasWindow(c, x, y)) {
      rect(g, "#352b45", px + 7, py + 8, 18, 14);
      rect(g, "#a58b9d", px + 8, py + 8, 16, 2);
      rect(g, c.zone === "library" ? "#8aa7b8" : "#b89f85", px + 9, py + 10, 14, 9);
      rect(g, "#584354", px + 15, py + 10, 2, 10);
      rect(g, "#584354", px + 9, py + 14, 14, 1);
      rect(g, "#c9b09c", px + 6, py + 21, 20, 2);
    }
  } else if (c.ground === "door") {
    rect(g, "#3f304e", px + 4, py, 24, 7);
    rect(g, "#af967b", px + 4, py + 7, 24, 2);
    rect(g, "#614657", px + 7, py + 10, 18, 4);
    rect(g, "#c4ad8e", px + 6, py + 26, 20, 3);
    rect(g, "#dbcfb4", px + 6, py + 29, 20, 2);
  }
}

function rug(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  const px = x * TILE + 5;
  const py = y * TILE + 5;
  const rw = w * TILE - 10;
  const rh = h * TILE - 10;
  rect(g, "rgba(23, 14, 33, 0.22)", px + 2, py + 4, rw, rh);
  rect(g, color, px, py, rw, rh);
  rect(g, "#bc9e95", px + 4, py + 4, rw - 8, 2);
  rect(g, "#bc9e95", px + 4, py + rh - 6, rw - 8, 2);
  rect(g, "#bc9e95", px + 4, py + 4, 2, rh - 8);
  rect(g, "#bc9e95", px + rw - 6, py + 4, 2, rh - 8);
  for (let ix = 12; ix < rw - 12; ix += 16) {
    rect(g, "rgba(232, 193, 159, 0.2)", px + ix, py + 11, 4, 3);
    rect(g, "rgba(232, 193, 159, 0.2)", px + ix, py + rh - 14, 4, 3);
  }
  for (let iy = 9; iy < rh - 4; iy += 6) {
    rect(g, "#bc9e95", px - 3, py + iy, 3, 1);
    rect(g, "#bc9e95", px + rw, py + iy, 3, 1);
  }
}

function sign(g: CanvasRenderingContext2D, x: number, y: number, text: string, accent: string) {
  g.font = "400 11px Silkscreen, monospace";
  g.textAlign = "left";
  const width = Math.ceil(g.measureText(text).width) + 20;
  rect(g, "#34263f", x + 2, y + 4, width, 25);
  rect(g, "#a891a9", x, y, width, 24);
  rect(g, "#261c35", x + 2, y + 2, width - 4, 20);
  rect(g, accent, x + 5, y + 6, 2, 12);
  g.fillStyle = "#f2dfd2";
  g.fillText(text, x + 12, y + 16);
}

export function floorArt() {
  const ready = document.fonts?.check("11px Silkscreen") ?? false;
  if (floor && pixelFont === ready) return floor;
  const c = document.createElement("canvas");
  c.width = MAP_W * TILE;
  c.height = MAP_H * TILE;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  cellsAll().forEach((c, i) => ground(g, c, i % MAP_W, Math.floor(i / MAP_W)));

  rug(g, 7, 20, 7, 4, "#735060");
  rug(g, 38, 19, 6, 5, "#46536b");
  rug(g, 6, 5, 6, 4, "#61506a");
  rug(g, 6, 34, 5, 4, "#7c5965");
  for (const x of [41, 47, 52]) rug(g, x, 36, 2, 2, "#65546b");

  // A compass mosaic gives the square a focal point without adding an obstacle.
  const cx = 26 * TILE + 16;
  const cy = 21 * TILE + 16;
  for (let i = 0; i < 5; i++) {
    const inset = i * 5;
    rect(g, i % 2 ? "#5b4c66" : "#8b778d", cx - 38 + inset, cy - 38 + inset, 76 - inset * 2, 2);
    rect(g, i % 2 ? "#5b4c66" : "#8b778d", cx - 38 + inset, cy + 36 - inset, 76 - inset * 2, 2);
    rect(g, i % 2 ? "#5b4c66" : "#8b778d", cx - 38 + inset, cy - 38 + inset, 2, 76 - inset * 2);
    rect(g, i % 2 ? "#5b4c66" : "#8b778d", cx + 36 - inset, cy - 38 + inset, 2, 76 - inset * 2);
  }
  rect(g, "#b5c28c", cx - 3, cy - 12, 6, 24);
  rect(g, "#b5c28c", cx - 12, cy - 3, 24, 6);
  rect(g, "#67546c", cx - 2, cy - 2, 4, 4);

  // Wall-mounted art stays on blocked wall tiles, never looks like an obstacle.
  for (const [x, y, caption] of [
    [10, 14, "COFFEE"],
    [43, 13, "READ • REST"],
    [9, 32, "FRESH TODAY"],
  ] as const) {
    const px = x * TILE;
    const py = y * TILE;
    rect(g, "#3c2e41", px, py + 3, 75, 24);
    rect(g, "#b79b86", px, py + 3, 75, 2);
    g.font = "600 9px Space Grotesk, sans-serif";
    g.fillStyle = "#e6caae";
    g.fillText(caption, px + 7, py + 14);
    for (let j = 0; j < 4; j++) rect(g, "#8d786f", px + 7 + j * 15, py + 19, 9, 1);
  }
  // Soft daylight slats from the north windows, behind people and furniture.
  for (const [x, y, w] of [
    [11, 15, 3],
    [39, 14, 3],
  ] as const) {
    g.fillStyle = "rgba(249, 213, 163, 0.06)";
    g.beginPath();
    g.moveTo(x * TILE, y * TILE);
    g.lineTo((x + w) * TILE, y * TILE);
    g.lineTo((x + w + 2) * TILE, (y + 4) * TILE);
    g.lineTo((x + 2) * TILE, (y + 4) * TILE);
    g.fill();
  }

  for (const prop of scenery) {
    const px = prop.x * TILE;
    const py = prop.y * TILE;
    const large = prop.kind === "tree";
    rect(
      g,
      "rgba(18, 16, 30, 0.18)",
      px + (large ? 1 : 5),
      py + 21,
      large ? 35 : 27,
      large ? 13 : 10,
    );
    rect(g, "rgba(18, 16, 30, 0.12)", px + 11, py + 28, large ? 29 : 23, 6);
  }
  sign(g, 5 * TILE, 14 * TILE + 2, "HOBBS", "#d3b283");
  sign(g, 36 * TILE, 13 * TILE + 2, "LIBRARY", "#a7c7c4");
  sign(g, 5 * TILE, 2 * TILE + 2, "DORMS", "#c0a2d6");
  sign(g, 4 * TILE, 32 * TILE + 2, "GROCERY", "#c6d79a");
  sign(g, 20 * TILE, 32 * TILE + 2, "PARK", "#b5cf91");
  sign(g, 41 * TILE, 31 * TILE + 2, "THE ROW", "#db9cb6");
  floor = c;
  pixelFont = ready;
  return c;
}

function cup(g: CanvasRenderingContext2D, x: number, y: number) {
  rect(g, "#453447", x - 1, y + 6, 12, 2);
  rect(g, "#e4d1bd", x, y, 8, 7);
  rect(g, "#f6e7d1", x, y, 8, 2);
  rect(g, "#674d47", x + 2, y + 1, 4, 1);
  rect(g, "#e4d1bd", x + 8, y + 1, 3, 4);
  rect(g, "#6f5360", x + 9, y + 2, 1, 2);
}

function drawProp(g: CanvasRenderingContext2D, prop: Scenery) {
  const { kind, zone, seed } = prop;
  if (kind === "tree") {
    rect(g, "#332b3d", 11, 4, 11, 27);
    rect(g, "#765649", 13, 3, 7, 27);
    rect(g, "#a07a5b", 14, 5, 2, 21);
    rect(g, "#54413c", 10, 28, 15, 3);
    const dark = seed % 2 ? "#254b42" : "#2b4b48";
    const mid = seed % 2 ? "#3d6b4c" : "#41684e";
    const light = seed % 2 ? "#658957" : "#73915e";
    // Stepped canopy silhouettes and grouped highlights keep the pixel scale.
    rect(g, "#1d3435", -7, -19, 46, 27);
    rect(g, "#1d3435", -3, -28, 38, 42);
    rect(g, "#1d3435", 5, -35, 23, 51);
    rect(g, dark, -5, -19, 42, 24);
    rect(g, dark, -1, -26, 34, 37);
    rect(g, dark, 6, -33, 20, 46);
    rect(g, mid, -2, -19, 35, 18);
    rect(g, mid, 2, -26, 27, 31);
    rect(g, mid, 8, -31, 16, 37);
    rect(g, light, 3, -23, 14, 5);
    rect(g, light, 9, -29, 12, 6);
    rect(g, light, -1, -13, 8, 5);
    rect(g, "#8fa16c", 6, -23, 6, 2);
    rect(g, "#8fa16c", 12, -29, 5, 2);
    rect(g, dark, 13, -9, 11, 4);
    rect(g, dark, 28, -15, 7, 7);
    rect(g, mid, 27, -11, 5, 2);
    if (seed % 3 === 0) {
      rect(g, "#d4a5a8", 23, -22, 3, 3);
      rect(g, "#d4a5a8", 1, -7, 3, 3);
    }
  } else if (kind === "shelf") {
    rect(g, "#342c43", 1, -15, 30, 46);
    rect(g, "#997581", 2, -15, 28, 3);
    rect(g, "#775765", 3, -12, 26, 40);
    rect(g, "#423444", 5, -10, 22, 14);
    rect(g, "#423444", 5, 9, 22, 14);
    const spines =
      zone === "grocery"
        ? ["#b7bb76", "#dba679", "#c8a195", "#8ea682", "#e0c5a0"]
        : ["#b5889e", "#7da6aa", "#d6bd89", "#98ab80", "#9786ba"];
    for (let row = 0; row < 2; row++) {
      for (let b = 0; b < (zone === "grocery" ? 4 : 5); b++) {
        const h = 8 + ((seed + b * 7 + row) % 5);
        const x = 5 + b * (zone === "grocery" ? 5 : 4);
        const y = row * 19 + 3 - h;
        const width = zone === "grocery" ? 4 : 3;
        rect(g, spines[(b + seed + row) % spines.length]!, x, y, width, h);
        rect(g, "rgba(247, 223, 190, 0.48)", x, y + 2, width, 1);
        if (zone === "grocery") {
          rect(g, "#d5c8ad", x, y - 1, width, 2);
          rect(g, "#e5d3b4", x, y + 5, width, 3);
        }
      }
    }
    rect(g, "#bd967f", 2, 4, 28, 3);
    rect(g, "#bd967f", 2, 23, 28, 3);
    rect(g, "#4b384b", 3, 28, 26, 3);
  } else if (kind === "counter") {
    rect(g, "#3d2d3e", 1, 0, 30, 31);
    rect(g, "#846367", 3, 11, 26, 18);
    rect(g, "#b08a76", 4, 12, 24, 3);
    rect(g, "#634751", 5, 18, 22, 1);
    rect(g, "#bfb09b", 1, 0, 30, 12);
    rect(g, "#ead5b4", 2, 0, 28, 3);
    rect(g, "#95736b", 2, 11, 28, 2);
    if (zone === "cafe" && prop.x === 5 && prop.y === 19) {
      // Espresso machine, brass fittings and a cup on the actual counter.
      rect(g, "#322c3e", 4, -12, 19, 14);
      rect(g, "#829694", 5, -12, 17, 8);
      rect(g, "#c6c7ad", 6, -12, 15, 2);
      rect(g, "#c9ad83", 7, -3, 2, 6);
      rect(g, "#c9ad83", 17, -3, 2, 6);
      rect(g, "#b3beaa", 4, 4, 20, 2);
      cup(g, 10, 0);
    } else if (zone === "cafe" && prop.y === 19) {
      rect(g, "#7c6468", 4, 0, 24, 9);
      rect(g, "#d7bea5", 5, 0, 22, 2);
      for (let j = 0; j < 3; j++) {
        rect(g, "#a76747", 7 + j * 7, 3, 5, 4);
        rect(g, "#e4b978", 7 + j * 7, 2, 5, 3);
        rect(g, "#f3d39c", 8 + j * 7, 2, 2, 1);
      }
    } else if (zone === "grocery" && prop.x !== 5) {
      rect(g, "#70514a", 3, -3, 26, 12);
      rect(g, "#c3a079", 3, -3, 26, 2);
      if (prop.x === 4) {
        for (let j = 0; j < 3; j++) {
          rect(g, "#b0734c", 5 + j * 7, 1, 6, 5);
          rect(g, "#e5c38b", 5 + j * 7, 0, 6, 3);
          rect(g, "#f6d8a2", 7 + j * 7, 0, 1, 3);
        }
      } else {
        for (let j = 0; j < 4; j++) {
          rect(g, j % 2 ? "#a7b878" : "#d28c78", 5 + j * 5, 1 + (j % 2), 4, 4);
          rect(g, "#728254", 6 + j * 5, j % 2, 2, 1);
        }
      }
    } else {
      rect(g, "#544258", 13, -7, 11, 11);
      rect(g, "#c6d59e", 14, -6, 9, 5);
      rect(g, "#8c818b", 11, 4, 15, 3);
      if (zone === "grocery") {
        for (let j = 0; j < 2; j++) {
          rect(g, "#b0734c", 3 + j * 6, 3, 5, 4);
          rect(g, "#e5c38b", 3 + j * 6, 2, 5, 2);
        }
      }
    }
  } else if (kind === "table") {
    rect(g, "#352a3e", 4, 1, 24, 15);
    rect(g, "#4a3547", 6, 12, 4, 16);
    rect(g, "#4a3547", 22, 12, 4, 16);
    rect(g, "#8a6364", 4, 3, 24, 15);
    rect(g, "#b89278", 4, 1, 24, 11);
    rect(g, "#dec2a0", 5, 1, 22, 2);
    rect(g, "#8d6962", 5, 11, 22, 2);
    if (zone === "cafe") {
      cup(g, 8, 3);
      rect(g, "#dbad75", 21, 5, 4, 3);
    } else {
      rect(g, "#4e4055", 8, 3, 16, 8);
      rect(g, "#e4d1b4", 9, 2, 14, 8);
      rect(g, "#a19d9c", 15, 2, 1, 8);
      for (let j = 0; j < 3; j++) rect(g, "#a29898", 10, 4 + j * 2, 4, 1);
      rect(g, "#b1bf9a", 20, -3, 3, 6);
    }
  } else if (kind === "bed") {
    rect(g, "#3b2b40", 3, -1, 26, 32);
    rect(g, "#97717a", 4, -2, 24, 31);
    rect(g, "#c1a293", 4, -3, 24, 4);
    rect(g, "#ddc8b4", 5, 2, 22, 25);
    rect(g, "#f0e1cc", 7, 3, 18, 6);
    rect(g, zone === "dorms" ? "#799595" : "#a27796", 5, 12, 22, 15);
    rect(g, zone === "dorms" ? "#a8b9a8" : "#c7a4b2", 5, 12, 22, 3);
    rect(g, "rgba(39, 26, 49, 0.18)", 23, 15, 4, 12);
    rect(g, "#624657", 4, 28, 24, 3);
  } else if (kind === "bench") {
    rect(g, "#332d3e", 3, 0, 3, 30);
    rect(g, "#332d3e", 26, 0, 3, 30);
    rect(g, "#9c7965", 2, -1, 28, 4);
    rect(g, "#b59272", 2, 5, 28, 4);
    rect(g, "#9c7965", 1, 15, 30, 6);
    rect(g, "#d1ad85", 2, 15, 28, 2);
    rect(g, "#66505a", 2, 21, 28, 3);
  } else if (kind === "board") {
    rect(g, "#342b40", 4, -17, 24, 35);
    rect(g, "#b99a79", 5, -16, 22, 33);
    rect(g, "#826050", 7, -13, 18, 27);
    rect(g, "#634956", 7, 17, 4, 13);
    rect(g, "#634956", 22, 17, 4, 13);
    rect(g, "#eadac0", 9, -9, 9, 12);
    rect(g, "#d6bec0", 17, -4, 6, 11);
    rect(g, "#b28c9c", 10, -6, 6, 1);
    rect(g, "#b28c9c", 10, -3, 4, 1);
    rect(g, "#e9bd8b", 8, 5, 7, 7);
    rect(g, "#a8c090", 9, -11, 2, 2);
    rect(g, "#ddaa9f", 20, -6, 2, 2);
  } else if (kind === "plant") {
    rect(g, "#493449", 8, 17, 17, 13);
    rect(g, "#ad7b71", 9, 16, 15, 11);
    rect(g, "#d2a48b", 7, 15, 19, 4);
    rect(g, "#33513f", 9, 2, 14, 14);
    rect(g, "#71965e", 12, -1, 7, 17);
    rect(g, "#8eac6d", 10, 3, 5, 7);
    rect(g, "#56774d", 4, 6, 9, 5);
    rect(g, "#a4ba7e", 21, 1, 5, 8);
    rect(g, "#648352", 17, 9, 10, 5);
  } else if (kind === "lamp") {
    rect(g, "#2b293d", 12, -20, 8, 50);
    rect(g, "#82838a", 15, -18, 2, 46);
    rect(g, "#383047", 8, 27, 16, 4);
    rect(g, "#41344c", 7, -29, 18, 5);
    rect(g, "#41344c", 9, -25, 14, 15);
    rect(g, "#e1d2a2", 11, -24, 10, 10);
    rect(g, "#fff0bf", 13, -23, 6, 8);
    rect(g, "#786b6f", 8, -12, 16, 3);
  } else if (kind === "stool") {
    rect(g, "#423041", 8, 10, 3, 20);
    rect(g, "#423041", 22, 10, 3, 20);
    rect(g, "#87606b", 6, 8, 21, 8);
    rect(g, "#b5937f", 6, 7, 21, 5);
    rect(g, "#d0af92", 8, 7, 17, 2);
    rect(g, "#624653", 9, 24, 15, 2);
  }
}

export function propArt(prop: Scenery) {
  const key = `${prop.kind}:${prop.zone}:${prop.seed % 6}:${prop.kind === "counter" ? `${prop.x},${prop.y}` : ""}`;
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = 64;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.translate(16, 64);
    drawProp(g, prop);
    sprites.set(key, c);
  }
  return c;
}

export function glowArt(warm: boolean, radius: number) {
  const key = `${warm}:${radius}`;
  let c = glows.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = radius * 2;
    const g = c.getContext("2d")!;
    const rgb = warm ? "244, 182, 114" : "151, 204, 193";
    const gradient = g.createRadialGradient(radius, radius, 2, radius, radius, radius);
    gradient.addColorStop(0, `rgba(${rgb}, 0.38)`);
    gradient.addColorStop(0.25, `rgba(${rgb}, 0.2)`);
    gradient.addColorStop(0.65, `rgba(${rgb}, 0.07)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, c.width, c.height);
    glows.set(key, c);
  }
  return c;
}
