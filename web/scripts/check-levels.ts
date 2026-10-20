// Runs the autopilot through every world and seed variant to check levels can be cleared.
// Usage: npm run check:levels
import { WORLDS, buildLevel } from "../src/game/levels";
import { Sim } from "../src/game/sim";
import { profileFor } from "../src/game/dash";

function run(world: (typeof WORLDS)[number], seed?: number) {
  const level = buildLevel(world, seed);
  const sim = new Sim(level, profileFor(0));
  // A bot with infinite lives: count hits instead of ending the run.
  let hits = 0;
  const hitAt: string[] = [];
  sim.onSfx = (s) => {
    if (s === "hit" || s === "fall") {
      if (s === "fall" || sim.invuln > 1.5) {
        hits++;
        hitAt.push(`${s}@${Math.round(sim.px)}`);
      }
      sim.lives = 99;
    }
  };
  const dt = 1 / 120;
  let t = 0;
  while (!sim.ended && t < 200) {
    sim.autopilot();
    sim.step(dt);
    t += dt;
  }
  return { level, sim, hits, hitAt };
}

let failed = 0;
for (const world of WORLDS) {
  const { level, sim, hits, hitAt } = run(world);
  const ok = sim.cleared && hits === 0;
  if (!ok) failed++;
  console.log(
    `${world.num.padEnd(8)} ${world.name.padEnd(11)} len ${level.goalX.toString().padStart(6)}px  coins ${String(level.totalCoins).padStart(3)}  ` +
      `bot ${ok ? "CLEARED" : "FAILED "} in ${sim.time.toFixed(1)}s, picked ${sim.coins}, stomps ${sim.stomps}, hits ${hits} ${hitAt.slice(0, 6).join(" ")}`,
  );
}
// The generator itself: other seeds should be clearable too.
for (const world of WORLDS) {
  const bad: string[] = [];
  for (let seed = 1; seed <= 25; seed++) {
    const { sim, hits, hitAt } = run(world, seed);
    if (!sim.cleared || hits > 0) bad.push(`seed ${seed}: ${hitAt.slice(0, 3).join(" ")}`);
  }
  console.log(`${world.num.padEnd(8)} 25 extra seeds: ${bad.length ? bad.join("; ") : "all clean"}`);
  if (bad.length) failed++;
}
process.exit(failed ? 1 : 0);
