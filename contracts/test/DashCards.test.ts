import { expect } from "chai";
import { ethers } from "hardhat";
import { aliceWithPacks, deployAll, PRICE } from "./fixture";

const decodeDataUri = (uri: string) => JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));

describe("Print run", () => {
  it("holds exactly 184,686 cards across 42 buckets", async () => {
    const { ripper } = await deployAll();
    expect(await ripper.totalRemaining()).to.equal(184_686n);
    const rem = await ripper.remaining();
    expect(rem.reduce((a, b) => a + b, 0n)).to.equal(184_686n);
    // Base normal = 4,119 designs x 8 copies; Key Card holo dash = 4 x 1.
    expect(rem[0]).to.equal(4119n * 8n);
    expect(rem[13 * 3 + 2]).to.equal(4n);
    // Golden Bone normal is the 1/1 of each of the 25 ultra rares.
    expect(rem[12 * 3]).to.equal(25n);
  });
});

describe("DashPacks claim", () => {
  it("gives 4 packs per Doge Dash NFT, once per token", async () => {
    const { alice, bob, doge, packs } = await deployAll();
    await doge.connect(alice).mint(3);
    await packs.connect(alice).claim([1, 2, 3]);
    expect(await packs.balanceOf(alice.address)).to.equal(12n);
    expect(await packs.packOrigin(5)).to.equal(2n);
    expect(await packs.claimable([1, 2, 3])).to.equal(0n);

    await expect(packs.connect(alice).claim([1])).to.be.revertedWithCustomError(packs, "AlreadyClaimed");

    // Packs follow the NFT: selling it does not reset the claim.
    await doge.connect(alice).transferFrom(alice.address, bob.address, 1);
    await expect(packs.connect(bob).claim([1])).to.be.revertedWithCustomError(packs, "AlreadyClaimed");
  });

  it("rejects non-holders and closed claim windows", async () => {
    const { alice, bob, doge, packs } = await deployAll();
    await doge.connect(alice).mint(1);
    await expect(packs.connect(bob).claim([1])).to.be.revertedWithCustomError(packs, "NotHolder");

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await packs.setClaimDeadline(now - 1);
    await expect(packs.connect(alice).claim([1])).to.be.revertedWithCustomError(packs, "ClaimsClosed");
  });

  it("accepts a signed cross-chain attestation", async () => {
    const { alice, bob, signer, packs } = await deployAll();
    await packs.setClaimSigner(signer.address);
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const ids = [42n, 77n];
    const domain = {
      name: "DashPacks",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await packs.getAddress(),
    };
    const types = { Claim: [{ name: "to", type: "address" }, { name: "dogeIdsHash", type: "bytes32" }, { name: "deadline", type: "uint256" }] };
    const dogeIdsHash = ethers.solidityPackedKeccak256(["uint256[]"], [ids]);
    const sig = await signer.signTypedData(domain, types, { to: alice.address, dogeIdsHash, deadline });

    // A relayer (bob) can submit; packs go to alice.
    await packs.connect(bob).claimWithAttestation(alice.address, ids, deadline, sig);
    expect(await packs.balanceOf(alice.address)).to.equal(8n);

    const forged = await bob.signTypedData(domain, types, { to: bob.address, dogeIdsHash, deadline });
    await expect(packs.claimWithAttestation(bob.address, ids, deadline, forged)).to.be.revertedWithCustomError(packs, "BadSignature");
  });

  it("caps total supply", async () => {
    const [owner] = await ethers.getSigners();
    const packs = await ethers.deployContract("DashPacks", [owner.address, 10, ethers.ZeroAddress]);
    await packs.promoMint(owner.address, 8);
    await expect(packs.promoMint(owner.address, 3)).to.be.revertedWithCustomError(packs, "SoldOut");
    await packs.promoMint(owner.address, 2);
    expect(await packs.totalMinted()).to.equal(10n);
    await expect(packs.claim([1])).to.be.revertedWithCustomError(packs, "ClaimPathDisabled");
  });

  it("only lets the ripper burn", async () => {
    const { alice, doge, packs } = await deployAll();
    await doge.connect(alice).mint(1);
    await packs.connect(alice).claim([1]);
    await expect(packs.connect(alice).burn(1)).to.be.revertedWithCustomError(packs, "OnlyRipper");
  });

  it("serves on-chain pack metadata", async () => {
    const { alice, doge, packs } = await deployAll();
    await doge.connect(alice).mint(1);
    await packs.connect(alice).claim([1]);
    const meta = decodeDataUri(await packs.tokenURI(1));
    expect(meta.name).to.equal("Series 1 Pack #1");
    expect(meta.attributes[1].value).to.equal("Doge Dash #1");
  });
});

describe("PackRipper", () => {
  it("takes payment, burns packs, draws on VRF answer and mints 10 cards", async () => {
    const { alice, treasury, vrf, usdc, packs, cards, ripper } = await aliceWithPacks(1);

    await expect(ripper.connect(alice).rip([1, 2], await usdc.getAddress())).to.emit(ripper, "Ripped");
    expect(await usdc.balanceOf(treasury.address)).to.equal(PRICE * 2n);
    expect(await packs.balanceOf(alice.address)).to.equal(2n);
    await expect(packs.ownerOf(1)).to.be.revertedWithCustomError(packs, "ERC721NonexistentToken");

    const [, status] = await ripper.packInfo(1);
    expect(status).to.equal(1n); // Pending
    await expect(ripper.openPack(1)).to.be.revertedWithCustomError(ripper, "NotDrawn");

    const reqId = await vrf.lastRequestId();
    await vrf.fulfill(reqId, 12345n);
    expect(await ripper.totalRemaining()).to.equal(184_686n - 20n);

    const drawn = await ripper.drawnCards(1);
    expect(drawn.length).to.equal(10);

    const [unopened, statuses] = await ripper.unopenedPacksOf(alice.address);
    expect(unopened).to.deep.equal([1n, 2n]);
    expect(statuses).to.deep.equal([2n, 2n]); // Drawn

    await ripper.connect(alice).openPack(1);
    expect(await cards.balanceOf(alice.address)).to.equal(10n);
    expect((await ripper.unopenedPacksOf(alice.address))[0]).to.deep.equal([2n]);
    const [ids, list, total] = await cards.cardsOf(alice.address, 0, 50);
    expect(total).to.equal(10n);
    for (let i = 0; i < 10; i++) {
      expect(list[i].set).to.equal(drawn[i].set);
      expect(list[i].design).to.equal(drawn[i].design);
      expect(list[i].serial).to.equal(drawn[i].serial);
      expect(list[i].packId).to.equal(1n);
      expect(list[i].serial).to.be.gte(1n);
      expect(list[i].serial).to.be.lte(list[i].copies);
    }
    await expect(ripper.openPack(1)).to.be.revertedWithCustomError(ripper, "NotDrawn");

    // Anyone can open; cards still go to the ripper.
    const [, , , , other] = await ethers.getSigners();
    await ripper.connect(other).openPack(2);
    expect(await cards.balanceOf(alice.address)).to.equal(20n);

    const meta = decodeDataUri(await cards.tokenURI(ids[0]));
    expect(meta.attributes.find((a: { trait_type: string }) => a.trait_type === "Pack").value).to.equal(1);
    expect(meta.image).to.match(/^data:image\/svg\+xml;base64,/);
  });

  it("rejects non-owners, unknown tokens and oversize rips", async () => {
    const { alice, bob, usdc, ripper } = await aliceWithPacks(2);
    await expect(ripper.connect(bob).rip([1], await usdc.getAddress())).to.be.revertedWithCustomError(ripper, "NotPackOwner");
    await expect(ripper.connect(alice).rip([1], bob.address)).to.be.revertedWithCustomError(ripper, "TokenNotAccepted");
    await expect(ripper.connect(alice).rip([1, 2, 3, 4, 5, 6], await usdc.getAddress())).to.be.revertedWithCustomError(ripper, "TooManyPacks");
    await expect(ripper.connect(alice).rip([], await usdc.getAddress())).to.be.revertedWithCustomError(ripper, "NoPacks");
  });

  it("fits a max-size rip inside the VRF callback gas limit", async () => {
    const { alice, vrf, usdc, ripper } = await aliceWithPacks(2);
    await ripper.connect(alice).rip([1, 2, 3, 4, 5], await usdc.getAddress());
    const reqId = await vrf.lastRequestId();
    const [, gasLimit] = await vrf.requests(reqId);
    const tx = await vrf.fulfill(reqId, 999n);
    const rc = await tx.wait();
    console.log(`      fulfill 5 packs: ${rc!.gasUsed} gas (limit ${gasLimit})`);
    const [, fulfilled] = await ripper.requestInfo(reqId);
    expect(fulfilled).to.equal(true);
    expect(gasLimit).to.be.lte(2_500_000n); // BSC testnet max callback gas
  });

  it("re-requests unanswered randomness and ignores the stale answer", async () => {
    const { alice, vrf, usdc, ripper } = await aliceWithPacks(1);
    await ripper.connect(alice).rip([1], await usdc.getAddress());
    const oldId = await vrf.lastRequestId();
    await expect(ripper.connect(alice).retry(oldId)).to.be.revertedWith("Only callable by owner");
    await ripper.retry(oldId);
    const newId = await vrf.lastRequestId();
    expect((await ripper.packInfo(1))[2]).to.equal(newId);

    await vrf.fulfill(oldId, 1n);
    expect((await ripper.packInfo(1))[1]).to.equal(1n); // still pending
    await vrf.fulfill(newId, 2n);
    expect((await ripper.packInfo(1))[1]).to.equal(2n); // drawn
    await expect(ripper.retry(newId)).to.be.revertedWithCustomError(ripper, "NothingToRetry");
  });

  it("never prints the same card twice", async () => {
    const { alice, vrf, usdc, ripper } = await aliceWithPacks(5);
    // 20 packs = 200 pulls, every (set, finish, design, serial) unique.
    const seen = new Set<string>();
    for (let start = 1; start <= 20; start += 5) {
      await ripper.connect(alice).rip([start, start + 1, start + 2, start + 3, start + 4], await usdc.getAddress());
      await vrf.fulfill(await vrf.lastRequestId(), BigInt(start) * 7919n);
    }
    for (let p = 1; p <= 20; p++) {
      for (const c of await ripper.drawnCards(p)) {
        const key = `${c.set}-${c.finish}-${c.design}-${c.serial}`;
        expect(seen.has(key), key).to.equal(false);
        seen.add(key);
      }
    }
    expect(seen.size).to.equal(200);
    expect(await ripper.totalRemaining()).to.equal(184_686n - 200n);
  });
});
