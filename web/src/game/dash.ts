// Who you play as. Every Doge Dash NFT plays as itself; a lucky few unlock perks.

export type Perk = "extraLife" | "superJump" | "doubleRewards";

export type DashProfile = {
  /** Doge Dash token ID, or 0 for the guest pup. */
  id: number;
  name: string;
  skin: { base: string; dark: string; belly: string; pattern: "plain" | "tiger" | "jaguar" };
  accessory: "none" | "headphones" | "halo" | "mohawk" | "cap" | "ribbon" | "crown";
  accessoryColor: string;
  perks: Perk[];
  /** Holds at least one Series 1 card of this Dash: runs with a holo trail. */
  holoTrail: boolean;
};

export const PERK_INFO: Record<Perk, { label: string; short: string; desc: string }> = {
  extraLife: { label: "Extra life", short: "+1 ♥", desc: "Start every run with 4 lives instead of 3." },
  superJump: { label: "Super jump", short: "2× JUMP", desc: "Jump again in mid-air." },
  doubleRewards: { label: "Double rewards", short: "2× COINS", desc: "Every coin counts twice." },
};

/** The 25 ultra-rare Dashes (the Costume Party / Impact / Golden Bone set) unlock every perk. */
export const ULTRA_RARE_IDS = new Set([
  118, 1054, 2299, 846, 475, 2866, 3674, 1479, 2632, 731, 2362, 3412, 3583, 762, 1677, 2116, 2729, 1857, 3577, 1283, 1085,
  1944, 3722, 1578, 3662,
]);

const SKINS = [
  { base: "#3d8bff", dark: "#1d4fb0", belly: "#cfe3ff", label: "Blue" },
  { base: "#ff8a1f", dark: "#b65300", belly: "#ffe0b8", label: "Orange" },
  { base: "#ff6fb5", dark: "#c22f7a", belly: "#ffe0ef", label: "Pink" },
  { base: "#f2c14e", dark: "#a8771a", belly: "#fff3cc", label: "Gold" },
  { base: "#9b6bff", dark: "#5a33b8", belly: "#e8dcff", label: "Purple" },
];
const PATTERNS = ["plain", "tiger", "jaguar"] as const;
const ACCESSORIES = ["none", "headphones", "halo", "mohawk", "cap", "ribbon", "crown"] as const;
const ACC_COLORS = ["#ff1fb4", "#3d8bff", "#ff3b3b", "#ffe14d", "#2fcf8a"];

/** Small deterministic hash so a token always gets the same look and perks. */
export function hash(n: number, salt = 0): number {
  let x = (n * 2654435761 + salt * 40503 + 0x9e3779b9) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Perks for a Doge Dash token. About 1 in 7 Dashes gets one perk; the 25 ultra rares get all three.
 * (Testnet rule: the real rule should come from the collection's trait metadata.)
 */
export function perksFor(id: number): Perk[] {
  if (id <= 0) return [];
  if (ULTRA_RARE_IDS.has(id)) return ["extraLife", "superJump", "doubleRewards"];
  const r = hash(id, 7) % 100;
  if (r < 5) return ["extraLife"];
  if (r < 10) return ["superJump"];
  if (r < 15) return ["doubleRewards"];
  return [];
}

export function profileFor(id: number, holoTrail = false): DashProfile {
  if (id <= 0) {
    return {
      id: 0,
      name: "GUEST PUP",
      skin: { base: "#e0b07a", dark: "#9a6a3a", belly: "#fff1dc", pattern: "plain" },
      accessory: "none",
      accessoryColor: "#ff1fb4",
      perks: [],
      holoTrail: false,
    };
  }
  const s = SKINS[hash(id, 1) % SKINS.length];
  return {
    id,
    name: `DASH #${id}`,
    skin: { base: s.base, dark: s.dark, belly: s.belly, pattern: PATTERNS[hash(id, 2) % PATTERNS.length] },
    accessory: ACCESSORIES[hash(id, 3) % ACCESSORIES.length],
    accessoryColor: ACC_COLORS[hash(id, 4) % ACC_COLORS.length],
    perks: perksFor(id),
    holoTrail,
  };
}

export function traitLabel(p: DashProfile): string {
  if (p.id === 0) return "No NFT needed · Level 1 only";
  const skin = SKINS.find((s) => s.base === p.skin.base)?.label ?? "";
  const pat = p.skin.pattern === "plain" ? "" : ` ${p.skin.pattern[0].toUpperCase()}${p.skin.pattern.slice(1)}`;
  const acc = p.accessory === "none" ? "" : ` · ${p.accessory[0].toUpperCase()}${p.accessory.slice(1)}`;
  return `${skin}${pat}${acc}`;
}
