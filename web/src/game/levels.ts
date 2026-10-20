// The five worlds from the Series 1 Level cards, and a seeded layout generator.
// Every world is a ~60 second run in 5 parts: LET'S GO!, COIN TRAIL, the world's
// challenge, TAKE FIVE, LEVEL CLEAR, ending at Dash's dog house.

export const VIEW_W = 960;
export const VIEW_H = 540;
export const GROUND_Y = 456;
export const PLAYER_W = 50;
export const PLAYER_H = 54;
export const PLAYER_SLIDE_H = 28;
export const PLAYER_SCREEN_X = 180;

export type WorldKey = "meadow" | "jungle" | "route66" | "ice" | "space";

export type World = {
  index: number;
  key: WorldKey;
  num: string;
  name: string;
  challenge: string;
  difficulty: number; // pips out of 10, as on the Level cards
  speed: number; // px/s
  gravity: number; // px/s^2
  jumpV: number; // px/s
  seconds: number;
};

export const WORLDS: World[] = [
  { index: 0, key: "meadow", num: "LEVEL 1", name: "THE MEADOW", challenge: "BIRD WATCH", difficulty: 1, speed: 320, gravity: 2600, jumpV: 1000, seconds: 60 },
  { index: 1, key: "jungle", num: "LEVEL 3", name: "THE JUNGLE", challenge: "DANGER AHEAD", difficulty: 3, speed: 350, gravity: 2600, jumpV: 1000, seconds: 60 },
  { index: 2, key: "route66", num: "LEVEL 5", name: "ROUTE 66", challenge: "BUZZ CITY", difficulty: 5, speed: 380, gravity: 2700, jumpV: 1020, seconds: 60 },
  { index: 3, key: "ice", num: "LEVEL 7", name: "ICE CAPS", challenge: "THIN ICE", difficulty: 7, speed: 410, gravity: 2700, jumpV: 1020, seconds: 60 },
  { index: 4, key: "space", num: "SPACE", name: "DEEP SPACE", challenge: "SHOOTING STARS", difficulty: 8, speed: 430, gravity: 1500, jumpV: 800, seconds: 60 },
];

export const SECTION_NAMES = (w: World) => ["LET’S GO!", "COIN TRAIL", w.challenge, "TAKE FIVE", "LEVEL CLEAR"];

export type Ground = { x0: number; x1: number };
export type Platform = { x: number; y: number; w: number };

export type ObstacleKind = "log" | "rock" | "fence" | "stump" | "cone" | "cactus" | "snowman" | "crater";

export type Ent =
  | { kind: "coin"; x: number; y: number; taken: boolean }
  | { kind: "obstacle"; x: number; w: number; h: number; style: ObstacleKind; hit: boolean }
  | { kind: "chicken"; x: number; vx: number; dead: number }
  | { kind: "boar"; x: number; vx: number; charging: boolean; dead: number }
  | { kind: "wasp"; x: number; baseY: number; phase: number; dead: number }
  | { kind: "ice"; x: number; w: number; crack: number; broken: boolean }
  | { kind: "star"; trigger: number; targetX: number; t: number; active: boolean; landed: boolean; crater: number };

export type Level = {
  world: World;
  seed: number;
  length: number;
  goalX: number;
  grounds: Ground[];
  platforms: Platform[];
  ents: Ent[];
  sections: { name: string; x0: number }[];
  totalCoins: number;
};

/** Mulberry32: tiny seeded RNG so every world has the same layout on every try. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

/** Horizontal distance of a full jump on flat ground. */
export function jumpDistance(w: World) {
  return (w.speed * 2 * w.jumpV) / w.gravity;
}

const OBSTACLES: Record<WorldKey, { style: ObstacleKind; w: number; h: number }[]> = {
  meadow: [{ style: "log", w: 70, h: 34 }, { style: "fence", w: 46, h: 52 }, { style: "rock", w: 54, h: 40 }],
  jungle: [{ style: "stump", w: 56, h: 50 }, { style: "log", w: 84, h: 36 }, { style: "rock", w: 60, h: 46 }],
  route66: [{ style: "cone", w: 34, h: 44 }, { style: "cactus", w: 40, h: 70 }, { style: "rock", w: 56, h: 40 }],
  ice: [{ style: "snowman", w: 50, h: 66 }, { style: "rock", w: 56, h: 40 }],
  space: [{ style: "rock", w: 60, h: 46 }],
};

export function buildLevel(world: World, seed = 1000 + world.index * 7919): Level {
  const r = rng(seed);
  const d = world.difficulty;
  const D = jumpDistance(world);
  const length = Math.round(world.speed * world.seconds);
  const sectionLen = Math.round((length - 1200) / 5);

  const grounds: Ground[] = [];
  const platforms: Platform[] = [];
  const ents: Ent[] = [];
  let x = 0;
  let groundStart = 0;

  const coin = (cx: number, cy: number) => ents.push({ kind: "coin", x: cx, y: cy, taken: false });
  const coinRow = (cx: number, cy: number, n: number, gap = 42) => {
    for (let i = 0; i < n; i++) coin(cx + i * gap, cy);
  };
  /** Coins along a jump arc starting at takeoff x0 across distance `span`. */
  const coinArc = (x0: number, span: number, n: number, peak = 150) => {
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      coin(x0 + f * span, GROUND_Y - 40 - Math.sin(f * Math.PI) * peak);
    }
  };
  const gap = (w: number) => {
    grounds.push({ x0: groundStart, x1: x });
    x += w;
    groundStart = x;
  };
  const flat = (len: number) => {
    x += len;
  };
  const obstacle = () => {
    const o = r.pick(OBSTACLES[world.key]);
    ents.push({ kind: "obstacle", x, w: o.w, h: o.h, style: o.style, hit: false });
    if (r.chance(0.6)) coinArc(x - D * 0.45, D * 0.9 + o.w, 3, Math.min(150, o.h + 70));
    x += o.w;
  };

  // ------------------------------------------------------------ patterns
  const P = {
    coins() {
      const n = r.int(4, 7);
      const wave = r.chance(0.5);
      for (let i = 0; i < n; i++) coin(x + i * 44, GROUND_Y - 40 - (wave ? Math.sin(i * 0.9) * 26 + 26 : 0));
      flat(n * 44 + 60);
    },
    gap() {
      flat(140);
      const w = Math.round(r.range(0.32, 0.46 + d * 0.012) * D);
      coinArc(x - D * 0.3, w + D * 0.6, 4, 140);
      gap(w);
      flat(200);
    },
    obstacle() {
      flat(120);
      obstacle();
      if (d >= 3 && r.chance(0.35)) {
        flat(Math.round(D * 1.05));
        obstacle();
      }
      flat(220);
    },
    platforms() {
      flat(120);
      const n = r.int(2, 3);
      const overGap = d >= 3 && r.chance(0.5);
      const startX = x;
      for (let i = 0; i < n; i++) {
        const pw = r.int(150, 220);
        const py = GROUND_Y - r.int(110, world.key === "space" ? 180 : 150);
        platforms.push({ x, y: py, w: pw });
        coinRow(x + 24, py - 40, Math.floor(pw / 50));
        x += pw + r.int(70, 120);
      }
      if (overGap) {
        // A pit under the middle of the platform run, short enough to jump without them.
        const mid = startX + (x - startX) / 2;
        const w = Math.round(D * 0.36);
        const save = x;
        x = mid - w / 2;
        gap(w);
        x = save;
      }
      flat(180);
    },
    chickens() {
      flat(160);
      const n = r.int(1, d >= 3 ? 3 : 2);
      for (let i = 0; i < n; i++) {
        ents.push({ kind: "chicken", x: x + i * Math.max(260, D * 1.1), vx: -60, dead: 0 });
      }
      flat(n * Math.max(260, D * 1.1) + 200);
    },
    boar() {
      flat(300);
      ents.push({ kind: "boar", x: x + 300, vx: 0, charging: false, dead: 0 });
      coinRow(x + 100, GROUND_Y - 190, 4);
      flat(700);
    },
    wasps() {
      flat(160);
      const n = r.int(1, Math.min(4, 1 + Math.ceil(d / 2)));
      const spacing = Math.max(300, D * 1.15);
      for (let i = 0; i < n; i++) {
        // Head height: slide under or jump over. Low: jump.
        const low = r.chance(0.45);
        ents.push({ kind: "wasp", x: x + i * spacing, baseY: low ? GROUND_Y - 20 : GROUND_Y - 50, phase: r.range(0, 6), dead: 0 });
      }
      flat(n * spacing + 160);
    },
    thinIce() {
      flat(100);
      // Thin ice tiles that crack behind you, with open water holes to hop.
      const tiles = r.int(10, 18);
      // After a hole, keep enough solid tiles to land a full jump on.
      const landing = Math.ceil((D * 0.9) / 70);
      let solid = 2;
      grounds.push({ x0: groundStart, x1: x });
      for (let i = 0; i < tiles; i++) {
        if (solid >= landing && i < tiles - landing && r.chance(0.35)) {
          const hole = r.chance(0.5) ? 70 : 110;
          coinArc(x - D * 0.35, hole + D * 0.7, 3, 120);
          x += hole;
          solid = 0;
          continue;
        }
        solid++;
        ents.push({ kind: "ice", x, w: 70, crack: 0, broken: false });
        x += 70;
      }
      groundStart = x;
      flat(220);
    },
    star() {
      flat(200);
      const targetX = x + 260;
      // The star lands ahead of Dash and leaves a crater to jump.
      ents.push({ kind: "star", trigger: targetX - world.speed * 1.9, targetX, t: 0, active: false, landed: false, crater: 0 });
      coinArc(targetX - D * 0.45, D * 0.95, 3, 150);
      flat(Math.round(D * 1.2) + 260);
    },
  };

  type PName = keyof typeof P;
  const general: [PName, number][] = [
    ["coins", 3],
    ["gap", 2 + d * 0.2],
    ["obstacle", 2 + d * 0.2],
    ["platforms", 1.5],
  ];
  const themed: Record<WorldKey, [PName, number][]> = {
    meadow: [["chickens", 3], ["wasps", 1], ["obstacle", 1], ["coins", 1]],
    jungle: [["boar", 2.5], ["obstacle", 1.5], ["gap", 1], ["chickens", 0.5]],
    route66: [["wasps", 3], ["obstacle", 1.2], ["gap", 0.8]],
    ice: [["thinIce", 3], ["gap", 1], ["obstacle", 1]],
    space: [["star", 3], ["platforms", 1.2], ["gap", 1.2]],
  };
  const extras: Record<WorldKey, PName[]> = {
    meadow: ["chickens"],
    jungle: ["boar", "chickens"],
    route66: ["wasps"],
    ice: ["thinIce", "wasps"],
    space: ["star", "wasps"],
  };
  const pickW = (list: [PName, number][]) => {
    const tot = list.reduce((a, [, w]) => a + w, 0);
    let v = r.next() * tot;
    for (const [n, w] of list) {
      v -= w;
      if (v < 0) return n;
    }
    return list[list.length - 1][0];
  };

  const names = SECTION_NAMES(world);
  const sections: { name: string; x0: number }[] = [];
  flat(700); // safe start

  for (let s = 0; s < 5; s++) {
    sections.push({ name: names[s], x0: x });
    const end = 700 + sectionLen * (s + 1);
    while (x < end) {
      let p: PName;
      if (s === 0) p = r.chance(0.5) ? "coins" : pickW(general.filter(([n]) => n !== "gap" || d >= 3));
      else if (s === 1) p = r.chance(0.55) ? "coins" : pickW([["gap", 2], ["platforms", 2]]);
      else if (s === 2) p = pickW(themed[world.key]);
      else if (s === 3) p = r.chance(0.7) ? "coins" : "platforms";
      else p = r.chance(0.35) ? r.pick(extras[world.key]) : pickW(general);
      P[p]();
      flat(Math.round(r.range(140, 300) - d * 8));
    }
  }

  flat(260);
  const goalX = Math.round(x + 120);
  coinRow(x - 200, GROUND_Y - 40, 5);
  x = goalX + 1200;
  grounds.push({ x0: groundStart, x1: x });

  ents.sort((a, b) => entX(a) - entX(b));
  return {
    world,
    seed,
    length,
    goalX,
    grounds,
    platforms,
    ents,
    sections,
    totalCoins: ents.filter((e) => e.kind === "coin").length,
  };
}

export function entX(e: Ent): number {
  return e.kind === "star" ? e.trigger : e.x;
}
