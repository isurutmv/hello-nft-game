// Per-wallet progress kept in the browser. The on-chain leaderboard mirrors clears and bests.
export type Progress = { cleared: number; best: number[] };

const key = (who: string) => `dd:progress:${who.toLowerCase()}`;

export function loadProgress(who: string): Progress {
  try {
    const raw = localStorage.getItem(key(who));
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (typeof p.cleared === "number" && Array.isArray(p.best)) return p;
    }
  } catch {
    /* storage unavailable */
  }
  return { cleared: 0, best: [0, 0, 0, 0, 0] };
}

export function saveRun(who: string, world: number, score: number, cleared: boolean): Progress {
  const p = loadProgress(who);
  if (cleared) p.cleared |= 1 << world;
  p.best[world] = Math.max(p.best[world] ?? 0, score);
  try {
    localStorage.setItem(key(who), JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
  return p;
}

/** World 0 is always open; each later world opens when the one before it is cleared. */
export function isUnlocked(world: number, clearedMask: number) {
  return world === 0 || (clearedMask & (1 << (world - 1))) !== 0;
}
