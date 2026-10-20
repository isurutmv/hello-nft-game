// Tiny WebAudio synth for game sound effects. No audio files.
import type { SfxName } from "./sim";

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem("dd:muted") === "1";
} catch {
  /* storage unavailable */
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("dd:muted", m ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

/** Call from a user gesture so browsers allow audio. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  void ctx?.resume();
}

function tone(freq: number, to: number, dur: number, type: OscillatorType, vol = 0.12, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sfx(name: SfxName) {
  switch (name) {
    case "jump":
      return tone(320, 680, 0.14, "square", 0.07);
    case "jump2":
      return tone(520, 1100, 0.16, "square", 0.07);
    case "coin":
      tone(988, 988, 0.06, "square", 0.06);
      return tone(1319, 1319, 0.12, "square", 0.06, 0.06);
    case "stomp":
      return tone(220, 60, 0.18, "triangle", 0.2);
    case "hit":
      return tone(300, 80, 0.3, "sawtooth", 0.1);
    case "fall":
      return tone(600, 90, 0.5, "triangle", 0.12);
    case "crack":
      return tone(1800, 600, 0.05, "square", 0.03);
    case "star":
      return tone(1600, 300, 0.9, "sine", 0.06);
    case "clear":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, "square", 0.07, i * 0.12));
      return;
    case "over":
      [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.25, "triangle", 0.12, i * 0.2));
      return;
  }
}
