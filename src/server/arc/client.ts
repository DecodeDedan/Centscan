import { createPublicClient, http, type PublicClient, type Transport } from "viem";
import { arc } from "viem/chains";
import { getConfig } from "../config";
import { createThrottledFetch } from "./throttle";

/** Calls per JSON-RPC batch. Smaller batches spread load evenly under the public RPC's per-call metering. */
export const RPC_BATCH_SIZE = 25;

export type ArcClient = PublicClient<Transport, typeof arc>;

export interface TransportLimits {
  callsPerSecond: number;
  burst: number;
}

/** Throttled client-side to stay under the RPC's limit; viem still retries 429 / 5xx with exponential backoff. */
export function arcTransport(rpcUrl: string, limits: TransportLimits): Transport {
  return http(rpcUrl, {
    batch: { batchSize: RPC_BATCH_SIZE },
    // The throttle's queueing time counts toward viem's timeout, so it must cover a full wave of queued calls.
    timeout: 30_000,
    retryCount: 5,
    // Rate-limit errors (-32005) clear within seconds; 1 s doubling over 5 retries waits up to ~31 s.
    retryDelay: 1_000,
    fetchFn: createThrottledFetch(limits.callsPerSecond, limits.burst),
  });
}

export function createArcClient(transport: Transport): ArcClient {
  return createPublicClient({ chain: arc, transport });
}

let shared: ArcClient | null = null;
let chainChecked: Promise<void> | null = null;

export async function getArcClient(): Promise<ArcClient> {
  const config = getConfig();
  shared ??= createArcClient(
    arcTransport(config.ARC_RPC_URL, { callsPerSecond: config.RPC_MAX_CALLS_PER_SECOND, burst: config.RPC_BURST }),
  );
  const client = shared;
  chainChecked ??= client.getChainId().then((id) => {
    if (id !== config.ARC_CHAIN_ID) throw new Error(`ARC_RPC_URL serves chain ${id}, expected ${config.ARC_CHAIN_ID}`);
  });
  try {
    await chainChecked;
  } catch (error) {
    chainChecked = null;
    throw error;
  }
  return client;
}
