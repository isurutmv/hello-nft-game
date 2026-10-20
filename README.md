# Doge Dash Collector Cards: Series 1 (BSC testnet)

Digital collector cards for Doge Dash holders, built from the Series 1 design:

1. **Connect** the wallet that holds Doge Dash NFTs.
2. **Claim** 4 sealed pack NFTs per Doge Dash NFT, once per token. Packs follow the NFT, not the wallet.
3. **Rip** a pack for 8 USDC or USDT. The pack burns, Chainlink VRF picks the cards, and 10 card NFTs mint to the wallet.
4. **Collect** cards in the binder, grouped by set, with rarity 1 (rarest) to 7 on every card back.

5. **Play** Doge Dash, the runner game, as your own Dash NFT.

```
contracts/   Hardhat project: Solidity contracts, tests, deploy scripts
web/         Vite + React + wagmi dapp (Home, Play, Claim, My packs, Rip, My cards)
web/src/dc   The Series 1 design files (.dc.html) and the small runtime that renders them
web/src/game Doge Dash runner: rules (sim.ts), levels, drawing, sound, perks
api/         Vercel functions: Dash cut-out art, and card/pack PNGs for wallets and marketplaces
```

## The cards are the design

Cards, card backs, packs and the pack-opening scene are rendered from the original Series 1 design files, unchanged:
`SeriesCard`, `ImpactCard`, `KeyCard`, `AdventureCard`, `LevelCard`, `EnemyCard`, `CardBack`, `PackWrapper` and the
design's `PackRip` screen (in `web/src/dc/components/`, with the design's images in `web/public/art/`). A small runtime
(`web/src/dc/runtime.ts`) renders the templates into a shadow root so their CSS applies exactly as designed.
`web/src/lib/designCard.ts` maps each on-chain card (set, finish, design, serial) to the props the design's own
pack-opening screen would pass. When you rip a pack, the design's opening scene plays with the cards Chainlink VRF drew.

Every Base, Sky Prism, Run Cycle and ZOOMIES! card shows its real HELLO Doge Dash, by token ID:

- The 60 Dashes in the design file use the design's own cut-outs.
- For every other token, `/api/dash/{id}` fetches the token's image from the collection's IPFS folder
  (`ipfs://QmYTS6KMs9AgkqrB1NX9du2EEAFJXyCjEv4amX2X2ZDHt4/{id}.png`), cuts the Dash out of its flat background and
  returns a 520 px PNG. The first request for a token takes a few seconds, then the CDN caches the result for good.
  The app preloads the art for the cards you pulled while you're on the "ready" screen.
- Each card's background colour comes from the token's Background trait (`web/src/data/dash-meta.json`, built by
  `web/scripts/build-dash-meta.mjs` from the collection's metadata). The palette matches the design's samples.

`/card.html?id=7` shows any minted card (flip and tilt), `/card.html?pack=1` a sealed pack.

## The game: Doge Dash

A side-scrolling runner across the five worlds on the Series 1 Level cards. Each world is a ~60 second run in five
parts (LET’S GO!, COIN TRAIL, the world's challenge, TAKE FIVE, LEVEL CLEAR) and ends at Dash's dog house.

| World | Challenge | What you face |
| --- | --- | --- |
| Level 1 · The Meadow | Bird Watch | Chickens, logs and fences, a few wasps |
| Level 3 · The Jungle | Danger Ahead | Charging boars, stumps, pits |
| Level 5 · Route 66 | Buzz City | Wasp swarms at head height (slide) and low (jump), cones and cacti |
| Level 7 · Ice Caps | Thin Ice | Ice that cracks behind you, open-water holes, snowmen |
| Space · Deep Space | Shooting Stars | Low gravity, falling stars that leave burning craters |

- **Controls:** Space, ↑ or tap to jump (hold for a higher jump). ↓ or swipe down to slide. P to pause. On
  phones there are JUMP and SLIDE buttons.
- **Scoring:** 10 per coin, 100 per stomp (land on chickens and boars), +1,000 for clearing the level, and 500
  per life left.
- **Who you play as:** each Doge Dash NFT in your wallet is its own runner, with colours, pattern and accessory
  taken from the token. Players without an NFT can run Level 1 as the guest pup.
- **Perks:** a lucky few Dashes get one perk: extra life (4 lives), super jump (jump again in mid-air) or double
  rewards (coins count twice). The 25 ultra-rare Dashes get all three. Holding a Series 1 card of your Dash adds a
  holo trail. Perks come from a hash of the token ID (`web/src/game/dash.ts`). For mainnet this should read the
  collection's trait metadata instead.
- **Progress:** clearing a world opens the next one. Progress is saved in the browser and also in
  `DashLeaderboard` on-chain, so unlocks follow your wallet.
- **Leaderboard:** `DashLeaderboard` keeps each wallet's best score per world and a top-10 table, and checks that
  you own the Dash you played as. Scores are reported by the game, so the table trusts players. That is fine for
  testnet. Runs are deterministic (seeded layouts and a fixed 120 Hz step), so a server can replay a run and sign
  the score before anything valuable depends on it.

Every level is checked by a bot: `npm run test:game` (in `web/`) runs 9 mechanics checks, then plays all five
worlds plus 25 extra seeds each, and fails if any run takes a hit. To watch the bot in the browser, add
`?autopilot` to the URL.

## Live on BSC testnet

Deployed from `0xC830ca16bAbF2812130C4a1428add5613d6C2cac` (v2, with design-rendered card images) and verified on [Sourcify](https://sourcify.dev) (exact match). The web app reads
these addresses from `web/src/contracts/deployments.json`.

| Contract | Address |
| --- | --- |
| MockDogeDash | [`0xa1cf6B0c1614dDD06c9e5050129E2C133fe3DA52`](https://testnet.bscscan.com/address/0xa1cf6B0c1614dDD06c9e5050129E2C133fe3DA52) |
| USDC | [`0x5c7ec3E41BB6B3B723bD87c789c60FE36A685CA3`](https://testnet.bscscan.com/address/0x5c7ec3E41BB6B3B723bD87c789c60FE36A685CA3) |
| USDT | [`0x6120E8410088bb7d5FeAEe809Df5943ddad0434D`](https://testnet.bscscan.com/address/0x6120E8410088bb7d5FeAEe809Df5943ddad0434D) |
| DashPacks | [`0x237B3aC99C068c7099463019e3670D4E2044F04a`](https://testnet.bscscan.com/address/0x237B3aC99C068c7099463019e3670D4E2044F04a) |
| DashCards | [`0xD6828C1b96B66c1C1Dd93220E3d7A0C8f5f223f9`](https://testnet.bscscan.com/address/0xD6828C1b96B66c1C1Dd93220E3d7A0C8f5f223f9) |
| CardRenderer | [`0xA3cA64612D2dB50858953261fcb93649ccd7544F`](https://testnet.bscscan.com/address/0xA3cA64612D2dB50858953261fcb93649ccd7544F) |
| PackRipper | [`0x8CA04435ecFDFD6ae0bcB118CE5b7b818e206cBe`](https://testnet.bscscan.com/address/0x8CA04435ecFDFD6ae0bcB118CE5b7b818e206cBe) |
| DashLeaderboard | [`0x19C999512a9bc4ba44636DEe20B1338EC4cA4e6b`](https://testnet.bscscan.com/address/0x19C999512a9bc4ba44636DEe20B1338EC4cA4e6b) |

Chainlink VRF v2.5 subscription `30569291071428640930983185309972124917807855442015241823367329295091774612262` (funded with tBNB, PackRipper is a consumer). A live
smoke run (`npx hardhat run scripts/smoke.ts --network bscTestnet`) claimed, paid, ripped and opened a pack; VRF
answered in about 11 seconds. The first deployment (v1) is kept in `contracts/deployments/bscTestnet.v1.json`; its
packs and cards don't carry over.

### Host the site on Vercel

Import the repository and leave the project root as the repository root. `vercel.json` builds `web/`, serves
`web/dist` and deploys the functions in `api/`. No secrets are needed on Vercel. Optional environment variables:

| Name | Value |
| --- | --- |
| `VITE_BSC_TESTNET_RPC` | `https://bsc-testnet-rpc.publicnode.com` (the default) |
| `VITE_WALLETCONNECT_PROJECT_ID` | A free project ID from cloud.reown.com, to connect mobile wallets by QR |
| `SITE_URL` | The site's public URL, e.g. `https://doge-dash.vercel.app`. Used by the image functions; defaults to the request's host |
| `IPFS_GATEWAY` | IPFS gateway for the Doge Dash art (default `https://gateway.pinata.cloud`) |

| Function | Returns |
| --- | --- |
| `/api/dash/{tokenId}` | The Dash cut out of its background, 520 px tall PNG |
| `/api/card/{cardId}` | The minted card rendered from the design, 720 × 1008 PNG |
| `/api/pack/{packId}` | The sealed pack, 720 × 1120 PNG |

The card and pack images are screenshots of `/card.html` taken by headless Chromium (`@sparticuz/chromium`), cached
for a year. After the first deploy, point the NFTs' metadata at the site so wallets and marketplaces show the design:

```bash
cd contracts
SITE_URL=https://your-site.vercel.app npx hardhat run scripts/set-uris.ts --network bscTestnet
```

That sets each card's `image` to `/api/card/{id}.png` and `animation_url` to the interactive `/card.html?id={id}`, and
the same for packs. Until then, tokenURI falls back to the on-chain SVG.

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
| `CardRenderer` | On-chain JSON metadata (name, set, finish, serial, rarity and token traits). `setURIs(image, animation)` sets `image` to `{image}{cardId}.png` and `animation_url` to `{animation}{cardId}`; until set, the image is an on-chain SVG. `DashPacks.setURIs` does the same for packs. |
| `DashLeaderboard` | Best score per wallet per world, a top-10 table per world, and a bitmask of the worlds each wallet has cleared. |
| `MockDogeDash`, `MockStablecoin` | Testnet only. Anyone can mint Doge Dash tokens (up to 5 per call), and the USDC/USDT faucet gives 100 per call. Both stablecoins use 18 decimals, like the Binance-Peg tokens on BSC. |

The VRF callback for a 5-pack rip uses about 1.54M gas. The callback limit is set to 2.4M, under the 2.5M maximum on
BSC testnet.

## Run it locally

```bash
cd contracts && npm install
npm test                 # 14 tests: print run, claims, attestation, rip, VRF gas, retry, uniqueness, leaderboard
npm run node             # terminal 1: local chain
npm run deploy:local     # terminal 2: deploys + writes web/src/contracts/deployments.json
npm run vrf:local        # terminal 2: answers VRF requests like Chainlink would

cd ../web && npm install && npm run dev
npm run test:game        # game mechanics + bot clears every level
```

The game itself needs no wallet or contracts: open the Play tab and run as the guest pup.

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

- Licensing for the HELLO Doge Dash art used on the cards, and permanent hosting for the card images (for example,
  render all cards once and pin them to IPFS, then `setURIs` to that folder).
- An attestation signer service that reads Doge Dash ownership on Ethereum (the contract side is done and tested).
- Real stablecoin addresses and 18-decimal pricing check (Binance-Peg USDC/USDT on BSC are 18 decimals).
- Server-signed leaderboard scores (replay the run), and perks read from real trait metadata.
- Final in-game art. The runner is drawn in code (lit, layered scenery and shaded characters) so it ships with no image assets.
- An external audit. Move ownership to a multisig.
