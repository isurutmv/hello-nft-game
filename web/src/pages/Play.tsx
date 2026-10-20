import { useEffect, useMemo, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { DashCardsAbi, DashLeaderboardAbi, MockDogeDashAbi } from "../contracts";
import { short, useGame, useTx } from "../lib/useGame";
import { Game } from "../game/game";
import { WORLDS } from "../game/levels";
import { PERK_INFO, profileFor, traitLabel, type DashProfile } from "../game/dash";
import { SCORE, type RunResult } from "../game/sim";
import { isUnlocked, loadProgress, saveRun } from "../game/progress";
import { setMuted, isMuted, unlockAudio } from "../game/audio";
import { DashAvatar } from "../components/DashAvatar";

const WORLD_BG = ["#5cc85a", "#1f6b4f", "#ff8a5a", "#8fd0ff", "#2b1766"];

export function Play({ onConnect }: { onConnect: () => void }) {
  const { c, address, isConnected } = useGame();
  const who = address ?? "guest";
  const [dashId, setDashId] = useState<number>(0);
  const [world, setWorld] = useState<number | null>(null);
  const [lastWorld, setLastWorld] = useState(0);
  const [progress, setProgress] = useState(() => loadProgress(who));
  useEffect(() => setProgress(loadProgress(who)), [who]);

  const owned = useReadContract({
    address: c?.MockDogeDash,
    abi: MockDogeDashAbi,
    functionName: "tokensOf",
    args: address ? [address] : undefined,
    query: { enabled: !!c && !!address },
  });
  const ids = useMemo(() => (owned.data ?? []).map(Number), [owned.data]);
  useEffect(() => {
    if (dashId === 0 && ids.length) setDashId(ids[0]);
    if (dashId !== 0 && !ids.includes(dashId)) setDashId(ids[0] ?? 0);
  }, [ids, dashId]);

  // Holding a Series 1 card of your Dash (Base, Sky Prism, Run Cycle, ZOOMIES!) gives a holo trail.
  const cards = useReadContract({
    address: c?.DashCards,
    abi: DashCardsAbi,
    functionName: "cardsOf",
    args: address ? [address, 0n, 500n] : undefined,
    query: { enabled: !!c && !!address },
  });
  const cardDesigns = useMemo(() => new Set((cards.data?.[1] ?? []).filter((x) => x.set <= 3).map((x) => x.design + 1)), [cards.data]);

  const chain = useReadContract({
    address: c?.DashLeaderboard,
    abi: DashLeaderboardAbi,
    functionName: "bestOf",
    args: address ? [address] : undefined,
    query: { enabled: !!c?.DashLeaderboard && !!address },
  });
  const chainMask = chain.data ? Number(chain.data[1]) : 0;
  const mask = progress.cleared | chainMask;
  const best = progress.best.map((b, i) => Math.max(b, chain.data ? Number(chain.data[0][i]) : 0));

  const profile = useMemo(() => profileFor(dashId, cardDesigns.has(dashId)), [dashId, cardDesigns]);
  const guest = dashId === 0;

  if (world !== null) {
    return (
      <Runner
        world={world}
        profile={profile}
        onExit={() => {
          setLastWorld(world);
          setWorld(null);
        }}
        onNext={() => setWorld(world + 1 < WORLDS.length && !guest ? world + 1 : null)}
        onResult={(r) => setProgress(saveRun(who, r.world, r.score, r.cleared))}
        canNext={!guest && world + 1 < WORLDS.length}
      />
    );
  }

  return (
    <>
      <section className="panel">
        <div className="kicker">DOGE DASH · THE GAME</div>
        <h2>Pick your Dash</h2>
        <p className="muted">
          Hold a Doge Dash NFT and you play as it. A lucky few unlock extra lives, super jump or double rewards. No NFT? Run as the guest pup
          on Level 1.
        </p>
        <div className="dash-pick">
          {[0, ...ids].map((id) => {
            const p = profileFor(id, cardDesigns.has(id));
            return (
              <button key={id} className={`dash-tile ${dashId === id ? "on" : ""}`} onClick={() => setDashId(id)}>
                <DashAvatar profile={p} size={92} />
                <b>{p.name}</b>
                <span className="muted small">{traitLabel(p)}</span>
                <span className="perks">
                  {p.perks.map((k) => (
                    <span key={k} className="pill pill-yellow" title={PERK_INFO[k].desc}>
                      {PERK_INFO[k].short}
                    </span>
                  ))}
                  {p.holoTrail && <span className="pill pill-holo">HOLO TRAIL</span>}
                </span>
              </button>
            );
          })}
          {!isConnected && (
            <button className="dash-tile dash-tile-add" onClick={onConnect}>
              <span className="plus">+</span>
              <b>Connect wallet</b>
              <span className="muted small">Play as your Doge Dash NFTs</span>
            </button>
          )}
        </div>
        {profile.perks.length > 0 && (
          <p className="small">
            {profile.perks.map((k) => (
              <span key={k}>
                <b>{PERK_INFO[k].label}:</b> {PERK_INFO[k].desc}{" "}
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Choose a world</h2>
        <p className="muted">Each world is a 60-second run in 5 parts. Reach Dash’s dog house to clear it and open the next world.</p>
        <div className="worlds">
          {WORLDS.map((w, i) => {
            const open = isUnlocked(i, mask) && (!guest || i === 0);
            return (
              <button key={w.key} className={`world ${open ? "" : "is-locked"}`} disabled={!open} onClick={() => (unlockAudio(), setWorld(i))}>
                <div className="world-art" style={{ background: WORLD_BG[i] }}>
                  <span className="world-num">{w.num}</span>
                  {(mask & (1 << i)) !== 0 && <span className="world-clear">CLEAR ✓</span>}
                  {!open && <span className="world-lock">🔒</span>}
                </div>
                <b>{w.name}</b>
                <span className="muted small">{w.challenge}</span>
                <span className="pips" aria-label={`Difficulty ${w.difficulty} of 10`}>
                  {Array.from({ length: 10 }, (_, k) => (
                    <i key={k} style={{ background: k < w.difficulty ? (w.difficulty > 6 ? "#ff2e63" : w.difficulty > 4 ? "#ffb02e" : "#7dffb0") : undefined }} />
                  ))}
                </span>
                <span className="small">{best[i] ? `Best ${best[i].toLocaleString()}` : open ? "Not played yet" : guest && i > 0 ? "Needs a Doge Dash NFT" : `Clear ${WORLDS[i - 1].num} first`}</span>
              </button>
            );
          })}
        </div>
        <div className="controls-help muted small">
          <span><kbd>Space</kbd> / <kbd>↑</kbd> / tap: jump (hold for higher)</span>
          <span><kbd>↓</kbd> / swipe down: slide under wasps</span>
          <span>Land on chickens and boars to stomp them (+{SCORE.stomp})</span>
          <span><kbd>P</kbd>: pause</span>
        </div>
      </section>

      {c?.DashLeaderboard && <Leaderboard initialWorld={lastWorld} />}
    </>
  );
}

function Runner({
  world,
  profile,
  onExit,
  onNext,
  onResult,
  canNext,
}: {
  world: number;
  profile: DashProfile;
  onExit: () => void;
  onNext: () => void;
  onResult: (r: RunResult) => void;
  canNext: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMute] = useState(isMuted());
  const [attempt, setAttempt] = useState(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  // The run keeps the Dash it started with, even if wallet data refreshes mid-run.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const g = new Game(canvas.current!, WORLDS[world], profileRef.current, {
      autopilot: new URLSearchParams(window.location.search).has("autopilot"),
      onEnd: (r) => {
        onResultRef.current(r);
        setTimeout(() => setResult(r), r.cleared ? 1200 : 700);
      },
    });
    game.current = g;
    g.start();
    const t = setInterval(() => setPaused(g.paused), 200);
    canvas.current!.focus();
    return () => {
      clearInterval(t);
      g.destroy();
    };
  }, [world, attempt]);

  const refocus = () => canvas.current?.focus();
  const retry = () => {
    setResult(null);
    setAttempt((a) => a + 1);
  };
  const w = WORLDS[world];

  return (
    <section className="panel runner">
      <div className="runner-bar">
        <button className="btn btn-sm btn-ghost" onClick={onExit}>
          ← Worlds
        </button>
        <b>
          {w.num} · {w.name}
        </b>
        <span className="row-gap" style={{ margin: 0 }}>
          <button
            className="btn btn-sm"
            onClick={() => {
              setMuted(!muted);
              setMute(!muted);
              refocus();
            }}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              game.current?.setPaused(!game.current.paused);
              refocus();
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </span>
      </div>
      <div className="stage">
        <canvas ref={canvas} className="game-canvas" tabIndex={0} />
        {paused && !result && (
          <div className="overlay">
            <h2>Paused</h2>
            <button
              className="btn btn-yellow btn-lg"
              onClick={() => {
                game.current?.setPaused(false);
                refocus();
              }}
            >
              Resume
            </button>
          </div>
        )}
        {result && <Results result={result} world={world} profile={profile} onRetry={retry} onNext={onNext} onExit={onExit} canNext={canNext} />}
        <div className="touch">
          <button
            className="touch-btn"
            onPointerDown={(e) => (e.preventDefault(), game.current?.slide(true))}
            onPointerUp={() => game.current?.slide(false)}
            onPointerLeave={() => game.current?.slide(false)}
          >
            SLIDE
          </button>
          <button
            className="touch-btn touch-jump"
            onPointerDown={(e) => (e.preventDefault(), game.current?.jump(true))}
            onPointerUp={() => game.current?.jump(false)}
            onPointerLeave={() => game.current?.jump(false)}
          >
            JUMP
          </button>
        </div>
      </div>
    </section>
  );
}

function Results({
  result,
  world,
  profile,
  onRetry,
  onNext,
  onExit,
  canNext,
}: {
  result: RunResult;
  world: number;
  profile: DashProfile;
  onRetry: () => void;
  onNext: () => void;
  onExit: () => void;
  canNext: boolean;
}) {
  const { c, address } = useGame();
  const { send, pending, error } = useTx();
  const [saved, setSaved] = useState(false);
  const r = result;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "r" || e.key === "R") onRetry();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onRetry]);

  async function save() {
    const rc = await send("save", {
      address: c!.DashLeaderboard!,
      abi: DashLeaderboardAbi,
      functionName: "submit",
      args: [world, r.score, profile.id, r.cleared],
    });
    if (rc) setSaved(true);
  }

  return (
    <div className={`overlay ${r.cleared ? "overlay-win" : ""}`}>
      {r.cleared && (
        <div className="coin-rain" aria-hidden>
          {Array.from({ length: 28 }, (_, i) => (
            <span
              key={i}
              style={{ left: `${(i * 61) % 97}%`, animationDelay: `${((i * 0.37) % 1.9).toFixed(2)}s`, animationDuration: `${1.4 + ((i * 7) % 5) * 0.2}s` }}
            >
              D
            </span>
          ))}
        </div>
      )}
      <div className="kicker">{r.cleared ? "YOU WON!" : `MADE IT ${Math.round(r.progress * 100)}% OF THE WAY`}</div>
      <h2>{r.cleared ? "LEVEL CLEAR!" : "GAME OVER"}</h2>
      <dl className="result-lines">
        <dt>Coins × {SCORE.coin}</dt>
        <dd>{(r.coins * SCORE.coin).toLocaleString()}</dd>
        <dt>Stomps × {SCORE.stomp}</dt>
        <dd>{(r.stomps * SCORE.stomp).toLocaleString()}</dd>
        {r.cleared && (
          <>
            <dt>Level clear</dt>
            <dd>+{SCORE.clear.toLocaleString()}</dd>
            <dt>Lives left × {SCORE.lifeLeft}</dt>
            <dd>{(r.livesLeft * SCORE.lifeLeft).toLocaleString()}</dd>
          </>
        )}
        <dt className="total">Score</dt>
        <dd className="total">{r.score.toLocaleString()}</dd>
      </dl>
      <div className="row-gap center">
        {r.cleared && canNext && (
          <button className="btn btn-yellow" onClick={onNext}>
            Next world →
          </button>
        )}
        <button className={`btn ${r.cleared && canNext ? "" : "btn-yellow"}`} onClick={onRetry}>
          {r.cleared ? "Play again" : "Try again"}
        </button>
        <button className="btn btn-ghost" onClick={onExit}>
          Worlds
        </button>
      </div>
      {c?.DashLeaderboard && address && r.score > 0 && (
        <div className="save">
          {saved ? (
            <span className="ok">✓ Saved on BNB Smart Chain testnet</span>
          ) : (
            <button className="btn btn-sm" disabled={!!pending} onClick={save}>
              {pending ? "Saving…" : "Save score to the on-chain leaderboard"}
            </button>
          )}
          {error && <span className="err small">{error}</span>}
        </div>
      )}
    </div>
  );
}

function Leaderboard({ initialWorld }: { initialWorld: number }) {
  const { c, address } = useGame();
  const [w, setW] = useState(initialWorld);
  const top = useReadContract({
    address: c!.DashLeaderboard!,
    abi: DashLeaderboardAbi,
    functionName: "top",
    args: [w],
    query: { refetchInterval: 20_000 },
  });
  const rows = top.data ?? [];
  return (
    <section className="panel">
      <h2>Leaderboard</h2>
      <div className="seg">
        {WORLDS.map((x, i) => (
          <button key={x.key} className={i === w ? "on" : ""} onClick={() => setW(i)}>
            {x.num}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted">No scores yet for {WORLDS[w].name}. Be the first.</p>
      ) : (
        <div className="table-wrap">
          <table className="odds">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Dash</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.player} className={e.player.toLowerCase() === address?.toLowerCase() ? "me" : ""}>
                  <td>{i + 1}</td>
                  <td>{short(e.player)}</td>
                  <td>{e.dogeId ? `DASH #${e.dogeId}` : "Guest pup"}</td>
                  <td>{e.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Scores are reported by the game client and recorded on BNB Smart Chain testnet.</p>
    </section>
  );
}
