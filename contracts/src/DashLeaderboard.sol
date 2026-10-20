// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Doge Dash runner leaderboard
/// @notice Best score per wallet per world, a top-10 table per world, and which worlds
/// each wallet has cleared (so unlocks follow the wallet across devices).
///
/// Scores are reported by the game client, so this table trusts players. That is fine for
/// testnet; before anything valuable depends on it, scores should be signed by a game
/// server that replays the run (the run is deterministic for a given world and inputs).
contract DashLeaderboard {
    uint8 public constant WORLDS = 5;
    uint256 public constant TOP_N = 10;
    /// @notice Upper bound on a plausible score for one 60-second run.
    uint32 public constant MAX_SCORE = 20_000;

    struct Entry {
        address player;
        uint32 score;
        uint32 dogeId; // 0 = guest pup
        uint64 at;
    }

    /// @notice Doge Dash collection used to check you own the Dash you played as. Zero skips the check.
    IERC721 public immutable dogeDash;

    mapping(uint8 => Entry[]) private _top;
    mapping(address => mapping(uint8 => uint32)) public best;
    /// @notice Bit i set = the wallet has cleared world i.
    mapping(address => uint8) public clearedMask;

    event RunSubmitted(address indexed player, uint8 indexed world, uint32 score, uint32 dogeId, bool cleared, bool newBest);

    error BadWorld();
    error BadScore();
    error NotYourDash(uint32 dogeId);

    constructor(IERC721 dogeDash_) {
        dogeDash = dogeDash_;
    }

    function submit(uint8 world, uint32 score, uint32 dogeId, bool cleared) external {
        if (world >= WORLDS) revert BadWorld();
        if (score > MAX_SCORE) revert BadScore();
        if (dogeId != 0 && address(dogeDash) != address(0) && dogeDash.ownerOf(dogeId) != msg.sender) {
            revert NotYourDash(dogeId);
        }
        if (cleared) clearedMask[msg.sender] |= uint8(1 << world);

        bool newBest = score > best[msg.sender][world];
        emit RunSubmitted(msg.sender, world, score, dogeId, cleared, newBest);
        if (!newBest) return;
        best[msg.sender][world] = score;
        _insert(world, Entry({player: msg.sender, score: score, dogeId: dogeId, at: uint64(block.timestamp)}));
    }

    function top(uint8 world) external view returns (Entry[] memory) {
        return _top[world];
    }

    /// @notice A wallet's best score in every world.
    function bestOf(address player) external view returns (uint32[5] memory scores, uint8 mask) {
        for (uint8 w; w < WORLDS; ++w) scores[w] = best[player][w];
        mask = clearedMask[player];
    }

    /// @dev Keep `_top[world]` sorted high to low, one row per player, at most TOP_N rows.
    function _insert(uint8 world, Entry memory e) private {
        Entry[] storage t = _top[world];
        // Drop the player's old row, if any.
        for (uint256 i; i < t.length; ++i) {
            if (t[i].player == e.player) {
                for (uint256 j = i; j + 1 < t.length; ++j) t[j] = t[j + 1];
                t.pop();
                break;
            }
        }
        if (t.length == TOP_N && t[TOP_N - 1].score >= e.score) return;
        if (t.length < TOP_N) t.push(e);
        uint256 k = t.length - 1;
        while (k > 0 && t[k - 1].score < e.score) {
            t[k] = t[k - 1];
            --k;
        }
        t[k] = e;
    }
}
