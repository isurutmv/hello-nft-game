import { useEffect, useRef } from "react";
import { drawDash } from "../game/render";
import type { DashProfile } from "../game/dash";

/** A small animated canvas of a Dash running in place. */
export function DashAvatar({ profile, size = 96, bg }: { profile: DashProfile; size?: number; bg?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const s = size / 96;
      drawDash(ctx, profile, size / 2 - 8 * s, size * 0.9, { t: (now - t0) / 1000, scale: 1.1 * s });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [profile, size]);
  return <canvas ref={ref} className="avatar" style={{ width: size, height: size, background: bg }} aria-label={profile.name} />;
}
