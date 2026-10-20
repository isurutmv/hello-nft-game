import type { Address } from "viem";
import deployments from "./deployments.json";

export * from "./abi";

export type Deployment = {
  chainId: number;
  contracts: {
    MockDogeDash: Address;
    USDC: Address;
    USDT: Address;
    DashPacks: Address;
    DashCards: Address;
    CardRenderer: Address;
    PackRipper: Address;
    VRFMock?: Address;
  };
};

const all = deployments as unknown as Record<string, Deployment>;

export function getDeployment(chainId: number | undefined): Deployment | undefined {
  return chainId === undefined ? undefined : all[String(chainId)];
}

export const deployedChainIds = Object.keys(all).map(Number);
