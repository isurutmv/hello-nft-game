// Pre-rendered, seamlessly tiling scenery for each world: sky, distant ranges with haze,
// mid and near layers, ground textures. Built once per world into offscreen canvases.
import { GROUND_Y, VIEW_H, VIEW_W, type WorldKey } from "./levels";

/** Pixel density of pre-rendered ground textures (close to the camera, so kept sharp). */
export const S = 1.5;
/** Background layers are soft and hazy, so 1x keeps them inside GPU memory budgets. */
const LS = 1;
/** Width of one seamless layer tile in game units. */
const TILE = 1920;

export type Layer = { img: HTMLCanvasElement; parallax: number; drift?: number; alpha?: number; top: number; scale: number };
export type Scene = {
  sky: HTMLCanvasElement;
  layers: Layer[]; // back to front, all behind gameplay
  front: Layer[]; // in front of gameplay
  groundTile: HTMLCanvasElement; // TILE_G x (VIEW_H - GROUND_Y + 40)
  lipTile: HTMLCanvasElement; // surface lip, drawn from GROUND_Y - LIP_UP
  pit: string;
  fog: string;
  light: string; // rim light colour for characters
  ambient: "pollen" | "fireflies" | "dust" | "snow" | "stardust";
  sun?: { x: number; y: number; r: number; color: string };
  rays?: string;
  vignette: number;
};

export const TILE_G = 512;
export const LIP_UP = 14;
const GROUND_H = VIEW_H - GROUND_Y + 40;

const cache = new Map<WorldKey, Scene>();

export function getScene(key: WorldKey): Scene {
  let s = cache.get(key);
  if (!s) {
    s = BUILDERS[key]();
    cache.set(key, s);
  }
  return s;
}

// ------------------------------------------------------------------ helpers

function canvas(w: number, h: number, scale = S) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const ctx = c.getContext("2d", { willReadFrequently: false })!;
  ctx.scale(scale, scale);
  return { c, ctx };
}

/** Crop a full-height layer to the rows that have content, so it costs less GPU memory. */
function layer(img: HTMLCanvasElement, parallax: number, extra: Partial<Layer> = {}): Layer {
  const ctx = img.getContext("2d")!;
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let first = img.height;
  outer: for (let y = 0; y < img.height; y += 2) {
    for (let x = 3; x < img.width * 4; x += 64) {
      if (data[y * img.width * 4 + x] > 4) {
        first = y;
        break outer;
      }
    }
  }
  first = Math.max(0, first - 4);
  const out = document.createElement("canvas");
  out.width = img.width;
  out.height = Math.max(1, img.height - first);
  out.getContext("2d")!.drawImage(img, 0, -first);
  return { img: out, parallax, top: first / LS, scale: LS, ...extra };
}

/** Deterministic random in [0,1). */
function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic fractal "noise" over [0, period): a sum of sines with integer harmonics. */
function ridge(seed: number, period: number, harmonics = [2, 3, 5, 8, 13, 21, 34], rough = 0.85) {
  const r = rnd(seed);
  const parts = harmonics.map((k) => ({ k, a: 1 / Math.pow(k, rough), p: r() * Math.PI * 2 }));
  const norm = parts.reduce((s, p) => s + p.a, 0);
  return (x: number) => parts.reduce((s, p) => s + p.a * Math.sin((2 * Math.PI * p.k * x) / period + p.p), 0) / norm;
}

/** Draw `fn` at x, and again one tile left/right when it straddles an edge, so tiles wrap. */
function wrap(x: number, width: number, fn: (x: number) => void) {
  fn(x);
  if (x - width < 0) fn(x + TILE);
  if (x + width > TILE) fn(x - TILE);
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function sky(stops: [number, string][], extra?: (ctx: CanvasRenderingContext2D) => void) {
  const { c, ctx } = canvas(VIEW_W, VIEW_H, LS);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  extra?.(ctx);
  return c;
}

function sunGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, core: string, glow: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
  g.addColorStop(0, glow);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const d = ctx.createRadialGradient(x, y, 0, x, y, r);
  d.addColorStop(0, "#ffffff");
  d.addColorStop(0.6, core);
  d.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = d;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A soft volumetric cloud made of shaded puffs. */
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, r: () => number, lit = "#ffffff", shade = "#c9d6e8", alpha = 1) {
  const puffs = 9 + Math.floor(r() * 6);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < puffs; i++) {
    const px = x + (r() - 0.5) * w;
    const py = y + (r() - 0.6) * w * 0.18;
    const pr = w * (0.12 + r() * 0.14);
    const g = ctx.createRadialGradient(px + pr * 0.25, py - pr * 0.35, pr * 0.1, px, py, pr);
    g.addColorStop(0, lit);
    g.addColorStop(0.65, mixRgba(lit, shade, 0.4, 0.95));
    g.addColorStop(1, mixRgba(shade, shade, 0, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function mixRgba(a: string, b: string, t: number, alpha: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgba(${ch(16)},${ch(8)},${ch(0)},${alpha})`;
}

function cloudLayer(seed: number, count: number, yMin: number, yMax: number, lit: string, shade: string, alpha = 0.95) {
  const H = 340;
  const { c, ctx } = canvas(TILE, H, LS);
  const r = rnd(seed);
  for (let i = 0; i < count; i++) {
    const w = 140 + r() * 220;
    const x = r() * TILE;
    const y = yMin + r() * (yMax - yMin);
    wrap(x, w, (xx) => cloud(ctx, xx, y, w, rnd(seed * 31 + i), lit, shade, alpha * (0.6 + r() * 0.4)));
  }
  return c;
}

/**
 * A mountain / hill range: ridge silhouette, slope lighting from the right, optional snow,
 * and a haze gradient towards the bottom so it sits in the distance.
 */
function range(o: {
  seed: number;
  base: number; // y of the average ridge line
  amp: number;
  color: string;
  lit: string;
  shadow: string;
  haze: string;
  hazeAmt: number;
  harmonics?: number[];
  rough?: number;
  snow?: number; // snow line (y); peaks above it get snow
  flatTop?: boolean; // mesas
  bottom?: number;
}) {
  const H = VIEW_H;
  const { c, ctx } = canvas(TILE, H, LS);
  const f = ridge(o.seed, TILE, o.harmonics, o.rough);
  const Y = (x: number) => {
    let y = o.base - f(x) * o.amp;
    if (o.flatTop) y = Math.max(y, o.base - o.amp * 0.55); // clamp peaks into flat mesa tops
    return y;
  };
  const bottom = o.bottom ?? H;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = 0; x <= TILE; x += 3) ctx.lineTo(x, Y(x));
  ctx.lineTo(TILE, bottom);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  // base fill
  const g = ctx.createLinearGradient(0, o.base - o.amp, 0, bottom);
  g.addColorStop(0, o.color);
  g.addColorStop(1, mix(o.color, o.shadow, 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE, H);
  // slope lighting: faces turned to the light get brighter
  for (let x = 0; x < TILE; x += 2) {
    const slope = (Y(x + 2) - Y(x - 2)) / 4; // >0 means descending to the right (lit)
    const y = Y(x);
    const depth = 40 + o.amp * 0.9;
    if (slope > 0) {
      ctx.fillStyle = o.lit;
      ctx.globalAlpha = Math.min(0.55, slope * 0.9);
    } else {
      ctx.fillStyle = o.shadow;
      ctx.globalAlpha = Math.min(0.5, -slope * 0.8);
    }
    ctx.fillRect(x, y, 2.2, depth);
  }
  ctx.globalAlpha = 1;
  // rock / grass streak texture
  const r = rnd(o.seed + 99);
  for (let i = 0; i < TILE * 0.6; i++) {
    const x = r() * TILE;
    const y = Y(x) + r() * (bottom - Y(x));
    ctx.fillStyle = r() > 0.5 ? o.lit : o.shadow;
    ctx.globalAlpha = 0.06 + r() * 0.08;
    ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 8);
  }
  ctx.globalAlpha = 1;
  if (o.snow !== undefined) {
    const sn = ridge(o.seed + 5, TILE, [6, 11, 19, 37], 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= TILE; x += 3) ctx.lineTo(x, o.snow + sn(x) * 18 + (Y(x) - o.base) * 0.15);
    ctx.lineTo(TILE, 0);
    ctx.closePath();
    const sg = ctx.createLinearGradient(0, o.base - o.amp, 0, o.snow + 30);
    sg.addColorStop(0, "#ffffff");
    sg.addColorStop(1, "#dcecff");
    ctx.fillStyle = sg;
    ctx.fill();
    // blue shadowed sides of the snow
    for (let x = 0; x < TILE; x += 2) {
      const slope = (Y(x + 2) - Y(x - 2)) / 4;
      if (slope < 0) {
        ctx.fillStyle = "#8fb3e0";
        ctx.globalAlpha = Math.min(0.55, -slope * 0.9);
        ctx.fillRect(x, Y(x), 2.2, Math.max(0, o.snow + 20 - Y(x)));
      }
    }
    ctx.globalAlpha = 1;
  }
  if (o.flatTop) {
    // sedimentary bands on mesas
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = k % 2 ? o.shadow : o.lit;
      ctx.globalAlpha = 0.12;
      const yy = o.base - o.amp * 0.5 + k * 16;
      ctx.fillRect(0, yy, TILE, 6);
    }
    ctx.globalAlpha = 1;
  }
  // atmospheric haze, stronger near the bottom of the range
  const hz = ctx.createLinearGradient(0, o.base - o.amp, 0, bottom);
  hz.addColorStop(0, hazeRgba(o.haze, o.hazeAmt * 0.6));
  hz.addColorStop(1, hazeRgba(o.haze, Math.min(1, o.hazeAmt * 1.4)));
  ctx.fillStyle = hz;
  ctx.fillRect(0, 0, TILE, H);
  ctx.restore();
  return c;
}

function hazeRgba(hex: string, a: number) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}

/** Layer of objects standing on a baseline, e.g. trees, cacti, poles. */
function standing(seed: number, count: number, baseY: number, draw: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number) => number, haze?: [string, number], blur = 0) {
  const { c, ctx } = canvas(TILE, VIEW_H, LS);
  const r = rnd(seed);
  const items: { x: number; s: number; seed: number }[] = [];
  for (let i = 0; i < count; i++) items.push({ x: r() * TILE, s: 0.7 + r() * 0.6, seed: seed * 97 + i });
  items.sort((a, b) => a.s - b.s);
  for (const it of items) {
    const w = 260 * it.s;
    wrap(it.x, w, (x) => draw(ctx, x, baseY, it.s, rnd(it.seed)));
  }
  if (blur) {
    // Blur the finished layer in one pass (a filter on every shape is very slow).
    const sharp = document.createElement("canvas");
    sharp.width = c.width;
    sharp.height = c.height;
    sharp.getContext("2d")!.drawImage(c, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.filter = `blur(${blur * LS}px)`;
    ctx.drawImage(sharp, 0, 0);
    ctx.restore();
  }
  if (haze) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = hazeRgba(haze[0], haze[1]);
    ctx.fillRect(0, 0, TILE, VIEW_H);
    ctx.globalCompositeOperation = "source-over";
  }
  return c;
}

// ------------------------------------------------------------------ props

function deciduous(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, leaf: [string, string, string]) {
  const h = (120 + r() * 70) * s;
  // trunk
  const tg = ctx.createLinearGradient(x - 8 * s, 0, x + 8 * s, 0);
  tg.addColorStop(0, "#3d2614");
  tg.addColorStop(0.6, "#7a5232");
  tg.addColorStop(1, "#4a2e18");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y);
  ctx.quadraticCurveTo(x - 5 * s, y - h * 0.5, x - 4 * s, y - h * 0.75);
  ctx.lineTo(x + 4 * s, y - h * 0.75);
  ctx.quadraticCurveTo(x + 5 * s, y - h * 0.5, x + 10 * s, y);
  ctx.fill();
  // canopy: many shaded clumps, lit from upper right
  const cx = x;
  const cy = y - h * 0.82;
  const R = (48 + r() * 22) * s;
  const clumps = 16;
  for (let i = 0; i < clumps; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R * 0.75;
    const px = cx + Math.cos(a) * d * 1.15;
    const py = cy + Math.sin(a) * d * 0.8;
    const pr = R * (0.32 + r() * 0.25);
    const g = ctx.createRadialGradient(px + pr * 0.35, py - pr * 0.4, pr * 0.1, px, py, pr);
    g.addColorStop(0, leaf[0]);
    g.addColorStop(0.55, leaf[1]);
    g.addColorStop(1, leaf[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  // leaf speckle
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R;
    ctx.fillStyle = r() > 0.4 ? leaf[0] : leaf[2];
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.8, 3 * s, 2 * s, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return R * 2;
}

function bush(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, leaf: [string, string, string]) {
  for (let i = 0; i < 7; i++) {
    const px = x + (r() - 0.5) * 70 * s;
    const pr = (16 + r() * 16) * s;
    const py = y - pr * 0.6;
    const g = ctx.createRadialGradient(px + pr * 0.3, py - pr * 0.4, 1, px, py, pr);
    g.addColorStop(0, leaf[0]);
    g.addColorStop(0.6, leaf[1]);
    g.addColorStop(1, leaf[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  // flowers
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = ["#ffffff", "#ffd23f", "#ff8ac2"][Math.floor(r() * 3)];
    ctx.beginPath();
    ctx.arc(x + (r() - 0.5) * 60 * s, y - r() * 30 * s, 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  return 90 * s;
}

function jungleTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, dark: string, light: string) {
  const h = (300 + r() * 160) * s;
  const tg = ctx.createLinearGradient(x - 14 * s, 0, x + 14 * s, 0);
  tg.addColorStop(0, "#1d140c");
  tg.addColorStop(0.65, "#5a4128");
  tg.addColorStop(1, "#2a1d10");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x - 16 * s, y);
  ctx.bezierCurveTo(x - 10 * s, y - h * 0.4, x - 8 * s, y - h * 0.7, x - 6 * s, y - h);
  ctx.lineTo(x + 6 * s, y - h);
  ctx.bezierCurveTo(x + 8 * s, y - h * 0.7, x + 10 * s, y - h * 0.4, x + 18 * s, y);
  ctx.fill();
  // buttress roots
  ctx.fillStyle = "#2a1d10";
  ctx.beginPath();
  ctx.moveTo(x - 40 * s, y);
  ctx.quadraticCurveTo(x - 14 * s, y - 20 * s, x - 10 * s, y - 60 * s);
  ctx.lineTo(x, y);
  ctx.moveTo(x + 44 * s, y);
  ctx.quadraticCurveTo(x + 16 * s, y - 24 * s, x + 12 * s, y - 64 * s);
  ctx.lineTo(x, y);
  ctx.fill();
  // vines
  ctx.strokeStyle = "#2f5a26";
  ctx.lineWidth = 2.5 * s;
  for (let i = 0; i < 3; i++) {
    const vx = x + (r() - 0.5) * 120 * s;
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.bezierCurveTo(vx + 20 * s, h * 0.3, vx - 20 * s, h * 0.5, vx + 6 * s, (200 + r() * 160) * s);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? dark : light;
      ctx.beginPath();
      ctx.ellipse(vx + (r() - 0.5) * 16 * s, 40 * s + k * 34 * s, 7 * s, 4 * s, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // canopy fronds
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const len = (90 + r() * 70) * s;
    leafShape(ctx, x, y - h, a, len, 26 * s, dark, light);
  }
  return 300 * s;
}

function leafShape(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, dark: string, light: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -w, len, 0);
  ctx.quadraticCurveTo(len * 0.5, w * 0.8, 0, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -w * 0.1, len, 0);
  ctx.stroke();
  ctx.restore();
}

function fern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, dark: string, light: string) {
  for (let i = 0; i < 7; i++) leafShape(ctx, x, y, -Math.PI / 2 + (i - 3) * 0.38 + (r() - 0.5) * 0.2, (60 + r() * 50) * s, 14 * s, dark, light);
  return 120 * s;
}

function saguaro(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, base: string, lit: string, dark: string) {
  const h = (110 + r() * 80) * s;
  const w = 20 * s;
  const body = (bx: number, by: number, bw: number, bh: number) => {
    const g = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.55, lit);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - bh, bw, bh, bw / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(bx + k * bw * 0.25, by - bh + bw / 2);
      ctx.lineTo(bx + k * bw * 0.25, by);
      ctx.stroke();
    }
  };
  body(x, y, w, h);
  if (r() > 0.2) {
    const ay = y - h * (0.45 + r() * 0.2);
    body(x - w * 1.3, ay + 6 * s, w * 0.8, h * 0.35);
    body(x - w * 0.8, ay + 6 * s, w * 1.4, w * 0.75);
  }
  if (r() > 0.4) {
    const ay = y - h * (0.35 + r() * 0.2);
    body(x + w * 1.3, ay + 6 * s, w * 0.8, h * 0.3);
    body(x + w * 0.8, ay + 6 * s, w * 1.4, w * 0.75);
  }
  return 90 * s;
}

function pole(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(x - 3 * s, y - 210 * s, 6 * s, 210 * s);
  ctx.fillRect(x - 26 * s, y - 196 * s, 52 * s, 5 * s);
  ctx.fillRect(x - 20 * s, y - 176 * s, 40 * s, 4 * s);
  return 60 * s;
}

function pine(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, snowy: boolean, haze = 0) {
  const h = (130 + r() * 90) * s;
  const tiers = 6;
  ctx.fillStyle = "#3a2616";
  ctx.fillRect(x - 4 * s, y - 24 * s, 8 * s, 24 * s);
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const ty = y - 18 * s - t * h;
    const tw = (1 - t) * 52 * s + 10 * s;
    const g = ctx.createLinearGradient(x - tw, 0, x + tw, 0);
    g.addColorStop(0, mix("#163b2e", "#c8dcef", haze));
    g.addColorStop(0.6, mix("#2f6b52", "#c8dcef", haze));
    g.addColorStop(1, mix("#1f4c3b", "#c8dcef", haze));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - tw, ty);
    ctx.quadraticCurveTo(x - tw * 0.3, ty - h / tiers * 0.6, x, ty - h / tiers - 22 * s);
    ctx.quadraticCurveTo(x + tw * 0.3, ty - h / tiers * 0.6, x + tw, ty);
    ctx.quadraticCurveTo(x, ty - 8 * s, x - tw, ty);
    ctx.fill();
    if (snowy) {
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.85, ty - 3 * s);
      ctx.quadraticCurveTo(x, ty - 14 * s - r() * 6 * s, x + tw * 0.7, ty - 4 * s);
      ctx.quadraticCurveTo(x, ty - 6 * s, x - tw * 0.85, ty - 3 * s);
      ctx.fill();
    }
  }
  if (snowy && haze === 0) {
    // snow drift at the foot of near trees only (far ones sit on the haze line)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, y, 40 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return 110 * s;
}

// ------------------------------------------------------------------ ground tiles

function groundTile(o: { top: string; mid: string; deep: string; speck: string[]; seed: number; stones?: string; strata?: boolean; road?: boolean }) {
  const { c, ctx } = canvas(TILE_G, GROUND_H);
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_H);
  g.addColorStop(0, o.top);
  g.addColorStop(0.35, o.mid);
  g.addColorStop(1, o.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE_G, GROUND_H);
  const r = rnd(o.seed);
  if (o.strata) {
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.05)";
      ctx.fillRect(0, 20 + k * 18 + Math.sin(k) * 4, TILE_G, 7);
    }
  }
  for (let i = 0; i < 1400; i++) {
    const x = r() * TILE_G;
    const y = r() * GROUND_H;
    ctx.fillStyle = o.speck[Math.floor(r() * o.speck.length)];
    ctx.globalAlpha = 0.15 + r() * 0.3;
    ctx.fillRect(x, y, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  ctx.globalAlpha = 1;
  if (o.stones) {
    for (let i = 0; i < 26; i++) {
      const x = r() * TILE_G;
      const y = 26 + r() * (GROUND_H - 30);
      const rw = 4 + r() * 10;
      const rh = rw * (0.5 + r() * 0.3);
      for (const xx of [x, x - TILE_G, x + TILE_G]) {
        const sg = ctx.createRadialGradient(xx - rw * 0.3, y - rh * 0.4, 1, xx, y, rw);
        sg.addColorStop(0, "#d8d0c4");
        sg.addColorStop(0.5, o.stones);
        sg.addColorStop(1, "rgba(0,0,0,.4)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(xx, y, rw, rh, r() * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (o.road) {
    // asphalt band with cracks and a worn centre line
    const ry = 18;
    const rh = 64;
    const ag = ctx.createLinearGradient(0, ry, 0, ry + rh);
    ag.addColorStop(0, "#4a4b52");
    ag.addColorStop(0.5, "#3a3b42");
    ag.addColorStop(1, "#2c2d33");
    ctx.fillStyle = ag;
    ctx.fillRect(0, ry, TILE_G, rh);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.18)";
      ctx.fillRect(r() * TILE_G, ry + r() * rh, 1.5, 1.5);
    }
    ctx.strokeStyle = "rgba(20,20,24,.7)";
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      let x = r() * TILE_G;
      let y = ry + r() * rh;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let x = 16; x < TILE_G; x += 128) {
      ctx.fillStyle = "#e9c23a";
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, ry + rh / 2 - 2, 64, 4);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillRect(0, ry + 4, TILE_G, 2);
    ctx.fillRect(0, ry + rh - 6, TILE_G, 2);
  }
  // darken towards the bottom (depth)
  const dg = ctx.createLinearGradient(0, GROUND_H * 0.4, 0, GROUND_H);
  dg.addColorStop(0, "rgba(0,0,0,0)");
  dg.addColorStop(1, "rgba(0,0,0,.45)");
  ctx.fillStyle = dg;
  ctx.fillRect(0, 0, TILE_G, GROUND_H);
  return c;
}

/** The lit surface edge of the ground: grass blades, snow lip, sand, moon dust. */
function lipTile(kind: "grass" | "jungle" | "sand" | "snow" | "moon") {
  const H = 40;
  const { c, ctx } = canvas(TILE_G, H);
  const r = rnd(kind.length * 17);
  const y0 = LIP_UP;
  if (kind === "grass" || kind === "jungle") {
    const base = kind === "grass" ? ["#3f8f2f", "#5cb84a", "#79d05e", "#9be27a"] : ["#1f5a24", "#2f7a32", "#45973f", "#62b04f"];
    const g = ctx.createLinearGradient(0, y0 - 4, 0, y0 + 14);
    g.addColorStop(0, base[2]);
    g.addColorStop(1, base[0]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= TILE_G; x += 8) ctx.lineTo(x, y0 + 10 + Math.sin(x * 0.11) * 3 + Math.sin(x * 0.037) * 3);
    ctx.lineTo(TILE_G, y0);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, y0 - 2, TILE_G, 4);
    for (let i = 0; i < TILE_G * 1.6; i++) {
      const x = r() * TILE_G;
      const hh = 6 + r() * 14;
      ctx.strokeStyle = base[1 + Math.floor(r() * 3)];
      ctx.lineWidth = 1 + r() * 1.3;
      const lean = (r() - 0.35) * 6;
      for (const xx of [x, x - TILE_G, x + TILE_G]) {
        ctx.beginPath();
        ctx.moveTo(xx, y0 + 3);
        ctx.quadraticCurveTo(xx + lean * 0.4, y0 - hh * 0.5, xx + lean, y0 - hh);
        ctx.stroke();
      }
    }
    if (kind === "grass") {
      for (let i = 0; i < 14; i++) {
        const x = r() * TILE_G;
        ctx.fillStyle = ["#ffffff", "#ffe066", "#ff9fd0", "#b39dff"][Math.floor(r() * 4)];
        ctx.beginPath();
        ctx.arc(x, y0 - 6 - r() * 6, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === "sand") {
    const g = ctx.createLinearGradient(0, y0 - 2, 0, y0 + 20);
    g.addColorStop(0, "#f3d39a");
    g.addColorStop(1, "#c8955a");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0 - 2, TILE_G, 22);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,.35)" : "rgba(120,70,30,.25)";
      ctx.fillRect(r() * TILE_G, y0 - 2 + r() * 20, 1.4, 1.4);
    }
    for (let i = 0; i < 10; i++) {
      const x = r() * TILE_G;
      ctx.fillStyle = "#8a6a44";
      ctx.beginPath();
      ctx.ellipse(x, y0 + 2, 3 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "snow") {
    const g = ctx.createLinearGradient(0, y0 - 8, 0, y0 + 16);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.7, "#e8f3ff");
    g.addColorStop(1, "#a9c9ec");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y0 + 16);
    for (let x = 0; x <= TILE_G; x += 6) ctx.lineTo(x, y0 - 4 - Math.abs(Math.sin(x * 0.05)) * 4 - Math.sin(x * 0.013) * 2);
    ctx.lineTo(TILE_G, y0 + 16);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.6 + r() * 0.4;
      ctx.fillRect(r() * TILE_G, y0 - 4 + r() * 16, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  } else {
    const g = ctx.createLinearGradient(0, y0 - 2, 0, y0 + 18);
    g.addColorStop(0, "#d8d3e8");
    g.addColorStop(1, "#8e86a8");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0 - 2, TILE_G, 20);
    for (let i = 0; i < 18; i++) {
      const x = r() * TILE_G;
      const w = 6 + r() * 14;
      ctx.fillStyle = "rgba(60,50,90,.35)";
      ctx.beginPath();
      ctx.ellipse(x, y0 + 6, w, w * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath();
      ctx.ellipse(x + 1, y0 + 4, w * 0.8, w * 0.12, 0, Math.PI, 0);
      ctx.fill();
    }
  }
  return c;
}

function moonGround() {
  const { c, ctx } = canvas(TILE_G, GROUND_H);
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_H);
  g.addColorStop(0, "#8e86a8");
  g.addColorStop(1, "#2a2440");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE_G, GROUND_H);
  const r = rnd(4242);
  for (let i = 0; i < 30; i++) {
    const x = r() * TILE_G;
    const y = 20 + r() * (GROUND_H - 30);
    const w = 6 + r() * 26;
    for (const xx of [x, x - TILE_G, x + TILE_G]) {
      const cg = ctx.createRadialGradient(xx - w * 0.3, y - w * 0.2, 1, xx, y, w);
      cg.addColorStop(0, "rgba(20,15,40,.45)");
      cg.addColorStop(0.8, "rgba(20,15,40,.15)");
      cg.addColorStop(1, "rgba(255,255,255,.12)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(xx, y, w, w * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.2)";
    ctx.fillRect(r() * TILE_G, r() * GROUND_H, 1.5, 1.5);
  }
  return c;
}

// ------------------------------------------------------------------ worlds

const BUILDERS: Record<WorldKey, () => Scene> = {
  meadow: () => {
    const leaf: [string, string, string] = ["#a6e07a", "#4f9d3c", "#22522a"];
    return {
      sky: sky(
        [
          [0, "#3d8fe0"],
          [0.55, "#9fd3f7"],
          [1, "#e9f6ff"],
        ],
        (ctx) => sunGlow(ctx, 760, 110, 46, "#fff6c8", "rgba(255,248,210,.55)"),
      ),
      layers: [
        layer(cloudLayer(11, 9, 60, 200, "#ffffff", "#b9cbe3"), 0.04, { drift: 6 }),
        layer(range({ seed: 1, base: 300, amp: 70, color: "#8fb7d6", lit: "#c9e1f2", shadow: "#6f93b8", haze: "#d4ebfa", hazeAmt: 0.45 }), 0.08),
        layer(range({ seed: 2, base: 345, amp: 50, color: "#6fae6a", lit: "#a8d98d", shadow: "#3f7a48", haze: "#cfe9f2", hazeAmt: 0.3, harmonics: [2, 3, 4, 7, 11] }), 0.16),
        layer(standing(21, 26, 392, (ctx, x, y, s, r) => deciduous(ctx, x, y, s * 0.6, r, leaf), ["#cfe9f2", 0.35]), 0.25),
        layer(range({ seed: 3, base: 400, amp: 26, color: "#5aa24a", lit: "#8fd06b", shadow: "#33702f", haze: "#cfe9f2", hazeAmt: 0.08, harmonics: [2, 3, 5] }), 0.38),
        layer(standing(22, 14, GROUND_Y + 2, (ctx, x, y, s, r) => deciduous(ctx, x, y, s * 1.05, r, leaf)), 0.55),
        layer(standing(23, 22, GROUND_Y + 6, (ctx, x, y, s, r) => bush(ctx, x, y, s, r, leaf)), 0.8),
      ],
      front: [layer(standing(24, 6, VIEW_H + 34, (ctx, x, y, s, r) => bush(ctx, x, y, s * 1.6, r, ["#6fbf52", "#2f6f2a", "#123a18"]), undefined, 4), 1.35, { alpha: 0.9 })],
      groundTile: groundTile({ top: "#7a4f2a", mid: "#5e3b1f", deep: "#2e1c0f", speck: ["#a87a4a", "#3a2412", "#c99a66"], seed: 7, stones: "#9a8a78" }),
      lipTile: lipTile("grass"),
      pit: "#1a0f08",
      fog: "#e6f4ff",
      light: "#fff4c8",
      ambient: "pollen",
      sun: { x: 760, y: 110, r: 46, color: "#fff6c8" },
      rays: "rgba(255,250,220,.07)",
      vignette: 0.35,
    };
  },
  jungle: () => {
    const dark = "#0f3a22";
    const light = "#3f8f4a";
    return {
      sky: sky(
        [
          [0, "#0e3b2e"],
          [0.5, "#3f8f6a"],
          [1, "#b9e8c8"],
        ],
        (ctx) => sunGlow(ctx, 640, 60, 40, "#f4ffd8", "rgba(220,255,200,.4)"),
      ),
      layers: [
        layer(standing(31, 22, 420, (ctx, x, y, s, r) => jungleTree(ctx, x, y, s * 0.55, r, "#2f6a4a", "#5f9f7a"), ["#9fd8b4", 0.55], 1.5), 0.1),
        layer(range({ seed: 4, base: 380, amp: 40, color: "#2f6a46", lit: "#5f9f6f", shadow: "#173f2a", haze: "#a8dcbc", hazeAmt: 0.45 }), 0.18),
        layer(standing(32, 16, 440, (ctx, x, y, s, r) => jungleTree(ctx, x, y, s * 0.8, r, "#1d5234", "#3f7f52"), ["#7fc49a", 0.3]), 0.3),
        layer(standing(33, 9, GROUND_Y + 4, (ctx, x, y, s, r) => jungleTree(ctx, x, y, s * 1.15, r, dark, light)), 0.55),
        layer(standing(34, 26, GROUND_Y + 8, (ctx, x, y, s, r) => fern(ctx, x, y, s, r, "#123f22", "#3f9a4a")), 0.82),
      ],
      front: [layer(standing(35, 5, VIEW_H + 60, (ctx, x, y, s, r) => fern(ctx, x, y, s * 1.6, r, "#06200f", "#1f5a2a"), undefined, 5), 1.4, { alpha: 0.85 })],
      groundTile: groundTile({ top: "#3b2a18", mid: "#2a1c0f", deep: "#120b05", speck: ["#5a4128", "#1a1008", "#6f5a3a"], seed: 8, stones: "#6a6a5a" }),
      lipTile: lipTile("jungle"),
      pit: "#060302",
      fog: "#bfe8cf",
      light: "#e8ffd0",
      ambient: "fireflies",
      sun: { x: 640, y: 60, r: 40, color: "#f4ffd8" },
      rays: "rgba(230,255,200,.09)",
      vignette: 0.5,
    };
  },
  route66: () => ({
    sky: sky(
      [
        [0, "#3b4fa0"],
        [0.45, "#e9876a"],
        [0.75, "#ffc97a"],
        [1, "#ffe8b0"],
      ],
      (ctx) => sunGlow(ctx, 700, 250, 62, "#ffe6a0", "rgba(255,200,120,.6)"),
    ),
    layers: [
      layer(cloudLayer(41, 7, 50, 170, "#ffd9c0", "#b9708a", 0.8), 0.03, { drift: 4 }),
      layer(range({ seed: 5, base: 330, amp: 90, color: "#c46a4a", lit: "#ffb07a", shadow: "#7a3a3a", haze: "#ffc9a0", hazeAmt: 0.55, flatTop: true, harmonics: [2, 3, 4, 6] }), 0.07),
      layer(range({ seed: 6, base: 372, amp: 70, color: "#b5552f", lit: "#ffa060", shadow: "#6a2a1a", haze: "#ffc9a0", hazeAmt: 0.3, flatTop: true, harmonics: [2, 3, 5, 7] }), 0.14),
      layer(range({ seed: 7, base: 420, amp: 22, color: "#d89a5a", lit: "#ffd59a", shadow: "#a0643a", haze: "#ffd9a8", hazeAmt: 0.2 }), 0.3),
      layer(standing(42, 12, 430, (ctx, x, y, s, r) => saguaro(ctx, x, y, s * 0.6, r, "#5f8a4a", "#8fbf6a", "#2f4a2a"), ["#ffd9a8", 0.35]), 0.36),
      layer(standing(43, 9, GROUND_Y, (ctx, x, y, s) => pole(ctx, x, y, s)), 0.7),
      layer(standing(44, 10, GROUND_Y + 4, (ctx, x, y, s, r) => saguaro(ctx, x, y, s * 1.1, r, "#4a7a3a", "#7fb05a", "#1f3a1a")), 0.85),
    ],
    front: [],
    groundTile: groundTile({ top: "#c8955a", mid: "#9a6a3a", deep: "#4a2e18", speck: ["#e8b880", "#6a4020"], seed: 9, road: true }),
    lipTile: lipTile("sand"),
    pit: "#2a1408",
    fog: "#ffd9a8",
    light: "#ffe0a0",
    ambient: "dust",
    sun: { x: 700, y: 250, r: 62, color: "#ffe6a0" },
    vignette: 0.4,
  }),
  ice: () => ({
    sky: sky(
      [
        [0, "#2a4f9a"],
        [0.55, "#8fc2ef"],
        [1, "#eaf6ff"],
      ],
      (ctx) => {
        // aurora
        for (let i = 0; i < 4; i++) {
          const g = ctx.createLinearGradient(0, 40 + i * 20, 0, 200 + i * 10);
          g.addColorStop(0, "rgba(120,255,200,0)");
          g.addColorStop(0.5, `rgba(${i % 2 ? "140,255,210" : "160,200,255"},.18)`);
          g.addColorStop(1, "rgba(120,255,200,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 120 + i * 18);
          for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, 90 + i * 22 + Math.sin(x * 0.008 + i) * 40);
          for (let x = VIEW_W; x >= 0; x -= 20) ctx.lineTo(x, 190 + i * 14 + Math.sin(x * 0.01 + i * 2) * 30);
          ctx.fill();
        }
        sunGlow(ctx, 220, 150, 30, "#ffffff", "rgba(255,255,255,.35)");
      },
    ),
    layers: [
      layer(range({ seed: 8, base: 290, amp: 130, color: "#7f9fcf", lit: "#d8e8ff", shadow: "#4f6fa8", haze: "#d8ecff", hazeAmt: 0.45, snow: 250, harmonics: [2, 3, 5, 8, 13], rough: 0.7 }), 0.06),
      layer(range({ seed: 9, base: 350, amp: 90, color: "#6a8fc0", lit: "#e0eeff", shadow: "#3a5f98", haze: "#d8ecff", hazeAmt: 0.25, snow: 330, harmonics: [2, 3, 5, 9, 15], rough: 0.7 }), 0.13),
      layer(standing(51, 40, 410, (ctx, x, y, s, r) => pine(ctx, x, y, s * 0.55, r, true, 0.45)), 0.25),
      layer(range({ seed: 10, base: 425, amp: 18, color: "#e6f2ff", lit: "#ffffff", shadow: "#a9c4e6", haze: "#eaf4ff", hazeAmt: 0.1 }), 0.35),
      layer(standing(52, 14, GROUND_Y + 4, (ctx, x, y, s, r) => pine(ctx, x, y, s * 1.05, r, true)), 0.6),
    ],
    front: [],
    groundTile: groundTile({ top: "#cfe6fb", mid: "#8fb8e0", deep: "#3f6a9a", speck: ["#ffffff", "#7aa8d8"], seed: 10, strata: true }),
    lipTile: lipTile("snow"),
    pit: "#0e2f5a",
    fog: "#eef7ff",
    light: "#ffffff",
    ambient: "snow",
    vignette: 0.35,
  }),
  space: () => ({
    sky: sky(
      [
        [0, "#05020f"],
        [0.6, "#140a3a"],
        [1, "#2b1766"],
      ],
      (ctx) => {
        const r = rnd(777);
        // nebula
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 26; i++) {
          const x = r() * VIEW_W;
          const y = r() * 360;
          const rr = 60 + r() * 160;
          const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
          const col = [
            [255, 80, 180],
            [90, 120, 255],
            [140, 60, 255],
            [60, 200, 255],
          ][Math.floor(r() * 4)];
          g.addColorStop(0, `rgba(${col.join(",")},.12)`);
          g.addColorStop(1, `rgba(${col.join(",")},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }
        ctx.globalCompositeOperation = "source-over";
        // stars
        for (let i = 0; i < 420; i++) {
          const x = r() * VIEW_W;
          const y = r() * 420;
          const b = r();
          ctx.fillStyle = `rgba(255,255,255,${0.25 + b * 0.75})`;
          ctx.fillRect(x, y, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1);
          if (b > 0.985) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
            g.addColorStop(0, "rgba(200,220,255,.6)");
            g.addColorStop(1, "rgba(200,220,255,0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - 8, y - 8, 16, 16);
          }
        }
        // ringed planet with atmosphere and terminator shadow
        const px = 760;
        const py = 130;
        const pr = 64;
        const atm = ctx.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.35);
        atm.addColorStop(0, "rgba(255,140,200,.45)");
        atm.addColorStop(1, "rgba(255,140,200,0)");
        ctx.fillStyle = atm;
        ctx.fillRect(px - pr * 2, py - pr * 2, pr * 4, pr * 4);
        const ring = (front: boolean) => {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(-0.3);
          for (const [w, col] of [[9, "rgba(255,225,160,.28)"], [4, "rgba(255,235,190,.6)"]] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.ellipse(0, 0, pr * 1.8, pr * 0.42, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        };
        ring(false);
        const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
        pg.addColorStop(0, "#ffd6ea");
        pg.addColorStop(0.5, "#e2709f");
        pg.addColorStop(1, "#5a1f4a");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.clip();
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = k % 2 ? "rgba(255,255,255,.08)" : "rgba(90,20,70,.12)";
          ctx.fillRect(px - pr, py - pr + k * 19 + 6, pr * 2, 8);
        }
        ctx.restore();
        // terminator: the night side away from the light
        const tg = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
        tg.addColorStop(0.45, "rgba(10,4,30,0)");
        tg.addColorStop(1, "rgba(10,4,30,.65)");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ring(true);
        // small blue moon
        const mg = ctx.createRadialGradient(240, 208, 3, 248, 216, 26);
        mg.addColorStop(0, "#e0f6ff");
        mg.addColorStop(0.55, "#4f8fce");
        mg.addColorStop(1, "#0f2a5a");
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(248, 216, 26, 0, Math.PI * 2);
        ctx.fill();
      },
    ),
    layers: [
      layer(range({ seed: 11, base: 380, amp: 70, color: "#3a2f6a", lit: "#7a6ab0", shadow: "#1a1438", haze: "#2b1766", hazeAmt: 0.35, harmonics: [2, 3, 5, 9, 14], rough: 0.65 }), 0.08),
      layer(range({ seed: 12, base: 420, amp: 40, color: "#5a4f88", lit: "#a89ad6", shadow: "#2a2050", haze: "#2b1766", hazeAmt: 0.15, harmonics: [3, 5, 8, 13] }), 0.2),
    ],
    front: [],
    groundTile: moonGround(),
    lipTile: lipTile("moon"),
    pit: "#020108",
    fog: "#3a2a7a",
    light: "#c8d4ff",
    ambient: "stardust",
    vignette: 0.55,
  }),
};

export { TILE };
