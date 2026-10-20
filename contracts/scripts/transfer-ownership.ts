import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Hands the deployment to NEW_OWNER:
 *  - DashPacks, DashCards, CardRenderer: ownership moves immediately.
 *  - PackRipper: treasury moves immediately; ownership is two-step (Chainlink ConfirmedOwner),
 *    so NEW_OWNER must call acceptOwnership() on PackRipper.
 *  - VRF subscription: two-step too; NEW_OWNER accepts it at vrf.chain.link
 *    (or calls acceptSubscriptionOwnerTransfer(subId) on the coordinator).
 *
 *   NEW_OWNER=0x... npx hardhat run scripts/transfer-ownership.ts --network bscTestnet
 */
async function main() {
  const to = process.env.NEW_OWNER;
  if (!to || !ethers.isAddress(to)) throw new Error("Set NEW_OWNER to the wallet that should own the contracts");
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = d.contracts;
  const send = async (label: string, tx: Promise<{ wait(): Promise<unknown> }>) => {
    await (await tx).wait();
    console.log(`  ✓ ${label}`);
  };

  console.log(`Transferring ${network.name} deployment to ${to}`);
  const ripper = await ethers.getContractAt("PackRipper", c.PackRipper);
  await send("PackRipper treasury", ripper.setTreasury(to));
  for (const name of ["DashPacks", "DashCards", "CardRenderer"] as const) {
    const ct = await ethers.getContractAt(name, c[name]);
    await send(`${name} owner`, ct.transferOwnership(to));
  }
  await send("PackRipper owner proposed (accept with acceptOwnership)", ripper.transferOwnership(to));

  if (d.vrf?.subId && d.vrf.subId !== "1") {
    const coordinator = new ethers.Contract(
      d.vrf.coordinator,
      ["function requestSubscriptionOwnerTransfer(uint256 subId, address newOwner)"],
      (await ethers.getSigners())[0],
    );
    await send("VRF subscription owner proposed (accept at vrf.chain.link)", coordinator.requestSubscriptionOwnerTransfer(d.vrf.subId, to));
  }

  d.treasury = to;
  d.pendingOwner = to;
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
