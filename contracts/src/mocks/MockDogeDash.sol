// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @notice Testnet stand-in for the Doge Dash collection (4,119 tokens on Ethereum).
/// Anyone can mint a few to try the claim flow.
contract MockDogeDash is ERC721Enumerable {
    uint256 public constant MAX_SUPPLY = 4119;
    uint256 public constant MAX_PER_MINT = 5;
    uint256 public totalMinted;

    error TooMany();

    constructor() ERC721("Doge Dash (testnet)", "tDASH") {}

    function mint(uint256 count) external {
        if (count == 0 || count > MAX_PER_MINT || totalMinted + count > MAX_SUPPLY) revert TooMany();
        for (uint256 i; i < count; ++i) _mint(msg.sender, ++totalMinted);
    }

    function tokensOf(address owner) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) ids[i] = tokenOfOwnerByIndex(owner, i);
    }
}
