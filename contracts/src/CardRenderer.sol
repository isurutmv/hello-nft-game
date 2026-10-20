// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {DashCards, ICardRenderer} from "./DashCards.sol";
import {PrintRun} from "./libraries/PrintRun.sol";

/// @title Card metadata
/// @notice Builds each card's JSON on-chain. If `imageBaseURI` is set, the image is
/// `{imageBaseURI}{set}/{finish}/{design}.png` (final art); otherwise it is an on-chain
/// SVG stand-in so cards show up in wallets on testnet without any hosting.
contract CardRenderer is ICardRenderer, Ownable {
    using Strings for uint256;

    string public imageBaseURI;

    constructor(address owner_) Ownable(owner_) {}

    function setImageBaseURI(string calldata uri) external onlyOwner {
        imageBaseURI = uri;
    }

    function tokenURI(uint256 tokenId, DashCards.Card calldata c) external view returns (string memory) {
        uint256 printed = PrintRun.designs(c.set) * c.copies;
        uint256 tier = PrintRun.rarity(printed);
        string memory name = cardName(c.set, c.design);
        string memory serial = string.concat(uint256(c.serial).toString(), "/", uint256(c.copies).toString());

        string memory image = bytes(imageBaseURI).length != 0
            ? string.concat(
                imageBaseURI, uint256(c.set).toString(), "/", uint256(c.finish).toString(), "/", uint256(c.design).toString(), ".png"
            )
            : string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(_svg(c, name, serial, tier))));

        string memory attrs = string.concat(
            '[{"trait_type":"Set","value":"', setName(c.set),
            '"},{"trait_type":"Version","value":"', finishName(c.finish),
            '"},{"trait_type":"Rarity","value":', tier.toString(),
            '},{"trait_type":"Serial","value":"', serial,
            '"},{"trait_type":"Printed in this finish","value":', printed.toString(),
            '},{"trait_type":"Pack","value":', uint256(c.packId).toString(), "}"
        );
        if (c.set <= PrintRun.ZOOMIES) {
            attrs = string.concat(attrs, ',{"trait_type":"Doge Dash token","value":', (uint256(c.design) + 1).toString(), "}");
        }

        string memory json = string.concat(
            '{"name":"', name, " - ", setName(c.set), " ", finishName(c.finish), " ", serial,
            '","description":"Doge Dash Collector Cards Series 1, card #', tokenId.toString(),
            '. Rarity ', tier.toString(), ' of 7 (1 is rarest).","attributes":', attrs, '],"image":"', image, '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ---------------------------------------------------------------- names

    function setName(uint256 set) public pure returns (string memory) {
        string[14] memory n = [
            "Base", "Sky Prism", "Run Cycle", "ZOOMIES!", "Enemies", "Level Cards", "Dash Adventures",
            "Costume Party", "Impact Colour", "Impact Prism", "Impact Silver", "Impact Gold", "Golden Bone", "Key Card"
        ];
        return n[set];
    }

    function finishName(uint256 finish) public pure returns (string memory) {
        return finish == 0 ? "Normal" : finish == 1 ? "Holo Card" : "Holo Dash";
    }

    function cardName(uint256 set, uint256 design) public pure returns (string memory) {
        if (set <= PrintRun.ZOOMIES) return string.concat("DASH #", (design + 1).toString());
        if (set == PrintRun.ENEMIES) {
            string[9] memory e = [
                "BOAR - CHARGE!", "BOAR - TUSK TROUBLE", "BOAR - ON PATROL",
                "CHICKEN - FEATHER STORM", "CHICKEN - BAWK!", "CHICKEN - SNEAKING UP",
                "WASP - STING OPERATION", "WASP - SWARM LEADER", "WASP - SPACE BUZZ"
            ];
            return e[design];
        }
        if (set == PrintRun.LEVEL) {
            string[5] memory lvl = ["LEVEL 1", "LEVEL 3", "LEVEL 5", "LEVEL 7", "SPACE"];
            string[5] memory title = ["BIRD WATCH", "DANGER AHEAD", "BUZZ CITY", "THIN ICE", "SHOOTING STARS"];
            string[5] memory part = ["LET'S GO!", "COIN TRAIL", "", "TAKE FIVE", "LEVEL CLEAR"];
            uint256 l = design / 5;
            uint256 p = design % 5;
            return string.concat(lvl[l], " ", (p + 1).toString(), "/5 - ", p == 2 ? title[l] : part[p]);
        }
        if (set == PrintRun.ADVENTURE) {
            string[25] memory a = [
                "FIRST STEPS", "DANGER AHEAD", "SWARM!", "HOME AT LAST", "COIN RUSH", "CHICKEN RUN", "BUZZ OFF",
                "TUSK TROUBLE", "JUNGLE JUMP", "STARE DOWN", "ROUTE 66", "RUSH HOUR", "STREET SWARM", "ICE DASH",
                "COLD FEET", "SNOW NAP", "BIG CHILL", "SPACE DASH", "MOON JUMP", "STAR GAZER", "COSMIC NAP",
                "LOST IN SPACE", "ALMOST HOME", "WELCOME HOME", "THE FINAL DASH"
            ];
            return a[design];
        }
        if (set == PrintRun.KEY) {
            string[4] memory k = ["DASH - THE ORIGINAL", "DASH - COSMIC", "DASH - COIN KING", "DASH - BREAKOUT"];
            return k[design];
        }
        // Costume Party, Impact ladder and Golden Bone share the 25 ultra-rare Dashes.
        string[25] memory s = [
            "DASH #118", "DASH #1054", "ASTRO DASH", "CYBORG DASH", "DASH #475", "DASH #2866", "DASH #3674",
            "DASH #1479", "DASH #2632", "LION DASH", "DASH #2362", "DASH #3412", "DASH #3583", "DASH #762",
            "ALIEN DASH", "DEVIL DASH", "DASH #2729", "DASH #1857", "DASH #3577", "DASH #1283", "ZOMBIE DASH",
            "DASH #1944", "DASH #3722", "DASH #1578", "DASH #3662"
        ];
        return s[design];
    }

    // ---------------------------------------------------------------- art

    function _svg(DashCards.Card calldata c, string memory name, string memory serial, uint256 tier)
        private
        pure
        returns (string memory)
    {
        string[14] memory bg = [
            "#ff1fb4", "#2aa3e0", "#2fcf8a", "#ff2e63", "#5a0f2e", "#c98a4b", "#0a6cf0",
            "#4b0fb0", "#ff8a1f", "#7fd6ff", "#9aa3b8", "#f5c431", "#b37806", "#1b1446"
        ];
        string memory holo = c.finish == 0
            ? ""
            : '<rect x="14" y="14" width="272" height="392" rx="12" fill="url(#h)" opacity=".45"/>';
        string memory dashFoil = c.finish == 2
            ? '<circle cx="150" cy="190" r="78" fill="none" stroke="url(#h)" stroke-width="10"/>'
            : "";
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs>',
            '<linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad5"/>',
            '<stop offset=".25" stop-color="#ffe57a"/><stop offset=".5" stop-color="#8dffc9"/>',
            '<stop offset=".75" stop-color="#7fd6ff"/><stop offset="1" stop-color="#c9a2ff"/></linearGradient></defs>',
            '<rect width="300" height="420" rx="18" fill="#ffe14d"/>',
            string.concat('<rect x="14" y="14" width="272" height="392" rx="12" fill="', bg[c.set], '"/>'),
            holo,
            '<circle cx="150" cy="190" r="70" fill="#ffffff" opacity=".18"/>',
            dashFoil,
            '<text x="150" y="200" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="44" fill="#fff">D</text>',
            string.concat(
                '<text x="28" y="48" font-family="sans-serif" font-weight="800" font-size="15" fill="#fff">',
                setName(c.set),
                "</text>",
                '<text x="272" y="48" text-anchor="end" font-family="sans-serif" font-weight="800" font-size="15" fill="#fff">',
                serial,
                "</text>"
            ),
            string.concat(
                '<rect x="14" y="320" width="272" height="86" fill="#1b1446" opacity=".85"/>',
                '<text x="150" y="352" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="18" fill="#ffe14d">',
                name,
                "</text>",
                '<text x="150" y="380" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#fff">',
                finishName(c.finish),
                " - RARITY ",
                tier.toString(),
                "</text></svg>"
            )
        );
    }
}
