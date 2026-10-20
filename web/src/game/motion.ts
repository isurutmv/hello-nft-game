// Procedural locomotion helpers: gait cycles with planted feet, two-bone IK and smoothing.
//
// Feet never slide: a gait's phase comes from distance travelled, so a foot in stance moves
// backwards (relative to the body) at exactly the ground speed.

export type Vec = { x: number; y: number };

export type Gait = {
  /** World distance covered by one full stride cycle. */
  stride: number;
  /** Fraction of the cycle each foot spends on the ground. */
  duty: number;
  /** Touchdown phase of each foot (0..1). */
  offsets: number[];
  /** How far a foot travels under the body during stance, in local units.
   * Must equal duty * stride / drawScale, or the planted foot slips. */
  sweep: number;
  /** Swing lift height in local units. */
  lift: number[];
};

/**
 * Rotary gallop, as dogs run at speed. Footfall order: near hind, far hind, far fore,
 * near fore, then a gathered suspension.
 * The viewer sees Dash's left side, so "near" legs are the left legs.
 */
export const DOG_GALLOP: Gait = { stride: 92, duty: 0.32, offsets: [0, 0.08, 0.4, 0.48], sweep: 34.2, lift: [8, 8, 12, 12] };
/** Transverse gallop for the boar (fore pair leads). */
export const BOAR_GALLOP: Gait = { stride: 64, duty: 0.4, offsets: [0.5, 0.6, 0, 0.1], sweep: 25.6, lift: [6, 6, 8, 8] };
/** A bird's walk: alternating steps, long stance. */
export const CHICKEN_WALK: Gait = { stride: 30, duty: 0.62, offsets: [0, 0.5], sweep: 18.6, lift: [6, 6] };

export type FootState = { x: number; y: number; stance: boolean; s: number };

/**
 * Foot position relative to its hip/shoulder anchor, for gait phase `phase` (cycles) and leg i.
 * x grows forward. In stance the foot moves back linearly (planted on the ground); in swing it
 * arcs forward with an eased path.
 */
export function footAt(g: Gait, i: number, phase: number, reachAhead = 0.55): FootState {
  const lp = (((phase - g.offsets[i]) % 1) + 1) % 1;
  const front = g.sweep * reachAhead;
  const back = front - g.sweep;
  if (lp < g.duty) {
    const s = lp / g.duty;
    return { x: front - s * g.sweep, y: 0, stance: true, s };
  }
  const u = (lp - g.duty) / (1 - g.duty);
  // Ease out of lift-off, ease into touchdown.
  const e = u * u * (3 - 2 * u);
  return { x: back + e * g.sweep, y: -g.lift[i] * Math.pow(Math.sin(Math.PI * u), 0.85), stance: false, s: u };
}

/**
 * Two-bone IK from anchor a to target t with bone lengths l1, l2.
 * bend = +1 puts the joint behind (toward -x), -1 in front (toward +x).
 */
export function ik2(a: Vec, t: Vec, l1: number, l2: number, bend: 1 | -1): { joint: Vec; end: Vec } {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const raw = Math.hypot(dx, dy) || 0.0001;
  const d = Math.min(l1 + l2 - 0.001, Math.max(Math.abs(l1 - l2) + 0.001, raw));
  const ang = Math.atan2(dy, dx);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, c)));
  const ja = ang + bend * off;
  const joint = { x: a.x + Math.cos(ja) * l1, y: a.y + Math.sin(ja) * l1 };
  const end = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
  return { joint, end };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Critically damped follow, frame-rate independent. */
export function follow(current: number, target: number, rate: number, dt: number) {
  return target + (current - target) * Math.exp(-rate * dt);
}
