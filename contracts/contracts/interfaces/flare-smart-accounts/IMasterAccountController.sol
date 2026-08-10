// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Minimal RippleFI integration surface from Flare's official
 * MasterAccountController facets.
 * @dev Source: flare-foundation/flare-smart-accounts.
 */
interface IMasterAccountController {
    function getPersonalAccount(
        string calldata xrplOwner
    ) external view returns (address);

    function getNonce(
        address personalAccount
    ) external view returns (uint256);

    function getExecutor(
        address personalAccount
    ) external view returns (address);

    function getXrplProviderWallets()
        external
        view
        returns (string[] memory);

    function isSmartAccount(
        address account
    ) external view returns (bool, string memory);
}
