// Shaded character art: Dash (a shiba-style runner built from the NFT's traits) and the enemies.
// All lit from the upper right to match the scenery.
import type { DashProfile } from "./dash";

type Ctx = CanvasRenderingContext2D;

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** A tapered limb segment from (x,y) at angle a. Returns the end point. */
function segment(ctx: Ctx, x: number, y: number, a: number, len: number, w0: number, w1: number, fill: string | CanvasGradient) {
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + nx * w0, y + ny * w0);
  ctx.lineTo(ex + nx * w1, ey + ny * w1);
  ctx.arc(ex, ey, w1, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(x - nx * w0, y - ny * w0);
  ctx.arc(x, y, w0, a - Math.PI / 2, a + Math.PI / 2, true);
  ctx.fill();
  return [ex, ey] as const;
}

function leg(ctx: Ctx, hx: number, hy: number, a1: number, bend: number, l1: number, l2: number, w: number, col: string | CanvasGradient, paw: string) {
  const [kx, ky] = segment(ctx, hx, hy, a1, l1, w, w * 0.62, col);
  const [px, py] = segment(ctx, kx, ky, a1 + bend, l2, w * 0.6, w * 0.48, col);
  ctx.fillStyle = paw;
  ctx.beginPath();
  ctx.ellipse(px + 2, py + 1, w * 0.85, w * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

export type DashPose = { sliding?: boolean; air?: boolean; vy?: number; t: number; ended?: boolean; scale?: number; light?: string };

/** Dash, facing right, feet at (x, y). About 60 units tall at scale 1. */
export function drawDash(ctx: Ctx, p: DashProfile, x: number, y: number, o: DashPose) {
  const { base, belly, pattern } = p.skin;
  const lit = shade(base, 0.32);
  const mid = base;
  const dk = shade(base, -0.35);
  const cream = belly;
  const creamDk = shade(belly, -0.18);
  const light = o.light ?? "#fff4d0";
  const ph = o.t * 15;

  ctx.save();
  ctx.translate(x, y);
  const sc = (o.scale ?? 1) * 0.86;
  ctx.scale(sc, sc);
  if (o.sliding) {
    ctx.translate(0, 2);
    ctx.scale(1.12, 0.62);
  }
  const bob = o.air || o.sliding ? 0 : Math.sin(ph * 2) * 1.6;
  const pitch = o.air ? Math.max(-0.25, Math.min(0.25, (o.vy ?? 0) / 3000)) : Math.sin(ph) * 0.035;
  ctx.translate(0, -18 + bob);
  ctx.rotate(pitch);
  ctx.translate(0, 18);

  // ------------------------------------------------ legs (far side first, darker)
  const legPose = (front: boolean, far: boolean) => {
    const off = far ? 0.55 : 0;
    if (o.air) return front ? { a: Math.PI / 2 - 0.95, b: 0.35 } : { a: Math.PI / 2 + 0.85, b: -0.25 };
    if (o.sliding) return front ? { a: Math.PI / 2 - 1.2, b: 0.3 } : { a: Math.PI / 2 + 1.1, b: -0.2 };
    if (front) return { a: Math.PI / 2 - Math.sin(ph + off) * 0.75, b: Math.max(0, Math.cos(ph + off)) * 1.1 };
    return { a: Math.PI / 2 - Math.sin(ph + Math.PI + off) * 0.62, b: -Math.max(0, Math.cos(ph + Math.PI + off)) * 0.95 };
  };
  const farCol = shade(base, -0.45);
  {
    const f = legPose(true, true);
    leg(ctx, 14, -26, f.a, f.b, 12, 12, 5.2, farCol, creamDk);
    const b = legPose(false, true);
    leg(ctx, -18, -27, b.a, b.b, 13, 12, 6.2, farCol, creamDk);
  }

  // ------------------------------------------------ tail (shiba curl)
  const wag = Math.sin(o.t * 16) * 0.12;
  ctx.save();
  ctx.translate(-24, -36);
  ctx.rotate(wag);
  ctx.lineCap = "round";
  ctx.strokeStyle = mid;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-12, -6, -14, -24, -2, -26);
  ctx.bezierCurveTo(8, -27, 10, -16, 4, -12);
  ctx.stroke();
  ctx.strokeStyle = cream;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-3, -2);
  ctx.bezierCurveTo(-11, -8, -11, -21, -2, -22);
  ctx.stroke();
  ctx.strokeStyle = lit;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -20);
  ctx.bezierCurveTo(-4, -28, 6, -27, 7, -18);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ------------------------------------------------ torso
  const torso = new Path2D();
  torso.moveTo(20, -44);
  torso.bezierCurveTo(27, -38, 26, -27, 18, -22);
  torso.bezierCurveTo(10, -18, -4, -20, -14, -20);
  torso.bezierCurveTo(-24, -20, -30, -26, -29, -34);
  torso.bezierCurveTo(-28, -42, -20, -45, -8, -45);
  torso.bezierCurveTo(4, -46, 12, -48, 20, -44);
  const tg = ctx.createLinearGradient(0, -47, 0, -19);
  tg.addColorStop(0, lit);
  tg.addColorStop(0.45, mid);
  tg.addColorStop(1, dk);
  ctx.fillStyle = tg;
  ctx.fill(torso);
  ctx.save();
  ctx.clip(torso);
  // cream chest and belly (urajiro)
  const cg = ctx.createLinearGradient(0, -34, 0, -18);
  cg.addColorStop(0, cream);
  cg.addColorStop(1, creamDk);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(28, -40);
  ctx.bezierCurveTo(22, -30, 12, -25, -2, -24);
  ctx.bezierCurveTo(-12, -24, -18, -23, -22, -18);
  ctx.lineTo(28, -16);
  ctx.closePath();
  ctx.fill();
  if (pattern === "tiger") {
    ctx.strokeStyle = shade(base, -0.55);
    ctx.globalAlpha = 0.55;
    ctx.lineCap = "round";
    for (const sx of [-20, -12, -4, 4, 11]) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, -47);
      ctx.quadraticCurveTo(sx + 5, -38, sx + 1, -30);
      ctx.stroke();
    }
  } else if (pattern === "jaguar") {
    ctx.globalAlpha = 0.6;
    for (const [sx, sy, r] of [[-20, -38, 3], [-11, -42, 2.6], [-2, -39, 3.2], [8, -42, 2.4], [-16, -30, 2.4], [2, -31, 2.2], [13, -36, 2.6]] as const) {
      ctx.strokeStyle = shade(base, -0.6);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = shade(base, -0.25);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // fur strokes
  ctx.strokeStyle = lit;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 12; i++) {
    const fx = -24 + i * 4;
    ctx.beginPath();
    ctx.moveTo(fx, -44 + Math.sin(i) * 1.5);
    ctx.lineTo(fx - 3, -40 + Math.sin(i) * 1.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // underside occlusion
  const og = ctx.createLinearGradient(0, -26, 0, -19);
  og.addColorStop(0, "rgba(0,0,0,0)");
  og.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = og;
  ctx.fillRect(-32, -30, 64, 14);
  ctx.restore();
  // rim light along the back
  ctx.strokeStyle = light;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-22, -43.5);
  ctx.bezierCurveTo(-10, -45.5, 6, -46.5, 19, -43.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ------------------------------------------------ near legs
  {
    const nearCol = ctx.createLinearGradient(0, -30, 0, -2);
    nearCol.addColorStop(0, mid);
    nearCol.addColorStop(1, dk);
    const b = legPose(false, false);
    leg(ctx, -17, -28, b.a, b.b, 14, 13, 6.8, nearCol, cream);
    const f = legPose(true, false);
    leg(ctx, 15, -27, f.a, f.b, 12.5, 12.5, 5.8, nearCol, cream);
  }

  // ------------------------------------------------ head
  const hx = 27;
  const hy = -53;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(o.air ? -0.12 : Math.sin(ph * 2) * 0.03);
  // neck ruff
  const ng = ctx.createLinearGradient(-10, -6, -6, 14);
  ng.addColorStop(0, mid);
  ng.addColorStop(1, dk);
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.ellipse(-6, 6, 10, 12, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // ears
  const ear = (ex: number, tip: number, lean: number, back: boolean) => {
    ctx.fillStyle = back ? shade(base, -0.2) : mid;
    ctx.beginPath();
    ctx.moveTo(ex - 6, -6);
    ctx.quadraticCurveTo(ex - 5 + lean, tip + 4, ex + lean, tip);
    ctx.quadraticCurveTo(ex + 4 + lean, tip + 6, ex + 7, -5);
    ctx.fill();
    const ig = ctx.createLinearGradient(0, tip, 0, -5);
    ig.addColorStop(0, "#ffd1dc");
    ig.addColorStop(1, "#d98a9e");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.moveTo(ex - 3, -6);
    ctx.quadraticCurveTo(ex - 2 + lean, tip + 7, ex + lean, tip + 4);
    ctx.quadraticCurveTo(ex + 2 + lean, tip + 8, ex + 4, -6);
    ctx.fill();
  };
  const earFlop = o.air ? 2 : Math.sin(ph * 2) * 0.8;
  ear(-6, -21 + earFlop, -2, true);
  ear(3, -23 + earFlop, 1, false);
  // skull
  const hg = ctx.createRadialGradient(4, -7, 2, 0, 0, 16);
  hg.addColorStop(0, lit);
  hg.addColorStop(0.6, mid);
  hg.addColorStop(1, dk);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // cheeks and muzzle (cream mask)
  const mg = ctx.createLinearGradient(0, -2, 0, 12);
  mg.addColorStop(0, cream);
  mg.addColorStop(1, creamDk);
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.ellipse(4, 6, 10, 6.5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(13, 3, 9, 6, 0.08, 0, Math.PI * 2);
  ctx.fill();
  // brow dot
  ctx.fillStyle = cream;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(6, -7.5, 2.4, 1.6, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // eye
  ctx.fillStyle = "#1a0f0a";
  ctx.beginPath();
  ctx.ellipse(6.5, -3, 2.8, 3.2, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(7.6, -4.2, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // nose
  const nz = ctx.createRadialGradient(20.5, 0.5, 0.3, 21, 1.5, 3.6);
  nz.addColorStop(0, "#5a4a52");
  nz.addColorStop(1, "#0d080a");
  ctx.fillStyle = nz;
  ctx.beginPath();
  ctx.ellipse(21, 1.5, 3.6, 2.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // mouth
  ctx.strokeStyle = "#3a2420";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(20, 4.5);
  ctx.quadraticCurveTo(17, 8.5, 12, 7.2);
  ctx.stroke();
  if (o.ended || o.air) {
    const tgg = ctx.createLinearGradient(0, 7, 0, 14);
    tgg.addColorStop(0, "#ff7a8a");
    tgg.addColorStop(1, "#d8405a");
    ctx.fillStyle = tgg;
    ctx.beginPath();
    ctx.ellipse(14, 10, 3, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // head rim light
  ctx.strokeStyle = light;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, 12.8, -1.5, -0.2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawAccessory(ctx, p);
  ctx.restore();

  ctx.restore();
}

function drawAccessory(ctx: Ctx, p: DashProfile) {
  const c = p.accessoryColor;
  const glossy = (x: number, y: number, w: number, h: number, r: number, col: string) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(col, 0.35));
    g.addColorStop(1, shade(col, -0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  switch (p.accessory) {
    case "headphones":
      ctx.strokeStyle = "#20182e";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(-1, 0, 15, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      glossy(-16, -4, 8, 12, 4, c);
      break;
    case "halo": {
      const g = ctx.createLinearGradient(-12, -24, 12, -20);
      g.addColorStop(0, "#fff6b0");
      g.addColorStop(0.5, "#ffd23f");
      g.addColorStop(1, "#c98f00");
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(255,225,77,.8)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(-1, -24, 12, 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case "mohawk":
      for (let k = 0; k < 5; k++) {
        const g = ctx.createLinearGradient(0, -24, 0, -10);
        g.addColorStop(0, shade(c, 0.3));
        g.addColorStop(1, shade(c, -0.3));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-9 + k * 4.2, -10);
        ctx.lineTo(-8 + k * 4.2 - 2, -24 + (k % 2) * 3);
        ctx.lineTo(-5 + k * 4.2, -11);
        ctx.fill();
      }
      break;
    case "cap": {
      const g = ctx.createLinearGradient(0, -16, 0, -2);
      g.addColorStop(0, shade(c, 0.3));
      g.addColorStop(1, shade(c, -0.35));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -3, 13.5, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      glossy(4, -6, 19, 4, 2, c);
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 8px "Lilita One", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("D", -1, -8);
      break;
    }
    case "ribbon": {
      ctx.save();
      ctx.translate(-9, -11);
      const g = ctx.createLinearGradient(-8, -6, 8, 6);
      g.addColorStop(0, shade(c, 0.35));
      g.addColorStop(1, shade(c, -0.3));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-9, -9, -10, 1);
      ctx.quadraticCurveTo(-6, 5, 0, 0);
      ctx.quadraticCurveTo(6, -9, 9, 1);
      ctx.quadraticCurveTo(6, 6, 0, 0);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "crown": {
      const g = ctx.createLinearGradient(0, -26, 0, -10);
      g.addColorStop(0, "#fff3a0");
      g.addColorStop(0.5, "#ffc72c");
      g.addColorStop(1, "#a86f00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(-11, -22);
      ctx.lineTo(-5, -15);
      ctx.lineTo(0, -25);
      ctx.lineTo(5, -15);
      ctx.lineTo(11, -22);
      ctx.lineTo(10, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff3b5c";
      ctx.beginPath();
      ctx.arc(0, -13, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

// ------------------------------------------------------------------ enemies

export function drawChicken(ctx: Ctx, x: number, y: number, t: number, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (squash) ctx.scale(1 + squash * 0.3, 1 - squash * 0.65);
  const step = Math.sin(t * 16);
  const bobY = Math.abs(step) * -1.5;
  // legs
  ctx.strokeStyle = "#e0901f";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  for (const [lx, s] of [[-4, step], [5, -step]] as const) {
    ctx.beginPath();
    ctx.moveTo(lx, -13);
    ctx.lineTo(lx + s * 4, -1);
    ctx.lineTo(lx + s * 4 - 5, 0);
    ctx.moveTo(lx + s * 4, -1);
    ctx.lineTo(lx + s * 4 + 3, 0);
    ctx.stroke();
  }
  ctx.translate(0, bobY);
  // tail feathers
  for (let i = 0; i < 4; i++) {
    const g = ctx.createLinearGradient(12, -40, 24, -22);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#bdb6aa");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(16 + i * 2, -32 + i * 3, 4, 11, 0.6 + i * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  // body
  const bg = ctx.createRadialGradient(-2, -32, 2, 2, -24, 21);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.7, "#ece7de");
  bg.addColorStop(1, "#b9b0a2");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(2, -23, 18, 13.5, -0.12, 0, Math.PI * 2);
  ctx.fill();
  // wing with feather rows
  const wg = ctx.createLinearGradient(0, -30, 0, -14);
  wg.addColorStop(0, "#f3efe8");
  wg.addColorStop(1, "#bfb6a6");
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.ellipse(6, -23, 11, 7, -0.25 + step * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,110,95,.45)";
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(10 + k * 2, -22, 6 - k * 1.5, 0.3, 2.2);
    ctx.stroke();
  }
  // neck + head
  ctx.fillStyle = "#f8f5f0";
  ctx.beginPath();
  ctx.ellipse(-11, -33, 7, 10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  const hg = ctx.createRadialGradient(-11, -41, 1, -12, -38, 9);
  hg.addColorStop(0, "#ffffff");
  hg.addColorStop(1, "#d8d1c4");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(-12, -39, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // comb + wattle
  const cg = ctx.createLinearGradient(0, -50, 0, -44);
  cg.addColorStop(0, "#ff5a4a");
  cg.addColorStop(1, "#b8141e");
  ctx.fillStyle = cg;
  for (const [cx, cy, r] of [[-16, -46, 3], [-12, -48, 3.4], [-8, -46.5, 3]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(-17, -33.5, 2.2, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // beak
  const kg = ctx.createLinearGradient(-24, -40, -18, -36);
  kg.addColorStop(0, "#ffd46a");
  kg.addColorStop(1, "#d98a10");
  ctx.fillStyle = kg;
  ctx.beginPath();
  ctx.moveTo(-18, -41);
  ctx.lineTo(-25, -38.5);
  ctx.lineTo(-18, -36.5);
  ctx.fill();
  // eye
  ctx.fillStyle = "#2a1408";
  ctx.beginPath();
  ctx.arc(-14.5, -41, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(-14.4, -42, 0.9, 0.9);
  ctx.restore();
}

export function drawBoar(ctx: Ctx, x: number, y: number, t: number, charging: boolean, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (squash) ctx.scale(1 + squash * 0.3, 1 - squash * 0.65);
  const st = charging ? Math.sin(t * 26) : Math.sin(t * 4) * 0.2;
  // legs with hooves
  const legC = "#3a2414";
  for (const [lx, s] of [[-20, st], [-10, -st], [12, -st], [22, st]] as const) {
    const a = Math.PI / 2 + s * 0.5;
    const ex = lx + Math.cos(a) * 14;
    ctx.strokeStyle = legC;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lx, -14);
    ctx.lineTo(ex, -2);
    ctx.stroke();
    ctx.fillStyle = "#1a0f08";
    ctx.beginPath();
    ctx.ellipse(ex, -1, 3.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // body
  const bg = ctx.createRadialGradient(0, -38, 4, 4, -26, 36);
  bg.addColorStop(0, "#8a5f3e");
  bg.addColorStop(0.6, "#5a3a22");
  bg.addColorStop(1, "#2a180c");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(5, -26, 31, 18, 0.04, 0, Math.PI * 2);
  ctx.fill();
  // bristly mane
  ctx.strokeStyle = "#1f120a";
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 34; i++) {
    const bx = -22 + i * 1.4;
    const by = -42 + Math.abs(i - 14) * 0.18;
    ctx.beginPath();
    ctx.moveTo(bx, by + 3);
    ctx.lineTo(bx + 2 + Math.sin(i * 3) * 1.5, by - 5 - (i % 3) * 1.5);
    ctx.stroke();
  }
  // fur texture
  ctx.strokeStyle = "rgba(150,110,70,.35)";
  for (let i = 0; i < 20; i++) {
    const fx = -18 + (i * 37) % 44;
    const fy = -34 + ((i * 17) % 16);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 4, fy + 2);
    ctx.stroke();
  }
  // tail
  ctx.strokeStyle = "#2a180c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(35, -30);
  ctx.quadraticCurveTo(42, -34, 39, -24);
  ctx.stroke();
  // head
  const hg = ctx.createRadialGradient(-26, -36, 2, -27, -29, 17);
  hg.addColorStop(0, "#7a5034");
  hg.addColorStop(1, "#2e1a0c");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-14, -42);
  ctx.quadraticCurveTo(-36, -44, -42, -30);
  ctx.quadraticCurveTo(-42, -18, -26, -16);
  ctx.quadraticCurveTo(-14, -18, -12, -30);
  ctx.fill();
  // ear
  ctx.fillStyle = "#3a2414";
  ctx.beginPath();
  ctx.moveTo(-20, -40);
  ctx.lineTo(-16, -50);
  ctx.lineTo(-13, -38);
  ctx.fill();
  // snout disc
  const sg = ctx.createRadialGradient(-43, -27, 1, -42, -25, 7);
  sg.addColorStop(0, "#f2b8b0");
  sg.addColorStop(1, "#a8645c");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(-43, -25, 4.6, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a2420";
  ctx.beginPath();
  ctx.ellipse(-44, -27, 1, 1.6, 0, 0, Math.PI * 2);
  ctx.ellipse(-44, -22.5, 1, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // tusk
  const tg = ctx.createLinearGradient(-40, -22, -34, -34);
  tg.addColorStop(0, "#fffbea");
  tg.addColorStop(1, "#c8b88a");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-36, -20);
  ctx.quadraticCurveTo(-45, -26, -42, -36);
  ctx.quadraticCurveTo(-41, -27, -33, -22);
  ctx.fill();
  // eye
  ctx.fillStyle = charging ? "#ff3020" : "#140a05";
  if (charging) {
    ctx.shadowColor = "#ff3020";
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(-29, -34, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawWasp(ctx: Ctx, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 3) * 0.06);
  // legs
  ctx.strokeStyle = "#1a1408";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-6 + i * 5, 6);
    ctx.quadraticCurveTo(-7 + i * 5, 12, -4 + i * 6, 15 + Math.sin(t * 8 + i) * 1.5);
    ctx.stroke();
  }
  // abdomen with bands
  const ag = ctx.createLinearGradient(-2, 0, 24, 0);
  const bands = ["#ffd21f", "#1a1408", "#ffd21f", "#1a1408", "#ffd21f", "#1a1408"];
  bands.forEach((c, i) => {
    ag.addColorStop(i / bands.length, c);
    ag.addColorStop((i + 1) / bands.length - 0.001, c);
  });
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.ellipse(9, 2, 14, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // abdomen shading + gloss
  const sh = ctx.createLinearGradient(0, -8, 0, 11);
  sh.addColorStop(0, "rgba(255,255,255,.35)");
  sh.addColorStop(0.4, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(0,0,0,.4)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(9, 2, 14, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // stinger
  ctx.fillStyle = "#1a1408";
  ctx.beginPath();
  ctx.moveTo(22, 4);
  ctx.lineTo(30, 7);
  ctx.lineTo(21, 8);
  ctx.fill();
  // thorax + head
  const th = ctx.createRadialGradient(-8, -3, 1, -7, 0, 8);
  th.addColorStop(0, "#5a4a1a");
  th.addColorStop(1, "#1a1408");
  ctx.fillStyle = th;
  ctx.beginPath();
  ctx.ellipse(-7, 0, 7.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd21f";
  ctx.beginPath();
  ctx.arc(-16, -1, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a0f08";
  ctx.beginPath();
  ctx.ellipse(-18, -2, 3, 3.8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillRect(-19, -4, 1.2, 1.2);
  // antennae
  ctx.strokeStyle = "#1a1408";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-18, -5);
  ctx.quadraticCurveTo(-22, -12, -26, -12);
  ctx.moveTo(-16, -6);
  ctx.quadraticCurveTo(-18, -14, -21, -15);
  ctx.stroke();
  // wings: translucent, blurred by the beat
  ctx.globalCompositeOperation = "lighter";
  const flap = Math.sin(t * 60);
  for (let k = 0; k < 2; k++) {
    const a = -0.9 + flap * 0.45 + k * 0.35;
    ctx.save();
    ctx.translate(-5, -5);
    ctx.rotate(a);
    const wg = ctx.createLinearGradient(0, 0, 0, -20);
    wg.addColorStop(0, "rgba(200,230,255,.45)");
    wg.addColorStop(1, "rgba(200,230,255,.08)");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.ellipse(0, -11, 5.5 - k, 12 - k * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

export function drawShootingStar(ctx: Ctx, x: number, y: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const tail = ctx.createLinearGradient(x, y, x + 200, y - 300);
  tail.addColorStop(0, "rgba(255,230,140,.85)");
  tail.addColorStop(0.3, "rgba(255,140,200,.35)");
  tail.addColorStop(1, "rgba(120,140,255,0)");
  ctx.strokeStyle = tail;
  ctx.lineCap = "round";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 200, y - 300);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,.6)";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 110, y - 165);
  ctx.stroke();
  const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,230,140,.9)");
  g.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(t * 5);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 4 : 13;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  ctx.restore();
}
