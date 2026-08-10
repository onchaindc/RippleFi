// Minimal fragments copied from the official Flare Coston2 periphery package
// v3.6.0. Keeping only the functions used by RippleFI avoids bundling the
// package's thousands of generated wagmi hooks into server routes.
const xrpPaymentResponseComponents = [
  { name: "attestationType", type: "bytes32" },
  { name: "sourceId", type: "bytes32" },
  { name: "votingRound", type: "uint64" },
  { name: "lowestUsedTimestamp", type: "uint64" },
  {
    name: "requestBody",
    type: "tuple",
    components: [
      { name: "transactionId", type: "bytes32" },
      { name: "proofOwner", type: "address" },
    ],
  },
  {
    name: "responseBody",
    type: "tuple",
    components: [
      { name: "blockNumber", type: "uint64" },
      { name: "blockTimestamp", type: "uint64" },
      { name: "sourceAddress", type: "string" },
      { name: "sourceAddressHash", type: "bytes32" },
      { name: "receivingAddressHash", type: "bytes32" },
      { name: "intendedReceivingAddressHash", type: "bytes32" },
      { name: "spentAmount", type: "int256" },
      { name: "intendedSpentAmount", type: "int256" },
      { name: "receivedAmount", type: "int256" },
      { name: "intendedReceivedAmount", type: "int256" },
      { name: "hasMemoData", type: "bool" },
      { name: "firstMemoData", type: "bytes" },
      { name: "hasDestinationTag", type: "bool" },
      { name: "destinationTag", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
] as const;

const xrpPaymentProofComponents = [
  { name: "merkleProof", type: "bytes32[]" },
  {
    name: "data",
    type: "tuple",
    components: xrpPaymentResponseComponents,
  },
] as const;

export const iDirectMintingAbi = [
  {
    type: "function",
    name: "executeDirectMintingWithData",
    stateMutability: "payable",
    inputs: [
      {
        name: "payment",
        type: "tuple",
        components: xrpPaymentProofComponents,
      },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const ixrpPaymentVerificationAbi = [
  {
    type: "function",
    name: "verifyXRPPayment",
    stateMutability: "view",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: xrpPaymentProofComponents,
      },
    ],
    outputs: [{ name: "proved", type: "bool" }],
  },
] as const;

export const iFdcHubAbi = [
  {
    type: "function",
    name: "fdcRequestFeeConfigurations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "feeConfigurations", type: "address" }],
  },
  {
    type: "function",
    name: "requestAttestation",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [],
  },
] as const;

export const iFdcRequestFeeConfigurationsAbi = [
  {
    type: "function",
    name: "getRequestFee",
    stateMutability: "view",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [{ name: "fee", type: "uint256" }],
  },
] as const;

export const iFlareSystemsManagerAbi = [
  {
    type: "function",
    name: "firstVotingRoundStartTs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "timestamp", type: "uint64" }],
  },
  {
    type: "function",
    name: "votingEpochDurationSeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "duration", type: "uint64" }],
  },
] as const;

export const iFdcVerificationAbi = [
  {
    type: "function",
    name: "fdcProtocolId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "protocolId", type: "uint8" }],
  },
] as const;

export const iRelayAbi = [
  {
    type: "function",
    name: "isFinalized",
    stateMutability: "view",
    inputs: [
      { name: "protocolId", type: "uint256" },
      { name: "votingRoundId", type: "uint256" },
    ],
    outputs: [{ name: "finalized", type: "bool" }],
  },
] as const;
