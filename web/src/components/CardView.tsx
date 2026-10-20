import { useState, type CSSProperties } from "react";
import { FINISHES, RARITY_COLORS, SETS, cardName, printed, rarity, type Card } from "../lib/cards";

/** Front of a Series 1 card. Stand-in art until the final card images are wired in. */
export function CardFront({ card, size = 220 }: { card: Card; size?: number }) {
  const set = SETS[card.set];
  const tier = rarity(printed(card.set, card.finish));
  const style = { "--w": `${size}px`, "--set": set.color } as CSSProperties;
  return (
    <div className={`card card-front finish-${card.finish}`} style={style}>
      <div className="card-inner">
        <div className="card-top">
          <span>{set.short}</span>
          <span>
            {card.serial}/{card.copies}
          </span>
        </div>
        <div className="card-art">
          <div className="card-dash">D</div>
          {card.finish === 2 && <div className="card-dashfoil" />}
        </div>
        <div className="card-bottom">
          <div className="card-name">{cardName(card.set, card.design)}</div>
          <div className="card-meta">
            {FINISHES[card.finish]} · Rarity {tier}
          </div>
        </div>
      </div>
      {card.finish > 0 && <div className="card-holo" />}
    </div>
  );
}

/** Back of a card: the rarity scale, how many exist in this finish, and this card's copy count. */
export function CardBack({ card, size = 220 }: { card: Card; size?: number }) {
  const n = printed(card.set, card.finish);
  const tier = rarity(n);
  const style = { "--w": `${size}px`, "--medal": RARITY_COLORS[tier - 1] } as CSSProperties;
  return (
    <div className="card card-back" style={style}>
      <div className="back-label">RARITY</div>
      <div className="back-medal">{tier}</div>
      <div className="back-printed">
        {n < 1000 ? "ONLY " : ""}
        {n.toLocaleString("en-US")} PRINTED
      </div>
      <div className="back-scale">
        {RARITY_COLORS.map((bg, i) => (
          <span key={i} style={i + 1 === tier ? { background: bg, color: "#1b1446" } : undefined}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="back-scale-legend">
        <span>← RAREST</span>
        <span>MOST PRINTED →</span>
      </div>
      <dl className="back-facts">
        <dt>SET</dt>
        <dd>{SETS[card.set].name}</dd>
        <dt>VERSION</dt>
        <dd>{FINISHES[card.finish]}</dd>
        <dt>THIS CARD</dt>
        <dd>{card.copies === 1 ? "One of one" : `${card.serial} of ${card.copies}`}</dd>
        <dt>PACK</dt>
        <dd>#{card.packId.toString()}</dd>
      </dl>
      <div className="back-foot">SERIES 1 · DIGITAL COLLECTOR CARD</div>
    </div>
  );
}

/** A card that flips between back and front when clicked. */
export function FlipCard({ card, size = 220, startFlipped = false }: { card: Card; size?: number; startFlipped?: boolean }) {
  const [back, setBack] = useState(startFlipped);
  return (
    <button className={`flip ${back ? "is-back" : ""}`} onClick={() => setBack(!back)} aria-label="Flip card" style={{ width: size }}>
      <div className="flip-inner">
        <div className="flip-face">
          <CardFront card={card} size={size} />
        </div>
        <div className="flip-face flip-back">
          <CardBack card={card} size={size} />
        </div>
      </div>
    </button>
  );
}

export function PackArt({ id, size = 160, selected = false }: { id: bigint | number; size?: number; selected?: boolean }) {
  return (
    <div className={`pack ${selected ? "is-selected" : ""}`} style={{ "--w": `${size}px` } as CSSProperties}>
      <div className="pack-crimp" />
      <div className="pack-body">
        <div className="pack-brand">DOGE DASH</div>
        <div className="pack-series">SERIES 1</div>
        <div className="pack-count">10 CARDS</div>
        <div className="pack-id">#{String(id).padStart(5, "0")}</div>
      </div>
      <div className="pack-crimp" />
    </div>
  );
}
