import { useEffect, useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { PackRipperAbi } from "../contracts";
import { useGame, useTx } from "../lib/useGame";
import { FINISHES, SETS, cardName, printed, rarity, revealOrder, toCard, type Card } from "../lib/cards";
import { CardBack, CardFront, FlipCard, PackArt } from "../components/CardView";

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

function Reveal({ packs, packIds, onDone }: { packs: Card[][]; packIds: bigint[]; onDone: () => void }) {
  const [p, setP] = useState(0);
  const [i, setI] = useState(0);
  const [front, setFront] = useState(false);
  const [done, setDone] = useState(false);
  const cards = packs[p];
  const card = cards[i];

  const next = () => {
    if (i < cards.length - 1) {
      setI(i + 1);
      setFront(false);
    } else if (p < packs.length - 1) {
      setP(p + 1);
      setI(0);
      setFront(false);
    } else setDone(true);
  };

  if (done) {
    const all = packs.flat();
    const best = [...all].sort((a, b) => rarity(printed(a.set, a.finish)) - rarity(printed(b.set, b.finish)))[0];
    return (
      <section className="panel">
        <div className="kicker">PULLED {all.length} CARDS</div>
        <h2>
          Best pull: {cardName(best.set, best.design)} · {SETS[best.set].name} {FINISHES[best.finish]}
        </h2>
        <p className="muted">Tap a card to see its back. These are now NFTs in your wallet.</p>
        <div className="card-grid">
          {all.map((cd, k) => (
            <FlipCard key={k} card={cd} size={170} />
          ))}
        </div>
        <button className="btn btn-yellow btn-lg" onClick={onDone}>
          View my collection →
        </button>
      </section>
    );
  }

  const tier = rarity(printed(card.set, card.finish));
  const hit = card.finish > 0 || SETS[card.set].rank >= 3;
  const word = SETS[card.set].rank >= 5 ? "IMPACT PULL!" : SETS[card.set].rank === 7 ? "KEY CARD!" : card.finish === 2 ? "HOLO DASH!" : card.finish === 1 ? "HOLO!" : SETS[card.set].rank >= 3 ? `${SETS[card.set].short}!` : "";

  return (
    <section className="panel reveal">
      <div className="kicker">
        PACK #{packIds[p].toString()} · CARD {i + 1} OF {cards.length}
        {packs.length > 1 && ` · PACK ${p + 1} OF ${packs.length}`}
      </div>
      <div className="reveal-stage">
        <button className={`reveal-card ${front ? "is-front" : ""}`} onClick={() => (front ? next() : setFront(true))} key={`${p}-${i}`}>
          <div className="flip-inner">
            <div className="flip-face flip-back-first">
              <CardBack card={card} size={260} />
            </div>
            <div className="flip-face flip-front-second">
              <CardFront card={card} size={260} />
            </div>
          </div>
        </button>
        {front && hit && word && (
          <div className="burst" style={{ color: SETS[card.set].color }}>
            {word}
          </div>
        )}
      </div>
      <p className="muted">
        {front
          ? `${SETS[card.set].name} · ${FINISHES[card.finish]} · ${card.serial}/${card.copies} · Rarity ${tier}`
          : `Rarity ${tier} on the back. Tap to flip.`}
      </p>
      <div className="row-gap center">
        <button className="btn btn-yellow" onClick={() => (front ? next() : setFront(true))}>
          {front ? "Next card →" : "Flip"}
        </button>
        <button className="btn btn-ghost" onClick={() => setDone(true)}>
          Skip to all cards
        </button>
      </div>
    </section>
  );
}
