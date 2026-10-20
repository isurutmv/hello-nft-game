// Shaded, procedurally animated characters: Dash (a shiba-style runner built from the NFT's
// traits) and the enemies. Locomotion uses planted-foot gaits and two-bone IK (motion.ts), so
// feet stay put on the ground and joints bend the way the real animals' do.
// Everything is lit from the upper right to match the scenery.
import type { DashProfile } from "./dash";
import { BOAR_GALLOP, CHICKEN_WALK, DOG_GALLOP, clamp, footAt, ik2, lerp, type Vec } from "./motion";

type Ctx = CanvasRenderingContext2D;

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const TAU = Math.PI * 2;

/** A tapered capsule between two points. */
function bone(ctx: Ctx, a: Vec, b: Vec, w0: number, w1: number, fill: string | CanvasGradient) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * w0, a.y + ny * w0);
  ctx.lineTo(b.x + nx * w1, b.y + ny * w1);
  ctx.arc(b.x, b.y, w1, ang + Math.PI / 2, ang - Math.PI / 2, true);
  ctx.lineTo(a.x - nx * w0, a.y - ny * w0);
  ctx.arc(a.x, a.y, w0, ang - Math.PI / 2, ang + Math.PI / 2, true);
  ctx.fill();
}

// ------------------------------------------------------------------ Dash

export type DashPose = {
  /** Seconds, for secondary motion (blinks, tail, breathing). */
  t: number;
  /** World distance travelled; drives the gallop so paws stay planted. Defaults to t * 380. */
  dist?: number;
  /** 0..1 blend into the jump pose (a boolean is accepted too). */
  air?: number | boolean;
  /** 0..1 blend into the slide. */
  slide?: number;
  /** @deprecated use slide */
  sliding?: boolean;
  vy?: number;
  /** 0..1 landing compression. */
  land?: number;
  ended?: boolean;
  scale?: number;
  light?: string;
};

/** World units per Dash drawing unit (at scale 1). */
const DASH_SCALE = 0.86;
const C = { x: 0, y: -33 }; // torso pivot
const SHOULDER = { x: 14, y: -29 };
const HIP = { x: -17, y: -30 };

/** Dash, facing right, feet at (x, y). About 60 units tall at scale 1. */
export function drawDash(ctx: Ctx, p: DashProfile, x: number, y: number, o: DashPose) {
  const { base, belly, pattern } = p.skin;
  const lit = shade(base, 0.32);
  const mid = base;
  const dk = shade(base, -0.35);
  const farCol = shade(base, -0.42);
  const cream = belly;
  const creamDk = shade(belly, -0.18);
  const light = o.light ?? "#fff4d0";

  const airAmt = typeof o.air === "boolean" ? (o.air ? 1 : 0) : (o.air ?? 0);
  const slideAmt = o.slide ?? (o.sliding ? 1 : 0);
  const runAmt = (1 - airAmt) * (1 - slideAmt);
  const vy = o.vy ?? 0;
  const land = o.land ?? 0;
  const dist = o.dist ?? o.t * 380;
  const ph = dist / DOG_GALLOP.stride; // gait cycles

  // ---- body motion: spine flex, bounce and pitch through the stride
  const cyc = ph * TAU;
  const gFlex = Math.cos(cyc - 0.04 * TAU); // +1 gathered, -1 extended
  const gBounce = 2.4 * Math.cos(cyc - 0.88 * TAU); // highest in the suspension
  const gPitch = 0.06 * Math.sin(cyc - 0.2 * TAU);
  const rising = clamp((200 - vy) / 600, 0, 1); // 1 while rising, 0 while falling fast
  const aFlex = lerp(0.6, -0.8, rising);
  const aPitch = clamp(vy / 2600, -0.28, 0.28);
  const flex = lerp(lerp(gFlex, aFlex, airAmt), -0.7, slideAmt) * (1 - land) + land * 0.9;
  const bounce = gBounce * runAmt;
  const pitch = lerp(lerp(gPitch, aPitch, airAmt), 0.03, slideAmt);
  const drop = slideAmt * 12 + land * 4;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  /** Body-space point to drawing space: spine flex, pitch around the torso pivot, bounce. */
  const bodyPt = (q: Vec, flexScale = 1): Vec => {
    const fx = q.x + (q.x > 0 ? -1 : 1) * flex * 2.6 * flexScale * Math.min(1, Math.abs(q.x) / 14);
    const dx = fx - C.x;
    const dy = q.y - C.y;
    return { x: C.x + dx * cosP - dy * sinP, y: C.y + dx * sinP + dy * cosP - bounce + drop };
  };
  const shoulder = bodyPt(SHOULDER);
  const hip = bodyPt(HIP);

  // ---- leg targets
  type Leg = { anchor: Vec; foot: Vec; fold: number; fore: boolean; far: boolean };
  const legs: Leg[] = [0, 1, 2, 3].map((i) => {
    const fore = i >= 2;
    const far = i === 1 || i === 2;
    const anchor = fore ? shoulder : hip;
    const nominal = fore ? SHOULDER : HIP;
    const f = footAt(DOG_GALLOP, i, ph);
    // the far legs sit slightly behind the near ones in depth
    const gait = { x: nominal.x + f.x + (far ? -1.5 : 0), y: f.y };
    // jump: fore legs reach forward on take-off and down to land; hinds kick back then tuck
    const air = fore
      ? { x: anchor.x + lerp(10, 17, rising), y: anchor.y + lerp(29, 24, rising) }
      : { x: anchor.x + lerp(4, -20, rising), y: anchor.y + lerp(25, 21, rising) };
    // slide: belly down, fore paws stretched forward, hinds stretched back
    const slide = fore ? { x: SHOULDER.x + 19, y: 0 } : { x: HIP.x - 21, y: 0 };
    let foot = { x: lerp(gait.x, air.x, airAmt), y: lerp(gait.y, air.y, airAmt) };
    foot = { x: lerp(foot.x, slide.x, slideAmt), y: lerp(foot.y, slide.y, slideAmt) };
    // fold: how bent the wrist (fore) or hock (hind) is. Peaks early in the swing.
    const swing = f.stance ? 0 : Math.sin(Math.PI * clamp(f.s / 0.75, 0, 1));
    const push = f.stance ? clamp((f.s - 0.6) / 0.4, 0, 1) : 0;
    let fold = fore ? swing * 1.9 - 0.3 : swing * 1.25 - 0.35 - push * 0.35;
    fold = lerp(fold, fore ? lerp(0.1, 0.9, rising) : lerp(0.2, 0.7, rising), airAmt);
    fold = lerp(fold, fore ? -1.25 : 1.2, slideAmt);
    return { anchor, foot, fold, fore, far };
  });

  /** A muscle mass (haunch or shoulder) that rotates with the upper bone, blending leg into body. */
  const muscle = (at: Vec, to: Vec, rx: number, ry: number, fill: string | CanvasGradient) => {
    const a = Math.atan2(to.y - at.y, to.x - at.x) - Math.PI / 2;
    ctx.save();
    ctx.translate(lerp(at.x, to.x, 0.32), lerp(at.y, to.y, 0.32));
    ctx.rotate(a);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  const drawLeg = (L: Leg, col: string | CanvasGradient, paw: string, w: number, mass?: string | CanvasGradient) => {
    if (L.fore) {
      // shoulder -> elbow -> wrist (two-bone IK, elbow behind), wrist -> paw (pastern)
      const wrist = { x: L.foot.x + Math.sin(L.fold) * 5, y: L.foot.y - 3 - Math.cos(L.fold) * 5 };
      const { joint: elbow, end } = ik2(L.anchor, wrist, 13, 12.5, 1);
      if (mass) muscle(L.anchor, elbow, w * 1.35, w * 2.1, mass);
      bone(ctx, L.anchor, elbow, w * 1.15, w * 0.8, col);
      bone(ctx, elbow, end, w * 0.78, w * 0.55, col);
      bone(ctx, end, { x: L.foot.x, y: L.foot.y - 3 }, w * 0.55, w * 0.5, col);
      ctx.fillStyle = paw;
      ctx.beginPath();
      ctx.ellipse(L.foot.x + 1.5, L.foot.y - 2, w * 0.9, w * 0.55, 0, 0, TAU);
      ctx.fill();
    } else {
      // hip -> stifle -> hock (two-bone IK, stifle forward), hock -> paw (metatarsus)
      const hock = { x: L.foot.x + Math.sin(L.fold) * 9, y: L.foot.y - 3 - Math.cos(L.fold) * 9 };
      const { joint: stifle, end } = ik2(L.anchor, hock, 13.5, 12.5, -1);
      if (mass) muscle(L.anchor, stifle, w * 1.75, w * 2.4, mass);
      bone(ctx, L.anchor, stifle, w * 1.5, w * 0.9, col);
      bone(ctx, stifle, end, w * 0.85, w * 0.55, col);
      bone(ctx, end, { x: L.foot.x, y: L.foot.y - 3 }, w * 0.55, w * 0.48, col);
      ctx.fillStyle = paw;
      ctx.beginPath();
      ctx.ellipse(L.foot.x + 1.5, L.foot.y - 2, w * 0.9, w * 0.55, 0, 0, TAU);
      ctx.fill();
    }
  };

  ctx.save();
  ctx.translate(x, y);
  const sc = (o.scale ?? 1) * DASH_SCALE;
  ctx.scale(sc, sc);

  // far legs first
  drawLeg(legs[1], farCol, creamDk, 4.6);
  drawLeg(legs[2], farCol, creamDk, 4.2);

  // ---- tail: a curled shiba tail that bobs a beat behind the body
  {
    const tb = bodyPt({ x: -24, y: -37 });
    const lag = Math.sin(cyc - 0.35 * TAU) * 0.12 * runAmt + airAmt * (rising ? 0.25 : -0.1) + slideAmt * 0.35 + Math.sin(o.t * 9) * 0.05;
    ctx.save();
    ctx.translate(tb.x, tb.y);
    ctx.rotate(pitch + lag);
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
  }

  // ---- torso, deformed by the spine flex (back arches when gathered)
  const arch = (q: Vec): Vec => bodyPt({ x: q.x, y: q.y - (q.y < -38 ? flex * 1.8 * (1 - (q.x / 30) ** 2) : 0) });
  const P = (px: number, py: number) => arch({ x: px, y: py });
  const torso = new Path2D();
  let q = P(20, -44);
  torso.moveTo(q.x, q.y);
  const curve = (a: [number, number], b: [number, number], c: [number, number]) => {
    const A = P(...a);
    const B = P(...b);
    const D = P(...c);
    torso.bezierCurveTo(A.x, A.y, B.x, B.y, D.x, D.y);
  };
  curve([27, -38], [26, -27], [18, -22]);
  curve([10, -18], [-4, -20], [-14, -20]);
  curve([-24, -20], [-30, -26], [-29, -34]);
  curve([-28, -42], [-20, -45], [-8, -45]);
  curve([4, -46], [12, -48], [20, -44]);
  const top = bodyPt({ x: 0, y: -47 });
  const bottom = bodyPt({ x: 0, y: -19 });
  const tg = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
  tg.addColorStop(0, lit);
  tg.addColorStop(0.45, mid);
  tg.addColorStop(1, dk);
  ctx.fillStyle = tg;
  ctx.fill(torso);
  ctx.save();
  ctx.clip(torso);
  // cream chest and belly (urajiro)
  const cg = ctx.createLinearGradient(0, bodyPt({ x: 0, y: -34 }).y, 0, bottom.y);
  cg.addColorStop(0, cream);
  cg.addColorStop(1, creamDk);
  ctx.fillStyle = cg;
  ctx.beginPath();
  q = P(28, -40);
  ctx.moveTo(q.x, q.y);
  for (const [a, b, c] of [
    [[22, -30], [12, -25], [-2, -24]],
    [[-12, -24], [-18, -23], [-22, -18]],
  ] as [number, number][][]) {
    const A = P(...a);
    const B = P(...b);
    const D = P(...c);
    ctx.bezierCurveTo(A.x, A.y, B.x, B.y, D.x, D.y);
  }
  q = P(28, -14);
  ctx.lineTo(q.x, q.y);
  ctx.closePath();
  ctx.fill();
  if (pattern === "tiger") {
    ctx.strokeStyle = shade(base, -0.55);
    ctx.globalAlpha = 0.55;
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    for (const sx of [-20, -12, -4, 4, 11]) {
      const a = P(sx, -47);
      const b = P(sx + 5, -38);
      const c = P(sx + 1, -30);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(b.x, b.y, c.x, c.y);
      ctx.stroke();
    }
  } else if (pattern === "jaguar") {
    ctx.globalAlpha = 0.6;
    for (const [sx, sy, r] of [[-20, -38, 3], [-11, -42, 2.6], [-2, -39, 3.2], [8, -42, 2.4], [-16, -30, 2.4], [2, -31, 2.2], [13, -36, 2.6]] as const) {
      const c = P(sx, sy);
      ctx.strokeStyle = shade(base, -0.6);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = shade(base, -0.25);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // fur strokes and underside occlusion
  ctx.strokeStyle = lit;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 12; i++) {
    const a = P(-24 + i * 4, -44 + Math.sin(i) * 1.5);
    const b = P(-27 + i * 4, -40 + Math.sin(i) * 1.5);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const og = ctx.createLinearGradient(0, bodyPt({ x: 0, y: -26 }).y, 0, bottom.y);
  og.addColorStop(0, "rgba(0,0,0,0)");
  og.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = og;
  ctx.fillRect(-40, -60, 80, 70);
  ctx.restore();
  // rim light along the back
  {
    const a = P(-22, -43.5);
    const b = P(-10, -45.5);
    const c = P(6, -46.5);
    const d = P(19, -43.5);
    ctx.strokeStyle = light;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // near legs
  {
    const nearCol = ctx.createLinearGradient(0, hip.y - 4, 0, 0);
    nearCol.addColorStop(0, mid);
    nearCol.addColorStop(1, dk);
    const massCol = ctx.createLinearGradient(0, hip.y - 10, 0, hip.y + 12);
    massCol.addColorStop(0, lit);
    massCol.addColorStop(0.5, mid);
    massCol.addColorStop(1, dk);
    drawLeg(legs[0], nearCol, cream, 5.4, massCol);
    drawLeg(legs[3], nearCol, cream, 4.9, massCol);
  }

  // ---- neck and head. The head is stabilised: it cancels most of the body's bounce,
  // like a running dog keeps its eyes level.
  const neck = bodyPt({ x: 16, y: -41 });
  const head: Vec = {
    x: neck.x + 11 + slideAmt * 5,
    y: neck.y - 12 + bounce * 0.55 + slideAmt * 5 - airAmt * (rising ? 2 : -1),
  };
  {
    const ng = ctx.createLinearGradient(neck.x, neck.y - 10, neck.x, neck.y + 8);
    ng.addColorStop(0, lit);
    ng.addColorStop(1, dk);
    bone(ctx, neck, { x: head.x - 4, y: head.y + 3 }, 9.5, 8, ng);
  }
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(-pitch * 0.5 + (airAmt * (rising ? -0.12 : 0.08)) + slideAmt * 0.12);
  const earLag = clamp(0.18 * runAmt + 0.1 * Math.sin(cyc - 0.15 * TAU) * runAmt + airAmt * (rising ? 0.35 : -0.15) + slideAmt * 0.4, -0.3, 0.6);
  const ear = (ex: number, tipH: number, back: boolean) => {
    ctx.save();
    ctx.translate(ex, -6);
    ctx.rotate(-earLag * (back ? 1.15 : 1));
    ctx.fillStyle = back ? shade(base, -0.2) : mid;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(-5, tipH + 4, 0, tipH);
    ctx.quadraticCurveTo(4, tipH + 6, 7, 1);
    ctx.fill();
    const ig = ctx.createLinearGradient(0, tipH, 0, 0);
    ig.addColorStop(0, "#ffd1dc");
    ig.addColorStop(1, "#d98a9e");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.quadraticCurveTo(-2, tipH + 7, 0, tipH + 4);
    ctx.quadraticCurveTo(2, tipH + 8, 4, 0);
    ctx.fill();
    ctx.restore();
  };
  ear(-7, -15, true);
  ear(2, -17, false);
  // skull
  const hg = ctx.createRadialGradient(4, -7, 2, 0, 0, 16);
  hg.addColorStop(0, lit);
  hg.addColorStop(0.6, mid);
  hg.addColorStop(1, dk);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13.5, 12.5, 0, 0, TAU);
  ctx.fill();
  // cheeks and muzzle; the jaw drops a little while panting
  const pant = runAmt > 0.5 ? 0.5 + 0.5 * Math.sin(cyc * 2) : 0;
  const jaw = o.ended || airAmt > 0.5 ? 1 : pant * 0.6;
  const mg = ctx.createLinearGradient(0, -2, 0, 12);
  mg.addColorStop(0, cream);
  mg.addColorStop(1, creamDk);
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.ellipse(4, 6, 10, 6.5, 0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(13, 3, 9, 6, 0.08, 0, TAU);
  ctx.fill();
  if (jaw > 0.05) {
    ctx.fillStyle = "#5a2a2a";
    ctx.beginPath();
    ctx.ellipse(14, 6.5 + jaw * 1.5, 6, 1.5 + jaw * 2, 0.15, 0, TAU);
    ctx.fill();
    const tgg = ctx.createLinearGradient(0, 7, 0, 14);
    tgg.addColorStop(0, "#ff7a8a");
    tgg.addColorStop(1, "#d8405a");
    ctx.fillStyle = tgg;
    ctx.beginPath();
    ctx.ellipse(13.5, 8.5 + jaw * 2.5, 3, 2.5 + jaw * 2, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.ellipse(12, 8 + jaw * 3.2, 7, 2.6, 0.1, 0, TAU);
    ctx.fill();
  }
  // brow dot
  ctx.fillStyle = cream;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(6, -7.5, 2.4, 1.6, -0.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // eye, with an occasional blink
  const blink = (o.t % 3.7) < 0.12;
  ctx.fillStyle = "#1a0f0a";
  ctx.beginPath();
  ctx.ellipse(6.5, -3, 2.8, blink ? 0.6 : 3.2, -0.15, 0, TAU);
  ctx.fill();
  if (!blink) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7.6, -4.2, 1.1, 0, TAU);
    ctx.fill();
  }
  // nose
  const nz = ctx.createRadialGradient(20.5, 0.5, 0.3, 21, 1.5, 3.6);
  nz.addColorStop(0, "#5a4a52");
  nz.addColorStop(1, "#0d080a");
  ctx.fillStyle = nz;
  ctx.beginPath();
  ctx.ellipse(21, 1.5, 3.6, 2.7, 0, 0, TAU);
  ctx.fill();
  if (jaw <= 0.05) {
    ctx.strokeStyle = "#3a2420";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(20, 4.5);
    ctx.quadraticCurveTo(17, 8.5, 12, 7.2);
    ctx.stroke();
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
// Enemies are drawn facing right and mirrored, since they all face Dash (left).

/**
 * Chicken walking left. `dist` is the distance walked (world units) so steps stay planted.
 * Signature head-bob: the head holds still in the world while the body walks under it, then
 * thrusts forward.
 */
export function drawChicken(ctx: Ctx, x: number, y: number, t: number, squash = 0, dist = t * 60) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  if (squash) ctx.scale(1 + squash * 0.3, 1 - squash * 0.65);
  const ph = dist / CHICKEN_WALK.stride;
  const step = (((ph * 2) % 1) + 1) % 1; // two steps per cycle
  const hold = 0.65;
  const travel = (CHICKEN_WALK.stride / 2) * hold;
  const headOff = step < hold ? travel / 2 - (step / hold) * travel : -travel / 2 + ((step - hold) / (1 - hold)) * travel;
  const bob = -Math.sin(Math.PI * step) * 1.4;
  const tilt = Math.sin(TAU * step) * 0.04;

  // legs: backward-bending ankles (bird legs), toes splay when planted
  const hipY = -15 + bob;
  for (const [i, far] of [[1, true], [0, false]] as const) {
    const f = footAt(CHICKEN_WALK, i, ph);
    const foot = { x: f.x + (far ? 2 : 0), y: f.y };
    const hip = { x: 1 + (far ? 1 : 0), y: hipY };
    const { joint } = ik2(hip, { x: foot.x, y: foot.y - 1 }, 8.5, 8.5, 1);
    ctx.strokeStyle = far ? "#b86f12" : "#e0901f";
    ctx.lineWidth = far ? 2.2 : 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(joint.x, joint.y);
    ctx.lineTo(foot.x, foot.y - 1);
    ctx.stroke();
    // toes: three forward, one back; curled up in the air
    const curl = f.stance ? 0 : 0.8;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const a of [-0.35, 0, 0.35]) {
      ctx.moveTo(foot.x, foot.y - 1);
      ctx.lineTo(foot.x + Math.cos(a + curl) * 5, foot.y - 1 + Math.sin(a + curl) * 2 - curl * 3);
    }
    ctx.moveTo(foot.x, foot.y - 1);
    ctx.lineTo(foot.x - 3, foot.y - 0.5 - curl * 2);
    ctx.stroke();
  }

  ctx.translate(0, bob);
  ctx.rotate(tilt);
  // tail feathers, flicking with the steps
  for (let i = 0; i < 4; i++) {
    const g = ctx.createLinearGradient(-12, -40, -24, -22);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#bdb6aa");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-16 - i * 2, -32 + i * 3, 4, 11, -0.6 - i * 0.15 - Math.sin(TAU * step) * 0.08, 0, TAU);
    ctx.fill();
  }
  // body
  const bg = ctx.createRadialGradient(2, -32, 2, -2, -24, 21);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.7, "#ece7de");
  bg.addColorStop(1, "#b9b0a2");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(-2, -23, 18, 13.5, 0.12, 0, TAU);
  ctx.fill();
  // folded wing
  const wg = ctx.createLinearGradient(0, -30, 0, -14);
  wg.addColorStop(0, "#f3efe8");
  wg.addColorStop(1, "#bfb6a6");
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.ellipse(-6, -23, 11, 7, 0.25, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,110,95,.45)";
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(-10 - k * 2, -22, 6 - k * 1.5, Math.PI - 2.2, Math.PI - 0.3);
    ctx.stroke();
  }
  // neck stretches to wherever the bobbing head is
  const hx = 12 + headOff;
  const hy = -39;
  ctx.fillStyle = "#f8f5f0";
  ctx.beginPath();
  ctx.moveTo(4, -30);
  ctx.quadraticCurveTo(hx - 6, hy + 2, hx - 4, hy - 4);
  ctx.lineTo(hx + 4, hy + 2);
  ctx.quadraticCurveTo(hx - 2, hy + 8, 12, -20);
  ctx.closePath();
  ctx.fill();
  const hg = ctx.createRadialGradient(hx - 1, hy - 2, 1, hx, hy, 9);
  hg.addColorStop(0, "#ffffff");
  hg.addColorStop(1, "#d8d1c4");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(hx, hy, 7.5, 0, TAU);
  ctx.fill();
  // comb + wattle (the wattle swings with the head thrust)
  const cg = ctx.createLinearGradient(0, hy - 11, 0, hy - 5);
  cg.addColorStop(0, "#ff5a4a");
  cg.addColorStop(1, "#b8141e");
  ctx.fillStyle = cg;
  for (const [cx, cy, r] of [[-4, -7, 3], [0, -9, 3.4], [4, -7.5, 3]] as const) {
    ctx.beginPath();
    ctx.arc(hx + cx, hy + cy, r, 0, TAU);
    ctx.fill();
  }
  const sw = step >= hold ? -0.35 : 0.1;
  ctx.beginPath();
  ctx.ellipse(hx + 5 + sw * 3, hy + 6, 2.2, 3.4, sw, 0, TAU);
  ctx.fill();
  // beak
  const kg = ctx.createLinearGradient(hx + 6, hy - 1, hx + 13, hy + 2);
  kg.addColorStop(0, "#ffd46a");
  kg.addColorStop(1, "#d98a10");
  ctx.fillStyle = kg;
  ctx.beginPath();
  ctx.moveTo(hx + 6, hy - 2);
  ctx.lineTo(hx + 13, hy + 0.5);
  ctx.lineTo(hx + 6, hy + 2.5);
  ctx.fill();
  // eye
  ctx.fillStyle = "#2a1408";
  ctx.beginPath();
  ctx.arc(hx + 2.5, hy - 2, 1.7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(hx + 2.6, hy - 3, 0.9, 0.9);
  ctx.restore();
}

/**
 * Boar facing left. Idle it roots and breathes; when Dash gets close (`alert` 0..1) it lowers its
 * head and paws the ground; charging, it gallops with planted hooves (`dist` = distance run).
 */
export function drawBoar(ctx: Ctx, x: number, y: number, t: number, charging: boolean, squash = 0, dist = 0, alert = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  if (squash) ctx.scale(1 + squash * 0.3, 1 - squash * 0.65);
  const ph = dist / BOAR_GALLOP.stride;
  const cyc = ph * TAU;
  const breathe = Math.sin(t * 3) * 0.6;
  const bounce = charging ? 2 * Math.cos(cyc) : 0;
  const pitch = charging ? 0.05 * Math.sin(cyc - 0.6) : alert * 0.04;
  const shoulder = { x: 17, y: -20 - bounce };
  const hip = { x: -19, y: -21 - bounce };
  // pawing: the near fore hoof scrapes back and forth before the charge
  const paw = !charging && alert > 0.3 ? Math.max(0, Math.sin(t * 7)) : 0;

  const legs = [0, 1, 2, 3].map((i) => {
    const fore = i >= 2;
    const far = i === 1 || i === 2;
    const anchor = fore ? shoulder : hip;
    let foot: Vec;
    if (charging) {
      const f = footAt(BOAR_GALLOP, i, ph);
      foot = { x: (fore ? 17 : -19) + f.x + (far ? -2 : 0), y: f.y };
    } else {
      foot = { x: (fore ? 18 : -18) + (far ? -3 : 0), y: 0 };
      if (i === 3 && paw > 0) foot = { x: 18 + 6 - paw * 12, y: -paw * 6 };
    }
    return { anchor, foot, fore, far };
  });
  const drawLeg = (L: (typeof legs)[number]) => {
    const col = L.far ? "#24160b" : "#3a2414";
    const { joint } = ik2(L.anchor, { x: L.foot.x, y: L.foot.y - 2 }, 9.5, 9.5, L.fore ? 1 : -1);
    bone(ctx, L.anchor, joint, L.fore ? 4.2 : 5.2, 3, col);
    bone(ctx, joint, { x: L.foot.x, y: L.foot.y - 2 }, 3, 2.4, col);
    ctx.fillStyle = "#120a05";
    ctx.beginPath();
    ctx.ellipse(L.foot.x + 0.5, L.foot.y - 1, 3.6, 2, 0, 0, TAU);
    ctx.fill();
  };
  drawLeg(legs[1]);
  drawLeg(legs[2]);

  ctx.save();
  ctx.translate(0, -bounce);
  ctx.rotate(pitch);
  // body (breathing)
  const bg = ctx.createRadialGradient(0, -38, 4, -4, -26, 36);
  bg.addColorStop(0, "#8a5f3e");
  bg.addColorStop(0.6, "#5a3a22");
  bg.addColorStop(1, "#2a180c");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(-5, -26, 31 + breathe * 0.4, 18 + breathe, -0.04, 0, TAU);
  ctx.fill();
  // bristly mane: hackles rise when alerted or charging
  const hackles = 1 + (charging ? 0.6 : alert * 0.5);
  ctx.strokeStyle = "#1f120a";
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 34; i++) {
    const bx = 22 - i * 1.4;
    const by = -42 + Math.abs(i - 14) * 0.18 - breathe * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, by + 3);
    ctx.lineTo(bx - 2 - Math.sin(i * 3) * 1.5, by - (5 + (i % 3) * 1.5) * hackles);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150,110,70,.35)";
  for (let i = 0; i < 20; i++) {
    const fx = 18 - ((i * 37) % 44);
    const fy = -34 + ((i * 17) % 16);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 4, fy + 2);
    ctx.stroke();
  }
  // tail: flicks while idle, sticks straight up when charging (as warthogs and boars do)
  ctx.strokeStyle = "#2a180c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-35, -30);
  if (charging) ctx.lineTo(-38, -46);
  else ctx.quadraticCurveTo(-42, -34 + Math.sin(t * 5) * 3, -39, -24);
  ctx.stroke();
  // head: roots when idle, drops low with tusks forward to charge
  const headDip = charging ? 0.22 : alert > 0 ? 0.15 * alert : 0.06 + Math.max(0, Math.sin(t * 1.6)) * 0.1;
  ctx.save();
  ctx.translate(14, -30);
  ctx.rotate(headDip);
  ctx.translate(-14, 30);
  const hg = ctx.createRadialGradient(26, -36, 2, 27, -29, 17);
  hg.addColorStop(0, "#7a5034");
  hg.addColorStop(1, "#2e1a0c");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(14, -42);
  ctx.quadraticCurveTo(36, -44, 42, -30);
  ctx.quadraticCurveTo(42, -18, 26, -16);
  ctx.quadraticCurveTo(14, -18, 12, -30);
  ctx.fill();
  // ear: flicks now and then; pinned back in the charge
  const flick = charging ? -0.5 : (t % 2.3) < 0.15 ? 0.4 : 0;
  ctx.save();
  ctx.translate(17, -40);
  ctx.rotate(flick);
  ctx.fillStyle = "#3a2414";
  ctx.beginPath();
  ctx.moveTo(3, 0);
  ctx.lineTo(-1, -10);
  ctx.lineTo(-4, 2);
  ctx.fill();
  ctx.restore();
  // snout disc
  const sg = ctx.createRadialGradient(43, -27, 1, 42, -25, 7);
  sg.addColorStop(0, "#f2b8b0");
  sg.addColorStop(1, "#a8645c");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(43, -25, 4.6, 6.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#4a2420";
  ctx.beginPath();
  ctx.ellipse(44, -27, 1, 1.6, 0, 0, TAU);
  ctx.ellipse(44, -22.5, 1, 1.6, 0, 0, TAU);
  ctx.fill();
  // tusk
  const tg = ctx.createLinearGradient(40, -22, 34, -34);
  tg.addColorStop(0, "#fffbea");
  tg.addColorStop(1, "#c8b88a");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(36, -20);
  ctx.quadraticCurveTo(45, -26, 42, -36);
  ctx.quadraticCurveTo(41, -27, 33, -22);
  ctx.fill();
  // eye
  ctx.fillStyle = charging || alert > 0.6 ? "#ff3020" : "#140a05";
  if (charging) {
    ctx.shadowColor = "#ff3020";
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(29, -34, 2, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.restore();

  drawLeg(legs[0]);
  drawLeg(legs[3]);
  ctx.restore();
}

/** Wasp hovering towards Dash: blurred wingbeat, pumping abdomen, dangling legs. */
export function drawWasp(ctx: Ctx, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x + Math.sin(t * 13) * 0.8, y + Math.sin(t * 17) * 0.6);
  ctx.scale(-1, 1);
  ctx.rotate(0.12 + Math.sin(t * 2.6) * 0.04); // nose down into the flight
  // legs hang and trail behind the motion
  ctx.strokeStyle = "#1a1408";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(t * 4 + i * 0.7) * 1.5;
    ctx.beginPath();
    ctx.moveTo(6 - i * 5, 5);
    ctx.quadraticCurveTo(5 - i * 5 - 2, 10, 2 - i * 6 + sway, 15);
    ctx.stroke();
  }
  // abdomen pumps around the petiole
  ctx.save();
  ctx.translate(-1, 0);
  ctx.rotate(-0.2 + Math.sin(t * 7) * 0.12);
  const ag = ctx.createLinearGradient(2, 0, -24, 0);
  const bands = ["#ffd21f", "#1a1408", "#ffd21f", "#1a1408", "#ffd21f", "#1a1408"];
  bands.forEach((c, i) => {
    ag.addColorStop(i / bands.length, c);
    ag.addColorStop((i + 1) / bands.length - 0.001, c);
  });
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.ellipse(-10, 2, 14, 9, 0, 0, TAU);
  ctx.fill();
  const sh = ctx.createLinearGradient(0, -8, 0, 11);
  sh.addColorStop(0, "rgba(255,255,255,.35)");
  sh.addColorStop(0.4, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(0,0,0,.4)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(-10, 2, 14, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1a1408";
  ctx.beginPath();
  ctx.moveTo(-23, 2);
  ctx.lineTo(-31, 5);
  ctx.lineTo(-22, 6);
  ctx.fill();
  ctx.restore();
  // thorax + head
  const th = ctx.createRadialGradient(8, -3, 1, 7, 0, 8);
  th.addColorStop(0, "#5a4a1a");
  th.addColorStop(1, "#1a1408");
  ctx.fillStyle = th;
  ctx.beginPath();
  ctx.ellipse(7, 0, 7.5, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffd21f";
  ctx.beginPath();
  ctx.arc(16, -1, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#2a0f08";
  ctx.beginPath();
  ctx.ellipse(18, -2, 3, 3.8, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillRect(18, -4, 1.2, 1.2);
  // antennae twitch
  const tw = Math.sin(t * 11) * 1.2;
  ctx.strokeStyle = "#1a1408";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, -5);
  ctx.quadraticCurveTo(22, -12, 26, -12 + tw);
  ctx.moveTo(16, -6);
  ctx.quadraticCurveTo(18, -14, 21, -15 - tw);
  ctx.stroke();
  // wings: a blurred figure-eight stroke. Ghost copies across the beat read as motion blur,
  // the way a fast wingbeat looks to the eye.
  const beat = t * 26 * TAU;
  for (let k = 0; k < 5; k++) {
    const b = beat - k * 0.55;
    const a = -0.95 + Math.sin(b) * 0.55;
    const twist = Math.cos(b) * 0.25;
    ctx.save();
    ctx.translate(5, -5);
    ctx.rotate(a);
    ctx.scale(1, 1 - Math.abs(twist));
    ctx.globalAlpha = k === 0 ? 0.75 : 0.3 - k * 0.05;
    const wg = ctx.createLinearGradient(0, 0, 0, -20);
    wg.addColorStop(0, "rgba(225,240,255,.85)");
    wg.addColorStop(1, "rgba(190,215,240,.35)");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.ellipse(0, -11, 5.5, 12, 0, 0, TAU);
    ctx.ellipse(3, -8, 3.5, 8, 0.35, 0, TAU);
    ctx.fill();
    if (k === 0) {
      // veins and edge so the membrane reads against any sky
      ctx.strokeStyle = "rgba(40,50,70,.45)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(0, -11, 5.5, 12, 0, 0, TAU);
      ctx.moveTo(0, -1);
      ctx.lineTo(1, -20);
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, -15);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
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
