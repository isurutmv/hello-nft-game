import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { DashCardsAbi } from "../contracts";
import { useGame } from "../lib/useGame";
import { SETS, printed, rarity, toCard, type Card } from "../lib/cards";
import { FlipCard } from "../components/CardView";

const PAGE = 300n;

export function Binder() {
  const { c, address } = useGame();
  const [setFilter, setSetFilter] = useState<number | "all">("all");
  const [sort, setSort] = useState<"rarity" | "newest">("rarity");

  const res = useReadContract({
    address: c!.DashCards,
    abi: DashCardsAbi,
    functionName: "cardsOf",
    args: address ? [address, 0n, PAGE] : undefined,
    query: { enabled: !!address },
  });
  const [ids, raw, total] = res.data ?? [[], [], 0n];
  const cards = useMemo(() => raw.map((r, k) => ({ id: ids[k], card: toCard(r) })), [ids, raw]);

  const bySet = useMemo(() => {
    const m = new Map<number, { designs: Set<number>; count: number }>();
    for (const { card } of cards) {
      const e = m.get(card.set) ?? { designs: new Set<number>(), count: 0 };
      e.designs.add(card.design);
      e.count++;
      m.set(card.set, e);
    }
    return m;
  }, [cards]);

  const shown = cards
    .filter(({ card }) => setFilter === "all" || card.set === setFilter)
    .sort((a, b) =>
      sort === "newest"
        ? Number(b.id - a.id)
        : rarity(printed(a.card.set, a.card.finish)) - rarity(printed(b.card.set, b.card.finish)) || Number(b.id - a.id),
    );

  return (
    <section className="panel">
      <div className="kicker">COLLECTION BINDER</div>
      <h2>My cards</h2>
      <p className="muted">
        {total.toString()} cards{total > PAGE ? ` (showing the first ${PAGE})` : ""}. Tap a card to flip it.
      </p>

      <div className="set-progress">
        {SETS.map((s, i) => {
          const e = bySet.get(i);
          const pct = e ? (e.designs.size / s.designs) * 100 : 0;
          return (
            <button key={s.name} className={`set-chip ${setFilter === i ? "on" : ""}`} onClick={() => setSetFilter(setFilter === i ? "all" : i)}>
              <span className="dot" style={{ background: s.color }} />
              <span className="set-chip-name">{s.name}</span>
              <span className="set-chip-n">
                {e?.designs.size ?? 0}/{s.designs.toLocaleString()}
              </span>
              <span className="bar">
                <span style={{ width: `${Math.max(pct, e ? 2 : 0)}%`, background: s.color }} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="row-gap">
        <div className="seg">
          <button className={sort === "rarity" ? "on" : ""} onClick={() => setSort("rarity")}>
            Rarest first
          </button>
          <button className={sort === "newest" ? "on" : ""} onClick={() => setSort("newest")}>
            Newest
          </button>
        </div>
        {setFilter !== "all" && (
          <button className="btn btn-sm btn-ghost" onClick={() => setSetFilter("all")}>
            Show all sets
          </button>
        )}
      </div>

      {res.isLoading ? (
        <p className="muted">Loading cards…</p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>No cards yet.</p>
          <p className="muted">Rip a pack to pull your first 10 cards.</p>
        </div>
      ) : (
        <div className="card-grid">
          {shown.map(({ id, card }) => (
            <div key={id.toString()} className="binder-slot">
              <FlipCard card={card as Card} size={170} />
              <div className="muted small">Card #{id.toString()}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
