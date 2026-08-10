import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

const privateKey = process.env.PRIVATE_KEY;
const flareRpcApiKey = process.env.FLARE_RPC_API_KEY;
const flareExplorerApiKey = process.env.FLARE_EXPLORER_API_KEY ?? "";

if (privateKey && !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hexadecimal private key prefixed with 0x.");
}

const coston2ExplorerUrl = process.env.COSTON2_EXPLORER_URL ?? "https://coston2-explorer.flare.network";
const coston2RpcUrl =
    process.env.COSTON2_RPC_URL ??
    (flareRpcApiKey
        ? `https://coston2-api-tracer.flare.network/ext/C/rpc?x-apikey=${flareRpcApiKey}`
        : "https://coston2-api.flare.network/ext/C/rpc");
const flareExplorerUrl =
    process.env.FLARE_EXPLORER_URL ?? "https://flare-explorer.flare.network";
const flareRpcUrl =
    process.env.FLARE_RPC_URL ??
    (flareRpcApiKey
        ? `https://flare-api-tracer.flare.network/ext/C/rpc?x-apikey=${flareRpcApiKey}`
        : "https://flare-api.flare.network/ext/C/rpc");

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.25",
        settings: {
            evmVersion: "cancun",
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        coston2: {
            url: coston2RpcUrl,
            accounts: privateKey ? [privateKey] : [],
            chainId: 114,
        },
        flare: {
            url: flareRpcUrl,
            accounts: privateKey ? [privateKey] : [],
            chainId: 14,
        },
    },
    etherscan: {
        apiKey: {
            coston2: flareExplorerApiKey,
            flare: flareExplorerApiKey,
        },
        customChains: [
            {
                network: "coston2",
                chainId: 114,
                urls: {
                    apiURL: `${coston2ExplorerUrl}/api` + (flareExplorerApiKey ? `?x-apikey=${flareExplorerApiKey}` : ""),
                    browserURL: coston2ExplorerUrl,
                },
            },
            {
                network: "flare",
                chainId: 14,
                urls: {
                    apiURL: `${flareExplorerUrl}/api` + (flareExplorerApiKey ? `?x-apikey=${flareExplorerApiKey}` : ""),
                    browserURL: flareExplorerUrl,
                },
            },
        ],
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};

export default config;
