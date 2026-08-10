// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract MockUpshiftVault is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable assetToken;
    uint256 public instantRedemptionFee = 100;
    uint256 public withdrawalFee = 50;
    uint256 public totalManagedAssets;
    uint256 public withdrawalLimit = type(uint256).max;
    bool public withdrawalsPaused;

    constructor(IERC20 asset_) ERC20("Mock Upshift FXRP", "upFXRP") {
        assetToken = asset_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function asset() external view returns (address) {
        return address(assetToken);
    }

    function lpTokenAddress() external view returns (address) {
        return address(this);
    }

    function maxWithdrawalAmount() external view returns (uint256) {
        if (withdrawalsPaused) {
            return 0;
        }
        return withdrawalLimit;
    }

    function deposit(
        address asset_,
        uint256 amount,
        address receiver
    ) external {
        require(asset_ == address(assetToken), "wrong asset");
        uint256 supply = totalSupply();
        uint256 shares = supply == 0
            ? amount
            : Math.mulDiv(amount, supply, totalManagedAssets);

        assetToken.safeTransferFrom(msg.sender, address(this), amount);
        totalManagedAssets += amount;
        _mint(receiver, shares);
    }

    function instantRedeem(uint256 shares, address receiver) external {
        require(!withdrawalsPaused, "withdrawals paused");
        (uint256 grossAssets, uint256 netAssets) = previewRedemption(
            shares,
            true
        );

        _burn(msg.sender, shares);
        totalManagedAssets -= grossAssets;
        assetToken.safeTransfer(receiver, netAssets);
        assetToken.safeTransfer(
            address(0x000000000000000000000000000000000000dEaD),
            grossAssets - netAssets
        );
    }

    function previewRedemption(
        uint256 shares,
        bool isInstant
    ) public view returns (uint256 assetsAmount, uint256 assetsAfterFee) {
        uint256 supply = totalSupply();
        if (shares == 0) {
            return (0, 0);
        }

        assetsAmount = supply == 0
            ? shares
            : Math.mulDiv(shares, totalManagedAssets, supply);
        uint256 fee = isInstant ? instantRedemptionFee : withdrawalFee;
        assetsAfterFee = Math.mulDiv(assetsAmount, 10_000 - fee, 10_000);
    }

    function addYield(uint256 amount) external {
        assetToken.safeTransferFrom(msg.sender, address(this), amount);
        totalManagedAssets += amount;
    }

    function setWithdrawalsPaused(bool paused) external {
        withdrawalsPaused = paused;
    }

    function setWithdrawalLimit(uint256 limit) external {
        withdrawalLimit = limit;
    }
}
