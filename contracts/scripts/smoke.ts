import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/** End-to-end check on a live network: mint, claim, pay, rip, wait for VRF, open. */
async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), "utf8"));
  const c = d.contracts;
  const [me] = await ethers.getSigners();
  const doge = await ethers.getContractAt("MockDogeDash", c.MockDogeDash);
  const packs = await ethers.getContractAt("DashPacks", c.DashPacks);
  const usdc = await ethers.getContractAt("MockStablecoin", c.USDC);
  const ripper = await ethers.getContractAt("PackRipper", c.PackRipper);
  const cards = await ethers.getContractAt("DashCards", c.DashCards);
  const wait = async (label: string, tx: Promise<{ wait(): Promise<unknown> }>) => {
    await (await tx).wait();
    console.log(`  ✓ ${label}`);
  };

  await wait("mint 1 test Doge Dash", doge.mint(1));
  const ids = await doge.tokensOf(me.address);
  const fresh = [];
  for (const id of ids) if (!(await packs.claimed(id))) fresh.push(id);
  await wait(`claim packs for Doge Dash #${fresh.join(",")}`, packs.claim(fresh));
  await wait("USDC faucet", usdc.faucet());
  await wait("approve USDC", usdc.approve(c.PackRipper, ethers.MaxUint256));
  const myPacks = await packs.packsOf(me.address);
  const packId = myPacks[0];
  const rc: any = await (await ripper.rip([packId], c.USDC)).wait();
  const ev = rc.logs.map((l: any) => { try { return ripper.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === "Ripped");
  console.log(`  ✓ ripped pack #${packId}, VRF request ${ev.args.requestId}`);

  const t0 = Date.now();
  for (;;) {
    const [, status] = await ripper.packInfo(packId);
    if (status === 2n) break;
    if (Date.now() - t0 > 600_000) throw new Error("VRF did not answer within 10 minutes");
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`  ✓ Chainlink VRF answered in ${Math.round((Date.now() - t0) / 1000)}s`);
  await wait("open pack (mint 10 cards)", ripper.openPack(packId));
  const [, list] = await cards.cardsOf(me.address, 0, 50);
  const SETS = ["Base", "Sky Prism", "Run Cycle", "ZOOMIES!", "Enemies", "Level", "Adventure", "Costume", "Impact Colour", "Impact Prism", "Impact Silver", "Impact Gold", "Golden Bone", "Key Card"];
  const F = ["Normal", "Holo Card", "Holo Dash"];
  for (const x of list) console.log(`    ${SETS[Number(x.set)]} ${F[Number(x.finish)]} design ${x.design} ${x.serial}/${x.copies}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
