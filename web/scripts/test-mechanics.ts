// Headless checks of the game rules. Usage: npm run test:game
import assert from "node:assert/strict";
import { GROUND_Y, WORLDS, type Level } from "../src/game/levels";
import { SCORE, Sim } from "../src/game/sim";
import { perksFor, profileFor, ULTRA_RARE_IDS, type DashProfile } from "../src/game/dash";

const world = WORLDS[0];
const flat = (ents: Level["ents"] = [], grounds = [{ x0: 0, x1: 20000 }]): Level => ({
  world, seed: 0, length: 20000, goalX: 15000, grounds, platforms: [], ents, sections: [{ name: "TEST", x0: 0 }], totalCoins: 0,
});
const guest = profileFor(0);
const withPerks = (perks: DashProfile["perks"]): DashProfile => ({ ...profileFor(5), perks });
const run = (sim: Sim, seconds: number, each?: (t: number) => void) => {
  for (let t = 0; t < seconds; t += 1 / 120) {
    each?.(t);
    sim.step(1 / 120);
  }
};
let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✔ ${name}`);
};

test("coins add up, and double rewards counts each twice", () => {
  const coins = () => [400, 450, 500].map((x) => ({ kind: "coin" as const, x, y: GROUND_Y - 30, taken: false }));
  const a = new Sim(flat(coins()), guest);
  run(a, 2);
  assert.equal(a.coins, 3);
  const b = new Sim(flat(coins()), withPerks(["doubleRewards"]));
  run(b, 2);
  assert.equal(b.coins, 6);
});

test("running into an enemy costs a life, then you're briefly invulnerable", () => {
  const sim = new Sim(flat([
    { kind: "chicken", x: 500, vx: 0, dead: 0 },
    { kind: "chicken", x: 560, vx: 0, dead: 0 },
  ]), guest);
  run(sim, 2);
  assert.equal(sim.lives, 2); // the second chicken is inside the invulnerability window
});

test("landing on a chicken stomps it and bounces you", () => {
  const sim = new Sim(flat([{ kind: "chicken", x: 700, vx: 0, dead: 0 }]), guest);
  // Jump so that we come down on the chicken.
  run(sim, 2.5, (t) => {
    if (Math.abs(t - 1.32) < 0.005) sim.pressJump();
    if (t > 1.6) sim.releaseJump();
  });
  assert.equal(sim.stomps, 1, "stomped");
  assert.equal(sim.lives, 3, "no damage");
});

test("wasps at head height can be slid under", () => {
  const sim = new Sim(flat([{ kind: "wasp", x: 600, baseY: GROUND_Y - 50, phase: 0, dead: 0 }]), guest);
  sim.setSlide(true);
  run(sim, 2.5);
  assert.equal(sim.lives, 3);
  const hit = new Sim(flat([{ kind: "wasp", x: 600, baseY: GROUND_Y - 50, phase: 0, dead: 0 }]), guest);
  run(hit, 2.5);
  assert.equal(hit.lives, 2);
});

test("falling in a pit costs a life and respawns on the next ground", () => {
  const sim = new Sim(flat([], [{ x0: 0, x1: 500 }, { x0: 900, x1: 20000 }]), guest);
  run(sim, 4);
  assert.equal(sim.lives, 2);
  assert.ok(sim.px > 900 && sim.onGround);
});

test("super jump allows a second jump in mid-air", () => {
  const peak = (p: DashProfile) => {
    const sim = new Sim(flat(), p);
    let top = GROUND_Y;
    run(sim, 1.4, (t) => {
      if (Math.abs(t - 0.1) < 0.005 || Math.abs(t - 0.45) < 0.005) sim.pressJump();
      top = Math.min(top, sim.py);
    });
    return GROUND_Y - top;
  };
  const normal = peak(guest);
  const sup = peak(withPerks(["superJump"]));
  assert.ok(sup > normal + 60, `super ${sup} vs normal ${normal}`);
});

test("extra life starts runs with 4 lives; 3 hits ends a normal run", () => {
  assert.equal(new Sim(flat(), withPerks(["extraLife"])).lives, 4);
  const ents = [600, 1400, 2200].map((x) => ({ kind: "obstacle" as const, x, w: 50, h: 40, style: "rock" as const, hit: false }));
  const sim = new Sim(flat(ents), guest);
  let ended = false;
  sim.onEnd = (r) => {
    ended = true;
    assert.equal(r.cleared, false);
  };
  run(sim, 10);
  assert.ok(ended);
});

test("reaching the dog house clears the level with the clear bonus", () => {
  const level = flat();
  level.goalX = 1500;
  const sim = new Sim(level, guest);
  run(sim, 6);
  const r = sim.result();
  assert.equal(r.cleared, true);
  assert.equal(r.score, SCORE.clear + 3 * SCORE.lifeLeft);
});

test("perks: ultra rares get all three, about 15% of others get one", () => {
  for (const id of ULTRA_RARE_IDS) assert.equal(perksFor(id).length, 3);
  let lucky = 0;
  for (let id = 1; id <= 4119; id++) if (!ULTRA_RARE_IDS.has(id) && perksFor(id).length) lucky++;
  const pct = lucky / 4094;
  assert.ok(pct > 0.1 && pct < 0.2, `lucky ${pct}`);
  assert.deepEqual(perksFor(0), []);
});

console.log(`${n} game mechanics checks passed`);
