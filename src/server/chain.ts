import type { ArcClient } from "./arc/client";

/** Live chain readout for the HUD: real values from the newest Arc block. */
export interface ChainStatus {
  blockNumber: string;
  /** Base fee in gwei of native USDC, as a decimal string. */
  baseFeeGwei: string;
  /** Unix seconds of the block. */
  timestamp: number;
  /** Cost of a plain 21,000-gas transfer at this base fee, in micro-USD (decimal string). */
  transferMicroUsd: string;
}

const GAS_PER_TRANSFER = 21_000n;
const WEI_PER_GWEI = 1_000_000_000n;
const WEI_PER_MICRO_USD = 1_000_000_000_000n;
/** One fresh read every 2 s at most, however many visitors poll: the public RPC allows ~10 calls/s in total. */
export const CHAIN_STATUS_TTL_MS = 2_000;

export function toChainStatus(block: { number: bigint; baseFeePerGas: bigint | null; timestamp: bigint }): ChainStatus {
  const baseFee = block.baseFeePerGas ?? 0n;
  const whole = baseFee / WEI_PER_GWEI;
  const frac = (baseFee % WEI_PER_GWEI).toString().padStart(9, "0").replace(/0+$/, "");
  return {
    blockNumber: block.number.toString(),
    baseFeeGwei: frac ? `${whole}.${frac}` : whole.toString(),
    timestamp: Number(block.timestamp),
    transferMicroUsd: ((GAS_PER_TRANSFER * baseFee + WEI_PER_MICRO_USD / 2n) / WEI_PER_MICRO_USD).toString(),
  };
}

/** Caches the latest status and shares one in-flight read between concurrent callers. */
export function createChainStatusReader(getClient: () => Promise<ArcClient>, now: () => number = Date.now) {
  let cached: { at: number; value: ChainStatus } | null = null;
  let inFlight: Promise<ChainStatus> | null = null;
  return async function read(): Promise<ChainStatus> {
    if (cached && now() - cached.at < CHAIN_STATUS_TTL_MS) return cached.value;
    inFlight ??= (async () => {
      try {
        const block = await (await getClient()).getBlock({ blockTag: "latest" });
        if (block.number === null) throw new Error("latest block has no number");
        const value = toChainStatus({ number: block.number, baseFeePerGas: block.baseFeePerGas, timestamp: block.timestamp });
        cached = { at: now(), value };
        return value;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
