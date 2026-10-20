// Canvas renderer for the runner: layered, lit scenery and shaded characters.
// Scenery is pre-rendered per world (scenery.ts); characters are drawn live (characters.ts).
import { GROUND_Y, PLAYER_W, VIEW_H, VIEW_W, type WorldKey } from "./levels";
import { BOAR, CHICKEN, CRATER, SCORE, starPos, type Sim } from "./sim";
import { PERK_INFO } from "./dash";
import { LIP_UP, S, TILE, TILE_G, getScene, type Layer, type Scene } from "./scenery";
import { drawBoar, drawChicken, drawDash, drawShootingStar, drawWasp, shade } from "./characters";

export { drawDash };

type Ctx = CanvasRenderingContext2D;
export type Banner = { text: string; sub: string; t: number };

// ------------------------------------------------------------------ per-run effects state

type Mote = { x: number; y: number; z: number; vx: number; vy: number; ph: number };
type Puff = { x: number; y: number; r: number; life: number; max: number; vx: number; vy: number; color: string };
type Fx = { motes: Mote[]; puffs: Puff[]; lastCam: number; lastT: number; dustT: number; wasGround: boolean };
const fxBySim = new WeakMap<Sim, Fx>();
const patterns = new WeakMap<Ctx, Map<string, CanvasPattern>>();

function fxFor(sim: Sim, kind: Scene["ambient"]): Fx {
  let fx = fxBySim.get(sim);
  if (!fx) {
    const n = kind === "snow" ? 140 : kind === "dust" ? 70 : kind === "stardust" ? 60 : 45;
    const motes: Mote[] = [];
    for (let i = 0; i < n; i++) motes.push(newMote(kind, true));
    fx = { motes, puffs: [], lastCam: sim.camX, lastT: -1, dustT: 0, wasGround: true };
    fxBySim.set(sim, fx);
  }
  return fx;
}

function newMote(kind: Scene["ambient"], anywhere: boolean): Mote {
  const z = 0.3 + Math.random() * 1.2; // depth: <1 behind, >1 in front
  const m: Mote = { x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, z, vx: 0, vy: 0, ph: Math.random() * 10 };
  if (kind === "snow") {
    m.vx = -20 - Math.random() * 30;
    m.vy = 40 + z * 50;
    if (!anywhere) m.y = -10;
  } else if (kind === "dust") {
    m.vx = -120 - Math.random() * 160;
    m.vy = (Math.random() - 0.5) * 10;
    m.y = 280 + Math.random() * 200;
    if (!anywhere) m.x = VIEW_W + 10;
  } else if (kind === "fireflies") {
    m.y = 140 + Math.random() * 300;
  } else if (kind === "pollen") {
    m.vx = -8;
    m.vy = -6;
  }
  return m;
}

function pattern(ctx: Ctx, key: string, img: HTMLCanvasElement) {
  let m = patterns.get(ctx);
  if (!m) patterns.set(ctx, (m = new Map()));
  let p = m.get(key);
  if (!p) {
    p = ctx.createPattern(img, "repeat")!;
    m.set(key, p);
  }
  return p;
}

// ------------------------------------------------------------------ main

export function render(ctx: Ctx, sim: Sim, banner: Banner | null, now: number, demo = false) {
  const world = sim.level.world;
  const key = world.key;
  const sc = getScene(key);
  const cam = sim.camX;
  const fx = fxFor(sim, sc.ambient);
  const dt = fx.lastT < 0 ? 0 : Math.min(0.05, now - fx.lastT);
  fx.lastT = now;
  const camDelta = cam - fx.lastCam;
  fx.lastCam = cam;

  ctx.save();
  if (sim.shake > 0) {
    const k = sim.shake * 22;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  // sky, light rays, distant layers
  ctx.drawImage(sc.sky, 0, 0, VIEW_W, VIEW_H);
  if (sc.sun && sc.rays) drawRays(ctx, sc.sun.x, sc.sun.y, sc.rays, now);
  for (const l of sc.layers) drawLayer(ctx, l, cam, now);
  if (key === "ice") drawAuroraShimmer(ctx, now);

  // pits read as dark chasms (or water on the ice caps)
  drawPits(ctx, sim, sc, cam, now);
  for (const g of sim.level.grounds) {
    const x0 = g.x0 - cam;
    const x1 = g.x1 - cam;
    if (x1 < -40 || x0 > VIEW_W + 40) continue;
    drawGroundSpan(ctx, sc, key, x0, x1, cam);
  }
  for (const p of sim.level.platforms) {
    const x = p.x - cam;
    if (x + p.w < -20 || x > VIEW_W + 20) continue;
    drawPlatform(ctx, sc, key, x, p.y, p.w, cam);
  }

  // entities
  for (const e of sim.entities) {
    const ex = (e.kind === "star" ? e.targetX : e.x) - cam;
    if (ex < -420 || ex > VIEW_W + 440) continue;
    switch (e.kind) {
      case "coin":
        if (!e.taken) drawCoin(ctx, ex, e.y, now);
        break;
      case "obstacle":
        groundShadow(ctx, ex + e.w / 2, GROUND_Y, e.w * 0.62, 0.32);
        drawObstacle(ctx, key, e.style, ex, e.w, e.h);
        break;
      case "ice":
        if (!e.broken) drawIce(ctx, ex, e.w, e.crack, now);
        break;
      case "chicken":
        if (e.dead > 0.5) break;
        groundShadow(ctx, ex + CHICKEN.w / 2, GROUND_Y, 20, 0.3);
        drawChicken(ctx, ex + CHICKEN.w / 2, GROUND_Y, now, e.dead > 0 ? Math.min(1, e.dead * 6) : 0);
        break;
      case "boar":
        if (e.dead > 0.5) break;
        groundShadow(ctx, ex + BOAR.w / 2, GROUND_Y, 34, 0.35);
        drawBoar(ctx, ex + BOAR.w / 2, GROUND_Y, now, e.charging, e.dead > 0 ? Math.min(1, e.dead * 6) : 0);
        if (e.charging && e.dead === 0 && Math.random() < 0.5) puff(fx, ex + BOAR.w + cam, GROUND_Y - 4, "#c8a878", 9, 60);
        break;
      case "wasp": {
        if (e.dead > 0) break;
        const y = e.baseY + Math.sin(sim.time * 5 + e.phase) * 5;
        groundShadow(ctx, ex, GROUND_Y, 14, Math.max(0.08, 0.28 - (GROUND_Y - y) / 400));
        drawWasp(ctx, ex, y, now + e.phase);
        break;
      }
      case "star":
        if (e.active && !e.landed) {
          const [sx, sy] = starPos(e.targetX, e.t);
          drawWarning(ctx, ex, now);
          drawShootingStar(ctx, sx - cam, sy, now);
        }
        if (e.landed) {
          drawCrater(ctx, ex, e.crater);
          if (Math.random() < 0.25) puff(fx, e.targetX + (Math.random() - 0.5) * 40, GROUND_Y - 10, "#6a5a7a", 10, -40);
        }
        break;
    }
  }
  drawHouse(ctx, key, sim.level.goalX - cam);

  // player: shadow, dust, trail, Dash
  const px = sim.px - cam;
  const footY = surfaceBelow(sim);
  if (footY !== null) {
    const h = Math.max(0, footY - sim.py);
    groundShadow(ctx, px + PLAYER_W / 2, footY, 26 * Math.max(0.35, 1 - h / 260), 0.4 * Math.max(0.15, 1 - h / 220));
  }
  if (sim.onGround && !sim.ended) {
    fx.dustT += dt;
    if (fx.dustT > 0.07) {
      fx.dustT = 0;
      puff(fx, sim.px + 8, sim.py - 3, dustColor(key), 5 + Math.random() * 4, -30);
    }
  }
  if (sim.onGround && !fx.wasGround) for (let i = 0; i < 6; i++) puff(fx, sim.px + PLAYER_W / 2 + (i - 3) * 8, sim.py - 2, dustColor(key), 8, (i - 3) * 30);
  fx.wasGround = sim.onGround;
  drawPuffs(ctx, fx, cam, dt);
  if (sim.profile.holoTrail) drawTrail(ctx, px, sim.py, now, sim.sliding);
  const flash = sim.invuln > 0 && Math.floor(now * 14) % 2 === 0;
  if (!flash) {
    drawDash(ctx, sim.profile, px + PLAYER_W / 2, sim.py, {
      sliding: sim.sliding,
      air: !sim.onGround,
      vy: sim.vy,
      t: sim.time,
      ended: sim.ended && sim.cleared,
      light: sc.light,
    });
  }

  // sparks
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.particles) {
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(p.x - cam, p.y, 0, p.x - cam, p.y, p.size * 1.8);
    g.addColorStop(0, p.color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x - cam - p.size * 2, p.y - p.size * 2, p.size * 4, p.size * 4);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  for (const p of sim.popups) {
    ctx.globalAlpha = 1 - p.t / 0.9;
    text(ctx, p.text, p.x - cam, p.y - p.t * 50, 22, p.color, "center", true);
  }
  ctx.globalAlpha = 1;

  // foreground depth layer, ambience, grading
  for (const l of sc.front) drawLayer(ctx, l, cam, now);
  drawMotes(ctx, fx, sc.ambient, dt, camDelta, now);
  if (sc.sun && key !== "space") drawSunBloom(ctx, sc.sun.x, sc.sun.y, sc.sun.r);
  drawVignette(ctx, sc.vignette);
  ctx.restore();

  if (!demo) drawHud(ctx, sim);
  if (banner && banner.t < 1.8) drawBanner(ctx, banner);
}

// ------------------------------------------------------------------ scenery

function drawLayer(ctx: Ctx, l: Layer, cam: number, now: number) {
  const off = (((cam * l.parallax + (l.drift ?? 0) * now) % TILE) + TILE) % TILE;
  const h = l.img.height / l.scale;
  if (l.alpha !== undefined) ctx.globalAlpha = l.alpha;
  ctx.drawImage(l.img, -off, l.top, TILE, h);
  if (TILE - off < VIEW_W) ctx.drawImage(l.img, TILE - off, l.top, TILE, h);
  ctx.globalAlpha = 1;
}

function drawRays(ctx: Ctx, sx: number, sy: number, color: string, now: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i++) {
    const a = 1.75 + i * 0.22 + Math.sin(now * 0.15 + i * 1.7) * 0.05;
    const w = 0.05 + (i % 3) * 0.025;
    const len = 900;
    const g = ctx.createRadialGradient(sx, sy, 10, sx, sy, len);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len);
    ctx.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len);
    ctx.fill();
  }
  ctx.restore();
}

function drawSunBloom(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, "rgba(255,250,230,.35)");
  g.addColorStop(1, "rgba(255,250,230,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  ctx.restore();
}

function drawAuroraShimmer(ctx: Ctx, now: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.08 + 0.06 * Math.sin(now * 0.7);
  const g = ctx.createLinearGradient(0, 60, 0, 240);
  g.addColorStop(0, "rgba(120,255,200,0)");
  g.addColorStop(0.5, "rgba(120,255,200,1)");
  g.addColorStop(1, "rgba(120,255,200,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  for (let x = 0; x <= VIEW_W; x += 24) ctx.lineTo(x, 110 + Math.sin(x * 0.009 + now * 0.4) * 40);
  for (let x = VIEW_W; x >= 0; x -= 24) ctx.lineTo(x, 200 + Math.sin(x * 0.012 + now * 0.3) * 30);
  ctx.fill();
  ctx.restore();
}

function drawPits(ctx: Ctx, sim: Sim, sc: Scene, cam: number, now: number) {
  const gs = sim.level.grounds;
  for (let i = 0; i + 1 < gs.length; i++) {
    const x0 = gs[i].x1 - cam;
    const x1 = gs[i + 1].x0 - cam;
    if (x1 < -20 || x0 > VIEW_W + 20) continue;
    pitRect(ctx, sc, x0, x1, now);
  }
  // gaps between ice tiles too
  for (const e of sim.entities) {
    if (e.kind !== "ice") continue;
    const x = e.x - cam;
    if (x < -100 || x > VIEW_W + 100) continue;
    if (e.broken) pitRect(ctx, sc, x, x + e.w, now);
  }
}

function pitRect(ctx: Ctx, sc: Scene, x0: number, x1: number, now: number) {
  if (sc.ambient === "snow") {
    const g = ctx.createLinearGradient(0, GROUND_Y + 10, 0, VIEW_H);
    g.addColorStop(0, "#1f5f9a");
    g.addColorStop(1, "#071a33");
    ctx.fillStyle = g;
    ctx.fillRect(x0, GROUND_Y + 22, x1 - x0, VIEW_H - GROUND_Y);
    ctx.strokeStyle = "rgba(200,235,255,.5)";
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, GROUND_Y + 28 + k * 10 + Math.sin(x * 0.08 + now * 3 + k) * 1.5);
      ctx.stroke();
    }
    return;
  }
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  g.addColorStop(0, shade(sc.pit, 0.15));
  g.addColorStop(0.3, sc.pit);
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND_Y + 8, x1 - x0, VIEW_H - GROUND_Y);
}

function drawGroundSpan(ctx: Ctx, sc: Scene, key: WorldKey, x0: number, x1: number, cam: number) {
  const gp = pattern(ctx, `${key}:g`, sc.groundTile);
  gp.setTransform(new DOMMatrix().translateSelf(-((cam % TILE_G) + TILE_G) % TILE_G, GROUND_Y).scaleSelf(1 / S));
  ctx.fillStyle = gp;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, VIEW_H - GROUND_Y);
  // cliff faces at the edges of a span
  for (const [ex, dir] of [[x0, 1], [x1, -1]] as const) {
    const g = ctx.createLinearGradient(ex, 0, ex + dir * 26, 0);
    g.addColorStop(0, "rgba(0,0,0,.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(ex, ex + dir * 26), GROUND_Y + 6, 26, VIEW_H - GROUND_Y);
  }
  const lp = pattern(ctx, `${key}:l`, sc.lipTile);
  lp.setTransform(new DOMMatrix().translateSelf(-((cam % TILE_G) + TILE_G) % TILE_G, GROUND_Y - LIP_UP).scaleSelf(1 / S));
  ctx.fillStyle = lp;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0 - 3, GROUND_Y - LIP_UP, x1 - x0 + 6, 40, 8);
  ctx.clip();
  ctx.fillRect(x0 - 3, GROUND_Y - LIP_UP, x1 - x0 + 6, 40);
  ctx.restore();
}

function drawPlatform(ctx: Ctx, sc: Scene, key: WorldKey, x: number, y: number, w: number, cam: number) {
  // soft shadow cast on the scene behind
  const sg = ctx.createRadialGradient(x + w / 2, y + 40, 4, x + w / 2, y + 40, w * 0.6);
  sg.addColorStop(0, "rgba(0,0,0,.25)");
  sg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(x - w * 0.2, y + 10, w * 1.4, 70);
  const gp = pattern(ctx, `${key}:g`, sc.groundTile);
  gp.setTransform(new DOMMatrix().translateSelf(-((cam % TILE_G) + TILE_G) % TILE_G, y).scaleSelf(1 / S));
  ctx.save();
  ctx.beginPath();
  // floating island: flat top, tapered rocky underside
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.quadraticCurveTo(x + w - 8, y + 26, x + w * 0.62, y + 40);
  ctx.quadraticCurveTo(x + w * 0.5, y + 52, x + w * 0.38, y + 40);
  ctx.quadraticCurveTo(x + 8, y + 26, x, y);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = gp;
  ctx.fillRect(x, y, w, 60);
  const dg = ctx.createLinearGradient(0, y, 0, y + 52);
  dg.addColorStop(0, "rgba(0,0,0,0)");
  dg.addColorStop(1, "rgba(0,0,0,.5)");
  ctx.fillStyle = dg;
  ctx.fillRect(x, y, w, 60);
  ctx.restore();
  const lp = pattern(ctx, `${key}:l`, sc.lipTile);
  lp.setTransform(new DOMMatrix().translateSelf(-((cam % TILE_G) + TILE_G) % TILE_G, y - LIP_UP).scaleSelf(1 / S));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - 4, y - LIP_UP, w + 8, LIP_UP + 16, 8);
  ctx.clip();
  ctx.fillStyle = lp;
  ctx.fillRect(x - 4, y - LIP_UP, w + 8, LIP_UP + 16);
  ctx.restore();
}

/** Height of whatever surface is under Dash (for the drop shadow), or null over a pit. */
function surfaceBelow(sim: Sim): number | null {
  const cx = sim.px + PLAYER_W / 2;
  let best: number | null = null;
  for (const p of sim.level.platforms) if (cx >= p.x && cx <= p.x + p.w && p.y >= sim.py - 1 && (best === null || p.y < best)) best = p.y;
  if (best !== null) return best;
  for (const g of sim.level.grounds) if (cx >= g.x0 && cx <= g.x1) return GROUND_Y;
  for (const e of sim.entities) if (e.kind === "ice" && !e.broken && cx >= e.x && cx <= e.x + e.w) return GROUND_Y;
  return null;
}

function groundShadow(ctx: Ctx, x: number, y: number, rx: number, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.22);
  ctx.translate(-x, -y);
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ props

function drawCoin(ctx: Ctx, x: number, y: number, now: number) {
  const spin = Math.cos(now * 3.2 + x * 0.013);
  const sx = Math.max(0.12, Math.abs(spin));
  // glow
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const gl = ctx.createRadialGradient(x, y, 2, x, y, 26);
  gl.addColorStop(0, "rgba(255,210,80,.35)");
  gl.addColorStop(1, "rgba(255,210,80,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(x - 26, y - 26, 52, 52);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  // rim
  const rim = ctx.createLinearGradient(-13, -13, 13, 13);
  rim.addColorStop(0, "#fff1a6");
  rim.addColorStop(0.5, "#d99a0a");
  rim.addColorStop(1, "#8a5a00");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  // face
  const face = ctx.createRadialGradient(-4, -5, 1, 0, 0, 11);
  face.addColorStop(0, "#fff7c2");
  face.addColorStop(0.5, "#ffc83a");
  face.addColorStop(1, "#c98a00");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  if (sx > 0.35) {
    ctx.font = 'bold 13px "Lilita One", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(120,70,0,.55)";
    ctx.fillText("D", 0.8, 5.6);
    ctx.fillStyle = "#fff3b0";
    ctx.fillText("D", 0, 4.8);
  }
  // moving glint
  const gx = ((now * 40 + x) % 60) - 30;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  ctx.ellipse(gx * 0.3, -4, 2, 6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawObstacle(ctx: Ctx, key: WorldKey, style: string, x: number, w: number, h: number) {
  const top = GROUND_Y - h;
  ctx.save();
  switch (style) {
    case "log": {
      const g = ctx.createLinearGradient(0, top, 0, GROUND_Y);
      g.addColorStop(0, "#9a6a40");
      g.addColorStop(0.35, "#6a4426");
      g.addColorStop(1, "#2e1c0e");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, top + 2, w - h * 0.25, h - 2, h / 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(30,15,5,.5)";
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(x + 6 + k * 9, top + 6 + (k % 2) * 4);
        ctx.lineTo(x + 18 + k * 9, top + h - 8 - (k % 3) * 3);
        ctx.stroke();
      }
      const ex = x + w - h * 0.42;
      const ey = top + h / 2 + 1;
      const eg = ctx.createRadialGradient(ex - 2, ey - 3, 1, ex, ey, h / 2);
      eg.addColorStop(0, "#f0c890");
      eg.addColorStop(0.7, "#c9925a");
      eg.addColorStop(1, "#7a4a24");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.ellipse(ex, ey, h * 0.36, h / 2 - 1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,70,30,.6)";
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(ex, ey, (h * 0.36 * k) / 4, ((h / 2 - 1) * k) / 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (key === "meadow" || key === "jungle") moss(ctx, x + 6, top + 3, w * 0.5);
      break;
    }
    case "rock":
    case "stump": {
      if (style === "stump") {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, "#2e1c0e");
        g.addColorStop(0.6, "#7a5232");
        g.addColorStop(1, "#4a2e18");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 6, GROUND_Y);
        ctx.quadraticCurveTo(x + 2, GROUND_Y - 10, x + 3, top + 6);
        ctx.lineTo(x + w - 3, top + 6);
        ctx.quadraticCurveTo(x + w - 2, GROUND_Y - 10, x + w + 6, GROUND_Y);
        ctx.fill();
        const tg = ctx.createRadialGradient(x + w / 2 - 4, top + 4, 1, x + w / 2, top + 6, w / 2);
        tg.addColorStop(0, "#f0c890");
        tg.addColorStop(1, "#9a6a3a");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, top + 6, w / 2 - 3, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        moss(ctx, x + 4, top + 12, w * 0.4);
        break;
      }
      const cool = key === "ice" || key === "space";
      const baseC = cool ? (key === "space" ? "#6a5f8a" : "#7f93ad") : key === "route66" ? "#a06a46" : "#8a8a80";
      const pts: [number, number][] = [
        [x, GROUND_Y],
        [x + w * 0.08, top + h * 0.45],
        [x + w * 0.38, top + 2],
        [x + w * 0.7, top + h * 0.12],
        [x + w * 0.95, top + h * 0.5],
        [x + w, GROUND_Y],
      ];
      ctx.fillStyle = shade(baseC, -0.25);
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.fill();
      // lit facet (upper right)
      const lg = ctx.createLinearGradient(x + w * 0.4, top, x + w, GROUND_Y);
      lg.addColorStop(0, shade(baseC, 0.35));
      lg.addColorStop(1, baseC);
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.38, top + 2);
      ctx.lineTo(x + w * 0.7, top + h * 0.12);
      ctx.lineTo(x + w * 0.95, top + h * 0.5);
      ctx.lineTo(x + w, GROUND_Y);
      ctx.lineTo(x + w * 0.45, GROUND_Y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(baseC, 0.1);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.08, top + h * 0.45);
      ctx.lineTo(x + w * 0.38, top + 2);
      ctx.lineTo(x + w * 0.45, GROUND_Y);
      ctx.lineTo(x + w * 0.12, GROUND_Y);
      ctx.fill();
      if (key === "meadow" || key === "jungle") moss(ctx, x + w * 0.2, top + 6, w * 0.45);
      if (key === "ice") {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, top + h * 0.3);
        ctx.quadraticCurveTo(x + w * 0.4, top - 3, x + w * 0.78, top + h * 0.18);
        ctx.quadraticCurveTo(x + w * 0.45, top + 8, x + w * 0.2, top + h * 0.3);
        ctx.fill();
      }
      break;
    }
    case "fence": {
      for (let k = 0; k < 3; k++) {
        const fx = x + k * (w / 3) + 2;
        const fw = w / 3 - 5;
        const g = ctx.createLinearGradient(fx, 0, fx + fw, 0);
        g.addColorStop(0, "#c9b28a");
        g.addColorStop(0.5, "#fff3dc");
        g.addColorStop(1, "#b09870");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(fx, GROUND_Y);
        ctx.lineTo(fx, top + 6);
        ctx.lineTo(fx + fw / 2, top);
        ctx.lineTo(fx + fw, top + 6);
        ctx.lineTo(fx + fw, GROUND_Y);
        ctx.fill();
      }
      const rg = ctx.createLinearGradient(0, top + 12, 0, top + 18);
      rg.addColorStop(0, "#fff3dc");
      rg.addColorStop(1, "#a8906a");
      ctx.fillStyle = rg;
      ctx.fillRect(x - 2, top + 12, w + 4, 6);
      ctx.fillRect(x - 2, GROUND_Y - 18, w + 4, 6);
      break;
    }
    case "cone": {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#b8400a");
      g.addColorStop(0.55, "#ff9a3a");
      g.addColorStop(1, "#d8580f");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 3, top);
      ctx.lineTo(x + w / 2 + 3, top);
      ctx.lineTo(x + w - 2, GROUND_Y - 5);
      ctx.lineTo(x + 2, GROUND_Y - 5);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath();
      ctx.moveTo(x + w * 0.33, top + h * 0.38);
      ctx.lineTo(x + w * 0.67, top + h * 0.38);
      ctx.lineTo(x + w * 0.72, top + h * 0.52);
      ctx.lineTo(x + w * 0.28, top + h * 0.52);
      ctx.fill();
      const bg = ctx.createLinearGradient(0, GROUND_Y - 7, 0, GROUND_Y);
      bg.addColorStop(0, "#ff8a2a");
      bg.addColorStop(1, "#8a2a00");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(x - 5, GROUND_Y - 7, w + 10, 7, 2);
      ctx.fill();
      break;
    }
    case "cactus":
      cactus(ctx, x + w / 2, GROUND_Y, h);
      break;
    case "snowman": {
      const ball = (cx: number, cy: number, r: number) => {
        const g = ctx.createRadialGradient(cx + r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.7, "#e4eefa");
        g.addColorStop(1, "#9fb6d6");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      const cx = x + w / 2;
      ball(cx, GROUND_Y - 20, 22);
      ball(cx, GROUND_Y - 50, 15);
      ctx.fillStyle = "#c8281e";
      ctx.beginPath();
      ctx.roundRect(cx - 14, GROUND_Y - 40, 28, 6, 3);
      ctx.fill();
      ctx.fillRect(cx + 4, GROUND_Y - 38, 6, 14);
      const ng = ctx.createLinearGradient(cx - 4, 0, cx - 20, 0);
      ng.addColorStop(0, "#ff9a3a");
      ng.addColorStop(1, "#d8580f");
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.moveTo(cx - 4, GROUND_Y - 53);
      ctx.lineTo(cx - 20, GROUND_Y - 49);
      ctx.lineTo(cx - 4, GROUND_Y - 47);
      ctx.fill();
      ctx.fillStyle = "#1a1418";
      for (const [ox, oy] of [[-6, -57], [2, -57], [0, -24], [0, -15]]) {
        ctx.beginPath();
        ctx.arc(cx + ox, GROUND_Y + oy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

function moss(ctx: Ctx, x: number, y: number, w: number) {
  const g = ctx.createLinearGradient(0, y - 4, 0, y + 6);
  g.addColorStop(0, "#9ad86a");
  g.addColorStop(1, "#3f7a2a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y, w / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cactus(ctx: Ctx, x: number, y: number, h: number) {
  const body = (bx: number, by: number, bw: number, bh: number) => {
    const g = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
    g.addColorStop(0, "#1f3a1a");
    g.addColorStop(0.55, "#7fb05a");
    g.addColorStop(1, "#3f6a2a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - bh, bw, bh, bw / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.2)";
    ctx.lineWidth = 1;
    for (const k of [-0.25, 0, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(bx + k * bw, by - bh + bw / 2);
      ctx.lineTo(bx + k * bw, by);
      ctx.stroke();
    }
  };
  body(x, y, 18, h);
  body(x - 15, y - h * 0.32, 9, h * 0.34);
  body(x - 10, y - h * 0.32, 12, 7);
  body(x + 15, y - h * 0.45, 9, h * 0.3);
  body(x + 10, y - h * 0.45, 12, 7);
}

function drawIce(ctx: Ctx, x: number, w: number, crack: number, now: number) {
  const j = crack > 0 ? (Math.random() - 0.5) * 2.5 : 0;
  const g = ctx.createLinearGradient(0, GROUND_Y - 4, 0, GROUND_Y + 30);
  g.addColorStop(0, "rgba(240,250,255,.98)");
  g.addColorStop(0.3, "rgba(170,220,250,.92)");
  g.addColorStop(1, "rgba(60,130,200,.85)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + 1 + j, GROUND_Y - 4, w - 2, 32, 4);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255,255,255,.35)";
  const sx = x + ((now * 30 + x) % w);
  ctx.beginPath();
  ctx.moveTo(sx, GROUND_Y - 2);
  ctx.lineTo(sx + 10, GROUND_Y - 2);
  ctx.lineTo(sx - 4, GROUND_Y + 24);
  ctx.lineTo(sx - 12, GROUND_Y + 24);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  if (crack > 0) {
    ctx.strokeStyle = "rgba(30,90,150,.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, GROUND_Y - 3);
    ctx.lineTo(x + w * 0.45, GROUND_Y + 10);
    ctx.lineTo(x + w * 0.32, GROUND_Y + 26);
    ctx.moveTo(x + w * 0.45, GROUND_Y + 10);
    ctx.lineTo(x + w * 0.78, GROUND_Y + 16);
    ctx.moveTo(x + w * 0.6, GROUND_Y + 13);
    ctx.lineTo(x + w * 0.7, GROUND_Y - 2);
    ctx.stroke();
  }
}

function drawWarning(ctx: Ctx, x: number, now: number) {
  ctx.save();
  ctx.globalAlpha = 0.45 + 0.45 * Math.sin(now * 18);
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, GROUND_Y, 4, x, GROUND_Y, 50);
  g.addColorStop(0, "rgba(255,80,80,.8)");
  g.addColorStop(1, "rgba(255,80,80,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, GROUND_Y);
  ctx.scale(1, 0.25);
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawCrater(ctx: Ctx, x: number, t: number) {
  const w = CRATER.w;
  const rim = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 10);
  rim.addColorStop(0, "#8e86a8");
  rim.addColorStop(1, "#2a2440");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y, w / 2 + 6, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#140c22";
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 1, w / 2 - 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = 0.55 + 0.35 * Math.sin(t * 9);
  const g = ctx.createRadialGradient(x, GROUND_Y - 2, 2, x, GROUND_Y - 2, w / 2);
  g.addColorStop(0, `rgba(255,200,80,${glow})`);
  g.addColorStop(0.5, `rgba(255,90,30,${glow * 0.6})`);
  g.addColorStop(1, "rgba(255,60,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y - 4, w / 2, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHouse(ctx: Ctx, key: WorldKey, x: number) {
  if (x < -320 || x > VIEW_W + 220) return;
  groundShadow(ctx, x + 75, GROUND_Y, 110, 0.4);
  // flag
  const pg = ctx.createLinearGradient(x - 72, 0, x - 64, 0);
  pg.addColorStop(0, "#9aa0b0");
  pg.addColorStop(1, "#ffffff");
  ctx.fillStyle = pg;
  ctx.fillRect(x - 72, GROUND_Y - 160, 5, 160);
  const fg = ctx.createLinearGradient(x - 67, 0, x - 8, 0);
  fg.addColorStop(0, "#ff1fb4");
  fg.addColorStop(1, "#b0107a");
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(x - 67, GROUND_Y - 160);
  ctx.quadraticCurveTo(x - 38, GROUND_Y - 150, x - 8, GROUND_Y - 145);
  ctx.quadraticCurveTo(x - 38, GROUND_Y - 138, x - 67, GROUND_Y - 128);
  ctx.fill();
  text(ctx, "GOAL", x - 44, GROUND_Y - 140, 11, "#fff", "center");
  // walls: wooden planks
  const wy = GROUND_Y - 110;
  for (let k = 0; k < 6; k++) {
    const g = ctx.createLinearGradient(0, wy + k * 18.3, 0, wy + (k + 1) * 18.3);
    g.addColorStop(0, "#e8b878");
    g.addColorStop(1, "#a8723a");
    ctx.fillStyle = g;
    ctx.fillRect(x, wy + k * 18.3, 150, 18.3);
    ctx.fillStyle = "rgba(70,40,15,.45)";
    ctx.fillRect(x, wy + (k + 1) * 18.3 - 1.5, 150, 1.5);
  }
  const side = ctx.createLinearGradient(x, 0, x + 150, 0);
  side.addColorStop(0, "rgba(0,0,0,.25)");
  side.addColorStop(0.7, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(255,240,200,.15)");
  ctx.fillStyle = side;
  ctx.fillRect(x, wy, 150, 110);
  // roof with shingles
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 22, wy + 4);
  ctx.lineTo(x + 75, wy - 74);
  ctx.lineTo(x + 172, wy + 4);
  ctx.closePath();
  ctx.clip();
  for (let r = 0; r < 8; r++) {
    for (let c = -1; c < 12; c++) {
      const sx = x - 22 + c * 18 + (r % 2) * 9;
      const sy = wy - 74 + r * 11;
      const g = ctx.createLinearGradient(0, sy, 0, sy + 11);
      g.addColorStop(0, "#e2483a");
      g.addColorStop(1, "#8a1a14");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(sx, sy, 17, 12, [0, 0, 6, 6]);
      ctx.fill();
    }
  }
  ctx.restore();
  // door
  const dg = ctx.createLinearGradient(0, GROUND_Y - 80, 0, GROUND_Y);
  dg.addColorStop(0, "#1a0f08");
  dg.addColorStop(1, "#3a2414");
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.moveTo(x + 45, GROUND_Y);
  ctx.lineTo(x + 45, GROUND_Y - 50);
  ctx.arc(x + 75, GROUND_Y - 50, 30, Math.PI, 0);
  ctx.lineTo(x + 105, GROUND_Y);
  ctx.fill();
  // warm light inside
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const lg = ctx.createRadialGradient(x + 75, GROUND_Y - 30, 2, x + 75, GROUND_Y - 30, 40);
  lg.addColorStop(0, key === "space" ? "rgba(160,200,255,.35)" : "rgba(255,190,90,.35)");
  lg.addColorStop(1, "rgba(255,190,90,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(x + 35, GROUND_Y - 70, 80, 70);
  ctx.restore();
  // sign
  const sg = ctx.createLinearGradient(0, wy - 34, 0, wy - 12);
  sg.addColorStop(0, "#ffffff");
  sg.addColorStop(1, "#d8d2c8");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.roundRect(x + 40, wy - 34, 70, 22, 6);
  ctx.fill();
  text(ctx, "HOME", x + 75, wy - 17, 16, "#c8281e", "center");
}

function drawTrail(ctx: Ctx, px: number, py: number, now: number, sliding: boolean) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const colors = ["255,154,213", "255,229,122", "141,255,201", "127,214,255", "201,162,255"];
  const y = py - (sliding ? 14 : 30);
  for (let i = 0; i < 5; i++) {
    const g = ctx.createLinearGradient(px - 140, 0, px + 10, 0);
    g.addColorStop(0, `rgba(${colors[i]},0)`);
    g.addColorStop(1, `rgba(${colors[i]},.55)`);
    ctx.fillStyle = g;
    ctx.fillRect(px - 140, y - 10 + i * 4 + Math.sin(now * 12 + i) * 1.5, 150, 4);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ particles

function dustColor(key: WorldKey) {
  return { meadow: "#c8a878", jungle: "#7a6040", route66: "#e8c48a", ice: "#ffffff", space: "#b8aee0" }[key];
}

function puff(fx: Fx, x: number, y: number, color: string, r: number, vx: number) {
  if (fx.puffs.length > 120) return;
  fx.puffs.push({ x, y, r, life: 0, max: 0.5 + Math.random() * 0.4, vx: vx + (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, color });
}

function drawPuffs(ctx: Ctx, fx: Fx, cam: number, dt: number) {
  for (const p of fx.puffs) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    const f = p.life / p.max;
    const r = p.r * (1 + f * 1.8);
    const g = ctx.createRadialGradient(p.x - cam, p.y, 0, p.x - cam, p.y, r);
    g.addColorStop(0, hexA(p.color, 0.45 * (1 - f)));
    g.addColorStop(1, hexA(p.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - cam - r, p.y - r, r * 2, r * 2);
  }
  fx.puffs = fx.puffs.filter((p) => p.life < p.max);
}

function drawMotes(ctx: Ctx, fx: Fx, kind: Scene["ambient"], dt: number, camDelta: number, now: number) {
  ctx.save();
  if (kind !== "snow") ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < fx.motes.length; i++) {
    const m = fx.motes[i];
    m.x += m.vx * dt - camDelta * m.z * 0.6;
    m.y += m.vy * dt;
    if (kind === "pollen" || kind === "stardust") {
      m.x += Math.sin(now * 0.8 + m.ph) * 8 * dt;
      m.y += Math.cos(now * 0.6 + m.ph) * 6 * dt;
    } else if (kind === "fireflies") {
      m.x += Math.sin(now * 0.9 + m.ph) * 20 * dt;
      m.y += Math.sin(now * 1.3 + m.ph * 2) * 14 * dt;
    }
    if (m.x < -30) m.x += VIEW_W + 60;
    if (m.x > VIEW_W + 30) m.x -= VIEW_W + 60;
    if (m.y > VIEW_H + 20) fx.motes[i] = newMote(kind, false);
    if (m.y < -20) m.y = VIEW_H + 10;
    const size = m.z;
    switch (kind) {
      case "snow": {
        const r = 1.2 + size * 2.2;
        ctx.fillStyle = `rgba(255,255,255,${size > 1.1 ? 0.5 : 0.85})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "dust": {
        ctx.fillStyle = `rgba(255,220,170,${0.12 + size * 0.12})`;
        ctx.fillRect(m.x, m.y, 6 + size * 10, 1.4);
        break;
      }
      case "fireflies": {
        const blink = Math.max(0, Math.sin(now * 2.2 + m.ph * 3));
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 7 + size * 4);
        g.addColorStop(0, `rgba(220,255,120,${0.9 * blink})`);
        g.addColorStop(1, "rgba(220,255,120,0)");
        ctx.fillStyle = g;
        ctx.fillRect(m.x - 12, m.y - 12, 24, 24);
        break;
      }
      case "pollen": {
        ctx.fillStyle = `rgba(255,250,210,${0.25 + 0.25 * Math.sin(now * 3 + m.ph)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 0.8 + size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "stardust": {
        const tw = Math.max(0, Math.sin(now * 3 + m.ph * 5));
        ctx.fillStyle = `rgba(200,210,255,${0.6 * tw})`;
        ctx.fillRect(m.x - 0.5, m.y - 3, 1, 6);
        ctx.fillRect(m.x - 3, m.y - 0.5, 6, 1);
        break;
      }
    }
  }
  ctx.restore();
}

function drawVignette(ctx: Ctx, amt: number) {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.45, VIEW_H * 0.35, VIEW_W / 2, VIEW_H * 0.5, VIEW_W * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(10,5,30,${amt})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function hexA(hex: string, a: number) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}

// ------------------------------------------------------------------ HUD

function panel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(30,22,80,.72)");
  g.addColorStop(1, "rgba(12,8,40,.72)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawHud(ctx: Ctx, sim: Sim) {
  panel(ctx, 14, 14, 34 + sim.maxLives * 28, 34);
  for (let i = 0; i < sim.maxLives; i++) heart(ctx, 36 + i * 28, 31, i < sim.lives);
  panel(ctx, 14, 54, 150, 32);
  coinIcon(ctx, 34, 70);
  text(ctx, String(sim.coins), 54, 78, 20, "#ffe14d");
  const score = sim.coins * SCORE.coin + sim.stomps * SCORE.stomp;
  panel(ctx, 14, 92, 150, 28);
  text(ctx, `SCORE ${score.toLocaleString()}`, 30, 112, 15, "#fff");

  // progress
  const bx = 300;
  const bw = 360;
  panel(ctx, bx - 6, 16, bw + 12, 18);
  const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  pg.addColorStop(0, "#ffe14d");
  pg.addColorStop(1, "#ffb02e");
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.roundRect(bx, 20, Math.max(10, bw * sim.progress), 10, 5);
  ctx.fill();
  sim.level.sections.forEach((s, i) => {
    if (!i) return;
    const f = s.x0 / sim.level.goalX;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillRect(bx + bw * f - 1, 18, 2, 14);
  });
  const w = sim.level.world;
  text(ctx, `${w.num} · ${w.name}`, bx + bw / 2, 56, 15, "#fff", "center", true);
  text(ctx, sim.level.sections[sim.section].name, bx + bw / 2, 76, 13, "#ffe14d", "center", true);

  text(ctx, sim.profile.name, VIEW_W - 20, 34, 16, "#fff", "right", true);
  sim.profile.perks.forEach((p, i) => {
    const tw = 74;
    const x = VIEW_W - 20 - tw - i * (tw + 6);
    const g = ctx.createLinearGradient(0, 44, 0, 66);
    g.addColorStop(0, "#fff07a");
    g.addColorStop(1, "#ffb02e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, 44, tw, 22, 11);
    ctx.fill();
    text(ctx, PERK_INFO[p].short, x + tw / 2, 60, 12, "#1b1446", "center");
  });
}

function drawBanner(ctx: Ctx, banner: Banner) {
  const a = banner.t < 0.2 ? banner.t / 0.2 : banner.t > 1.4 ? (1.8 - banner.t) / 0.4 : 1;
  const s = 1 + Math.max(0, 0.25 - banner.t) * 1.5;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(VIEW_W / 2, 200);
  ctx.scale(s, s);
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  text(ctx, banner.text, 0, 0, 58, "#ffe14d", "center", true);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (banner.sub) text(ctx, banner.sub, 0, 42, 20, "#ffffff", "center", true);
  ctx.restore();
}

function heart(ctx: Ctx, x: number, y: number, full: boolean) {
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.bezierCurveTo(x - 14, y - 2, x - 8, y - 14, x, y - 6);
  ctx.bezierCurveTo(x + 8, y - 14, x + 14, y - 2, x, y + 8);
  if (full) {
    const g = ctx.createRadialGradient(x - 3, y - 6, 1, x, y, 13);
    g.addColorStop(0, "#ff9aac");
    g.addColorStop(0.5, "#ff3b5c");
    g.addColorStop(1, "#a8102e");
    ctx.fillStyle = g;
  } else ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fill();
  if (full) {
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 5, 2.4, 1.6, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function coinIcon(ctx: Ctx, x: number, y: number) {
  const g = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, 10);
  g.addColorStop(0, "#fff7c2");
  g.addColorStop(0.6, "#ffc83a");
  g.addColorStop(1, "#a86f00");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, "D", x, y + 4, 11, "#a86f00", "center");
}

// ------------------------------------------------------------------ helpers

export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", outline = false) {
  ctx.font = `${size}px "Lilita One", "Nunito", sans-serif`;
  ctx.textAlign = align;
  if (outline) {
    ctx.lineWidth = Math.max(3, size / 7);
    ctx.strokeStyle = "#1b1446";
    ctx.lineJoin = "round";
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
  ctx.fill();
}
