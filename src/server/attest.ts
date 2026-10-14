import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  InsufficientFundsError,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";
import type { ApiError } from "@/lib/api";
import { ATTEST_MAX_REPORT_AGE_MS } from "@/lib/api";
import { attestationArgs, registryAbi } from "@/lib/registry";
import type { AttestationRecord } from "@/lib/report";
import { arcTransport, getArcClient } from "./arc/client";
import { getAttestationConfig, getConfig } from "./config";
import { errorFields, log } from "./log";
import type { StoredReport } from "./store";

export class AttestError extends Error {
  /** `sent` is true once the transaction may have reached the chain, so callers must not treat it as free to retry. */
  constructor(
    readonly apiError: ApiError,
    readonly sent = false,
  ) {
    super(apiError.message);
    this.name = "AttestError";
  }
}

const RECEIPT_TIMEOUT_MS = 60_000;

// ponytail: one in-process queue so concurrent attestations never race for the same nonce; a single
// service instance is the deployment model (ARCHITECTURE §12). Use a DB-backed lock if it ever scales out.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Validates freshness, then sends attest() from the service wallet and waits for the receipt. */
export function attestReport(stored: StoredReport, now: number = Date.now()): Promise<AttestationRecord> {
  const config = getAttestationConfig();
  if (!config?.privateKey) {
    throw new AttestError({ code: "ATTEST_DISABLED", message: "This server has no attester key configured." });
  }
  if (now - Date.parse(stored.createdAt) > ATTEST_MAX_REPORT_AGE_MS) {
    throw new AttestError({ code: "REPORT_TOO_OLD", message: "Refresh the report first: only reports under 1 hour old can be attested." });
  }
  const { privateKey, registry } = config;
  return serialized(() => send(stored, registry, privateKey));
}

async function send(stored: StoredReport, registry: Hex, privateKey: Hex): Promise<AttestationRecord> {
  const account = privateKeyToAccount(privateKey);
  const client = await getArcClient();
  const config = getConfig();
  const wallet = createWalletClient({
    account,
    chain: arc,
    transport: arcTransport(config.ARC_RPC_URL, { callsPerSecond: config.RPC_MAX_CALLS_PER_SECOND, burst: config.RPC_BURST }),
  });
  const args = attestationArgs(stored.report);
  let sent = false;
  try {
    // Simulating first turns a StaleWindow revert into a typed error instead of a wasted transaction.
    const { request } = await client.simulateContract({
      account,
      address: registry,
      abi: registryAbi,
      functionName: "attest",
      args: [args.target, stored.reportHash, args.medianCostMicroUsd, args.windowEndBlock, args.flags],
    });
    sent = true;
    const txHash = await wallet.writeContract(request);
    log.info({ target: args.target, txHash, reportHash: stored.reportHash }, "attestation sent");
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS });
    if (receipt.status !== "success") throw new Error(`attest transaction ${txHash} reverted`);
    return {
      reportHash: stored.reportHash,
      txHash,
      attester: account.address.toLowerCase() as Hex,
      blockNumber: Number(receipt.blockNumber),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    throw toAttestError(error, args.target, sent);
  }
}

function toAttestError(error: unknown, target: Hex, sent: boolean): AttestError {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "StaleWindow") {
      return new AttestError({ code: "STALE_WINDOW", message: "A newer report for this contract is already attested." }, sent);
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      log.error({ target }, "attester wallet has insufficient USDC for gas");
      return new AttestError({ code: "ATTESTER_UNFUNDED", message: "The attester wallet is out of USDC for gas. Reports and badges still work." }, sent);
    }
  }
  log.error({ target, chainId: getConfig().ARC_CHAIN_ID, ...errorFields(error) }, "attestation failed");
  return new AttestError({ code: "RPC_UNAVAILABLE", message: "The attestation could not be sent to Arc. Try again in a minute." }, sent);
}
