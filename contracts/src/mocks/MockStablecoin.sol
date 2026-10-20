// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet USDC / USDT with a public faucet. 18 decimals, like the
/// Binance-Peg stablecoins on BSC.
contract MockStablecoin is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 100 ether;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
