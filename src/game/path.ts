import { MAP_H, MAP_W, nearestWalkable, walkable } from "./world";

type P = { x: number; y: number };

function key(x: number, y: number) {
  return y * MAP_W + x;
}

export function findPath(start: P, goalIn: P): P[] {
  const goal = nearestWalkable(goalIn.x, goalIn.y);
  const s = walkable(start.x, start.y) ? start : nearestWalkable(start.x, start.y);
  if (s.x === goal.x && s.y === goal.y) return [];

  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const gScore = new Float64Array(MAP_W * MAP_H);
  gScore.fill(Infinity);
  const prev = new Int32Array(MAP_W * MAP_H);
  prev.fill(-1);
  const closed = new Uint8Array(MAP_W * MAP_H);

  const open: { f: number; i: number }[] = [];
  const push = (f: number, i: number) => {
    open.push({ f, i });
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (open[p]!.f <= open[k]!.f) break;
      const tmp = open[p]!;
      open[p] = open[k]!;
      open[k] = tmp;
      k = p;
    }
  };
  const pop = () => {
    if (!open.length) return undefined;
    const top = open[0]!;
    const last = open.pop()!;
    if (!open.length) return top;
    open[0] = last;
    let k = 0;
    for (;;) {
      const l = k * 2 + 1;
      const r = l + 1;
      let s = k;
      if (l < open.length && open[l]!.f < open[s]!.f) s = l;
      if (r < open.length && open[r]!.f < open[s]!.f) s = r;
      if (s === k) break;
      const tmp = open[k]!;
      open[k] = open[s]!;
      open[s] = tmp;
      k = s;
    }
    return top;
  };

  const si = key(s.x, s.y);
  gScore[si] = 0;
  push(h(s.x, s.y), si);
  const gi = key(goal.x, goal.y);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  let expanded = 0;
  const limit = MAP_W * MAP_H;
  while (open.length && expanded++ < limit) {
    const cur = pop();
    if (!cur) break;
    if (closed[cur.i]) continue;
    closed[cur.i] = 1;
    if (cur.i === gi) break;
    const cx = cur.i % MAP_W;
    const cy = (cur.i / MAP_W) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (!walkable(nx, ny)) continue;
      const ni = key(nx, ny);
      if (closed[ni]) continue;
      const ng = gScore[cur.i]! + 1;
      if (ng >= gScore[ni]!) continue;
      gScore[ni] = ng;
      prev[ni] = cur.i;
      push(ng + h(nx, ny), ni);
    }
  }

  if (!closed[gi] && gScore[gi] === Infinity) return [];
  const out: P[] = [];
  let i = gi;
  const guard = MAP_W * MAP_H;
  let steps = 0;
  while (i !== si && i >= 0 && steps++ < guard) {
    out.push({ x: i % MAP_W, y: (i / MAP_W) | 0 });
    i = prev[i]!;
  }
  out.reverse();
  return out;
}
