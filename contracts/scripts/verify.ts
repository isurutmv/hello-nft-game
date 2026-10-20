import { artifacts, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Verify every deployed contract on Sourcify (API v2, no key needed). BscScan reads Sourcify
 * matches too. Usage: npx hardhat run scripts/verify.ts --network bscTestnet
 */
const API = "https://sourcify.dev/server";

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), "utf8"));
  const c = d.contracts;
  const jobs: [string, string][] = [
    ["MockDogeDash", c.MockDogeDash],
    ["MockStablecoin", c.USDC],
    ["MockStablecoin", c.USDT],
    ["DashPacks", c.DashPacks],
    ["CardRenderer", c.CardRenderer],
    ["DashCards", c.DashCards],
    ["PackRipper", c.PackRipper],
    ["DashLeaderboard", c.DashLeaderboard],
  ];
  for (const [name, address] of jobs) {
    const art = await artifacts.readArtifact(name);
    const fq = `${art.sourceName}:${art.contractName}`;
    const build = await artifacts.getBuildInfo(fq);
    if (!build) throw new Error(`No build info for ${fq}`);
    const res = await fetch(`${API}/v2/verify/${d.chainId}/${address}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stdJsonInput: build.input, compilerVersion: build.solcLongVersion, contractIdentifier: fq }),
    });
    const body = (await res.json()) as { verificationId?: string; customCode?: string; message?: string };
    if (body.customCode === "already_verified") {
      console.log(`  ✓ ${name} ${address} (already verified)`);
      continue;
    }
    if (!body.verificationId) {
      console.log(`  ✗ ${name} ${address}: ${body.message ?? res.status}`);
      continue;
    }
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const job = (await (await fetch(`${API}/v2/verify/${body.verificationId}`)).json()) as {
        isJobCompleted: boolean;
        contract?: { match?: string };
        error?: { message?: string };
      };
      if (!job.isJobCompleted) continue;
      if (job.contract?.match) console.log(`  ✓ ${name} ${address} (${job.contract.match.replace("_", " ")})`);
      else console.log(`  ✗ ${name} ${address}: ${job.error?.message ?? "failed"}`);
      break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
