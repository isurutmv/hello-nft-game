// Runs a Sim on a canvas: fixed-step loop, input, sound, section banners.
import { VIEW_H, VIEW_W, buildLevel, type World } from "./levels";
import { Sim, type RunResult } from "./sim";
import { render, type Banner } from "./render";
import { sfx, unlockAudio } from "./audio";
import type { DashProfile } from "./dash";

const STEP = 1 / 120;

export type GameOptions = {
  demo?: boolean; // autopilot attract mode, no HUD, loops forever
  autopilot?: boolean; // the bot plays a real run (debugging: add ?autopilot to the URL)
  onEnd?: (r: RunResult) => void;
};

export class Game {
  sim!: Sim;
  paused = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private banner: Banner | null = null;
  private world: World;
  private profile: DashProfile;
  private opts: GameOptions;
  private cleanup: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, world: World, profile: DashProfile, opts: GameOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.world = world;
    this.profile = profile;
    this.opts = opts;
    this.resize();
    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    this.cleanup.push(() => window.removeEventListener("resize", onResize));
    if (!opts.demo) this.bindInput();
    this.reset();
  }

  reset() {
    this.sim = new Sim(buildLevel(this.world), this.profile);
    if (!this.opts.demo) this.sim.onSfx = sfx;
    this.sim.onSection = (_i, name) => (this.banner = { text: name, sub: "", t: 0 });
    this.sim.onEnd = (r) => this.opts.onEnd?.(r);
    this.banner = { text: this.world.num, sub: `${this.world.name} · ${this.world.challenge}`, t: 0 };
    this.paused = false;
  }

  start() {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.acc += dt;
        while (this.acc >= STEP) {
          if (this.opts.demo || this.opts.autopilot) this.sim.autopilot();
          this.sim.step(STEP);
          this.acc -= STEP;
        }
        if (this.banner) this.banner.t += dt;
        if (this.opts.demo && this.sim.ended && this.sim.endTimer > 1.5) this.reset();
      }
      this.draw(now / 1000);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  setPaused(p: boolean) {
    if (this.sim.ended) return;
    this.paused = p;
    this.acc = 0;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
  }

  // ------------------------------------------------------------ input
  /** On-screen buttons call these. */
  jump(down: boolean) {
    if (down) {
      unlockAudio();
      this.sim.pressJump();
    } else this.sim.releaseJump();
  }
  slide(down: boolean) {
    this.sim.setSlide(down);
  }

  private bindInput() {
    const isJump = (k: string) => k === " " || k === "ArrowUp" || k === "w" || k === "W";
    const isSlide = (k: string) => k === "ArrowDown" || k === "s" || k === "S";
    const down = (e: KeyboardEvent) => {
      if (isJump(e.key)) {
        e.preventDefault();
        if (!e.repeat) this.jump(true);
      } else if (isSlide(e.key)) {
        e.preventDefault();
        this.slide(true);
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") this.setPaused(!this.paused);
    };
    const up = (e: KeyboardEvent) => {
      if (isJump(e.key)) {
        // Stops Space from also "clicking" whatever button has focus.
        e.preventDefault();
        this.jump(false);
      }
      else if (isSlide(e.key)) this.slide(false);
    };
    // Tap or click the game to jump (hold for a higher jump); swipe down to slide.
    let startY = 0;
    const pdown = (e: PointerEvent) => {
      startY = e.clientY;
      this.jump(true);
    };
    const pmove = (e: PointerEvent) => {
      if (e.buttons && e.clientY - startY > 40) {
        this.jump(false);
        this.slide(true);
      }
    };
    const pup = () => {
      this.jump(false);
      this.slide(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    this.canvas.addEventListener("pointerdown", pdown);
    this.canvas.addEventListener("pointermove", pmove);
    window.addEventListener("pointerup", pup);
    const blur = () => this.setPaused(true);
    window.addEventListener("blur", blur);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      this.canvas.removeEventListener("pointerdown", pdown);
      this.canvas.removeEventListener("pointermove", pmove);
      window.removeEventListener("pointerup", pup);
      window.removeEventListener("blur", blur);
    });
  }

  // ------------------------------------------------------------ drawing
  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || VIEW_W;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(((w * VIEW_H) / VIEW_W) * dpr);
  }

  private draw(now: number) {
    const scale = this.canvas.width / VIEW_W;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    render(this.ctx, this.sim, this.opts.demo ? null : this.banner, now, this.opts.demo);
  }
}
