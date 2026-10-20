import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Point card and pack NFT metadata at the deployed site, so wallets and marketplaces show the
 * Series 1 design art:
 *   image          {SITE_URL}/api/card/{id}.png  and  {SITE_URL}/api/pack/{id}.png
 *   animation_url  {SITE_URL}/card.html?id={id}  and  {SITE_URL}/card.html?pack={id}
 *
 *   SITE_URL=https://your-app.vercel.app npx hardhat run scripts/set-uris.ts --network bscTestnet
 */
async function main() {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  if (!site || !/^https?:\/\//.test(site)) throw new Error("Set SITE_URL, e.g. https://your-app.vercel.app");
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), "utf8"));
  const renderer = await ethers.getContractAt("CardRenderer", d.contracts.CardRenderer);
  const packs = await ethers.getContractAt("DashPacks", d.contracts.DashPacks);
  await (await renderer.setURIs(`${site}/api/card/`, `${site}/card.html?id=`)).wait();
  console.log(`  ✓ cards  -> ${site}/api/card/{id}.png`);
  await (await packs.setURIs(`${site}/api/pack/`, `${site}/card.html?pack=`)).wait();
  console.log(`  ✓ packs  -> ${site}/api/pack/{id}.png`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
