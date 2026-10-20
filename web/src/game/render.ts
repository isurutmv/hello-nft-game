// Canvas drawing for the runner. Everything is drawn with shapes; no image assets.
import { GROUND_Y, PLAYER_W, VIEW_H, VIEW_W, type WorldKey } from "./levels";
import { BOAR, CHICKEN, CRATER, SCORE, WASP_R, starPos, type Sim } from "./sim";
import { PERK_INFO, type DashProfile } from "./dash";

type Ctx = CanvasRenderingContext2D;

const THEME: Record<
  WorldKey,
  { sky: [string, string]; far: string; mid: string; top: string; soil: string; pit: string; plat: string; platTop: string }
> = {
  meadow: { sky: ["#7fd0ff", "#dff5ff"], far: "#8fd78a", mid: "#4fae5a", top: "#5cc85a", soil: "#8b5a2b", pit: "#3a2414", plat: "#9b6a3a", platTop: "#6fd46a" },
  jungle: { sky: ["#2f8f72", "#bff0d0"], far: "#1f6b4f", mid: "#164f3a", top: "#3fae4a", soil: "#4a2e1a", pit: "#1a0f08", plat: "#6b4426", platTop: "#4fc35a" },
  route66: { sky: ["#ff8a5a", "#ffe08a"], far: "#c45a32", mid: "#9a3f22", top: "#e9b46a", soil: "#55565e", pit: "#2a1a10", plat: "#b0703a", platTop: "#f0c27a" },
  ice: { sky: ["#8fd0ff", "#f1fbff"], far: "#d6ecff", mid: "#ffffff", top: "#ffffff", soil: "#9fd3f2", pit: "#1f5f9a", plat: "#a8dcf5", platTop: "#ffffff" },
  space: { sky: ["#090522", "#2b1766"], far: "#3a2a7a", mid: "#57439a", top: "#9a8fc0", soil: "#4c4272", pit: "#05020f", plat: "#6a5aa8", platTop: "#b8aee0" },
};

const n01 = (i: number, s = 0) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export type Banner = { text: string; sub: string; t: number };

export function render(ctx: Ctx, sim: Sim, banner: Banner | null, now: number, demo = false) {
  const world = sim.level.world;
  const th = THEME[world.key];
  const cam = sim.camX;
  ctx.save();
  if (sim.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * sim.shake * 3, (Math.random() - 0.5) * 10 * sim.shake * 3);

  drawBackground(ctx, world.key, cam, now);

  // ground
  for (const g of sim.level.grounds) {
    const x0 = g.x0 - cam;
    const x1 = g.x1 - cam;
    if (x1 < -20 || x0 > VIEW_W + 20) continue;
    drawGround(ctx, world.key, x0, x1, cam);
  }
  // water / lava in pits for flavour
  if (world.key === "ice") {
    ctx.fillStyle = th.pit;
    ctx.fillRect(0, VIEW_H - 40, VIEW_W, 40);
  }

  for (const p of sim.level.platforms) {
    const x = p.x - cam;
    if (x + p.w < -10 || x > VIEW_W + 10) continue;
    roundRect(ctx, x, p.y, p.w, 22, 8, th.plat);
    roundRect(ctx, x, p.y, p.w, 9, 6, th.platTop);
  }

  for (const e of sim.entities) {
    const ex = (e.kind === "star" ? e.targetX : e.x) - cam;
    if (ex < -400 || ex > VIEW_W + 420) continue;
    switch (e.kind) {
      case "coin":
        if (!e.taken) drawCoin(ctx, ex, e.y, now);
        break;
      case "obstacle":
        drawObstacle(ctx, e.style, ex, e.w, e.h);
        break;
      case "ice":
        if (!e.broken) drawIce(ctx, ex, e.w, e.crack);
        break;
      case "chicken":
        drawChicken(ctx, ex, e.dead, now);
        break;
      case "boar":
        drawBoar(ctx, ex, e.charging, e.dead, now);
        break;
      case "wasp": {
        const y = e.baseY + Math.sin(sim.time * 5 + e.phase) * 5;
        drawWasp(ctx, ex, y, e.dead, now);
        break;
      }
      case "star":
        if (e.active && !e.landed) {
          const [sx, sy] = starPos(e.targetX, e.t);
          drawWarning(ctx, ex, now);
          drawStar(ctx, sx - cam, sy, now);
        }
        if (e.landed) drawCrater(ctx, ex, e.crater);
        break;
    }
  }

  drawHouse(ctx, sim.level.goalX - cam);

  // player
  const px = sim.px - cam;
  if (sim.profile.holoTrail) drawTrail(ctx, px, sim.py, now);
  const flash = sim.invuln > 0 && Math.floor(now * 14) % 2 === 0;
  if (!flash) drawDash(ctx, sim.profile, px + PLAYER_W / 2, sim.py, { sliding: sim.sliding, air: !sim.onGround, t: sim.time, ended: sim.ended && sim.cleared });

  for (const p of sim.particles) {
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cam - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const p of sim.popups) {
    ctx.globalAlpha = 1 - p.t / 0.9;
    text(ctx, p.text, p.x - cam, p.y - p.t * 50, 22, p.color, "center");
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (!demo) drawHud(ctx, sim);
  if (banner && banner.t < 1.8) {
    const a = banner.t < 0.2 ? banner.t / 0.2 : banner.t > 1.4 ? (1.8 - banner.t) / 0.4 : 1;
    const s = 1 + Math.max(0, 0.25 - banner.t) * 1.5;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(VIEW_W / 2, 200);
    ctx.scale(s, s);
    text(ctx, banner.text, 0, 0, 58, "#ffe14d", "center", true);
    if (banner.sub) text(ctx, banner.sub, 0, 42, 20, "#ffffff", "center", true);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ backgrounds

function drawBackground(ctx: Ctx, key: WorldKey, cam: number, now: number) {
  const th = THEME[key];
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, th.sky[0]);
  g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (key === "space") {
    for (let i = 0; i < 120; i++) {
      const x = (n01(i, 1) * 3000 - cam * 0.05) % 3000;
      const sx = x < 0 ? x + 3000 : x;
      if (sx > VIEW_W) continue;
      const tw = 0.5 + 0.5 * Math.sin(now * 2 + i);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * tw * n01(i, 3)})`;
      ctx.fillRect(sx, n01(i, 2) * 380, 2, 2);
    }
    // planets
    planet(ctx, 760 - ((cam * 0.03) % 1400), 120, 60, "#ff7aa8", "#ffd1e4", true);
    planet(ctx, 260 - ((cam * 0.06) % 1800) + 1200, 220, 34, "#7fd6ff", "#e0f6ff", false);
    // earth-like far horizon
    ctx.fillStyle = th.far;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, 360 + Math.sin((x + cam * 0.2) * 0.01) * 18 + Math.sin((x + cam * 0.2) * 0.031) * 8);
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.fill();
    return;
  }

  // sun / clouds
  if (key === "route66") {
    ctx.fillStyle = "rgba(255,240,180,.9)";
    ctx.beginPath();
    ctx.arc(720, 170, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const w = 2200;
    let x = (n01(i, 5) * w - cam * 0.08 - now * 8) % w;
    if (x < -200) x += w;
    cloud(ctx, x, 50 + n01(i, 6) * 120, 0.7 + n01(i, 7) * 0.6, key === "jungle" ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.85)");
  }

  // far layer
  ctx.fillStyle = th.far;
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  const fo = cam * 0.15;
  for (let x = 0; x <= VIEW_W; x += 16) {
    const wx = x + fo;
    let y: number;
    if (key === "route66") y = 300 + (Math.floor(wx / 260) % 3 === 0 ? -80 : Math.floor(wx / 260) % 3 === 1 ? -30 : 10) + Math.sin(wx * 0.02) * 4;
    else if (key === "ice") y = 300 - Math.abs(((wx % 300) / 300) * 2 - 1) * -120 - 110 + Math.sin(wx * 0.01) * 20;
    else y = 320 + Math.sin(wx * 0.006) * 40 + Math.sin(wx * 0.017) * 16;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.fill();
  if (key === "ice") {
    // snow caps
    ctx.fillStyle = "rgba(255,255,255,.9)";
    for (let k = -1; k < 5; k++) {
      const peak = k * 300 - (fo % 300) + 150;
      ctx.beginPath();
      ctx.moveTo(peak - 40, 230);
      ctx.lineTo(peak, 190);
      ctx.lineTo(peak + 40, 230);
      ctx.fill();
    }
  }

  // mid layer
  const mo = cam * 0.4;
  const step = 180;
  const start = Math.floor(mo / step) - 1;
  for (let i = start; i < start + VIEW_W / step + 3; i++) {
    const x = i * step - mo + n01(i, 9) * 80;
    const s = 0.7 + n01(i, 10) * 0.5;
    if (key === "meadow") tree(ctx, x, GROUND_Y - 10, s, th.mid);
    else if (key === "jungle") palm(ctx, x, GROUND_Y - 10, s, th.mid, i);
    else if (key === "route66") (n01(i, 11) > 0.75 ? sign66(ctx, x, GROUND_Y - 6) : cactusBg(ctx, x, GROUND_Y - 6, s, th.mid));
    else if (key === "ice") pine(ctx, x, GROUND_Y - 6, s);
  }
  if (key === "ice") {
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 50; i++) {
      const x = (n01(i, 12) * VIEW_W - now * 30 * (0.5 + n01(i, 13)) - cam * 0.3) % VIEW_W;
      const y = (n01(i, 14) * VIEW_H + now * 60 * (0.5 + n01(i, 15))) % VIEW_H;
      ctx.beginPath();
      ctx.arc(x < 0 ? x + VIEW_W : x, y, 1.5 + n01(i, 16) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (key === "jungle") {
    ctx.strokeStyle = "#1d5a32";
    ctx.lineWidth = 4;
    for (let i = start; i < start + VIEW_W / step + 3; i++) {
      const x = i * step - cam * 0.6 + 40;
      const len = 60 + n01(i, 20) * 120;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 14, len / 2, x, len);
      ctx.stroke();
    }
  }
}

function drawGround(ctx: Ctx, key: WorldKey, x0: number, x1: number, cam: number) {
  const th = THEME[key];
  ctx.fillStyle = th.soil;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, VIEW_H - GROUND_Y);
  if (key === "route66") {
    // the road
    ctx.fillStyle = "#3f4048";
    ctx.fillRect(x0, GROUND_Y + 14, x1 - x0, 50);
    ctx.fillStyle = "#ffd23f";
    const off = -cam % 80;
    for (let x = x0 + ((off + 80) % 80); x < x1 - 30; x += 80) ctx.fillRect(x, GROUND_Y + 37, 36, 4);
  } else {
    ctx.fillStyle = "rgba(0,0,0,.12)";
    for (let x = x0 - ((cam + x0) % 60); x < x1; x += 60) {
      if (x < x0) continue;
      ctx.fillRect(x + 10, GROUND_Y + 30 + ((x + cam) % 3) * 12, 14, 6);
    }
  }
  ctx.fillStyle = th.top;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, 14);
  if (key === "meadow" || key === "jungle") {
    ctx.fillStyle = key === "meadow" ? "#48b048" : "#2f8f3a";
    for (let x = x0; x < x1; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 14);
      ctx.lineTo(x + 7, GROUND_Y + 22);
      ctx.lineTo(x + 14, GROUND_Y + 14);
      ctx.fill();
    }
  }
  if (key === "ice") {
    ctx.fillStyle = "#cfeeff";
    ctx.fillRect(x0, GROUND_Y + 14, x1 - x0, 4);
  }
  // edge shading
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(x0, GROUND_Y, 4, VIEW_H - GROUND_Y);
  ctx.fillRect(x1 - 4, GROUND_Y, 4, VIEW_H - GROUND_Y);
}

// ------------------------------------------------------------------ Dash

export function drawDash(
  ctx: Ctx,
  p: DashProfile,
  x: number,
  y: number,
  o: { sliding?: boolean; air?: boolean; t: number; ended?: boolean; scale?: number },
) {
  const { base, dark, belly, pattern } = p.skin;
  const run = o.t * 18;
  ctx.save();
  ctx.translate(x, y);
  const sc = o.scale ?? 1;
  ctx.scale(sc, sc);
  if (o.sliding) ctx.scale(1.18, 0.6);
  const bob = o.air || o.sliding ? 0 : Math.abs(Math.sin(run)) * -3;
  ctx.translate(0, bob);

  // tail
  ctx.strokeStyle = base;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-20, -30);
  ctx.quadraticCurveTo(-34, -40 + Math.sin(o.t * 20) * 6, -28, -52);
  ctx.stroke();

  // legs
  ctx.fillStyle = dark;
  const legs = [-14, -6, 8, 16];
  legs.forEach((lx, i) => {
    const a = o.air ? (i < 2 ? -0.6 : 0.6) : Math.sin(run + (i % 2 ? Math.PI : 0)) * 0.7;
    ctx.save();
    ctx.translate(lx, -14);
    ctx.rotate(a);
    roundRect(ctx, -3.5, 0, 7, 15, 3, i % 2 ? dark : shade(base, -0.15));
    ctx.restore();
  });

  // body
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(0, -26, 25, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(4, -20, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (pattern === "tiger") {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    for (const sx of [-14, -5, 4]) {
      ctx.beginPath();
      ctx.moveTo(sx, -40);
      ctx.quadraticCurveTo(sx + 4, -32, sx, -26);
      ctx.stroke();
    }
  } else if (pattern === "jaguar") {
    ctx.fillStyle = dark;
    for (const [sx, sy] of [[-15, -32], [-6, -36], [3, -31], [-10, -24], [10, -35]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // head
  const hx = 20;
  const hy = -44;
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(hx - 12, hy - 10);
  ctx.lineTo(hx - 8, hy - 28);
  ctx.lineTo(hx - 1, hy - 13);
  ctx.moveTo(hx + 3, hy - 13);
  ctx.lineTo(hx + 10, hy - 28);
  ctx.lineTo(hx + 14, hy - 9);
  ctx.fill();
  ctx.fillStyle = "#ffb3c7";
  ctx.beginPath();
  ctx.moveTo(hx - 9, hy - 13);
  ctx.lineTo(hx - 7.5, hy - 22);
  ctx.lineTo(hx - 4, hy - 14);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(hx, hy, 16, 0, Math.PI * 2);
  ctx.fill();
  // muzzle
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(hx + 11, hy + 5, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1446";
  ctx.beginPath();
  ctx.ellipse(hx + 20, hy + 1, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(hx + 4, hy - 4, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1446";
  ctx.beginPath();
  ctx.arc(hx + 5.5, hy - 3.5, 3, 0, Math.PI * 2);
  ctx.fill();
  // mouth / tongue
  if (o.ended || o.air) {
    ctx.fillStyle = "#ff5c7a";
    ctx.beginPath();
    ctx.ellipse(hx + 14, hy + 12, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // accessory
  const c = p.accessoryColor;
  switch (p.accessory) {
    case "headphones":
      ctx.strokeStyle = "#1b1446";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(hx, hy, 18, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      roundRect(ctx, hx - 20, hy - 6, 9, 14, 4, c);
      break;
    case "halo":
      ctx.strokeStyle = "#ffe14d";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(hx, hy - 28, 14, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "mohawk":
      ctx.fillStyle = c;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(hx - 10 + k * 6, hy - 13);
        ctx.lineTo(hx - 8 + k * 6, hy - 27 + (k % 2) * 3);
        ctx.lineTo(hx - 4 + k * 6, hy - 14);
        ctx.fill();
      }
      break;
    case "cap":
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(hx, hy - 6, 16, Math.PI, 0);
      ctx.fill();
      roundRect(ctx, hx + 4, hy - 9, 22, 5, 2, c);
      text(ctx, "D", hx - 1, hy - 10, 11, "#fff", "center");
      break;
    case "ribbon":
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(hx - 10, hy - 16);
      ctx.lineTo(hx - 20, hy - 24);
      ctx.lineTo(hx - 20, hy - 10);
      ctx.closePath();
      ctx.moveTo(hx - 10, hy - 16);
      ctx.lineTo(hx, hy - 24);
      ctx.lineTo(hx, hy - 10);
      ctx.fill();
      break;
    case "crown":
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.moveTo(hx - 11, hy - 14);
      ctx.lineTo(hx - 11, hy - 26);
      ctx.lineTo(hx - 5, hy - 19);
      ctx.lineTo(hx, hy - 28);
      ctx.lineTo(hx + 5, hy - 19);
      ctx.lineTo(hx + 11, hy - 26);
      ctx.lineTo(hx + 11, hy - 14);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function drawTrail(ctx: Ctx, px: number, py: number, now: number) {
  const colors = ["#ff9ad5", "#ffe57a", "#8dffc9", "#7fd6ff", "#c9a2ff"];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = colors[(i + Math.floor(now * 8)) % 5];
    ctx.globalAlpha = 0.5 - i * 0.08;
    ctx.fillRect(px - 10 - i * 14, py - 34 + Math.sin(now * 10 + i) * 3, 14, 10);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ things

function drawCoin(ctx: Ctx, x: number, y: number, now: number) {
  const sx = Math.abs(Math.cos(now * 4 + x * 0.01));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.15, sx), 1);
  ctx.fillStyle = "#c98f00";
  ctx.beginPath();
  ctx.arc(0, 1.5, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff3a8";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  if (sx > 0.4) text(ctx, "D", 0, 5, 13, "#c98f00", "center");
  ctx.restore();
}

function drawObstacle(ctx: Ctx, style: string, x: number, w: number, h: number) {
  const top = GROUND_Y - h;
  switch (style) {
    case "log":
      roundRect(ctx, x, top, w, h, h / 2, "#8a5a2b");
      ctx.fillStyle = "#c98f55";
      ctx.beginPath();
      ctx.ellipse(x + w - h / 2.5, top + h / 2, h / 3, h / 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a5a2b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + w - h / 2.5, top + h / 2, h / 6, h / 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "fence":
      ctx.fillStyle = "#fff6e6";
      for (let k = 0; k < 3; k++) roundRect(ctx, x + k * (w / 3) + 2, top, w / 3 - 6, h, 4, "#fff6e6");
      ctx.fillRect(x, top + 12, w, 6);
      ctx.fillRect(x, top + h - 18, w, 6);
      break;
    case "rock":
      ctx.fillStyle = "#8d8fa3";
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + w * 0.15, top + h * 0.3);
      ctx.lineTo(x + w * 0.5, top);
      ctx.lineTo(x + w * 0.85, top + h * 0.25);
      ctx.lineTo(x + w, GROUND_Y);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, top + h * 0.35);
      ctx.lineTo(x + w * 0.5, top + 4);
      ctx.lineTo(x + w * 0.45, top + h * 0.5);
      ctx.fill();
      break;
    case "stump":
      roundRect(ctx, x, top, w, h, 6, "#6b4426");
      ctx.fillStyle = "#c98f55";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, top + 4, w / 2, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cone":
      ctx.fillStyle = "#ff7a1f";
      ctx.beginPath();
      ctx.moveTo(x + w / 2, top);
      ctx.lineTo(x + w, GROUND_Y - 4);
      ctx.lineTo(x, GROUND_Y - 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + w * 0.3, top + h * 0.4, w * 0.4, 6);
      roundRect(ctx, x - 4, GROUND_Y - 6, w + 8, 6, 2, "#ff7a1f");
      break;
    case "cactus":
      cactusBg(ctx, x + w / 2, GROUND_Y, h / 70, "#2f9a4a");
      break;
    case "snowman":
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x + w / 2, GROUND_Y - 20, 22, 0, Math.PI * 2);
      ctx.arc(x + w / 2, GROUND_Y - 50, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff8a1f";
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 4, GROUND_Y - 50);
      ctx.lineTo(x + w / 2 - 18, GROUND_Y - 47);
      ctx.lineTo(x + w / 2 - 4, GROUND_Y - 45);
      ctx.fill();
      ctx.fillStyle = "#1b1446";
      ctx.fillRect(x + w / 2 - 8, GROUND_Y - 56, 3, 3);
      roundRect(ctx, x + w / 2 - 12, GROUND_Y - 68, 24, 6, 2, "#ff3b3b");
      break;
  }
}

function drawIce(ctx: Ctx, x: number, w: number, crack: number) {
  const j = crack > 0 ? (Math.random() - 0.5) * 3 : 0;
  ctx.fillStyle = "#bfe8ff";
  ctx.fillRect(x + 1 + j, GROUND_Y, w - 2, 26);
  ctx.fillStyle = "#eaf8ff";
  ctx.fillRect(x + 1 + j, GROUND_Y, w - 2, 7);
  if (crack > 0) {
    ctx.strokeStyle = "#5aa6d6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, GROUND_Y);
    ctx.lineTo(x + w * 0.45, GROUND_Y + 12);
    ctx.lineTo(x + w * 0.35, GROUND_Y + 26);
    ctx.moveTo(x + w * 0.45, GROUND_Y + 12);
    ctx.lineTo(x + w * 0.75, GROUND_Y + 18);
    ctx.stroke();
  }
}

function drawChicken(ctx: Ctx, x: number, dead: number, now: number) {
  const { w } = CHICKEN;
  ctx.save();
  ctx.translate(x + w / 2, GROUND_Y);
  if (dead > 0) {
    ctx.globalAlpha = Math.max(0, 1 - dead * 2);
    ctx.scale(1.2, 0.35);
  }
  const step = Math.sin(now * 16) * 4;
  ctx.strokeStyle = "#ff9a1f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, -10);
  ctx.lineTo(-5 + step, 0);
  ctx.moveTo(5, -10);
  ctx.lineTo(5 - step, 0);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(2, -22, 18, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-10, -34, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff3b3b";
  ctx.beginPath();
  ctx.arc(-12, -44, 4, 0, Math.PI * 2);
  ctx.arc(-7, -45, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffc21f";
  ctx.beginPath();
  ctx.moveTo(-18, -35);
  ctx.lineTo(-25, -32);
  ctx.lineTo(-18, -30);
  ctx.fill();
  ctx.fillStyle = "#1b1446";
  ctx.fillRect(-13, -37, 3, 3);
  ctx.fillStyle = "#e8e2d8";
  ctx.beginPath();
  ctx.ellipse(8, -24, 9, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBoar(ctx: Ctx, x: number, charging: boolean, dead: number, now: number) {
  const { w } = BOAR;
  ctx.save();
  ctx.translate(x + w / 2, GROUND_Y);
  if (dead > 0) {
    ctx.globalAlpha = Math.max(0, 1 - dead * 2);
    ctx.scale(1.2, 0.35);
  }
  const step = charging ? Math.sin(now * 26) * 6 : 0;
  ctx.fillStyle = "#4a2e1a";
  for (const lx of [-22, -10, 10, 22]) ctx.fillRect(lx - 3 + (lx > 0 ? step : -step), -12, 7, 12);
  ctx.fillStyle = "#7a4a2c";
  ctx.beginPath();
  ctx.ellipse(4, -26, 32, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a341c";
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    ctx.moveTo(-6 + k * 7, -42);
    ctx.lineTo(-3 + k * 7, -50);
    ctx.lineTo(0 + k * 7, -42);
    ctx.fill();
  }
  ctx.fillStyle = "#7a4a2c";
  ctx.beginPath();
  ctx.ellipse(-26, -28, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e89aa0";
  ctx.beginPath();
  ctx.ellipse(-38, -26, 6, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-34, -20);
  ctx.quadraticCurveTo(-42, -26, -40, -36);
  ctx.lineTo(-36, -22);
  ctx.fill();
  ctx.fillStyle = charging ? "#ff2e2e" : "#1b1446";
  ctx.beginPath();
  ctx.arc(-26, -33, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (charging && dead === 0) {
    ctx.fillStyle = "rgba(200,170,120,.6)";
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(x + w + 8 + k * 12, GROUND_Y - 6 - ((now * 40 + k * 7) % 10), 5 - k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWasp(ctx: Ctx, x: number, y: number, dead: number, now: number) {
  if (dead > 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(220,240,255,.75)";
  const flap = Math.sin(now * 50) * 0.5;
  ctx.beginPath();
  ctx.ellipse(2, -WASP_R + 2, 9, 14, 0.4 + flap, 0, Math.PI * 2);
  ctx.ellipse(10, -WASP_R + 4, 7, 11, 0.9 + flap, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd21f";
  ctx.beginPath();
  ctx.ellipse(0, 0, WASP_R + 3, WASP_R - 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1446";
  for (const sx of [-2, 7]) ctx.fillRect(sx, -WASP_R + 5, 5, (WASP_R - 5) * 2);
  ctx.beginPath();
  ctx.moveTo(WASP_R + 2, -3);
  ctx.lineTo(WASP_R + 12, 0);
  ctx.lineTo(WASP_R + 2, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-WASP_R + 2, -2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(-WASP_R, -5, 3, 3);
  ctx.restore();
}

function drawStar(ctx: Ctx, x: number, y: number, now: number) {
  const g = ctx.createLinearGradient(x, y, x + 140, y - 220);
  g.addColorStop(0, "rgba(255,225,77,.9)");
  g.addColorStop(1, "rgba(255,120,200,0)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 140, y - 220);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now * 6);
  ctx.fillStyle = "#ffe14d";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 8 : 18;
    const a = (i / 10) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  ctx.restore();
}

function drawWarning(ctx: Ctx, x: number, now: number) {
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 20);
  ctx.strokeStyle = "#ff2e63";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 4, 40, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  text(ctx, "!", x, GROUND_Y - 16, 28, "#ff2e63", "center", true);
  ctx.globalAlpha = 1;
}

function drawCrater(ctx: Ctx, x: number, t: number) {
  ctx.fillStyle = "#2a1a4a";
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 2, CRATER.w / 2, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  const glow = 0.6 + 0.4 * Math.sin(t * 8);
  ctx.fillStyle = `rgba(255,140,40,${glow})`;
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y - 2, CRATER.w / 2 - 12, CRATER.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe14d";
  ctx.beginPath();
  ctx.arc(x, GROUND_Y - 6, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawHouse(ctx: Ctx, x: number) {
  if (x < -300 || x > VIEW_W + 200) return;
  // GOAL flag
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 70, GROUND_Y - 150, 5, 150);
  ctx.fillStyle = "#ff1fb4";
  ctx.beginPath();
  ctx.moveTo(x - 65, GROUND_Y - 150);
  ctx.lineTo(x - 10, GROUND_Y - 135);
  ctx.lineTo(x - 65, GROUND_Y - 120);
  ctx.fill();
  text(ctx, "GOAL!", x - 48, GROUND_Y - 130, 12, "#fff", "center");
  // dog house
  ctx.fillStyle = "#ffcf6a";
  ctx.fillRect(x, GROUND_Y - 110, 150, 110);
  ctx.fillStyle = "#e0a846";
  for (let k = 0; k < 5; k++) ctx.fillRect(x, GROUND_Y - 100 + k * 22, 150, 3);
  ctx.fillStyle = "#ff3b3b";
  ctx.beginPath();
  ctx.moveTo(x - 20, GROUND_Y - 106);
  ctx.lineTo(x + 75, GROUND_Y - 180);
  ctx.lineTo(x + 170, GROUND_Y - 106);
  ctx.fill();
  ctx.fillStyle = "#1b1446";
  ctx.beginPath();
  ctx.moveTo(x + 45, GROUND_Y);
  ctx.lineTo(x + 45, GROUND_Y - 50);
  ctx.arc(x + 75, GROUND_Y - 50, 30, Math.PI, 0);
  ctx.lineTo(x + 105, GROUND_Y);
  ctx.fill();
  roundRect(ctx, x + 40, GROUND_Y - 142, 70, 22, 6, "#fff");
  text(ctx, "HOME", x + 75, GROUND_Y - 125, 16, "#ff3b3b", "center");
}

// ------------------------------------------------------------------ HUD

function drawHud(ctx: Ctx, sim: Sim) {
  // lives
  for (let i = 0; i < sim.maxLives; i++) heart(ctx, 26 + i * 30, 30, i < sim.lives ? "#ff3b5c" : "rgba(255,255,255,.25)");
  // coins + score
  roundRect(ctx, 16, 52, 150, 32, 16, "rgba(27,20,70,.55)");
  drawCoinIcon(ctx, 34, 68);
  text(ctx, String(sim.coins), 54, 76, 20, "#ffe14d");
  const score = sim.coins * SCORE.coin + sim.stomps * SCORE.stomp;
  roundRect(ctx, 16, 90, 150, 28, 14, "rgba(27,20,70,.55)");
  text(ctx, `SCORE ${score.toLocaleString()}`, 30, 110, 15, "#fff");

  // progress
  const bx = 300;
  const bw = 360;
  roundRect(ctx, bx, 20, bw, 14, 7, "rgba(27,20,70,.55)");
  roundRect(ctx, bx, 20, Math.max(14, bw * sim.progress), 14, 7, "#ffe14d");
  sim.level.sections.forEach((s) => {
    const f = s.x0 / sim.level.goalX;
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillRect(bx + bw * f - 1, 18, 2, 18);
  });
  text(ctx, "🏠", bx + bw + 8, 34, 16, "#fff");
  const w = sim.level.world;
  text(ctx, `${w.num} · ${w.name}`, bx + bw / 2, 56, 15, "#fff", "center", true);
  text(ctx, sim.level.sections[sim.section].name, bx + bw / 2, 76, 13, "#ffe14d", "center", true);

  // who & perks
  text(ctx, sim.profile.name, VIEW_W - 20, 34, 16, "#fff", "right", true);
  sim.profile.perks.forEach((p, i) => {
    const label = PERK_INFO[p].short;
    const tw = 74;
    roundRect(ctx, VIEW_W - 20 - tw - i * (tw + 6), 44, tw, 22, 11, "#ffe14d");
    text(ctx, label, VIEW_W - 20 - tw / 2 - i * (tw + 6), 60, 12, "#1b1446", "center");
  });
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

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function heart(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.bezierCurveTo(x - 14, y - 2, x - 8, y - 14, x, y - 6);
  ctx.bezierCurveTo(x + 8, y - 14, x + 14, y - 2, x, y + 8);
  ctx.fill();
}

function drawCoinIcon(ctx: Ctx, x: number, y: number) {
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, "D", x, y + 4, 11, "#c98f00", "center");
}

function cloud(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y - 10 * s, 28 * s, 0, Math.PI * 2);
  ctx.arc(x + 56 * s, y, 22 * s, 0, Math.PI * 2);
  ctx.fill();
}

function tree(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = "#7a5230";
  ctx.fillRect(x - 6 * s, y - 70 * s, 12 * s, 70 * s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 90 * s, 34 * s, 0, Math.PI * 2);
  ctx.arc(x - 24 * s, y - 70 * s, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 24 * s, y - 72 * s, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function palm(ctx: Ctx, x: number, y: number, s: number, color: string, i: number) {
  ctx.strokeStyle = "#3a2a14";
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 14 * s, y - 70 * s, x + 4 * s, y - 140 * s);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.6 + n01(i, k) * 0.2;
    ctx.save();
    ctx.translate(x + 4 * s, y - 140 * s);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -36 * s, 10 * s, 40 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function cactusBg(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  roundRect(ctx, x - 8 * s, y - 70 * s, 16 * s, 70 * s, 8 * s, color);
  roundRect(ctx, x - 24 * s, y - 50 * s, 10 * s, 26 * s, 5 * s, color);
  roundRect(ctx, x - 24 * s, y - 30 * s, 20 * s, 8 * s, 4 * s, color);
  roundRect(ctx, x + 14 * s, y - 58 * s, 10 * s, 30 * s, 5 * s, color);
  roundRect(ctx, x + 4 * s, y - 34 * s, 20 * s, 8 * s, 4 * s, color);
}

function sign66(ctx: Ctx, x: number, y: number) {
  ctx.fillStyle = "#6b6b6b";
  ctx.fillRect(x - 3, y - 90, 6, 90);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(x - 26, y - 130);
  ctx.lineTo(x + 26, y - 130);
  ctx.lineTo(x + 22, y - 100);
  ctx.lineTo(x, y - 86);
  ctx.lineTo(x - 22, y - 100);
  ctx.fill();
  text(ctx, "66", x, y - 100, 22, "#1b1446", "center");
}

function pine(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = "#5a3a20";
  ctx.fillRect(x - 5 * s, y - 20 * s, 10 * s, 20 * s);
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = "#2f7a5a";
    ctx.beginPath();
    ctx.moveTo(x - (40 - k * 8) * s, y - (20 + k * 30) * s);
    ctx.lineTo(x, y - (70 + k * 30) * s);
    ctx.lineTo(x + (40 - k * 8) * s, y - (20 + k * 30) * s);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x - 12 * s, y - (58 + k * 30) * s);
    ctx.lineTo(x, y - (70 + k * 30) * s);
    ctx.lineTo(x + 12 * s, y - (58 + k * 30) * s);
    ctx.fill();
  }
}

function planet(ctx: Ctx, x: number, y: number, r: number, c: string, light: string, ring: boolean) {
  const g = ctx.createRadialGradient(x - r / 3, y - r / 3, r / 6, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = "rgba(255,225,77,.7)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.7, r * 0.4, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
}
