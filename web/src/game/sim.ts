// Game rules, with no rendering or DOM, so it can run headless (tests, autopilot).
import {
  GROUND_Y,
  PLAYER_H,
  PLAYER_SCREEN_X,
  PLAYER_SLIDE_H,
  PLAYER_W,
  VIEW_H,
  VIEW_W,
  jumpDistance,
  type Ent,
  type Level,
} from "./levels";
import type { DashProfile } from "./dash";

export type SfxName = "jump" | "jump2" | "coin" | "stomp" | "hit" | "fall" | "clear" | "over" | "crack" | "star";

export type RunResult = {
  world: number;
  cleared: boolean;
  coins: number;
  stomps: number;
  livesLeft: number;
  time: number;
  progress: number; // 0..1
  score: number;
};

export const SCORE = { coin: 10, stomp: 100, clear: 1000, lifeLeft: 500 };

export const CHICKEN = { w: 44, h: 40 };
export const BOAR = { w: 72, h: 46 };
export const WASP_R = 17;
export const CRATER = { w: 84, h: 22 };
const STAR_FALL = 1.0;

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

export class Sim {
  readonly level: Level;
  readonly profile: DashProfile;
  readonly speed: number;
  readonly gravity: number;
  readonly jumpV: number;

  // player (x = left edge in world space, y = feet)
  px = 60;
  py = GROUND_Y;
  vy = 0;
  onGround = true;
  sliding = false;
  jumps = 0;
  coyote = 0;
  jumpBuffer = 0;
  jumpHeld = false;
  slideHeld = false;
  invuln = 0;
  lives: number;
  maxLives: number;

  time = 0;
  coins = 0;
  stomps = 0;
  section = 0;
  ended = false;
  cleared = false;
  endTimer = 0;
  shake = 0;
  particles: Particle[] = [];
  /** Visual-only events for the renderer (banners, floating text). */
  popups: { x: number; y: number; text: string; t: number; color: string }[] = [];

  onSfx: (s: SfxName) => void = () => {};
  onSection: (index: number, name: string) => void = () => {};
  onEnd: (r: RunResult) => void = () => {};

  private ents: Ent[];
  private first = 0; // first entity index still relevant

  constructor(level: Level, profile: DashProfile) {
    this.level = level;
    this.profile = profile;
    this.speed = level.world.speed;
    this.gravity = level.world.gravity;
    this.jumpV = level.world.jumpV;
    this.maxLives = profile.perks.includes("extraLife") ? 4 : 3;
    this.lives = this.maxLives;
    // Deep copy so a restart gets fresh entities.
    this.ents = level.ents.map((e) => ({ ...e }));
  }

  get entities() {
    return this.ents;
  }
  get camX() {
    return this.px - PLAYER_SCREEN_X;
  }
  get height() {
    return this.sliding ? PLAYER_SLIDE_H : PLAYER_H;
  }
  get progress() {
    return Math.min(1, Math.max(0, this.px / this.level.goalX));
  }
  get coinValue() {
    return this.profile.perks.includes("doubleRewards") ? 2 : 1;
  }

  // ------------------------------------------------------------ input
  pressJump() {
    this.jumpHeld = true;
    this.jumpBuffer = 0.13;
  }
  releaseJump() {
    this.jumpHeld = false;
  }
  setSlide(on: boolean) {
    this.slideHeld = on;
  }

  // ------------------------------------------------------------ step
  step(dt: number) {
    if (this.ended) {
      this.endTimer += dt;
      this.updateParticles(dt);
      return;
    }
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);

    const prevBottom = this.py;
    this.px += this.speed * dt;

    // Jumping: buffered press, coyote time, super-jump double jump, variable height.
    if (this.jumpBuffer > 0) {
      if (this.onGround || this.coyote > 0) {
        this.vy = -this.jumpV;
        this.jumps = 1;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.onSfx("jump");
      } else if (this.profile.perks.includes("superJump") && this.jumps < 2) {
        this.vy = -this.jumpV * 0.92;
        this.jumps = 2;
        this.jumpBuffer = 0;
        this.burst(this.px + PLAYER_W / 2, this.py, 10, "#ffe14d");
        this.onSfx("jump2");
      }
    }
    if (!this.jumpHeld && this.vy < -this.jumpV * 0.42) this.vy = -this.jumpV * 0.42;

    // Slide on the ground; in the air, holding down drops you faster.
    const wantSlide = this.slideHeld;
    if (!this.onGround && wantSlide) this.vy += this.gravity * 1.2 * dt;
    this.vy += this.gravity * dt;
    this.py += this.vy * dt;

    // Landing on ground, ice, platforms and obstacle tops.
    this.onGround = false;
    const top = this.supportAt(prevBottom, this.py);
    if (top !== null && this.vy >= 0) {
      this.py = top;
      this.vy = 0;
      this.onGround = true;
      this.jumps = 0;
    }
    this.sliding = wantSlide && this.onGround;

    if (this.py > VIEW_H + 120) this.fallIntoPit();

    this.updateEntities(dt, prevBottom);
    this.updateParticles(dt);

    // Sections
    const secs = this.level.sections;
    let s = 0;
    for (let i = 0; i < secs.length; i++) if (this.px >= secs[i].x0) s = i;
    if (s !== this.section) {
      this.section = s;
      this.onSection(s, secs[s].name);
    }

    if (this.px + PLAYER_W >= this.level.goalX + 30) this.finish(true);
  }

  /** Highest surface the feet landed on this frame, if any. */
  private supportAt(prevBottom: number, bottom: number): number | null {
    const x0 = this.px + 10;
    const x1 = this.px + PLAYER_W - 10;
    let best: number | null = null;
    const consider = (surface: number, sx0: number, sx1: number) => {
      if (x1 < sx0 || x0 > sx1) return;
      if (prevBottom <= surface + 1 && bottom >= surface) {
        if (best === null || surface < best) best = surface;
      }
    };
    for (const g of this.level.grounds) {
      if (g.x1 < x0 - 2 || g.x0 > x1 + 2) continue;
      consider(GROUND_Y, g.x0, g.x1);
    }
    for (const p of this.level.platforms) consider(p.y, p.x, p.x + p.w);
    for (let i = this.first; i < this.ents.length; i++) {
      const e = this.ents[i];
      if (e.kind === "ice" && !e.broken) consider(GROUND_Y, e.x, e.x + e.w);
      else if (e.kind === "obstacle") consider(GROUND_Y - e.h, e.x + 4, e.x + e.w - 4);
      if ("x" in e && e.x > x1 + 200) break;
    }
    return best;
  }

  private groundBelow(x: number): boolean {
    for (const g of this.level.grounds) if (x >= g.x0 && x <= g.x1) return true;
    for (const e of this.ents) if (e.kind === "ice" && !e.broken && x >= e.x && x <= e.x + e.w) return true;
    return false;
  }

  private updateEntities(dt: number, prevBottom: number) {
    const left = this.camX - 200;
    const right = this.camX + VIEW_W + 200;
    const pl = { x: this.px + 6, y: this.py - this.height + 4, w: PLAYER_W - 12, h: this.height - 6 };

    while (this.first < this.ents.length) {
      const e = this.ents[this.first];
      const ex = e.kind === "star" ? e.targetX + 400 : e.kind === "ice" ? e.x + e.w : e.x + 120;
      if (ex < left && !(e.kind === "star" && !e.landed)) this.first++;
      else break;
    }

    for (let i = this.first; i < this.ents.length; i++) {
      const e = this.ents[i];
      if (e.kind === "star") {
        if (e.trigger > right + 2000) break;
      } else if (e.x > right) break;

      switch (e.kind) {
        case "coin": {
          if (e.taken) break;
          if (overlap(pl, { x: e.x - 13, y: e.y - 13, w: 26, h: 26 })) {
            e.taken = true;
            this.coins += this.coinValue;
            this.burst(e.x, e.y, 5, "#ffe14d");
            this.onSfx("coin");
          }
          break;
        }
        case "obstacle": {
          const box = { x: e.x + 4, y: GROUND_Y - e.h, w: e.w - 8, h: e.h };
          // Standing on top is handled as support; anything else is a hit.
          if (!e.hit && overlap(pl, box) && !(this.onGround && Math.abs(this.py - (GROUND_Y - e.h)) < 1)) {
            e.hit = true;
            this.damage();
          }
          break;
        }
        case "chicken":
        case "boar": {
          const size = e.kind === "chicken" ? CHICKEN : BOAR;
          if (e.dead > 0) {
            e.dead += dt;
            break;
          }
          if (e.kind === "boar" && !e.charging && e.x - this.px < 540) {
            e.charging = true;
            e.vx = -270;
            this.onSfx("hit");
          }
          e.x += e.vx * dt;
          if (!this.groundBelow(e.x + size.w / 2)) {
            e.dead = 0.01; // walked off a ledge
            break;
          }
          const box = { x: e.x + 4, y: GROUND_Y - size.h, w: size.w - 8, h: size.h };
          if (overlap(pl, box)) {
            if (this.vy > 0 && prevBottom <= box.y + 14) this.stomp(e, e.x + size.w / 2, box.y);
            else this.damage();
          }
          break;
        }
        case "wasp": {
          if (e.dead > 0) {
            e.dead += dt;
            break;
          }
          e.x -= 40 * dt;
          const y = e.baseY + Math.sin(this.time * 5 + e.phase) * 5;
          if (overlap(pl, { x: e.x - WASP_R, y: y - WASP_R, w: WASP_R * 2, h: WASP_R * 2 })) this.damage();
          break;
        }
        case "ice": {
          if (e.broken) break;
          const standing = this.onGround && this.py === GROUND_Y && this.px + PLAYER_W - 10 > e.x && this.px + 10 < e.x + e.w;
          if (standing && e.crack === 0) {
            e.crack = 0.001;
            this.onSfx("crack");
          }
          if (e.crack > 0) {
            e.crack += dt;
            if (e.crack > 0.32) {
              e.broken = true;
              this.burst(e.x + e.w / 2, GROUND_Y, 8, "#d8f3ff");
            }
          }
          break;
        }
        case "star": {
          if (!e.active && this.px >= e.trigger) {
            e.active = true;
            this.onSfx("star");
          }
          if (e.active && !e.landed) {
            e.t += dt;
            const [sx, sy] = starPos(e.targetX, e.t);
            if (overlap(pl, { x: sx - 16, y: sy - 16, w: 32, h: 32 })) this.damage();
            if (e.t >= STAR_FALL) {
              e.landed = true;
              this.shake = 0.25;
              this.burst(e.targetX, GROUND_Y - 6, 18, "#ffb02e");
            }
          }
          if (e.landed) {
            e.crater += dt;
            const box = { x: e.targetX - CRATER.w / 2 + 6, y: GROUND_Y - CRATER.h, w: CRATER.w - 12, h: CRATER.h };
            if (overlap(pl, box)) this.damage();
          }
          break;
        }
      }
    }
  }

  private stomp(e: Extract<Ent, { kind: "chicken" | "boar" }>, x: number, y: number) {
    e.dead = 0.01;
    this.stomps++;
    this.vy = -this.jumpV * 0.62;
    this.jumps = 1;
    this.burst(x, y, 12, e.kind === "chicken" ? "#ffffff" : "#8a5a3c");
    this.popups.push({ x, y: y - 10, text: `+${SCORE.stomp}`, t: 0, color: "#7dffb0" });
    this.onSfx("stomp");
  }

  private damage() {
    if (this.invuln > 0 || this.ended) return;
    this.lives--;
    this.invuln = 1.6;
    this.shake = 0.3;
    this.burst(this.px + PLAYER_W / 2, this.py - 30, 14, "#ff5c7a");
    this.onSfx("hit");
    if (this.lives <= 0) this.finish(false);
  }

  private fallIntoPit() {
    this.onSfx("fall");
    const wasInvuln = this.invuln;
    this.invuln = 0;
    this.damage();
    if (this.ended) return;
    if (wasInvuln > 0) this.invuln = Math.max(this.invuln, wasInvuln);
    // Respawn on the next solid ground ahead.
    let x = this.px;
    for (let i = 0; i < 4000 && !(this.groundBelow(x + 10) && this.groundBelow(x + PLAYER_W + 60)); i++) x += 10;
    this.px = x + 10;
    this.py = GROUND_Y - 160;
    this.vy = 0;
  }

  private finish(cleared: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.cleared = cleared;
    this.onSfx(cleared ? "clear" : "over");
    if (cleared) for (let i = 0; i < 4; i++) this.burst(this.level.goalX + 40, GROUND_Y - 120, 20, ["#ffe14d", "#ff1fb4", "#7fd6ff", "#7dffb0"][i]);
    this.onEnd(this.result());
  }

  result(): RunResult {
    const score =
      this.coins * SCORE.coin + this.stomps * SCORE.stomp + (this.cleared ? SCORE.clear + this.lives * SCORE.lifeLeft : 0);
    return {
      world: this.level.world.index,
      cleared: this.cleared,
      coins: this.coins,
      stomps: this.stomps,
      livesLeft: Math.max(0, this.lives),
      time: this.time,
      progress: this.progress,
      score,
    };
  }

  // ------------------------------------------------------------ particles
  burst(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 220;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0, max: 0.4 + Math.random() * 0.4, color, size: 3 + Math.random() * 4 });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 0.9);
  }

  // ------------------------------------------------------------ autopilot
  /**
   * A simple bot: looks ahead and jumps or slides. Used for the attract-mode demo and to
   * check in tests that every generated level can be cleared.
   */
  autopilot() {
    if (this.ended) return;
    const feetX = this.px + PLAYER_W;
    const D = jumpDistance(this.level.world);
    let jump = false;
    let slide = false;
    const near = (x: number, lead: number) => x - feetX < lead && x + 40 > this.px;

    // Gaps (ground ends ahead)
    if (this.onGround && !this.groundBelow(feetX + this.speed * 0.06) && this.groundBelow(this.px + 12)) jump = true;
    for (let i = this.first; i < this.ents.length && !jump; i++) {
      const e = this.ents[i];
      if (e.kind === "star") {
        if (e.landed && near(e.targetX - CRATER.w / 2, D * 0.32)) jump = true;
        continue;
      }
      if (e.x > feetX + D) break;
      if (e.kind === "obstacle" && !e.hit && near(e.x, D * 0.3)) jump = true;
      if ((e.kind === "chicken" || e.kind === "boar") && e.dead === 0) {
        const lead = e.kind === "boar" && e.charging ? D * 0.55 : D * 0.32;
        if (near(e.x, lead)) jump = true;
      }
      if (e.kind === "wasp" && e.dead === 0 && near(e.x - WASP_R, D * 0.3)) {
        if (e.baseY > GROUND_Y - 35) jump = true;
        else slide = near(e.x - WASP_R, 120) || this.sliding;
      }
    }
    if (jump && this.onGround) this.pressJump();
    if (!this.onGround && this.vy > -50) this.releaseJump();
    this.setSlide(slide && !jump);
  }
}

export function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Shooting star path: from up and to the right of the target down to the ground. */
export function starPos(targetX: number, t: number): [number, number] {
  const f = Math.min(1, t / STAR_FALL);
  return [targetX + 320 * (1 - f), -60 + (GROUND_Y + 60) * f];
}
