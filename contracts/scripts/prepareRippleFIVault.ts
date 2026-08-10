import { ethers } from "hardhat";

const FLARE_CHAIN_ID = 14n;
const MAINNET_FXRP = "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE";
const MAINNET_UPSHIFT = "0x373D7d201C8134D4a2f7b5c63560da217e3dEA28";

const erc20Abi = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];
const upshiftAbi = [
    "function asset() view returns (address)",
    "function lpTokenAddress() view returns (address)",
    "function withdrawalsPaused() view returns (bool)",
    "function maxWithdrawalAmount() view returns (uint256)",
    "function previewRedemption(uint256 shares, bool isInstant) view returns (uint256,uint256)",
];

async function main(): Promise<void> {
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== FLARE_CHAIN_ID) {
        throw new Error(`Expected Flare mainnet chain 14, received ${network.chainId}.`);
    }

    const fxrp = new ethers.Contract(MAINNET_FXRP, erc20Abi, ethers.provider);
    const strategy = new ethers.Contract(
        MAINNET_UPSHIFT,
        upshiftAbi,
        ethers.provider
    );
    const strategyAsset = await strategy.asset();
    if (ethers.getAddress(strategyAsset) !== ethers.getAddress(MAINNET_FXRP)) {
        throw new Error(
            `Upshift asset mismatch: expected ${MAINNET_FXRP}, received ${strategyAsset}.`
        );
    }

    const lpTokenAddress = await strategy.lpTokenAddress();
    const lpToken = new ethers.Contract(lpTokenAddress, erc20Abi, ethers.provider);
    const lpDecimals = Number(await lpToken.decimals());
    const unit = 10n ** BigInt(lpDecimals);
    const [gross, net] = await strategy.previewRedemption(unit, true);
    const [deployer] = await ethers.getSigners();
    if (!deployer) {
        throw new Error("No deployment signer is configured.");
    }
    const deployerAddress = await deployer.getAddress();
    const deployerBalance = await ethers.provider.getBalance(deployerAddress);
    const vaultFactory = await ethers.getContractFactory(
        "RippleFIVault",
        deployer
    );
    const deployment = await vaultFactory.getDeployTransaction(
        MAINNET_FXRP,
        MAINNET_UPSHIFT
    );
    const gasLimit = await ethers.provider.estimateGas({
        ...deployment,
        from: deployerAddress,
    });
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!gasPrice) {
        throw new Error("Could not read the Flare gas price.");
    }
    const estimatedCost = gasLimit * gasPrice;
    const requiredBalance = (estimatedCost * 125n) / 100n;
    const sufficientBalance = deployerBalance >= requiredBalance;

    console.log("RippleFIVault Flare mainnet preflight");
    console.log(`Chain: ${network.chainId}`);
    console.log(`Deployer: ${deployerAddress}`);
    console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} FLR`);
    console.log(`Estimated gas limit: ${gasLimit.toString()}`);
    console.log(`Estimated max gas cost: ${ethers.formatEther(estimatedCost)} FLR`);
    console.log(`Required with 25% buffer: ${ethers.formatEther(requiredBalance)} FLR`);
    console.log(`Balance sufficient: ${sufficientBalance ? "yes" : "no"}`);
    console.log(`FXRP: ${MAINNET_FXRP} (${await fxrp.symbol()}, ${await fxrp.decimals()} decimals)`);
    console.log(`Upshift strategy: ${MAINNET_UPSHIFT}`);
    console.log(`Strategy LP token: ${lpTokenAddress} (${await lpToken.symbol()}, ${lpDecimals} decimals)`);
    console.log(`Withdrawals paused: ${await strategy.withdrawalsPaused()}`);
    console.log(`Maximum instant withdrawal: ${(await strategy.maxWithdrawalAmount()).toString()}`);
    console.log(`One LP gross/net FXRP: ${gross.toString()} / ${net.toString()}`);
    console.log("No transaction was broadcast.");

    if (!sufficientBalance) {
        throw new Error("Deployer does not have enough FLR for deployment gas.");
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
