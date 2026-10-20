import { expect } from "chai";
import { ethers } from "hardhat";

describe("DashLeaderboard", () => {
  async function deploy() {
    const signers = await ethers.getSigners();
    const doge = await ethers.deployContract("MockDogeDash");
    const board = await ethers.deployContract("DashLeaderboard", [await doge.getAddress()]);
    return { signers, doge, board };
  }

  it("keeps each wallet's best and a sorted top 10", async () => {
    const { signers, board } = await deploy();
    for (let i = 0; i < 12; i++) await board.connect(signers[i]).submit(0, 1000 + i * 100, 0, false);
    const top = await board.top(0);
    expect(top.length).to.equal(10);
    expect(top[0].score).to.equal(2100n);
    expect(top[9].score).to.equal(1200n);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].score).to.be.gte(top[i].score);

    // A lower score doesn't replace a best; a higher one moves the row instead of duplicating it.
    await board.connect(signers[2]).submit(0, 500, 0, false);
    expect(await board.best(signers[2].address, 0)).to.equal(1200n);
    await board.connect(signers[2]).submit(0, 5000, 0, true);
    const after = await board.top(0);
    expect(after[0].player).to.equal(signers[2].address);
    expect(after.filter((e) => e.player === signers[2].address).length).to.equal(1);
    expect(after.length).to.equal(10);
  });

  it("records clears, checks Dash ownership and bounds", async () => {
    const { signers, doge, board } = await deploy();
    const [alice, bob] = signers;
    await doge.connect(alice).mint(1);
    await board.connect(alice).submit(2, 3000, 1, true);
    await board.connect(alice).submit(0, 100, 1, true);
    const [scores, mask] = await board.bestOf(alice.address);
    expect(scores[2]).to.equal(3000n);
    expect(mask).to.equal(0b101n);

    await expect(board.connect(bob).submit(0, 100, 1, false)).to.be.revertedWithCustomError(board, "NotYourDash");
    await expect(board.submit(5, 100, 0, false)).to.be.revertedWithCustomError(board, "BadWorld");
    await expect(board.submit(0, 20_001, 0, false)).to.be.revertedWithCustomError(board, "BadScore");
  });
});
