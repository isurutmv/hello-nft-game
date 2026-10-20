// Planted feet must not slide: while a foot is in stance its world x must stay put.
// Usage: npx tsx scripts/check-gaits.ts
import assert from "node:assert/strict";
import { BOAR_GALLOP, CHICKEN_WALK, DOG_GALLOP, footAt, type Gait } from "../src/game/motion";

function maxSlip(g: Gait, scale: number) {
  let worst = 0;
  g.offsets.forEach((_, i) => {
    let start: number | null = null;
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = 0; d < g.stride * 4; d += 0.25) {
      const f = footAt(g, i, d / g.stride);
      if (f.stance) {
        const wx = d + f.x * scale; // body moves +d; foot is offset in local units
        if (start === null) start = d;
        lo = Math.min(lo, wx);
        hi = Math.max(hi, wx);
      } else if (start !== null) {
        worst = Math.max(worst, hi - lo);
        start = null;
        lo = Infinity;
        hi = -Infinity;
      }
    }
  });
  return worst;
}

for (const [name, g, scale] of [["dog gallop", DOG_GALLOP, 0.86], ["boar gallop", BOAR_GALLOP, 1], ["chicken walk", CHICKEN_WALK, 1]] as const) {
  const slip = maxSlip(g, scale);
  console.log(`  ${name}: planted foot drifts at most ${slip.toFixed(2)} world units per step`);
  assert.ok(slip < 0.6, `${name} feet slide ${slip}`);
}
console.log("gaits keep feet planted");
