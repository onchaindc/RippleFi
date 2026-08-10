import { ethers } from "hardhat";

const NETWORKS = {
    14: {
        fxrp: "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE",
        name: "Flare Mainnet",
        strategy: "0x373D7d201C8134D4a2f7b5c63560da217e3dEA28",
    },
    114: {
        fxrp: "0x0b6A3645c240605887a5532109323A3E12273dc7",
        name: "Coston2",
        strategy: "0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81",
    },
} as const;

function validateAddress(configuredAddress: string, label: string): string {
    if (
        !ethers.isAddress(configuredAddress) ||
        configuredAddress === ethers.ZeroAddress
    ) {
        throw new Error(`${label} must be a valid non-zero address.`);
    }
    return ethers.getAddress(configuredAddress);
}

async function main(): Promise<void> {
    const currentNetwork = await ethers.provider.getNetwork();
    const network =
        NETWORKS[Number(currentNetwork.chainId) as keyof typeof NETWORKS];
    if (!network) {
        throw new Error(
            `Unsupported deployment chain ${currentNetwork.chainId}. Use Flare (14) or Coston2 (114).`
        );
    }

    if (
        currentNetwork.chainId === 14n &&
        process.env.CONFIRM_MAINNET_DEPLOY !== "YES"
    ) {
        throw new Error(
            "Mainnet broadcast blocked. Set CONFIRM_MAINNET_DEPLOY=YES only after completing the deployment checklist."
        );
    }

    const isMainnet = currentNetwork.chainId === 14n;
    const fxrpAddress = validateAddress(
        isMainnet
            ? network.fxrp
            : process.env.FXRP_ADDRESS?.trim() ?? network.fxrp,
        "FXRP_ADDRESS"
    );
    const strategyAddress = validateAddress(
        isMainnet
            ? network.strategy
            : process.env.UPSHIFT_VAULT_ADDRESS?.trim() ?? network.strategy,
        "UPSHIFT_VAULT_ADDRESS"
    );
    const [deployer] = await ethers.getSigners();

    if (!deployer) {
        throw new Error(
            "No deployment signer is configured. Add PRIVATE_KEY to your .env file."
        );
    }

    const deployerAddress = await deployer.getAddress();

    console.log("Deploying RippleFIVault");
    console.log(`Network: ${network.name} (${currentNetwork.chainId})`);
    console.log(`Deployer: ${deployerAddress}`);
    console.log(`FXRP asset: ${fxrpAddress}`);
    console.log(`Upshift strategy: ${strategyAddress}`);

    const vaultFactory = await ethers.getContractFactory(
        "RippleFIVault",
        deployer
    );
    const vault = await vaultFactory.deploy(fxrpAddress, strategyAddress);
    const deploymentTransaction = vault.deploymentTransaction();
    if (!deploymentTransaction) {
        throw new Error("Deployment transaction was not created.");
    }

    console.log(`Deployment transaction: ${deploymentTransaction.hash}`);

    const receipt = await deploymentTransaction.wait();
    if (!receipt || receipt.status !== 1) {
        throw new Error("RippleFIVault deployment reverted.");
    }

    console.log(`RippleFIVault deployed at: ${await vault.getAddress()}`);
    console.log(`Deployment block: ${receipt.blockNumber}`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
