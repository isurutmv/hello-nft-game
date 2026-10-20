// Compacts HELLO Doge Dash metadata (fetched from IPFS) into web/src/data/dash-meta.json:
//   palette: the design's card background colours
//   bg:      one character per token (token N at index N-1) = palette index of its Background trait
//   names:   display names for the named ultra rares
// Usage: node scripts/build-dash-meta.mjs <doge-meta.json>
import fs from "node:fs";

const meta = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const design = JSON.parse(fs.readFileSync(new URL("../src/dc/design-data.json", import.meta.url), "utf8"));

// Background trait -> the design's card colour (checked against the design's sample Dashes below).
const BG = { Pink: "#ff1fb4", Orange: "#ff8a1f", Red: "#ff3b3b", Yellow: "#ffc21f", Blue: "#0a6cf0", Cyan: "#12c9e6", Purple: "#7b3cff", Lime: "#6fdc2f" };
const palette = Object.values(BG);
const unknown = new Set();

let mismatch = 0;
for (const d of design.dashes) {
  const t = meta[d.tok]?.t?.Background;
  if (t && BG[t] !== d.bg) {
    mismatch++;
    console.log(`  sample #${d.tok}: trait ${t} -> ${BG[t]}, design uses ${d.bg}`);
  }
}
console.log(`${design.dashes.length - mismatch}/${design.dashes.length} design samples match the trait mapping`);

let bg = "";
const names = {};
const missing = [];
for (let id = 1; id <= 4120; id++) {
  const m = meta[id];
  if (!m) missing.push(id);
  const i = m ? palette.indexOf(BG[m.t?.Background]) : 0;
  if (m && i < 0) unknown.add(m.t?.Background);
  bg += String.fromCharCode(48 + Math.max(0, i));
  if (m && !m.n.startsWith("#")) names[id] = m.n.toUpperCase();
}
if (unknown.size) console.log("unmapped Background traits (shown pink):", [...unknown].join(", "));
// The design's own names for the 25 ultra rares win (ASTRO DASH, CYBORG DASH, ...).
for (const s of design.supers) names[s.tok] = s.name;
fs.writeFileSync(new URL("../src/data/dash-meta.json", import.meta.url), JSON.stringify({ palette, bg, names }) + "\n");
console.log(`wrote dash-meta.json: ${4120 - missing.length} tokens${missing.length ? `, missing ${missing.length}: ${missing.slice(0, 20).join(",")}` : ""}`);
