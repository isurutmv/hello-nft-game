// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Doge Dash Series 1 sealed packs
/// @notice Every Doge Dash NFT claims 4 packs, once per token ID. Packs follow the
/// NFT, not the wallet: a token that was already claimed can't be claimed again
/// after it is sold. Sealed packs are tradeable NFTs; ripping one (see PackRipper)
/// burns it and mints its 10 cards.
///
/// Two ways to prove you hold a Doge Dash NFT:
///  - `claim`: the collection lives on this chain (the BSC testnet mock), so the
///    contract reads `ownerOf` directly.
///  - `claimWithAttestation`: the collection lives on another chain (Ethereum
///    mainnet), so a trusted signer that read ownership there signs an EIP-712
///    attestation.
contract DashPacks is ERC721Enumerable, Ownable, EIP712 {
    using Strings for uint256;

    uint256 public constant PACKS_PER_NFT = 4;

    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(address to,bytes32 dogeIdsHash,uint256 deadline)");

    /// @notice Total packs that can ever exist (holder claims + leftovers).
    uint256 public immutable maxSupply;

    /// @notice Doge Dash collection on this chain (used by `claim`). Zero disables it.
    IERC721 public dogeDash;
    /// @notice Signer for cross-chain claims (used by `claimWithAttestation`). Zero disables it.
    address public claimSigner;
    /// @notice The ripper is the only contract allowed to burn packs.
    address public ripper;
    /// @notice Unix time after which claims close. Zero means no deadline.
    uint64 public claimDeadline;

    /// @notice Packs minted so far. Burned packs still count, so IDs never repeat.
    uint256 public totalMinted;

    /// @notice Pack art from the site (`{imageBaseURI}{packId}.png`) and its interactive page
    /// (`{animationBaseURI}{packId}`). Empty means the on-chain SVG stand-in.
    string public imageBaseURI;
    string public animationBaseURI;

    /// @notice Doge Dash token ID => already claimed.
    mapping(uint256 => bool) public claimed;
    /// @notice Pack ID => Doge Dash token ID it was claimed with (0 for promo packs).
    mapping(uint256 => uint256) public packOrigin;

    event Claimed(address indexed to, uint256 indexed dogeId, uint256 firstPackId);
    event PromoMinted(address indexed to, uint256 firstPackId, uint256 count);
    event RipperSet(address ripper);
    event DogeDashSet(address dogeDash);
    event ClaimSignerSet(address signer);
    event ClaimDeadlineSet(uint64 deadline);
    event URIsSet(string imageBaseURI, string animationBaseURI);

    error AlreadyClaimed(uint256 dogeId);
    error NotHolder(uint256 dogeId);
    error ClaimsClosed();
    error ClaimPathDisabled();
    error BadSignature();
    error SoldOut();
    error OnlyRipper();

    constructor(address owner_, uint256 maxSupply_, address dogeDash_)
        ERC721("Doge Dash Series 1 Pack", "DDPACK")
        Ownable(owner_)
        EIP712("DashPacks", "1")
    {
        maxSupply = maxSupply_;
        dogeDash = IERC721(dogeDash_);
    }

    // ---------------------------------------------------------------- claim

    /// @notice Claim 4 packs for each Doge Dash NFT the caller holds on this chain.
    function claim(uint256[] calldata dogeIds) external {
        if (address(dogeDash) == address(0)) revert ClaimPathDisabled();
        for (uint256 i; i < dogeIds.length; ++i) {
            if (dogeDash.ownerOf(dogeIds[i]) != msg.sender) revert NotHolder(dogeIds[i]);
        }
        _claim(msg.sender, dogeIds);
    }

    /// @notice Claim with a signed attestation that `to` holds `dogeIds` on the origin chain.
    /// Anyone can submit it (a relayer can pay the gas), packs always go to `to`.
    function claimWithAttestation(address to, uint256[] calldata dogeIds, uint256 deadline, bytes calldata signature)
        external
    {
        if (claimSigner == address(0)) revert ClaimPathDisabled();
        if (block.timestamp > deadline) revert BadSignature();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, to, keccak256(abi.encodePacked(dogeIds)), deadline))
        );
        if (ECDSA.recover(digest, signature) != claimSigner) revert BadSignature();
        _claim(to, dogeIds);
    }

    /// @notice Number of packs `dogeIds` can still claim.
    function claimable(uint256[] calldata dogeIds) external view returns (uint256 packs) {
        for (uint256 i; i < dogeIds.length; ++i) {
            if (!claimed[dogeIds[i]]) packs += PACKS_PER_NFT;
        }
    }

    function _claim(address to, uint256[] calldata dogeIds) private {
        if (claimDeadline != 0 && block.timestamp > claimDeadline) revert ClaimsClosed();
        for (uint256 i; i < dogeIds.length; ++i) {
            uint256 dogeId = dogeIds[i];
            if (claimed[dogeId]) revert AlreadyClaimed(dogeId);
            claimed[dogeId] = true;
            uint256 first = _mintPacks(to, PACKS_PER_NFT, dogeId);
            emit Claimed(to, dogeId, first);
        }
    }

    // ---------------------------------------------------------------- admin

    /// @notice Mint packs outside the holder claim (leftover packs, booster boxes, promotions).
    function promoMint(address to, uint256 count) external onlyOwner {
        uint256 first = _mintPacks(to, count, 0);
        emit PromoMinted(to, first, count);
    }

    function setRipper(address ripper_) external onlyOwner {
        ripper = ripper_;
        emit RipperSet(ripper_);
    }

    function setDogeDash(address dogeDash_) external onlyOwner {
        dogeDash = IERC721(dogeDash_);
        emit DogeDashSet(dogeDash_);
    }

    function setClaimSigner(address signer) external onlyOwner {
        claimSigner = signer;
        emit ClaimSignerSet(signer);
    }

    function setClaimDeadline(uint64 deadline) external onlyOwner {
        claimDeadline = deadline;
        emit ClaimDeadlineSet(deadline);
    }

    function setURIs(string calldata image, string calldata animation) external onlyOwner {
        imageBaseURI = image;
        animationBaseURI = animation;
        emit URIsSet(image, animation);
    }

    // ---------------------------------------------------------------- rip

    /// @notice Burn a pack. Only the ripper can call this, after it has checked ownership and payment.
    function burn(uint256 packId) external {
        if (msg.sender != ripper) revert OnlyRipper();
        _burn(packId);
    }

    // ---------------------------------------------------------------- views

    /// @notice All pack IDs held by `owner`.
    function packsOf(address owner) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) ids[i] = tokenOfOwnerByIndex(owner, i);
    }

    function tokenURI(uint256 packId) public view override returns (string memory) {
        _requireOwned(packId);
        uint256 origin = packOrigin[packId];
        string memory from = origin == 0 ? "Promo" : string.concat("Doge Dash #", origin.toString());
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0" stop-color="#7b3cff"/><stop offset=".5" stop-color="#ff1fb4"/>',
            '<stop offset="1" stop-color="#ffe14d"/></linearGradient></defs>',
            '<rect width="300" height="420" rx="18" fill="url(#g)"/>',
            '<rect x="14" y="14" width="272" height="392" rx="12" fill="none" stroke="#1b1446" stroke-width="4"/>',
            '<text x="150" y="70" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="26" fill="#1b1446">DOGE DASH</text>',
            '<text x="150" y="200" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="48" fill="#fff">SERIES 1</text>',
            '<text x="150" y="240" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="20" fill="#1b1446">10 CARDS</text>',
            '<text x="150" y="380" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#1b1446">PACK #',
            packId.toString(),
            "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"Series 1 Pack #',
            packId.toString(),
            '","description":"Sealed Doge Dash Collector Cards Series 1 pack. Rip it to burn the pack and mint its 10 cards.",',
            '"attributes":[{"trait_type":"Series","value":"1"},{"trait_type":"Claimed with","value":"',
            from,
            '"}],"image":"',
            bytes(imageBaseURI).length != 0
                ? string.concat(imageBaseURI, packId.toString(), ".png")
                : string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg))),
            '"',
            bytes(animationBaseURI).length != 0 ? string.concat(',"animation_url":"', animationBaseURI, packId.toString(), '"') : "",
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ---------------------------------------------------------------- internal

    function _mintPacks(address to, uint256 count, uint256 origin) private returns (uint256 first) {
        first = totalMinted + 1;
        if (totalMinted + count > maxSupply) revert SoldOut();
        totalMinted += count;
        for (uint256 i; i < count; ++i) {
            uint256 packId = first + i;
            if (origin != 0) packOrigin[packId] = origin;
            _mint(to, packId);
        }
    }
}
