import type { Report } from "./report";

/** ABI of contracts/src/CentscanRegistry.sol (kept in sync by tests/registry-abi.test.ts). */
export const registryAbi = [
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "reportHash", type: "bytes32" },
      { name: "medianCostMicroUsd", type: "uint64" },
      { name: "windowEndBlock", type: "uint64" },
      { name: "flags", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [
      { name: "target", type: "address" },
      { name: "attester", type: "address" },
    ],
    outputs: [
      { name: "reportHash", type: "bytes32" },
      { name: "medianCostMicroUsd", type: "uint64" },
      { name: "windowEndBlock", type: "uint64" },
      { name: "timestamp", type: "uint32" },
      { name: "flags", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "FLAG_LIVE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "FLAG_SOURCE_VERIFIED",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "event",
    name: "Attested",
    anonymous: false,
    inputs: [
      { name: "target", type: "address", indexed: true },
      { name: "attester", type: "address", indexed: true },
      { name: "reportHash", type: "bytes32", indexed: true },
      { name: "medianCostMicroUsd", type: "uint64", indexed: false },
      { name: "windowEndBlock", type: "uint64", indexed: false },
      { name: "flags", type: "uint8", indexed: false },
    ],
  },
  { type: "error", name: "StaleWindow", inputs: [{ name: "previous", type: "uint64" }, { name: "given", type: "uint64" }] },
  { type: "error", name: "ZeroReportHash", inputs: [] },
  { type: "error", name: "ZeroTarget", inputs: [] },
] as const;

export const FLAG_SOURCE_VERIFIED = 1;
export const FLAG_LIVE = 2;

const UINT64_MAX = (1n << 64n) - 1n;

export interface AttestationArgs {
  target: `0x${string}`;
  medianCostMicroUsd: bigint;
  windowEndBlock: bigint;
  flags: number;
}

/** Derives the on-chain attestation fields from a report. */
export function attestationArgs(report: Report): AttestationArgs {
  const flags =
    (report.source.verdict === "pass" ? FLAG_SOURCE_VERIFIED : 0) | (report.activity.verdict === "pass" ? FLAG_LIVE : 0);
  const median = BigInt(report.headline.medianMicroUsd ?? "0");
  return {
    target: report.target as `0x${string}`,
    medianCostMicroUsd: median > UINT64_MAX ? UINT64_MAX : median,
    windowEndBlock: BigInt(report.window.toBlock),
    flags,
  };
}
