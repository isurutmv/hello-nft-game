import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, type Hash } from "viem";
import { getDeployment } from "../contracts";

/** The contracts for the wallet's current chain (or the app's default chain when disconnected). */
export function useGame() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const deployment = getDeployment(chainId);
  return { address, isConnected, chainId, deployment, c: deployment?.contracts };
}

/** Send a contract write, wait for the receipt, then refresh every read. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(label: string, args: Parameters<typeof writeContractAsync>[0]) {
    setError(null);
    setPending(label);
    try {
      const hash: Hash = await writeContractAsync(args);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      await queryClient.invalidateQueries();
      return receipt;
    } catch (e) {
      const msg = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
      setError(msg);
      return undefined;
    } finally {
      setPending(null);
    }
  }

  return { send, pending, error, clearError: () => setError(null) };
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
