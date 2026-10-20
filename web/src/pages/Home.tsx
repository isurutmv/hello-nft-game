import { useReadContracts } from "wagmi";
import { DashPacksAbi, PackRipperAbi } from "../contracts";
import { useGame } from "../lib/useGame";
import { FINISHES, SETS, TOTAL_CARDS, printed, rarity } from "../lib/cards";
import { CardFront, PackArt } from "../components/CardView";

const MAX_PACKS = 18_469;

export function Home({ onCta, connected }: { onCta: () => void; connected: boolean }) {
  const { c } = useGame();
  const reads = useReadContracts({
    contracts: c
      ? [
          { address: c.DashPacks, abi: DashPacksAbi, functionName: "totalMinted" },
          { address: c.PackRipper, abi: PackRipperAbi, functionName: "totalRemaining" },
          { address: c.PackRipper, abi: PackRipperAbi, functionName: "remaining" },
        ]
      : [],
    query: { enabled: !!c, refetchInterval: 15_000 },
  });
  const packsMinted = reads.data?.[0]?.result as bigint | undefined;
  const left = reads.data?.[1]?.result as bigint | undefined;
  const buckets = reads.data?.[2]?.result as readonly number[] | undefined;
  const pulled = left === undefined ? undefined : TOTAL_CARDS - Number(left);

  // Expected cards per pack from what is still in the pool, by set.
  const odds = SETS.map((s, set) => {
    const inPool = buckets ? [0, 1, 2].reduce((a, f) => a + Number(buckets[set * 3 + f]), 0) : printed(set, 0) + printed(set, 1) + printed(set, 2);
    const total = left !== undefined ? Number(left) : TOTAL_CARDS;
    const perPack = total ? (10 * inPool) / total : 0;
    return { s, set, inPool, perPack };
  });

  return (
    <>
      <section className="hero">
        <div>
          <div className="kicker">SERIES 1 · DIGITAL COLLECTOR CARDS</div>
          <h1>
            Hold a Dash.
            <br />
            Claim 4 packs.
          </h1>
          <p className="lead">
            Every Doge Dash NFT unlocks 4 Series 1 packs. Rip a pack for 8 USDC or USDT and pull 10 cards: holos, Impact inserts, Key
            cards and 1-of-1s.
          </p>
          <button className="btn btn-yellow btn-lg" onClick={onCta}>
            {connected ? "Claim my packs" : "Connect wallet"}
          </button>
          <div className="stats">
            <div>
              <b>{packsMinted !== undefined ? Number(packsMinted).toLocaleString() : "—"}</b>
              <span>of {MAX_PACKS.toLocaleString()} packs claimed</span>
            </div>
            <div>
              <b>{pulled !== undefined ? pulled.toLocaleString() : "—"}</b>
              <span>of {TOTAL_CARDS.toLocaleString()} cards pulled</span>
            </div>
            <div>
              <b>8.00</b>
              <span>USDC / USDT per pack</span>
            </div>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-pack">
            <PackArt id={1} size={190} />
          </div>
          <div className="hero-card hero-card-1">
            <CardFront card={{ set: 9, finish: 2, design: 2, serial: 1, copies: 1, packId: 1n }} size={170} />
          </div>
          <div className="hero-card hero-card-2">
            <CardFront card={{ set: 13, finish: 1, design: 1, serial: 2, copies: 2, packId: 1n }} size={170} />
          </div>
        </div>
      </section>

      <section className="how">
        {[
          ["1", "Connect", "Link the wallet that holds your Doge Dash NFTs."],
          ["2", "Claim", "4 packs per NFT, once per token. Packs follow the NFT, not the wallet."],
          ["3", "Rip", "8 USDC or USDT per pack. The pack burns and 10 cards mint to your wallet."],
        ].map(([n, t, d]) => (
          <div key={n} className="how-step">
            <span className="how-n">{n}</span>
            <h3>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Print run &amp; live odds</h2>
        <p className="muted">
          All {TOTAL_CARDS.toLocaleString()} cards are printed up front. Each pull removes one card from the pool with Chainlink VRF
          randomness, so the odds below update as packs are ripped. Rarity 1 is rarest.
        </p>
        <div className="table-wrap">
          <table className="odds">
            <thead>
              <tr>
                <th>Set</th>
                <th>Designs</th>
                {FINISHES.map((f) => (
                  <th key={f}>{f}</th>
                ))}
                <th>Left in pool</th>
                <th>Per pack</th>
              </tr>
            </thead>
            <tbody>
              {odds.map(({ s, set, inPool, perPack }) => (
                <tr key={s.name}>
                  <td>
                    <span className="dot" style={{ background: s.color }} />
                    {s.name}
                  </td>
                  <td>{s.designs.toLocaleString()}</td>
                  {[0, 1, 2].map((f) => (
                    <td key={f}>
                      {s.copies[f]} <span className="rar">R{rarity(printed(set, f))}</span>
                    </td>
                  ))}
                  <td>{inPool.toLocaleString()}</td>
                  <td>{perPack >= 1 ? `~${perPack.toFixed(1)}` : perPack > 0 ? `1 in ${Math.round(1 / perPack)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
