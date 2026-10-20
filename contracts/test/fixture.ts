import { ethers } from "hardhat";

export const PRICE = ethers.parseUnits("8", 18);
export const MAX_PACKS = 18_469n;
export const VRF_CONFIG = {
  keyHash: ethers.ZeroHash,
  subId: 1n,
  confirmations: 3,
  nativePayment: true,
  gasBase: 150_000,
  gasPerPack: 450_000,
};

export async function deployAll() {
  const [owner, alice, bob, treasury, signer] = await ethers.getSigners();

  const vrf = await ethers.deployContract("VRFMock");
  const doge = await ethers.deployContract("MockDogeDash");
  const usdc = await ethers.deployContract("MockStablecoin", ["Test USDC", "USDC"]);
  const usdt = await ethers.deployContract("MockStablecoin", ["Test USDT", "USDT"]);

  const packs = await ethers.deployContract("DashPacks", [owner.address, MAX_PACKS, await doge.getAddress()]);
  const renderer = await ethers.deployContract("CardRenderer", [owner.address]);
  const cards = await ethers.deployContract("DashCards", [owner.address, await renderer.getAddress()]);
  const ripper = await ethers.deployContract("PackRipper", [
    await vrf.getAddress(),
    await packs.getAddress(),
    await cards.getAddress(),
    treasury.address,
    VRF_CONFIG,
  ]);

  await packs.setRipper(await ripper.getAddress());
  await cards.setMinter(await ripper.getAddress());
  await ripper.setPrice(await usdc.getAddress(), PRICE);
  await ripper.setPrice(await usdt.getAddress(), PRICE);

  return { owner, alice, bob, treasury, signer, vrf, doge, usdc, usdt, packs, renderer, cards, ripper };
}

/** Alice mints `nfts` Doge Dash tokens, claims, and gets enough USDC for every pack. */
export async function aliceWithPacks(nfts = 2) {
  const ctx = await deployAll();
  const { alice, doge, packs, usdc, ripper } = ctx;
  await doge.connect(alice).mint(nfts);
  const ids = await doge.tokensOf(alice.address);
  await packs.connect(alice).claim([...ids]);
  for (let i = 0; i < Math.ceil((nfts * 4 * 8) / 100); i++) await usdc.connect(alice).faucet();
  await usdc.connect(alice).approve(await ripper.getAddress(), ethers.MaxUint256);
  return ctx;
}
