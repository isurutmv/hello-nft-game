# Doge Dash Collector Cards: Series 1 (BSC testnet)

Digital collector cards for Doge Dash holders, built from the Series 1 design:

1. **Connect** the wallet that holds Doge Dash NFTs.
2. **Claim** 4 sealed pack NFTs per Doge Dash NFT, once per token. Packs follow the NFT, not the wallet.
3. **Rip** a pack for 8 USDC or USDT. The pack burns, Chainlink VRF picks the cards, and 10 card NFTs mint to the wallet.
4. **Collect** cards in the binder, grouped by set, with rarity 1 (rarest) to 7 on every card back.

```
contracts/   Hardhat project: Solidity contracts, tests, deploy scripts
web/         Vite + React + wagmi dapp (Home, Claim, My packs, Rip, My cards)
```

## The print run

All 184,686 cards are fixed up front (`contracts/src/libraries/PrintRun.sol`). Each pull removes one card from the
pool, so the final counts per design, finish and serial match the print run exactly. The odds of each pull are the
print-run odds of what is still in the pool.

| Set | Designs | Normal | Holo Card | Holo Dash | Cards |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base | 4,119 | 8 | 3 | 2 | 53,547 |
| Sky Prism | 4,119 | 5 | 2 | 2 | 37,071 |
| Run Cycle | 4,119 | 5 | 2 | 1 | 32,952 |
| ZOOMIES! | 4,119 | 7 | 3 | 3 | 53,547 |
| Enemies | 9 | 150 | 24 | 6 | 1,620 |
| Level Cards | 25 | 64 | 12 | 4 | 2,000 |
| Dash Adventures | 25 | 80 | 12 | 6 | 2,450 |
| Costume Party | 25 | 12 | 2 | 1 | 375 |
| Impact Colour / Prism | 25 each | 10 | 2 | 1 | 325 each |
| Impact Silver | 25 | 5 | 2 | 1 | 200 |
| Impact Gold | 25 | 3 | 2 | 1 | 150 |
| Golden Bone | 25 | 1 | 2 | 1 | 100 |
| Key Card | 4 | 3 | 2 | 1 | 24 |

That is 18,468.6 packs of 10. The pack cap is 18,469: holder claims use 16,476 (4 × 4,119), and the owner can mint
the 1,993 leftovers with `promoMint`. The last pack ever ripped gets the final 6 cards.

Rarity is set by how many cards exist in that set and finish: 1–12 → 1, 13–30 → 2, 31–60 → 3, 61–150 → 4,
151–999 → 5, 1,000–9,999 → 6, 10,000+ → 7.

## Contracts

| Contract | What it does |
| --- | --- |
| `DashPacks` | ERC-721 sealed packs. `claim(dogeIds)` checks `ownerOf` on the Doge Dash collection on the same chain. `claimWithAttestation` accepts an EIP-712 signature from a trusted signer, for when the holder's NFTs live on Ethereum. Optional claim deadline, `promoMint` for leftovers, hard cap of 18,469. |
| `PackRipper` | Takes 8 USDC/USDT per pack (up to 5 packs per rip), burns the packs, and requests Chainlink VRF v2.5. The VRF callback draws all 10 cards per pack from the pool straight away. Because the draw happens when the randomness arrives, nobody can see a seed first and wait for a better pool state. `openPack` then mints the cards. Anyone can call it, and the cards always go to the wallet that ripped. `retry` re-requests randomness if VRF never answers. |
| `DashCards` | ERC-721 cards. Set, finish, design, serial, copies and pack ID are stored on-chain. |
| `CardRenderer` | On-chain JSON metadata with an SVG stand-in image. Call `setImageBaseURI` to switch to the final art at `{base}{set}/{finish}/{design}.png`. |
| `MockDogeDash`, `MockStablecoin` | Testnet only. Anyone can mint Doge Dash tokens (up to 5 per call), and the USDC/USDT faucet gives 100 per call. Both stablecoins use 18 decimals, like the Binance-Peg tokens on BSC. |

The VRF callback for a 5-pack rip uses about 1.54M gas. The callback limit is set to 2.4M, under the 2.5M maximum on
BSC testnet.

## Run it locally

```bash
cd contracts && npm install
npm test                 # 12 tests: print run, claims, attestation, rip, VRF gas, retry, uniqueness
npm run node             # terminal 1: local chain
npm run deploy:local     # terminal 2: deploys + writes web/src/contracts/deployments.json
npm run vrf:local        # terminal 2: answers VRF requests like Chainlink would

cd ../web && npm install && npm run dev
```

Add the Hardhat network (chain 31337, `http://127.0.0.1:8545`) to MetaMask and import one of the test accounts
that `npm run node` prints.

## Deploy to BSC testnet

1. Get tBNB from the [BNB Chain faucet](https://www.bnbchain.org/en/testnet-faucet). About 0.3 tBNB covers
   deployment plus the VRF subscription.
2. Configure and deploy:

   ```bash
   cd contracts
   cp .env.example .env     # set PRIVATE_KEY (a testnet-only key)
   npm run deploy:bsctest
   ```

   The script deploys the mocks and the game contracts, creates a Chainlink VRF v2.5 subscription, funds it with
   `VRF_FUND_BNB` tBNB (default 0.1), and adds `PackRipper` as a consumer. To use an existing subscription, set
   `VRF_SUB_ID`. To use existing tokens, set `DOGE_DASH`, `USDC` and `USDT`.
3. Commit the updated `web/src/contracts/deployments.json` and deploy `web/` to any static host (`npm run build`
   outputs to `web/dist`).
4. Keep the VRF subscription funded at [vrf.chain.link](https://vrf.chain.link). If it runs dry, rips stay
   "pending". Top it up, then call `PackRipper.retry(requestId)` for each stuck request.

Chainlink VRF v2.5 on BSC testnet: coordinator `0xDA3b641D438362C440Ac5458c57e00a712b66700`, 50 gwei key hash
`0x8596b430971ac45bdf6088665b9ad8e8630c9d5049ab54b14dff711bee7c0e26`
([docs](https://docs.chain.link/vrf/v2-5/supported-networks)).

## How this answers the open design questions

| Question from the design | What this build does |
| --- | --- |
| Chain | BNB Smart Chain. Rips cost a few cents of gas instead of Ethereum mainnet fees. |
| Snapshot or live holder | Live holder. `claim` checks `ownerOf` when the claim is made. For Ethereum-held NFTs, the attestation signer can sign from a snapshot or live state. |
| When packs mint | At claim time, so sealed packs are tradeable NFTs straight away. On BSC this costs very little gas. |
| Fair pulls | Chainlink VRF v2.5, with draws made inside the VRF callback, without replacement from the fixed print run. |
| Leftover packs (1,993) | Minted with `promoMint` for booster boxes or promotions. |
| Claim window | Optional, set with `setClaimDeadline`. Unclaimed packs can be minted with `promoMint` afterwards. |

## Still to do before mainnet

- Final card art and image hosting (`CardRenderer.setImageBaseURI`), and wiring the art into the web card component.
- An attestation signer service that reads Doge Dash ownership on Ethereum (the contract side is done and tested).
- Real stablecoin addresses and 18-decimal pricing check (Binance-Peg USDC/USDT on BSC are 18 decimals).
- An external audit. Move ownership to a multisig.
