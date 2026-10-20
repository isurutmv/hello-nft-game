import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Deploys the full Series 1 stack.
 *
 *   bscTestnet: mock Doge Dash + test USDC/USDT, Chainlink VRF v2.5 (paid in tBNB)
 *   localhost / hardhat: same, with a local VRF mock (run scripts/vrf-autofulfill.ts)
 *
 * Writes addresses to deployments/<network>.json and, for the web app,
 * ../web/src/contracts/deployments.json (ABIs come from `npm run export-abi`).
 *
 * Env (all optional): DOGE_DASH, USDC, USDT (reuse existing tokens), VRF_SUB_ID,
 * VRF_FUND_BNB, TREASURY.
 */

// Chainlink VRF v2.5, BNB Chain testnet (docs.chain.link/vrf/v2-5/supported-networks)
const BSC_TESTNET_VRF = {
  coordinator: "0xDA3b641D438362C440Ac5458c57e00a712b66700",
  keyHash: "0x8596b430971ac45bdf6088665b9ad8e8630c9d5049ab54b14dff711bee7c0e26", // 50 gwei lane
};

const MAX_PACKS = 18_469;
const PRICE = ethers.parseUnits("8", 18); // test USDC/USDT use 18 decimals, like Binance-Peg

const COORDINATOR_ABI = [
  "function createSubscription() returns (uint256 subId)",
  "function fundSubscriptionWithNative(uint256 subId) payable",
  "function addConsumer(uint256 subId, address consumer)",
  "event SubscriptionCreated(uint256 indexed subId, address owner)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying to ${network.name} (${chainId}) from ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BNB`);

  const deployed = async (name: string, args: unknown[] = []) => {
    const c = await ethers.deployContract(name, args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(`  ${name.padEnd(16)} ${addr}`);
    return c;
  };

  // ---------------------------------------------------------- tokens
  const dogeAddr = process.env.DOGE_DASH || (await (await deployed("MockDogeDash")).getAddress());
  const usdcAddr = process.env.USDC || (await (await deployed("MockStablecoin", ["Test USDC", "USDC"])).getAddress());
  const usdtAddr = process.env.USDT || (await (await deployed("MockStablecoin", ["Test USDT", "USDT"])).getAddress());

  // ---------------------------------------------------------- VRF
  let coordinatorAddr: string;
  let keyHash: string;
  let subId: bigint;
  if (isLocal) {
    coordinatorAddr = await (await deployed("VRFMock")).getAddress();
    keyHash = ethers.ZeroHash;
    subId = 1n;
  } else {
    coordinatorAddr = BSC_TESTNET_VRF.coordinator;
    keyHash = BSC_TESTNET_VRF.keyHash;
    const coordinator = new ethers.Contract(coordinatorAddr, COORDINATOR_ABI, deployer);
    if (process.env.VRF_SUB_ID) {
      subId = BigInt(process.env.VRF_SUB_ID);
      console.log(`  Using VRF subscription ${subId}`);
    } else {
      const rc = await (await coordinator.createSubscription()).wait();
      const ev = rc.logs
        .map((l: { topics: string[]; data: string }) => { try { return coordinator.interface.parseLog(l); } catch { return null; } })
        .find((e: { name: string } | null) => e?.name === "SubscriptionCreated");
      subId = ev.args.subId;
      const fund = ethers.parseEther(process.env.VRF_FUND_BNB || "0.1");
      await (await coordinator.fundSubscriptionWithNative(subId, { value: fund })).wait();
      console.log(`  Created VRF subscription ${subId}, funded ${ethers.formatEther(fund)} tBNB`);
    }
  }

  // ---------------------------------------------------------- game
  const treasury = process.env.TREASURY || deployer.address;
  const packs = await deployed("DashPacks", [deployer.address, MAX_PACKS, dogeAddr]);
  const renderer = await deployed("CardRenderer", [deployer.address]);
  const cards = await deployed("DashCards", [deployer.address, await renderer.getAddress()]);
  const ripper = await deployed("PackRipper", [
    coordinatorAddr,
    await packs.getAddress(),
    await cards.getAddress(),
    treasury,
    { keyHash, subId, confirmations: 3, nativePayment: true, gasBase: 150_000, gasPerPack: 450_000 },
  ]);
  const ripperAddr = await ripper.getAddress();

  await (await packs.getFunction("setRipper")(ripperAddr)).wait();
  await (await cards.getFunction("setMinter")(ripperAddr)).wait();
  await (await ripper.getFunction("setPrice")(usdcAddr, PRICE)).wait();
  await (await ripper.getFunction("setPrice")(usdtAddr, PRICE)).wait();
  if (!isLocal) {
    const coordinator = new ethers.Contract(coordinatorAddr, COORDINATOR_ABI, deployer);
    await (await coordinator.addConsumer(subId, ripperAddr)).wait();
    console.log(`  Added PackRipper as VRF consumer`);
  }

  // ---------------------------------------------------------- outputs
  const out = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    treasury,
    vrf: { coordinator: coordinatorAddr, keyHash, subId: subId.toString() },
    contracts: {
      MockDogeDash: dogeAddr,
      USDC: usdcAddr,
      USDT: usdtAddr,
      DashPacks: await packs.getAddress(),
      DashCards: await cards.getAddress(),
      CardRenderer: await renderer.getAddress(),
      PackRipper: ripperAddr,
      ...(isLocal ? { VRFMock: coordinatorAddr } : {}),
    },
  };

  const root = path.join(__dirname, "..");
  fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments", `${network.name}.json`), JSON.stringify(out, null, 2) + "\n");

  const web = path.join(root, "..", "web", "src", "contracts");
  if (fs.existsSync(path.dirname(web)) && network.name !== "hardhat") {
    fs.mkdirSync(web, { recursive: true });
    const file = path.join(web, "deployments.json");
    const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    all[chainId] = out;
    fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
    console.log(`  Wrote web/src/contracts/deployments.json`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
