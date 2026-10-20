// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DashPacks} from "./DashPacks.sol";
import {DashCards} from "./DashCards.sol";
import {PrintRun} from "./libraries/PrintRun.sol";

/// @title Pack ripper
/// @notice Pay 8 USDC or USDT per pack, burn the packs, and pull their cards from
/// the Series 1 print run with Chainlink VRF randomness.
///
/// The whole print run (184,686 cards) is a pool, and every pull removes one card
/// from it, so the final counts per design, finish and serial match the print run
/// exactly. Pull odds are the print-run odds of whatever is still in the pool.
///
/// Ripping happens in three steps:
///  1. `rip` takes payment, burns the packs and requests randomness.
///  2. The VRF callback draws all 10 cards of every pack in the request. Drawing
///     at the moment randomness arrives means nobody can see their seed first and
///     wait for a better pool state.
///  3. `openPack` mints the drawn cards as NFTs. Anyone can call it; cards always
///     go to whoever ripped the pack.
contract PackRipper is VRFConsumerBaseV2Plus, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CARDS_PER_PACK = 10;
    /// @dev Bucket value for an empty slot, used only if the pool runs dry.
    uint256 private constant EMPTY = 63;

    enum Status {
        None,
        Pending, // paid and burned, waiting for randomness
        Drawn, // cards drawn, waiting to be minted
        Opened // cards minted
    }

    struct Pack {
        address owner;
        Status status;
        uint256 requestId;
        /// @dev 10 cards x 22 bits: bucket (6 bits) | value (16 bits)
        uint256 cards;
    }

    struct Request {
        address owner;
        bool fulfilled;
        uint256[] packIds;
    }

    struct VrfConfig {
        bytes32 keyHash;
        uint256 subId;
        uint16 confirmations;
        bool nativePayment;
        uint32 gasBase;
        uint32 gasPerPack;
    }

    DashPacks public immutable packs;
    DashCards public immutable cards;

    address public treasury;
    /// @notice Price per pack in each accepted payment token (token units). Zero = not accepted.
    mapping(address => uint256) public price;
    uint256 public maxPacksPerRip = 5;
    VrfConfig public vrf;

    /// @notice Cards left in each (set, finish) bucket.
    uint32[42] private _remaining;
    uint256 public totalRemaining;
    /// @dev Sparse Fisher-Yates swap table: bucket => index => value + 1 (0 means value == index).
    mapping(uint256 => mapping(uint256 => uint256)) private _swap;

    mapping(uint256 => Pack) private _packs;
    mapping(uint256 => Request) private _requests;
    /// @dev Every pack each wallet has ripped, so the app can find packs still to open.
    mapping(address => uint256[]) private _rippedBy;

    event Ripped(address indexed owner, uint256 indexed requestId, uint256[] packIds, address payToken, uint256 paid);
    event PackDrawn(uint256 indexed packId, uint256 indexed requestId);
    event PackOpened(uint256 indexed packId, address indexed owner, uint256 firstCardId, uint256 count);
    event RequestRetried(uint256 indexed oldRequestId, uint256 indexed newRequestId);
    event PriceSet(address indexed token, uint256 price);
    event TreasurySet(address treasury);
    event VrfConfigSet(VrfConfig config);

    error NoPacks();
    error TooManyPacks();
    error NotPackOwner(uint256 packId);
    error TokenNotAccepted(address token);
    error NotDrawn(uint256 packId);
    error NothingToRetry();

    constructor(address coordinator, DashPacks packs_, DashCards cards_, address treasury_, VrfConfig memory vrf_)
        VRFConsumerBaseV2Plus(coordinator)
    {
        packs = packs_;
        cards = cards_;
        treasury = treasury_;
        vrf = vrf_;
        uint256 total;
        for (uint256 b; b < PrintRun.BUCKETS; ++b) {
            uint256 size = PrintRun.bucketSize(b);
            _remaining[b] = uint32(size);
            total += size;
        }
        totalRemaining = total;
    }

    // ---------------------------------------------------------------- rip

    /// @notice Pay for and rip `packIds`. Approve `price[payToken] * packIds.length` first.
    function rip(uint256[] calldata packIds, address payToken) external nonReentrant returns (uint256 requestId) {
        uint256 n = packIds.length;
        if (n == 0) revert NoPacks();
        if (n > maxPacksPerRip) revert TooManyPacks();
        uint256 unit = price[payToken];
        if (unit == 0) revert TokenNotAccepted(payToken);

        for (uint256 i; i < n; ++i) {
            if (packs.ownerOf(packIds[i]) != msg.sender) revert NotPackOwner(packIds[i]);
        }

        uint256 paid = unit * n;
        IERC20(payToken).safeTransferFrom(msg.sender, treasury, paid);

        requestId = _requestRandomness(n);
        Request storage rq = _requests[requestId];
        rq.owner = msg.sender;
        rq.packIds = packIds;

        for (uint256 i; i < n; ++i) {
            uint256 packId = packIds[i];
            packs.burn(packId);
            _packs[packId] = Pack({owner: msg.sender, status: Status.Pending, requestId: requestId, cards: 0});
            _rippedBy[msg.sender].push(packId);
        }
        emit Ripped(msg.sender, requestId, packIds, payToken, paid);
    }

    /// @notice Mint the cards of a drawn pack to the wallet that ripped it.
    function openPack(uint256 packId) public nonReentrant returns (uint256 firstCardId) {
        Pack storage p = _packs[packId];
        if (p.status != Status.Drawn) revert NotDrawn(packId);
        p.status = Status.Opened;
        uint256 packed = p.cards;
        uint256 count;
        for (uint256 i; i < CARDS_PER_PACK; ++i) {
            (bool ok, DashCards.Card memory card) = _decode(packed, i, packId);
            if (!ok) continue;
            uint256 id = cards.mint(p.owner, card);
            if (count == 0) firstCardId = id;
            ++count;
        }
        emit PackOpened(packId, p.owner, firstCardId, count);
    }

    function openPacks(uint256[] calldata packIds) external {
        for (uint256 i; i < packIds.length; ++i) openPack(packIds[i]);
    }

    // ---------------------------------------------------------------- VRF

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        Request storage rq = _requests[requestId];
        // Ignore unknown or superseded requests (see `retry`).
        if (rq.owner == address(0) || rq.fulfilled) return;
        rq.fulfilled = true;

        uint32[42] memory rem = _remaining;
        uint256 total = totalRemaining;
        uint256 seed = randomWords[0];
        uint256[] storage ids = rq.packIds;

        for (uint256 p; p < ids.length; ++p) {
            uint256 packId = ids[p];
            uint256 packed;
            for (uint256 i; i < CARDS_PER_PACK; ++i) {
                uint256 entry = EMPTY << 16;
                if (total != 0) {
                    uint256 r = uint256(keccak256(abi.encode(seed, packId, i)));
                    (uint256 bucket, uint256 value) = _draw(rem, r % total);
                    --total;
                    entry = (bucket << 16) | value;
                }
                packed |= entry << (i * 22);
            }
            Pack storage pk = _packs[packId];
            pk.cards = packed;
            pk.status = Status.Drawn;
            emit PackDrawn(packId, requestId);
        }

        _remaining = rem;
        totalRemaining = total;
    }

    /// @dev Pick the card at position `r` of the pool and remove it.
    function _draw(uint32[42] memory rem, uint256 r) private returns (uint256 bucket, uint256 value) {
        uint256 n;
        for (; bucket < PrintRun.BUCKETS; ++bucket) {
            n = rem[bucket];
            if (r < n) break;
            r -= n;
        }
        mapping(uint256 => uint256) storage swap = _swap[bucket];
        uint256 last = n - 1;
        uint256 atR = swap[r];
        value = atR == 0 ? r : atR - 1;
        if (r != last) {
            uint256 atLast = swap[last];
            swap[r] = atLast == 0 ? last + 1 : atLast;
        }
        if (swap[last] != 0) delete swap[last];
        rem[bucket] = uint32(last);
    }

    function _requestRandomness(uint256 packCount) private returns (uint256) {
        VrfConfig memory c = vrf;
        return s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: c.keyHash,
                subId: c.subId,
                requestConfirmations: c.confirmations,
                callbackGasLimit: c.gasBase + c.gasPerPack * uint32(packCount),
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: c.nativePayment}))
            })
        );
    }

    /// @notice Re-request randomness for a request VRF never answered (for example an
    /// underfunded subscription). A late answer to the old request is ignored.
    function retry(uint256 requestId) external onlyOwner returns (uint256 newId) {
        Request storage old = _requests[requestId];
        if (old.owner == address(0) || old.fulfilled) revert NothingToRetry();
        uint256[] memory ids = old.packIds;
        newId = _requestRandomness(ids.length);
        Request storage rq = _requests[newId];
        rq.owner = old.owner;
        rq.packIds = ids;
        delete _requests[requestId];
        for (uint256 i; i < ids.length; ++i) _packs[ids[i]].requestId = newId;
        emit RequestRetried(requestId, newId);
    }

    // ---------------------------------------------------------------- admin

    function setPrice(address token, uint256 unitPrice) external onlyOwner {
        price[token] = unitPrice;
        emit PriceSet(token, unitPrice);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setVrfConfig(VrfConfig calldata config) external onlyOwner {
        vrf = config;
        emit VrfConfigSet(config);
    }

    function setMaxPacksPerRip(uint256 max) external onlyOwner {
        maxPacksPerRip = max;
    }

    // ---------------------------------------------------------------- views

    function packInfo(uint256 packId) external view returns (address owner, Status status, uint256 requestId) {
        Pack storage p = _packs[packId];
        return (p.owner, p.status, p.requestId);
    }

    /// @notice The cards drawn for a pack (available once VRF has answered, before and after minting).
    function drawnCards(uint256 packId) external view returns (DashCards.Card[] memory out) {
        Pack storage p = _packs[packId];
        if (p.status < Status.Drawn) revert NotDrawn(packId);
        DashCards.Card[] memory tmp = new DashCards.Card[](CARDS_PER_PACK);
        uint256 n;
        for (uint256 i; i < CARDS_PER_PACK; ++i) {
            (bool ok, DashCards.Card memory card) = _decode(p.cards, i, packId);
            if (ok) tmp[n++] = card;
        }
        out = new DashCards.Card[](n);
        for (uint256 i; i < n; ++i) out[i] = tmp[i];
    }

    function requestInfo(uint256 requestId) external view returns (address owner, bool fulfilled, uint256[] memory packIds) {
        Request storage rq = _requests[requestId];
        return (rq.owner, rq.fulfilled, rq.packIds);
    }

    /// @notice Packs `owner` has ripped that are not opened yet, with their status.
    function unopenedPacksOf(address owner) external view returns (uint256[] memory ids, Status[] memory statuses) {
        uint256[] storage all = _rippedBy[owner];
        uint256 n;
        for (uint256 i; i < all.length; ++i) if (_packs[all[i]].status != Status.Opened) ++n;
        ids = new uint256[](n);
        statuses = new Status[](n);
        n = 0;
        for (uint256 i; i < all.length; ++i) {
            Status st = _packs[all[i]].status;
            if (st != Status.Opened) {
                ids[n] = all[i];
                statuses[n++] = st;
            }
        }
    }

    /// @notice Cards left in every (set, finish) bucket, index = set * 3 + finish.
    function remaining() external view returns (uint32[42] memory) {
        return _remaining;
    }

    function _decode(uint256 packed, uint256 i, uint256 packId) private pure returns (bool, DashCards.Card memory card) {
        uint256 entry = (packed >> (i * 22)) & 0x3fffff;
        uint256 bucket = entry >> 16;
        if (bucket == EMPTY) return (false, card);
        uint256 value = entry & 0xffff;
        uint256 set = bucket / PrintRun.FINISHES;
        uint256 finish = bucket % PrintRun.FINISHES;
        uint256 c = PrintRun.copies(set, finish);
        card = DashCards.Card({
            set: uint8(set),
            finish: uint8(finish),
            design: uint16(value / c),
            serial: uint16(value % c + 1),
            copies: uint16(c),
            packId: uint32(packId)
        });
        return (true, card);
    }
}
