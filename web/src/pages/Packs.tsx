import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits, maxUint256 } from "viem";
import { DashPacksAbi, MockStablecoinAbi, PackRipperAbi } from "../contracts";
import { useGame, useTx } from "../lib/useGame";
import { PackArt } from "../components/CardView";

type Token = "USDC" | "USDT";

export function Packs({ onRip }: { onRip: (ids: bigint[]) => void }) {
  const { c, address } = useGame();
  const { send, pending, error } = useTx();
  const [selected, setSelected] = useState<bigint[]>([]);
  const [token, setToken] = useState<Token>("USDC");
  const tokenAddr = token === "USDC" ? c!.USDC : c!.USDT;

  const packs = useReadContract({
    address: c!.DashPacks,
    abi: DashPacksAbi,
    functionName: "packsOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const unopened = useReadContract({
    address: c!.PackRipper,
    abi: PackRipperAbi,
    functionName: "unopenedPacksOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const reads = useReadContracts({
    contracts: [
      { address: c!.PackRipper, abi: PackRipperAbi, functionName: "price", args: [tokenAddr] },
      { address: c!.PackRipper, abi: PackRipperAbi, functionName: "maxPacksPerRip" },
      { address: tokenAddr, abi: MockStablecoinAbi, functionName: "balanceOf", args: [address!] },
      { address: tokenAddr, abi: MockStablecoinAbi, functionName: "allowance", args: [address!, c!.PackRipper] },
    ],
    query: { enabled: !!address },
  });
  const price = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const maxPer = Number((reads.data?.[1]?.result as bigint | undefined) ?? 5n);
  const balance = (reads.data?.[2]?.result as bigint | undefined) ?? 0n;
  const allowance = (reads.data?.[3]?.result as bigint | undefined) ?? 0n;

  const owned = packs.data ?? [];
  const sel = selected.filter((id) => owned.includes(id));
  const total = price * BigInt(sel.length);
  const needsApproval = allowance < total;
  const short = balance < total;
  const fmt = (v: bigint) => Number(formatUnits(v, 18)).toFixed(2);
  const [waitIds, waitStatus] = unopened.data ?? [[], []];

  const toggle = (id: bigint) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= maxPer ? s : [...s, id]));
  const selectFirst = (n: number) => setSelected(owned.slice(0, Math.min(n, maxPer)));

  async function approve() {
    await send("approve", { address: tokenAddr, abi: MockStablecoinAbi, functionName: "approve", args: [c!.PackRipper, maxUint256] });
  }
  async function rip() {
    const ids = [...sel];
    const rc = await send("rip", { address: c!.PackRipper, abi: PackRipperAbi, functionName: "rip", args: [ids, tokenAddr] });
    if (rc) {
      setSelected([]);
      onRip(ids);
    }
  }

  return (
    <>
      {waitIds.length > 0 && (
        <section className="panel panel-glow">
          <div className="kicker">PAID · READY TO OPEN</div>
          <h2>{waitIds.length} ripped {waitIds.length === 1 ? "pack" : "packs"} waiting</h2>
          <p className="muted">
            {waitStatus.some((s) => s === 1)
              ? "Some packs are still waiting for Chainlink VRF randomness (usually under a minute)."
              : "Cards are drawn. Open them to mint the cards to your wallet."}
          </p>
          <button className="btn btn-yellow" onClick={() => onRip([...waitIds])}>
            Open {waitIds.length === 1 ? "it" : "them"} →
          </button>
        </section>
      )}

      <section className="panel">
        <div className="kicker">STEP 3 · RIP</div>
        <h2>My packs</h2>
        <p className="muted">
          {owned.length} sealed {owned.length === 1 ? "pack" : "packs"}. Sealed packs stay tradeable NFTs. Ripping burns the pack and mints
          its 10 cards to your wallet.
        </p>

        {owned.length === 0 ? (
          <div className="empty">
            <p>No packs yet.</p>
            <p className="muted">Claim 4 packs per Doge Dash NFT on the Claim page.</p>
          </div>
        ) : (
          <div className="packs-layout">
            <div>
              <div className="row-gap">
                <button className="btn btn-sm" onClick={() => selectFirst(1)}>
                  Select 1
                </button>
                <button className="btn btn-sm" onClick={() => selectFirst(maxPer)}>
                  Select {Math.min(maxPer, owned.length)}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>
                  Clear
                </button>
                <span className="muted small">Up to {maxPer} packs per rip.</span>
              </div>
              <div className="pack-grid">
                {owned.map((id) => (
                  <button key={id.toString()} className="pack-btn" onClick={() => toggle(id)} aria-pressed={sel.includes(id)}>
                    <PackArt id={id} size={120} selected={sel.includes(id)} />
                    {sel.includes(id) && <span className="tick">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <aside className="pay">
              <h3>Rip selected packs</h3>
              <div className="seg">
                {(["USDC", "USDT"] as Token[]).map((t) => (
                  <button key={t} className={t === token ? "on" : ""} onClick={() => setToken(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <dl className="pay-lines">
                <dt>Price per pack</dt>
                <dd>
                  {fmt(price)} {token}
                </dd>
                <dt>Packs</dt>
                <dd>× {sel.length}</dd>
                <dt className="total">Total</dt>
                <dd className="total">
                  {fmt(total)} {token}
                </dd>
                <dt>Your balance</dt>
                <dd className={short ? "err" : ""}>
                  {fmt(balance)} {token}
                </dd>
              </dl>
              <ol className="steps">
                <li className={!needsApproval && sel.length ? "done" : ""}>Approve {token}</li>
                <li>Pay & rip in one transaction</li>
                <li>Chainlink VRF draws your cards</li>
              </ol>
              {needsApproval ? (
                <button className="btn btn-yellow btn-block" disabled={!sel.length || !!pending} onClick={approve}>
                  {pending === "approve" ? "Approving…" : `Approve ${token}`}
                </button>
              ) : (
                <button className="btn btn-yellow btn-block" disabled={!sel.length || short || !!pending} onClick={rip}>
                  {pending === "rip" ? "Confirming…" : sel.length ? `Pay & rip · ${fmt(total)} ${token}` : "Select packs"}
                </button>
              )}
              {short && sel.length > 0 && <p className="err small">Not enough {token}. Use the faucet in the testnet bar.</p>}
              {error && <p className="err small">{error}</p>}
            </aside>
          </div>
        )}
      </section>
    </>
  );
}
