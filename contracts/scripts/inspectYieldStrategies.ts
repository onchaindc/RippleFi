import { ethers } from "hardhat";

const FIRELIGHT_VAULT = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361";
const UPSHIFT_VAULTS: Record<number, string> = {
    14: "0x373D7d201C8134D4a2f7b5c63560da217e3dEA28",
    114: "0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81",
};

const firelightAbi = [
    "function asset() view returns (address)",
    "function totalAssets() view returns (uint256)",
    "function totalSupply() view returns (uint256)",
];

const upshiftAbi = [
    "function asset() view returns (address)",
    "function lpTokenAddress() view returns (address)",
    "function withdrawalsPaused() view returns (bool)",
    "function instantRedemptionFee() view returns (uint256)",
    "function withdrawalFee() view returns (uint256)",
    "function lagDuration() view returns (uint256)",
    "function maxWithdrawalAmount() view returns (uint256)",
];

async function main(): Promise<void> {
    const network = await ethers.provider.getNetwork();
    const upshiftAddress = UPSHIFT_VAULTS[Number(network.chainId)];
    if (!upshiftAddress) {
        throw new Error(`Unsupported chain ${network.chainId}`);
    }

    const upshift = new ethers.Contract(
        upshiftAddress,
        upshiftAbi,
        ethers.provider
    );

    if (network.chainId === 114n) {
        const firelight = new ethers.Contract(
            FIRELIGHT_VAULT,
            firelightAbi,
            ethers.provider
        );
        console.log("Firelight");
        console.log(`  vault: ${FIRELIGHT_VAULT}`);
        console.log(`  asset: ${await firelight.asset()}`);
        console.log(`  total assets: ${(await firelight.totalAssets()).toString()}`);
        console.log(`  total supply: ${(await firelight.totalSupply()).toString()}`);
    }

    console.log("Upshift");
    console.log(`  vault: ${upshiftAddress}`);
    console.log(`  asset: ${await upshift.asset()}`);
    console.log(`  LP token: ${await upshift.lpTokenAddress()}`);
    console.log(`  withdrawals paused: ${await upshift.withdrawalsPaused()}`);
    console.log(
        `  instant redemption fee: ${(await upshift.instantRedemptionFee()).toString()}`
    );
    console.log(`  queued withdrawal fee: ${(await upshift.withdrawalFee()).toString()}`);
    console.log(`  lag duration: ${(await upshift.lagDuration()).toString()}`);
    console.log(
        `  max withdrawal amount: ${(await upshift.maxWithdrawalAmount()).toString()}`
    );
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
