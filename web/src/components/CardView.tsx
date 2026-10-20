import { useState } from "react";
import type { Card } from "../lib/cards";
import { designCard } from "../lib/designCard";
import { DcView } from "../dc";

/** Front of a Series 1 card, rendered from the design's own card templates. */
export function CardFront({ card, size = 220, gx, gy }: { card: Card; size?: number; gx?: number; gy?: number }) {
  return <DcView name="CardFace" props={{ card: designCard(card), gx, gy }} width={size} className="dc-card" />;
}

/** Back of a card: the design's rarity medal, print count and copy count. */
export function CardBack({ card, size = 220 }: { card: Card; size?: number }) {
  return <DcView name="CardFace" props={{ card: designCard(card), back: true, glare: false }} width={size} className="dc-card" />;
}

/** A card that flips between front and back when clicked, with the design's light glare under the pointer. */
export function FlipCard({ card, size = 220, startFlipped = false }: { card: Card; size?: number; startFlipped?: boolean }) {
  const [back, setBack] = useState(startFlipped);
  const [glare, setGlare] = useState<{ gx: number; gy: number } | null>(null);
  return (
    <button
      className={`flip ${back ? "is-back" : ""}`}
      onClick={() => setBack(!back)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setGlare({ gx: Math.round(((e.clientX - r.left) / r.width) * 100), gy: Math.round(((e.clientY - r.top) / r.height) * 100) });
      }}
      onPointerLeave={() => setGlare(null)}
      aria-label="Flip card"
      style={{ width: size }}
    >
      <div className="flip-inner">
        <div className="flip-face">
          <CardFront card={card} size={size} gx={glare?.gx} gy={glare?.gy} />
        </div>
        <div className="flip-face flip-back">
          <CardBack card={card} size={size} />
        </div>
      </div>
    </button>
  );
}

/** A sealed Series 1 pack, from the design's pack wrapper. */
export function PackArt({ id, size = 160, selected = false, shine = 30 }: { id: bigint | number; size?: number; selected?: boolean; shine?: number }) {
  return (
    <div className={`pack-dc ${selected ? "is-selected" : ""}`} style={{ width: size }}>
      <DcView name="PackWrapper" props={{ shine }} width={size} />
      <div className="pack-dc-id">PACK #{String(id).padStart(5, "0")}</div>
    </div>
  );
}
