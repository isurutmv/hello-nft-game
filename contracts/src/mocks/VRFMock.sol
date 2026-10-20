// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

interface IRawFulfill {
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external;
}

/// @notice Minimal VRF v2.5 coordinator for local tests. Records requests and lets the
/// test answer them, forwarding the requested callback gas limit like the real one.
contract VRFMock {
    struct Req {
        address consumer;
        uint32 gasLimit;
    }

    uint256 public lastRequestId;
    mapping(uint256 => Req) public requests;

    event Requested(uint256 indexed requestId, address consumer, uint32 callbackGasLimit);

    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata req) external returns (uint256 id) {
        id = ++lastRequestId;
        requests[id] = Req(msg.sender, req.callbackGasLimit);
        emit Requested(id, msg.sender, req.callbackGasLimit);
    }

    /// @notice Answer a request. Returns false if the consumer's callback reverted or ran out of gas.
    function fulfill(uint256 id, uint256 word) external returns (bool ok) {
        Req memory r = requests[id];
        require(r.consumer != address(0), "unknown request");
        delete requests[id];
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        (ok,) = r.consumer.call{gas: r.gasLimit}(abi.encodeCall(IRawFulfill.rawFulfillRandomWords, (id, words)));
    }
}
