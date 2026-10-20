import { http, createConfig } from "wagmi";
import { bscTestnet, hardhat } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export const chains = [bscTestnet, hardhat] as const;

export const config = createConfig({
  chains,
  connectors: [
    injected(), // MetaMask, Rabby, Trust, OKX and other browser wallets
    coinbaseWallet({ appName: "Doge Dash Collector Cards" }),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : []),
  ],
  transports: {
    [bscTestnet.id]: http(import.meta.env.VITE_BSC_TESTNET_RPC || undefined),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
