import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Local dev only: answers every VRFMock request a few seconds after it is made,
 * so the web app's rip flow behaves like it does on BSC testnet with Chainlink.
 */
async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const { contracts } = JSON.parse(fs.readFileSync(file, "utf8"));
  const vrf = await ethers.getContractAt("VRFMock", contracts.VRFMock);
  console.log(`Watching VRFMock at ${contracts.VRFMock}`);

  let next = (await vrf.lastRequestId()) + 1n;
  for (;;) {
    const last = await vrf.lastRequestId();
    for (; next <= last; next++) {
      const id = next;
      const word = BigInt(ethers.hexlify(ethers.randomBytes(32)));
      const tx = await vrf.fulfill(id, word);
      const rc = await tx.wait();
      console.log(`  fulfilled request ${id} (${rc!.gasUsed} gas)`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
