// Maps an on-chain card (set, finish, design, serial) to the props of the design's card
// components, mirroring how the design's own pack-opening screen builds its cards.
import data from "../dc/design-data.json";
import meta from "../data/dash-meta.json";
import { assetUrl } from "../dc";
import { printed, rarity, type Card } from "./cards";

type Sample = { tok: number; art: string; bg: string; name: string; no: string };
const SAMPLES = new Map<number, Sample>((data.dashes as Sample[]).map((d) => [d.tok, d]));
const SUPERS = data.supers as { tok: number; art: string; name: string }[];

const META = meta as { palette: string[]; bg: string; names: Record<string, string> };

/** Where a Doge Dash's cut-out art comes from: the design file if it has it, else the cut-out service. */
export function dashArt(tok: number): { url: string; fromDesign: boolean } {
  const s = SAMPLES.get(tok);
  if (s) return { url: assetUrl(s.art), fromDesign: true };
  return { url: `/api/dash/${tok}`, fromDesign: false };
}

/** Card background for a Doge Dash, from its Background trait. */
export function dashBg(tok: number): string {
  const s = SAMPLES.get(tok);
  if (s) return s.bg;
  const i = META.bg.charCodeAt(tok - 1) - 48;
  return META.palette[i] ?? "#ff1fb4";
}

export function dashName(tok: number): string {
  return SAMPLES.get(tok)?.name ?? META.names[String(tok)] ?? `DASH #${tok}`;
}

// The design's set keys, in PrintRun order.
const KEYS = ["base", "prism", "run", "zoom", "enemy", "lvl", "adv", "costume", "imp_colour", "imp_prism", "imp_silver", "imp_gold", "imp_bone", "key"] as const;
const SET_LABEL = ["BASE", "SKY PRISM", "RUN CYCLE", "ZOOMIES!", "ENEMIES", "LEVEL CARDS", "DASH ADVENTURES", "COSTUME PARTY", "IMPACT COLOUR", "IMPACT PRISM", "IMPACT SILVER", "IMPACT GOLD", "GOLDEN BONE", "KEY CARD"];
const VERSION = ["NORMAL", "HOLO CARD", "HOLO DASH"];
/** Holo Dash foil area per card type (from the design). */
const BOX: Record<string, [number, number, number, number]> = {
  base: [42, 96, 277, 274],
  prism: [60, 85, 245, 288],
  run: [111, 158, 238, 238],
  zoom: [78, 161, 209, 223],
  costume: [69, 81, 230, 281],
  impact: [55, 178, 250, 250],
};
const KEY_BOX: Record<string, [number, number, number, number, string]> = {
  A: [55, 160, 250, 214, "mk-Sit"],
  B: [50, 130, 260, 250, "mk-Run"],
  C: [105, 106, 150, 128, "mk-Sit"],
  D: [40, -26, 280, 269, "mk-Run"],
};
const ADV = [
  "FIRST STEPS", "DANGER AHEAD", "SWARM!", "HOME AT LAST", "COIN RUSH", "CHICKEN RUN", "BUZZ OFF", "TUSK TROUBLE", "JUNGLE JUMP", "STARE DOWN",
  "ROUTE 66", "RUSH HOUR", "STREET SWARM", "ICE DASH", "COLD FEET", "SNOW NAP", "BIG CHILL", "SPACE DASH", "MOON JUMP", "STAR GAZER",
  "COSMIC NAP", "LOST IN SPACE", "ALMOST HOME", "WELCOME HOME", "THE FINAL DASH",
];
const LVL: [string, string][] = [["1", "BIRD WATCH"], ["3", "DANGER AHEAD"], ["5", "BUZZ CITY"], ["7", "THIN ICE"], ["space", "SHOOTING STARS"]];
const LPART = ["LET’S GO!", "COIN TRAIL", "", "TAKE FIVE", "LEVEL CLEAR"];
const ENEM: [string, string[]][] = [
  ["boar", ["CHARGE!", "TUSK TROUBLE", "ON PATROL"]],
  ["chicken", ["FEATHER STORM", "BAWK!", "SNEAKING UP"]],
  ["wasp", ["STING OPERATION", "SWARM LEADER", "SPACE BUZZ"]],
];
const KEY_NAMES: Record<string, string> = { A: "THE ORIGINAL", B: "COSMIC", C: "COIN KING", D: "BREAKOUT" };

export type DesignCard = Record<string, unknown> & { name: string; tokLabel: string };

export function designCard(card: Card): DesignCard {
  const key = KEYS[card.set];
  const vi = card.finish;
  const vname = VERSION[vi];
  const n = printed(card.set, card.finish);
  const o: DesignCard = {
    k: "base",
    isSeries: false,
    isImpact: false,
    isAdv: false,
    isLvl: false,
    isEnemy: false,
    isKey: false,
    version: vname,
    holoCard: vi === 1,
    holoDash: vi === 2,
    serial: `${card.serial}/${card.copies}`,
    name: "",
    tok: "[ID]",
    no: "001",
    pup: false,
    mask: "",
    maskStyle: "",
    mx: 0,
    my: 0,
    mw: 0,
    mh: 0,
    copiesN: card.copies,
    printed: n,
    rarity: rarity(n),
    backSet: SET_LABEL[card.set].charAt(0) + SET_LABEL[card.set].slice(1).toLowerCase(),
    backVer: vname.charAt(0) + vname.slice(1).toLowerCase(),
    tokLabel: "Series 1 set card",
  };
  let box: [number, number, number, number] | null = null;
  const art = (tok: number, fromDesignMask: boolean, url: string) => {
    o.mask = fromDesignMask ? `mk-n${tok}` : "";
    o.maskStyle = fromDesignMask
      ? ""
      : `-webkit-mask-image:url(${url});mask-image:url(${url});-webkit-mask-size:contain;mask-size:contain;-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat`;
  };

  if (card.set <= 3) {
    // Base, Sky Prism, Run Cycle, ZOOMIES!: one design per Doge Dash token
    const tok = card.design + 1;
    const a = dashArt(tok);
    Object.assign(o, { isSeries: true, k: key, art: a.url, name: dashName(tok), no: String(tok).slice(-3).padStart(3, "0"), bg: dashBg(tok), tok: String(tok) });
    // The design's PUP CARD ribbon marks the first mint of a Base design.
    o.pup = card.set === 0 && card.serial === 1;
    art(tok, a.fromDesign, a.url);
    box = BOX[key];
  } else if (card.set === 7 || (card.set >= 8 && card.set <= 12)) {
    const s = SUPERS[card.design];
    const url = assetUrl(s.art);
    if (card.set === 7) {
      Object.assign(o, { isSeries: true, k: "costume", art: url, name: s.name, no: String(s.tok), tok: String(s.tok) });
      box = BOX.costume;
    } else {
      Object.assign(o, { isImpact: true, art: url, name: s.name, tok: String(s.tok), finish: ["colour", "prism", "silver", "gold", "bone"][card.set - 8] });
      box = BOX.impact;
    }
    art(s.tok, true, url);
  } else if (card.set === 13) {
    const kid = "ABCD"[card.design];
    const kb = KEY_BOX[kid];
    Object.assign(o, { isKey: true, keyId: kid, name: `DASH · ${KEY_NAMES[kid]}`, mask: kb[4], serial: `${card.serial} / ${card.copies}` });
    box = [kb[0], kb[1], kb[2], kb[3]];
  } else if (card.set === 6) {
    Object.assign(o, { isAdv: true, scene: card.design + 1, name: ADV[card.design] });
  } else if (card.set === 5) {
    const L = LVL[Math.floor(card.design / 5)];
    const p = (card.design % 5) + 1;
    Object.assign(o, { isLvl: true, level: L[0], part: p, name: p === 3 ? L[1] : LPART[p - 1] });
  } else {
    const E = ENEM[Math.floor(card.design / 3)];
    const d = (card.design % 3) + 1;
    Object.assign(o, { isEnemy: true, enemy: E[0], design: d, name: E[1][d - 1] });
  }
  if (box) Object.assign(o, { mx: box[0], my: box[1], mw: box[2], mh: box[3] });
  // Cards without a Dash cut-out (Adventures, Levels, Enemies) show Holo Dash as a full-card holo.
  if (!box && o.holoDash) {
    o.holoDash = false;
    o.holoCard = true;
  }
  o.tokLabel = o.tok && o.tok !== "[ID]" ? `Token #${o.tok}` : "Series 1 set card";
  return o;
}

/**
 * One card as a live entry for the design's pack-opening screen (PackRipLive), which then builds
 * the card, its finish effects and its reveal exactly as the design does.
 */
export function liveEntry(card: Card): Record<string, unknown> {
  const e: Record<string, unknown> = { cat: KEYS[card.set], vi: card.finish, cnt: card.copies, serial: card.serial };
  if (card.set <= 3) {
    const tok = card.design + 1;
    const a = dashArt(tok);
    e.dash = {
      art: a.url,
      name: dashName(tok),
      no: String(tok).slice(-3).padStart(3, "0"),
      bg: dashBg(tok),
      tok: String(tok),
      m: a.fromDesign ? `n${tok}` : "",
      maskStyle: a.fromDesign
        ? ""
        : `-webkit-mask-image:url(${a.url});mask-image:url(${a.url});-webkit-mask-size:contain;mask-size:contain;-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat`,
    };
    e.pup = card.set === 0 && card.serial === 1;
  } else if (card.set >= 7 && card.set <= 12) e.super = card.design;
  else if (card.set === 13) e.keyId = "ABCD"[card.design];
  else if (card.set === 6) e.scene = card.design + 1;
  else if (card.set === 5) {
    e.lvl = Math.floor(card.design / 5);
    e.part = (card.design % 5) + 1;
  } else {
    e.enemy = Math.floor(card.design / 3);
    e.design = (card.design % 3) + 1;
  }
  return e;
}
