// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Minimal RippleFI integration surface from Flare's official
 * Personal Account interface.
 * @dev Source: flare-foundation/flare-smart-accounts.
 */
interface IPersonalAccount {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    function executeUserOp(Call[] calldata calls) external payable;

    function xrplOwner() external view returns (string memory);

    function controllerAddress() external view returns (address);

    function implementation() external view returns (address);
}
