// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Metadata for a card, kept in its own contract so art and copy can change
/// without touching the token contract.
interface ICardRenderer {
    function tokenURI(uint256 tokenId, DashCards.Card calldata card) external view returns (string memory);
}

/// @title Doge Dash Collector Cards, Series 1
/// @notice One NFT per printed card. Cards are only minted by the PackRipper when a
/// pack is opened, and every card's set, finish, design and serial is stored on-chain.
contract DashCards is ERC721Enumerable, Ownable {
    struct Card {
        uint8 set; // PrintRun set index (Base, Sky Prism, ..., Key Card)
        uint8 finish; // 0 Normal, 1 Holo Card, 2 Holo Dash
        uint16 design; // design index inside the set
        uint16 serial; // 1-based serial
        uint16 copies; // copies of this exact design + finish
        uint32 packId; // the pack it was pulled from
    }

    address public minter;
    ICardRenderer public renderer;
    uint256 public totalMinted;

    mapping(uint256 => Card) private _cards;

    event MinterSet(address minter);
    event RendererSet(address renderer);
    event CardMinted(uint256 indexed tokenId, uint256 indexed packId, address indexed to, Card card);

    error OnlyMinter();

    constructor(address owner_, address renderer_) ERC721("Doge Dash Collector Cards S1", "DDCARD") Ownable(owner_) {
        renderer = ICardRenderer(renderer_);
    }

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
        emit MinterSet(minter_);
    }

    function setRenderer(address renderer_) external onlyOwner {
        renderer = ICardRenderer(renderer_);
        emit RendererSet(renderer_);
    }

    function mint(address to, Card calldata card) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert OnlyMinter();
        tokenId = ++totalMinted;
        _cards[tokenId] = card;
        _mint(to, tokenId);
        emit CardMinted(tokenId, card.packId, to, card);
    }

    function cardOf(uint256 tokenId) external view returns (Card memory) {
        _requireOwned(tokenId);
        return _cards[tokenId];
    }

    /// @notice A page of `owner`'s cards with their data, for wallets and the binder view.
    function cardsOf(address owner, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Card[] memory cards, uint256 total)
    {
        total = balanceOf(owner);
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 n = end > offset ? end - offset : 0;
        ids = new uint256[](n);
        cards = new Card[](n);
        for (uint256 i; i < n; ++i) {
            uint256 id = tokenOfOwnerByIndex(owner, offset + i);
            ids[i] = id;
            cards[i] = _cards[id];
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return renderer.tokenURI(tokenId, _cards[tokenId]);
    }
}
