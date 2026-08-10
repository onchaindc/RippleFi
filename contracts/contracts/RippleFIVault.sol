// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IUpshiftVault {
    function asset() external view returns (address);

    function deposit(
        address asset_,
        uint256 amount,
        address receiver
    ) external;

    function instantRedeem(uint256 shares, address receiver) external;

    function previewRedemption(
        uint256 shares,
        bool isInstant
    ) external view returns (uint256 assetsAmount, uint256 assetsAfterFee);

    function lpTokenAddress() external view returns (address);

    function withdrawalsPaused() external view returns (bool);

    function maxWithdrawalAmount() external view returns (uint256);
}

/**
 * @title RippleFIVault
 * @author RippleFI
 * @notice User-facing ERC-4626 vault that deploys FXRP into an Upshift strategy.
 * @dev Strategy assets are valued at net instant-redemption value so synchronous
 *      withdrawals and payments remain solvent after strategy exit fees.
 */
contract RippleFIVault is ERC4626, Ownable, ReentrancyGuard {
    using Math for uint256;
    using SafeERC20 for IERC20;

    error InsufficientStrategyLiquidity(uint256 requested, uint256 available);
    error InvalidStrategy();
    error StrategyAssetMismatch(address expected, address actual);
    error StrategyRedemptionShortfall(uint256 requested, uint256 received);
    error ZeroAssetAddress();

    event StrategyDepositStatusChanged(bool enabled);
    event StrategyInvested(uint256 assets);
    event StrategyRedeemed(uint256 shares, uint256 assets);

    IUpshiftVault public immutable strategy;
    IERC20 public immutable strategyShareToken;
    uint256 public immutable strategyShareUnit;
    bool public strategyDepositsEnabled = true;

    constructor(
        IERC20 asset_,
        IUpshiftVault strategy_
    )
        ERC20("RippleFI FXRP Vault Share", "rFXRP")
        ERC4626(asset_)
        Ownable(msg.sender)
    {
        if (address(asset_) == address(0)) {
            revert ZeroAssetAddress();
        }
        if (address(strategy_) == address(0)) {
            revert InvalidStrategy();
        }

        address strategyAsset = strategy_.asset();
        if (strategyAsset != address(asset_)) {
            revert StrategyAssetMismatch(address(asset_), strategyAsset);
        }

        address shareToken = strategy_.lpTokenAddress();
        if (shareToken == address(0)) {
            revert InvalidStrategy();
        }

        strategy = strategy_;
        strategyShareToken = IERC20(shareToken);
        strategyShareUnit =
            10 **
            uint256(IERC20Metadata(shareToken).decimals());
    }

    /**
     * @notice Net assets available through the synchronous RippleFI interface.
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + strategyNetAssets();
    }

    /**
     * @notice Current RippleFI position for a user.
     */
    function getUserInfo(
        address user
    ) external view returns (uint256 assets, uint256 shares) {
        shares = balanceOf(user);
        assets = convertToAssets(shares);
    }

    /**
     * @notice Net FXRP value of RippleFI's strategy shares after instant-exit fees.
     */
    function strategyNetAssets() public view returns (uint256) {
        uint256 shares = strategyShareToken.balanceOf(address(this));
        if (shares == 0) {
            return 0;
        }

        (, uint256 assetsAfterFee) = strategy.previewRedemption(shares, true);
        return assetsAfterFee;
    }

    /**
     * @notice Gross FXRP value of RippleFI's strategy shares before exit fees.
     */
    function strategyGrossAssets() public view returns (uint256) {
        uint256 shares = strategyShareToken.balanceOf(address(this));
        if (shares == 0) {
            return 0;
        }

        (uint256 assetsAmount, ) = strategy.previewRedemption(shares, false);
        return assetsAmount;
    }

    /**
     * @notice Gross FXRP value of one whole strategy LP token.
     */
    function strategySharePrice() external view returns (uint256) {
        (uint256 assetsAmount, ) = strategy.previewRedemption(
            strategyShareUnit,
            false
        );
        return assetsAmount;
    }

    /**
     * @notice FXRP currently available for synchronous withdrawals.
     */
    function availableLiquidity() public view returns (uint256) {
        uint256 idleAssets = IERC20(asset()).balanceOf(address(this));
        if (strategyShareToken.balanceOf(address(this)) == 0) {
            return idleAssets;
        }
        if (strategy.withdrawalsPaused()) {
            return idleAssets;
        }

        uint256 strategyAssets = strategyNetAssets();
        uint256 strategyLimit = _strategyWithdrawalLimit();
        return idleAssets + Math.min(strategyAssets, strategyLimit);
    }

    function maxWithdraw(
        address owner
    ) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), availableLiquidity());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 liquidShares = convertToShares(availableLiquidity());
        return Math.min(super.maxRedeem(owner), liquidShares);
    }

    /**
     * @dev Deposits are priced at their net instant-redemption value to avoid
     *      diluting existing rFXRP holders with the strategy exit fee.
     */
    function previewDeposit(
        uint256 assets
    ) public view override returns (uint256) {
        return
            _convertToShares(
                _netStrategyValueForDeposit(assets),
                Math.Rounding.Floor
            );
    }

    /**
     * @dev Returns the gross FXRP required to mint shares with the requested
     *      net value after Upshift's instant-redemption fee.
     */
    function previewMint(
        uint256 shares
    ) public view override returns (uint256) {
        uint256 requiredNetAssets = _convertToAssets(
            shares,
            Math.Rounding.Ceil
        );
        return _grossAssetsForNetStrategyValue(requiredNetAssets);
    }

    function deposit(
        uint256 assets,
        address receiver
    ) public override nonReentrant returns (uint256 shares) {
        shares = super.deposit(assets, receiver);
    }

    function mint(
        uint256 shares,
        address receiver
    ) public override nonReentrant returns (uint256 assets) {
        assets = super.mint(shares, receiver);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256 shares) {
        shares = super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256 assets) {
        assets = super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Enables or disables automatic strategy deposits.
     * @dev Disabling strategy deposits leaves new FXRP idle and withdrawable.
     */
    function setStrategyDepositsEnabled(bool enabled) external onlyOwner {
        strategyDepositsEnabled = enabled;
        emit StrategyDepositStatusChanged(enabled);
    }

    /**
     * @notice Deposits any idle FXRP into Upshift.
     */
    function investIdle() external nonReentrant {
        _invest(IERC20(asset()).balanceOf(address(this)));
    }

    /**
     * @notice Disables deposits and instantly redeems all Upshift shares.
     */
    function emergencyRedeemAll() external onlyOwner nonReentrant {
        strategyDepositsEnabled = false;
        emit StrategyDepositStatusChanged(false);

        uint256 shares = strategyShareToken.balanceOf(address(this));
        if (shares > 0) {
            _redeemStrategyShares(shares);
        }
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._deposit(caller, receiver, assets, shares);

        if (strategyDepositsEnabled) {
            _invest(assets);
        }
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        _ensureLiquidity(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _invest(uint256 assets) internal {
        if (assets == 0 || !strategyDepositsEnabled) {
            return;
        }

        IERC20 assetToken = IERC20(asset());
        assetToken.forceApprove(address(strategy), assets);
        strategy.deposit(asset(), assets, address(this));
        emit StrategyInvested(assets);
    }

    function _ensureLiquidity(uint256 assets) internal {
        IERC20 assetToken = IERC20(asset());
        uint256 idleAssets = assetToken.balanceOf(address(this));
        if (idleAssets >= assets) {
            return;
        }

        uint256 requiredAssets = assets - idleAssets;
        uint256 strategyShares = strategyShareToken.balanceOf(address(this));
        (, uint256 netStrategyAssets) = strategy.previewRedemption(
            strategyShares,
            true
        );
        uint256 strategyLimit = _strategyWithdrawalLimit();

        if (
            strategy.withdrawalsPaused() ||
            netStrategyAssets < requiredAssets ||
            strategyLimit < requiredAssets
        ) {
            revert InsufficientStrategyLiquidity(
                requiredAssets,
                Math.min(netStrategyAssets, strategyLimit)
            );
        }

        uint256 sharesToRedeem = requiredAssets.mulDiv(
            strategyShares,
            netStrategyAssets,
            Math.Rounding.Ceil
        );
        (, uint256 previewAssets) = strategy.previewRedemption(
            sharesToRedeem,
            true
        );
        if (
            previewAssets < requiredAssets &&
            sharesToRedeem < strategyShares
        ) {
            sharesToRedeem += 1;
        }

        _redeemStrategyShares(sharesToRedeem);

        uint256 availableAssets = assetToken.balanceOf(address(this));
        if (availableAssets < assets) {
            revert StrategyRedemptionShortfall(assets, availableAssets);
        }
    }

    function _redeemStrategyShares(uint256 shares) internal {
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        strategy.instantRedeem(shares, address(this));
        uint256 received = IERC20(asset()).balanceOf(address(this)) -
            balanceBefore;
        emit StrategyRedeemed(shares, received);
    }

    function _netStrategyValueForDeposit(
        uint256 assets
    ) internal view returns (uint256) {
        if (assets == 0 || !strategyDepositsEnabled) {
            return assets;
        }

        (uint256 grossPerShare, ) = strategy.previewRedemption(
            strategyShareUnit,
            false
        );
        if (grossPerShare == 0) {
            revert InvalidStrategy();
        }

        uint256 strategyShares = assets.mulDiv(
            strategyShareUnit,
            grossPerShare,
            Math.Rounding.Floor
        );
        (, uint256 netAssets) = strategy.previewRedemption(
            strategyShares,
            true
        );
        return netAssets;
    }

    function _grossAssetsForNetStrategyValue(
        uint256 netAssets
    ) internal view returns (uint256) {
        if (netAssets == 0 || !strategyDepositsEnabled) {
            return netAssets;
        }

        (uint256 grossPerShare, uint256 netPerShare) = strategy
            .previewRedemption(strategyShareUnit, true);
        if (grossPerShare == 0 || netPerShare == 0) {
            revert InvalidStrategy();
        }

        uint256 strategyShares = netAssets.mulDiv(
            strategyShareUnit,
            netPerShare,
            Math.Rounding.Ceil
        );
        return
            strategyShares.mulDiv(
                grossPerShare,
                strategyShareUnit,
                Math.Rounding.Ceil
            );
    }

    function _strategyWithdrawalLimit() internal view returns (uint256) {
        uint256 limit = strategy.maxWithdrawalAmount();
        return limit == 0 ? type(uint256).max : limit;
    }
}
