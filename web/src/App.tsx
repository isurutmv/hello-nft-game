import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContract, useReadContracts, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { formatUnits } from "viem";
import { MockDogeDashAbi, MockStablecoinAbi, DashPacksAbi, DashCardsAbi, deployedChainIds } from "./contracts";
import { short, useGame, useTx } from "./lib/useGame";
import { Home } from "./pages/Home";
import { Claim } from "./pages/Claim";
import { Packs } from "./pages/Packs";
import { Rip } from "./pages/Rip";
import { Binder } from "./pages/Binder";

export type Page = "home" | "claim" | "packs" | "rip" | "cards";

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [ripIds, setRipIds] = useState<bigint[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const { address, isConnected, chainId, deployment, c } = useGame();
  const { disconnect } = useDisconnect();

  const counts = useReadContracts({
    contracts: c && address
      ? [
          { address: c.DashPacks, abi: DashPacksAbi, functionName: "balanceOf", args: [address] },
          { address: c.DashCards, abi: DashCardsAbi, functionName: "balanceOf", args: [address] },
          { address: c.USDC, abi: MockStablecoinAbi, functionName: "balanceOf", args: [address] },
        ]
      : [],
    query: { enabled: !!c && !!address },
  });
  const packCount = counts.data?.[0]?.result as bigint | undefined;
  const cardCount = counts.data?.[1]?.result as bigint | undefined;
  const usdc = counts.data?.[2]?.result as bigint | undefined;

  useEffect(() => {
    if (isConnected) setShowConnect(false);
  }, [isConnected]);

  const go = (p: Page) => {
    if (!isConnected && p !== "home") return setShowConnect(true);
    setPage(p);
  };
  const startRip = (ids: bigint[]) => {
    setRipIds(ids);
    setPage("rip");
  };

  const nav: { key: Page; label: string; count?: bigint }[] = [
    { key: "home", label: "Home" },
    { key: "claim", label: "Claim" },
    { key: "packs", label: "My packs", count: packCount },
    { key: "cards", label: "My cards", count: cardCount },
  ];

  return (
    <div className="app">
      <header className="top">
        <button className="logo" onClick={() => setPage("home")}>
          <span className="logo-coin">D</span>
          <span>
            DOGE DASH <em>CARDS</em>
          </span>
        </button>
        <nav>
          {nav.map((n) => (
            <button key={n.key} className={page === n.key || (n.key === "packs" && page === "rip") ? "on" : ""} onClick={() => go(n.key)}>
              {n.label}
              {!!n.count && <span className="count">{n.count.toString()}</span>}
            </button>
          ))}
        </nav>
        <div className="top-right">
          {isConnected ? (
            <>
              {usdc !== undefined && <span className="chip">{Number(formatUnits(usdc, 18)).toFixed(2)} USDC</span>}
              <button className="chip chip-addr" onClick={() => disconnect()} title="Disconnect">
                {short(address)}
              </button>
            </>
          ) : (
            <button className="btn btn-yellow" onClick={() => setShowConnect(true)}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {isConnected && !deployment && <WrongNetwork chainId={chainId} />}
      {isConnected && deployment && <TestnetTools />}

      <main>
        {page === "home" && <Home onCta={() => (isConnected ? go(packCount ? "packs" : "claim") : setShowConnect(true))} connected={isConnected} />}
        {page === "claim" && deployment && <Claim onDone={() => setPage("packs")} />}
        {page === "packs" && deployment && <Packs onRip={startRip} />}
        {page === "rip" && deployment && <Rip packIds={ripIds} onDone={() => setPage("cards")} onBack={() => setPage("packs")} />}
        {page === "cards" && deployment && <Binder />}
      </main>

      <footer>
        HELLO Labs · Doge Dash Collector Cards · Series 1 · running on BNB Smart Chain testnet. Pulls use Chainlink VRF; every card is
        verifiable on-chain.
      </footer>

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connectors, connect, isPending, error } = useConnect();
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3>Connect wallet</h3>
        <p className="muted">Connect the wallet that holds your Doge Dash NFTs. We only read your balance; nothing moves without your signature.</p>
        <div className="wallets">
          {connectors.map((cn) => (
            <button key={cn.uid} className="wallet" disabled={isPending} onClick={() => connect({ connector: cn })}>
              <span className="wallet-i">{cn.name.charAt(0)}</span>
              {cn.name === "Injected" ? "Browser wallet (MetaMask, Rabby…)" : cn.name}
            </button>
          ))}
        </div>
        {error && <p className="err">{error.message}</p>}
        <p className="muted small">Series 1 runs on BNB Smart Chain testnet. Get free tBNB for gas from the BNB Chain faucet.</p>
      </div>
    </div>
  );
}

function WrongNetwork({ chainId }: { chainId: number }) {
  const { switchChain, isPending } = useSwitchChain();
  const target = deployedChainIds.includes(bscTestnet.id) || deployedChainIds.length === 0 ? bscTestnet.id : deployedChainIds[0];
  return (
    <div className="banner banner-warn">
      {deployedChainIds.length === 0
        ? "No contracts deployed yet. Run the deploy script (see README) to fill web/src/contracts/deployments.json."
        : `This wallet is on chain ${chainId}. Series 1 lives on BNB Smart Chain testnet.`}
      {deployedChainIds.length > 0 && (
        <button className="btn btn-yellow btn-sm" disabled={isPending} onClick={() => switchChain({ chainId: target as 97 | 31337 })}>
          Switch network
        </button>
      )}
    </div>
  );
}

/** Testnet-only helpers: mint mock Doge Dash NFTs and get test stablecoins. */
function TestnetTools() {
  const { c, address } = useGame();
  const { send, pending, error } = useTx();
  const { address: acct } = useAccount();
  const doge = useReadContract({
    address: c!.MockDogeDash,
    abi: MockDogeDashAbi,
    functionName: "balanceOf",
    args: acct ? [acct] : undefined,
    query: { enabled: !!acct },
  });
  if (!c || !address) return null;
  return (
    <div className="banner banner-test">
      <span className="tag">TESTNET</span>
      <span className="muted">You hold {doge.data?.toString() ?? "…"} test Doge Dash NFTs.</span>
      <button
        className="btn btn-sm"
        disabled={!!pending}
        onClick={() => send("Minting Doge Dash", { address: c.MockDogeDash, abi: MockDogeDashAbi, functionName: "mint", args: [2n] })}
      >
        {pending === "Minting Doge Dash" ? "Minting…" : "Mint 2 test Doge Dash"}
      </button>
      <button
        className="btn btn-sm"
        disabled={!!pending}
        onClick={() => send("USDC", { address: c.USDC, abi: MockStablecoinAbi, functionName: "faucet" })}
      >
        {pending === "USDC" ? "Sending…" : "Get 100 USDC"}
      </button>
      <button
        className="btn btn-sm"
        disabled={!!pending}
        onClick={() => send("USDT", { address: c.USDT, abi: MockStablecoinAbi, functionName: "faucet" })}
      >
        {pending === "USDT" ? "Sending…" : "Get 100 USDT"}
      </button>
      <a className="btn btn-sm btn-ghost" href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noreferrer">
        tBNB faucet ↗
      </a>
      {error && <span className="err">{error}</span>}
    </div>
  );
}
