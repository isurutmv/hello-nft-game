import { useEffect, useMemo, useRef, useState } from "react";
import { useReadContracts } from "wagmi";
import { PackRipperAbi } from "../contracts";
import { useGame, useTx } from "../lib/useGame";
import { revealOrder, toCard, type Card } from "../lib/cards";
import { dashArt, liveEntry } from "../lib/designCard";
import { DcView } from "../dc";
import { PackArt } from "../components/CardView";

const PENDING = 1;
const DRAWN = 2;
const OPENED = 3;

export function Rip({ packIds, onDone, onBack }: { packIds: bigint[]; onDone: () => void; onBack: () => void }) {
  const { c } = useGame();
  const { send, pending, error } = useTx();
  const [revealing, setRevealing] = useState(false);

  const info = useReadContracts({
    contracts: packIds.map((id) => ({ address: c!.PackRipper, abi: PackRipperAbi, functionName: "packInfo", args: [id] }) as const),
    query: { enabled: packIds.length > 0, refetchInterval: (q) => (q.state.data?.some((r) => r.result?.[1] === PENDING) ? 3000 : false) },
  });
  const statuses = packIds.map((_, i) => Number(info.data?.[i]?.result?.[1] ?? 0));
  const allDrawn = statuses.length > 0 && statuses.every((s) => s >= DRAWN);
  const toOpen = packIds.filter((_, i) => statuses[i] === DRAWN);
  const allOpened = statuses.length > 0 && statuses.every((s) => s === OPENED);

  const drawn = useReadContracts({
    contracts: packIds.map((id) => ({ address: c!.PackRipper, abi: PackRipperAbi, functionName: "drawnCards", args: [id] }) as const),
    query: { enabled: allDrawn },
  });
  const packCards: Card[][] = useMemo(
    () => packIds.map((_, i) => revealOrder(((drawn.data?.[i]?.result as readonly Parameters<typeof toCard>[0][] | undefined) ?? []).map(toCard))),
    [drawn.data, packIds],
  );

  // Warm the Dash cut-outs while the player is still on the "ready" screen, so the reveal never
  // shows a card before its art has loaded.
  useEffect(() => {
    for (const card of packCards.flat()) if (card.set <= 3) new Image().src = dashArt(card.design + 1).url;
  }, [packCards]);

  useEffect(() => {
    if (allOpened && packCards.every((p) => p.length)) setRevealing(true);
  }, [allOpened, packCards]);

  async function open() {
    const rc = await send("open", { address: c!.PackRipper, abi: PackRipperAbi, functionName: "openPacks", args: [toOpen] });
    if (rc) setRevealing(true);
  }

  if (!packIds.length) {
    return (
      <section className="panel">
        <p className="muted">No packs selected.</p>
        <button className="btn" onClick={onBack}>
          ← My packs
        </button>
      </section>
    );
  }

  if (revealing && packCards.every((p) => p.length)) return <Reveal packs={packCards} packIds={packIds} onDone={onDone} />;

  return (
    <section className="panel rip-stage">
      <div className="kicker">
        {packIds.length} {packIds.length === 1 ? "PACK" : "PACKS"} · PAID
      </div>
      <div className={`rip-packs ${allDrawn ? "is-ready" : "is-waiting"}`}>
        {packIds.map((id) => (
          <PackArt key={id.toString()} id={id} size={150} />
        ))}
      </div>
      {!allDrawn ? (
        <>
          <h2>Drawing your cards…</h2>
          <p className="muted">
            Chainlink VRF is generating verifiable randomness for your {packIds.length === 1 ? "pack" : "packs"}. The cards are drawn from the
            print run the moment it arrives, usually within a minute.
          </p>
          <div className="loader" />
        </>
      ) : (
        <>
          <h2>Your cards are ready</h2>
          <p className="muted">Rip it open to mint the {packIds.length * 10} cards to your wallet.</p>
          <button className="btn btn-yellow btn-lg" disabled={!!pending || !toOpen.length} onClick={open}>
            {pending ? "Ripping…" : `Rip open ${packIds.length === 1 ? "pack" : `${packIds.length} packs`}`}
          </button>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </section>
  );
}

/**
 * The design's own pack-opening scene, driven by the cards Chainlink VRF actually drew: tear the
 * wrapper, deal the cards, flip each one, then browse them close up.
 */
function Reveal({ packs, packIds, onDone }: { packs: Card[][]; packIds: bigint[]; onDone: () => void }) {
  const [p, setP] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const live = useMemo(() => packs[p].map(liveEntry), [packs, p]);
  const last = p === packs.length - 1;
  return (
    <section className="panel reveal-live">
      <div className="row-gap" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <div className="kicker" style={{ margin: 0 }}>
          PACK #{packIds[p].toString()}
          {packs.length > 1 && ` · ${p + 1} OF ${packs.length}`}
        </div>
        <div className="row-gap" style={{ margin: 0 }}>
          {!last && (
            <button className="btn btn-yellow btn-sm" onClick={() => setP(p + 1)}>
              Next pack →
            </button>
          )}
          <button className={`btn btn-sm ${last ? "btn-yellow" : ""}`} onClick={onDone}>
            View my collection →
          </button>
        </div>
      </div>
      <div ref={box} className="rip-live-box">
        <DcView key={`${p}`} name="PackRipLive" props={{ live, kicker: `PACK ${p + 1} OF ${packs.length} · PAID` }} width={width} />
      </div>
      <p className="muted small">Drag across the top of the pack (or tap it) to rip it open, then tap each card to flip it.</p>
    </section>
  );
}
