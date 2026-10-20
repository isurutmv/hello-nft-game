import { useEffect, useRef } from "react";
import { Game } from "../game/game";
import { WORLDS } from "../game/levels";
import { profileFor } from "../game/dash";

/** Attract mode: the autopilot runs a world on loop. */
export function GameDemo({ world = 0, dashId = 2299 }: { world?: number; dashId?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = new Game(ref.current!, WORLDS[world], profileFor(dashId, true), { demo: true });
    g.start();
    return () => g.destroy();
  }, [world, dashId]);
  return <canvas ref={ref} className="game-canvas demo" aria-label="Doge Dash gameplay demo" />;
}
