import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    // BSC supports Cancun opcodes (MCOPY etc.) since the Tycho upgrade.
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" },
  },
  paths: { sources: "./src" },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // BscScan is served through the Etherscan v2 multichain API.
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "1" },
};

export default config;
