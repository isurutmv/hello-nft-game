// Mirrors contracts/src/libraries/PrintRun.sol and CardRenderer.sol.

export type Card = {
  set: number;
  finish: number;
  design: number;
  serial: number;
  copies: number;
  packId: bigint;
};

export type SetInfo = {
  name: string;
  short: string;
  designs: number;
  copies: [number, number, number];
  color: string;
  tier: string;
  /** Display rank: higher sorts later in a pack reveal (biggest hit last). */
  rank: number;
};

export const SETS: SetInfo[] = [
  { name: "Base", short: "BASE", designs: 4119, copies: [8, 3, 2], color: "#ff1fb4", tier: "Common", rank: 0 },
  { name: "Sky Prism", short: "SKY PRISM", designs: 4119, copies: [5, 2, 2], color: "#2aa3e0", tier: "Uncommon", rank: 1 },
  { name: "Run Cycle", short: "RUN CYCLE", designs: 4119, copies: [5, 2, 1], color: "#2fcf8a", tier: "Rare", rank: 1 },
  { name: "ZOOMIES!", short: "ZOOMIES!", designs: 4119, copies: [7, 3, 3], color: "#ff2e63", tier: "Insert", rank: 2 },
  { name: "Enemies", short: "ENEMIES", designs: 9, copies: [150, 24, 6], color: "#8a1846", tier: "Set", rank: 3 },
  { name: "Level Cards", short: "LEVEL", designs: 25, copies: [64, 12, 4], color: "#c98a4b", tier: "Set", rank: 3 },
  { name: "Dash Adventures", short: "ADVENTURE", designs: 25, copies: [80, 12, 6], color: "#0a6cf0", tier: "Set", rank: 3 },
  { name: "Costume Party", short: "COSTUME PARTY", designs: 25, copies: [12, 2, 1], color: "#6a2bd9", tier: "Super rare", rank: 4 },
  { name: "Impact Colour", short: "IMPACT COLOUR", designs: 25, copies: [10, 2, 1], color: "#ff8a1f", tier: "Ultra rare", rank: 5 },
  { name: "Impact Prism", short: "IMPACT PRISM", designs: 25, copies: [10, 2, 1], color: "#5fbfef", tier: "Ultra rare", rank: 5 },
  { name: "Impact Silver", short: "IMPACT SILVER", designs: 25, copies: [5, 2, 1], color: "#8a93a8", tier: "Ultra rare", rank: 5 },
  { name: "Impact Gold", short: "IMPACT GOLD", designs: 25, copies: [3, 2, 1], color: "#d9a514", tier: "Ultra rare", rank: 5 },
  { name: "Golden Bone", short: "GOLDEN BONE", designs: 25, copies: [1, 2, 1], color: "#b37806", tier: "Chase", rank: 6 },
  { name: "Key Card", short: "KEY CARD", designs: 4, copies: [3, 2, 1], color: "#14102e", tier: "Grail", rank: 7 },
];

export const FINISHES = ["Normal", "Holo Card", "Holo Dash"] as const;

export const TOTAL_CARDS = SETS.reduce((a, s) => a + s.designs * (s.copies[0] + s.copies[1] + s.copies[2]), 0);

const ENEMIES = [
  "BOAR · CHARGE!", "BOAR · TUSK TROUBLE", "BOAR · ON PATROL",
  "CHICKEN · FEATHER STORM", "CHICKEN · BAWK!", "CHICKEN · SNEAKING UP",
  "WASP · STING OPERATION", "WASP · SWARM LEADER", "WASP · SPACE BUZZ",
];
const LEVELS = ["LEVEL 1", "LEVEL 3", "LEVEL 5", "LEVEL 7", "SPACE"];
const LEVEL_TITLES = ["BIRD WATCH", "DANGER AHEAD", "BUZZ CITY", "THIN ICE", "SHOOTING STARS"];
const LEVEL_PARTS = ["LET’S GO!", "COIN TRAIL", "", "TAKE FIVE", "LEVEL CLEAR"];
const ADVENTURES = [
  "FIRST STEPS", "DANGER AHEAD", "SWARM!", "HOME AT LAST", "COIN RUSH", "CHICKEN RUN", "BUZZ OFF",
  "TUSK TROUBLE", "JUNGLE JUMP", "STARE DOWN", "ROUTE 66", "RUSH HOUR", "STREET SWARM", "ICE DASH",
  "COLD FEET", "SNOW NAP", "BIG CHILL", "SPACE DASH", "MOON JUMP", "STAR GAZER", "COSMIC NAP",
  "LOST IN SPACE", "ALMOST HOME", "WELCOME HOME", "THE FINAL DASH",
];
const KEYS = ["THE ORIGINAL", "COSMIC", "COIN KING", "BREAKOUT"];
const SUPERS = [
  "DASH #118", "DASH #1054", "ASTRO DASH", "CYBORG DASH", "DASH #475", "DASH #2866", "DASH #3674",
  "DASH #1479", "DASH #2632", "LION DASH", "DASH #2362", "DASH #3412", "DASH #3583", "DASH #762",
  "ALIEN DASH", "DEVIL DASH", "DASH #2729", "DASH #1857", "DASH #3577", "DASH #1283", "ZOMBIE DASH",
  "DASH #1944", "DASH #3722", "DASH #1578", "DASH #3662",
];

export function cardName(set: number, design: number): string {
  if (set <= 3) return `DASH #${design + 1}`;
  if (set === 4) return ENEMIES[design];
  if (set === 5) {
    const l = Math.floor(design / 5);
    const p = design % 5;
    return `${LEVELS[l]} · ${p + 1}/5 · ${p === 2 ? LEVEL_TITLES[l] : LEVEL_PARTS[p]}`;
  }
  if (set === 6) return ADVENTURES[design];
  if (set === 13) return `DASH · ${KEYS[design]}`;
  return SUPERS[design];
}

export function printed(set: number, finish: number): number {
  return SETS[set].designs * SETS[set].copies[finish];
}

/** 1 (rarest) to 7, from how many cards exist in that set and finish. */
export function rarity(printedCount: number): number {
  if (printedCount >= 10_000) return 7;
  if (printedCount >= 1_000) return 6;
  if (printedCount >= 151) return 5;
  if (printedCount >= 61) return 4;
  if (printedCount >= 31) return 3;
  if (printedCount >= 13) return 2;
  return 1;
}

export const RARITY_COLORS = [
  "linear-gradient(135deg,#ff9ad5,#ffe57a,#8dffc9,#7fd6ff,#c9a2ff,#ff9ad5)",
  "linear-gradient(180deg,#fff6c2 0%,#f5c431 45%,#b37806 60%,#ffe27a 100%)",
  "linear-gradient(180deg,#ffc2e0 0%,#ff4fa3 50%,#a8115c 100%)",
  "linear-gradient(180deg,#e2ccff 0%,#9b5cff 50%,#5a20b0 100%)",
  "linear-gradient(180deg,#c8ecff 0%,#2aa3e0 50%,#105d8a 100%)",
  "linear-gradient(180deg,#c9ffe6 0%,#2fcf8a 50%,#137a4d 100%)",
  "linear-gradient(180deg,#eef0f6 0%,#9aa3b8 50%,#555d72 100%)",
];

export function toCard(c: { set: number; finish: number; design: number; serial: number; copies: number; packId: number | bigint }): Card {
  return { set: Number(c.set), finish: Number(c.finish), design: Number(c.design), serial: Number(c.serial), copies: Number(c.copies), packId: BigInt(c.packId) };
}

/** Reveal order: commons first, biggest hit last. */
export function revealOrder(cards: Card[]): Card[] {
  const score = (c: Card) => SETS[c.set].rank * 10 + c.finish * 3 + (7 - rarity(printed(c.set, c.finish)));
  return [...cards].sort((a, b) => score(a) - score(b));
}
