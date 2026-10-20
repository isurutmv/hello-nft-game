// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Series 1 print run
/// @notice The fixed print run for Doge Dash Collector Cards Series 1.
///
/// The run is split into 14 sets (categories) and 3 finishes (versions):
/// Normal, Holo Card and Holo Dash. Each (set, finish) pair is a bucket that
/// holds `designs(set) * copies(set, finish)` cards. Every card in a bucket is
/// one (design, copy) pair, so a card's serial is its copy index + 1 out of
/// `copies(set, finish)`.
///
///   set              designs  normal  holo card  holo dash  total
///   Base               4,119       8          3          2  53,547
///   Sky Prism          4,119       5          2          2  37,071
///   Run Cycle          4,119       5          2          1  32,952
///   ZOOMIES!           4,119       7          3          3  53,547
///   Enemies                9     150         24          6   1,620
///   Level Cards           25      64         12          4   2,000
///   Dash Adventures       25      80         12          6   2,450
///   Costume Party         25      12          2          1     375
///   Impact Colour         25      10          2          1     325
///   Impact Prism          25      10          2          1     325
///   Impact Silver         25       5          2          1     200
///   Impact Gold           25       3          2          1     150
///   Golden Bone           25       1          2          1     100
///   Key Card               4       3          2          1      24
///                                                          -------
///                                                          184,686
library PrintRun {
    uint256 internal constant SETS = 14;
    uint256 internal constant FINISHES = 3;
    uint256 internal constant BUCKETS = SETS * FINISHES;
    uint256 internal constant TOTAL_CARDS = 184_686;

    uint8 internal constant BASE = 0;
    uint8 internal constant SKY_PRISM = 1;
    uint8 internal constant RUN_CYCLE = 2;
    uint8 internal constant ZOOMIES = 3;
    uint8 internal constant ENEMIES = 4;
    uint8 internal constant LEVEL = 5;
    uint8 internal constant ADVENTURE = 6;
    uint8 internal constant COSTUME = 7;
    uint8 internal constant IMPACT_COLOUR = 8;
    uint8 internal constant IMPACT_PRISM = 9;
    uint8 internal constant IMPACT_SILVER = 10;
    uint8 internal constant IMPACT_GOLD = 11;
    uint8 internal constant GOLDEN_BONE = 12;
    uint8 internal constant KEY = 13;

    /// @dev Copies per design, 3 bytes per set (normal, holo card, holo dash).
    bytes internal constant COPIES =
        hex"080302_050202_050201_070303_961806_400c04_500c06_0c0201_0a0201_0a0201_050201_030201_010201_030201";

    function designs(uint256 set) internal pure returns (uint256) {
        if (set <= ZOOMIES) return 4119;
        if (set == ENEMIES) return 9;
        if (set == KEY) return 4;
        return 25;
    }

    function copies(uint256 set, uint256 finish) internal pure returns (uint256) {
        return uint8(COPIES[set * FINISHES + finish]);
    }

    function bucketSize(uint256 bucket) internal pure returns (uint256) {
        uint256 set = bucket / FINISHES;
        return designs(set) * copies(set, bucket % FINISHES);
    }

    /// @notice Rarity 1 (rarest) to 7, from how many cards exist in that set and finish.
    /// Thresholds: 1-12, 13-30, 31-60, 61-150, 151-999, 1,000-9,999, 10,000+ printed.
    function rarity(uint256 printed) internal pure returns (uint256) {
        if (printed >= 10_000) return 7;
        if (printed >= 1_000) return 6;
        if (printed >= 151) return 5;
        if (printed >= 61) return 4;
        if (printed >= 31) return 3;
        if (printed >= 13) return 2;
        return 1;
    }
}
