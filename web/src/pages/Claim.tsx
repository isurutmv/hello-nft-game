import { useReadContract, useReadContracts } from "wagmi";
import { DashPacksAbi, MockDogeDashAbi } from "../contracts";
import { useGame, useTx } from "../lib/useGame";

const BG = ["#7b3cff", "#ff8a1f", "#ff1fb4", "#ff3b3b", "#ffc21f", "#0a6cf0", "#12c9e6"];

export function Claim({ onDone }: { onDone: () => void }) {
  const { c, address } = useGame();
  const { send, pending, error } = useTx();

  const owned = useReadContract({
    address: c!.MockDogeDash,
    abi: MockDogeDashAbi,
    functionName: "tokensOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const ids = owned.data ?? [];
  const claimedReads = useReadContracts({
    contracts: ids.map((id) => ({ address: c!.DashPacks, abi: DashPacksAbi, functionName: "claimed", args: [id] }) as const),
    query: { enabled: ids.length > 0 },
  });
  const claimed = ids.map((_, i) => claimedReads.data?.[i]?.result === true);
  const unclaimed = ids.filter((_, i) => !claimed[i]);
  // Keep each claim transaction a sensible size.
  const batch = unclaimed.slice(0, 25);

  async function claim() {
    const rc = await send("claim", { address: c!.DashPacks, abi: DashPacksAbi, functionName: "claim", args: [batch] });
    if (rc && unclaimed.length === batch.length) onDone();
  }

  return (
    <section className="panel">
      <div className="kicker">STEP 2 · CLAIM</div>
      <h2>Your Doge Dash NFTs</h2>
      {owned.isLoading ? (
        <p className="muted">Reading your wallet…</p>
      ) : ids.length === 0 ? (
        <div className="empty">
          <p>No Doge Dash NFTs in this wallet.</p>
          <p className="muted">On testnet, use “Mint 2 test Doge Dash” in the bar above, then come back here.</p>
        </div>
      ) : (
        <>
          <div className="nft-grid">
            {ids.map((id, i) => (
              <div key={id.toString()} className={`nft ${claimed[i] ? "is-claimed" : ""}`}>
                <div className="nft-art" style={{ background: BG[Number(id) % BG.length] }}>
                  <span>D</span>
                </div>
                <div className="nft-name">DASH #{id.toString()}</div>
                <span className={`pill ${claimed[i] ? "pill-dim" : "pill-yellow"}`}>{claimed[i] ? "ALREADY CLAIMED" : "4 PACKS READY"}</span>
                <div className="muted small">
                  {claimed[i] ? "The packs for this token were already claimed." : `Token #${id.toString()} · BSC testnet`}
                </div>
              </div>
            ))}
          </div>
          <div className="claim-bar">
            <div>
              <b>{unclaimed.length * 4}</b> packs to claim
              <div className="muted small">
                One transaction mints {batch.length * 4} pack NFTs to your wallet (a few cents of tBNB for gas, no payment).
              </div>
            </div>
            <button className="btn btn-yellow btn-lg" disabled={!batch.length || !!pending} onClick={claim}>
              {pending ? "Claiming…" : batch.length ? `Claim ${batch.length * 4} packs` : "All claimed"}
            </button>
          </div>
          {error && <p className="err">{error}</p>}
        </>
      )}
      <ul className="rules muted small">
        <li>4 packs per Doge Dash NFT, claimable once per token.</li>
        <li>Packs follow the NFT, not the wallet: if a token was already claimed, the new holder can’t claim it again.</li>
      </ul>
    </section>
  );
}
