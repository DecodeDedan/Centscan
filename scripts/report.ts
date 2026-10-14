/**
 * CLI: build a Centscan report for one contract and print it as JSON.
 *   pnpm report <address> [hours]
 * Reads the same environment variables as the app (see .env.example).
 */
import { isAddress, type Hex } from "viem";
import { parseWindowHours } from "../src/lib/report";
import { arcTransport, createArcClient } from "../src/server/arc/client";
import { getConfig } from "../src/server/config";
import { log } from "../src/server/log";
import { buildReport } from "../src/server/report/build";

async function main(): Promise<void> {
  const [address, hoursArg] = process.argv.slice(2);
  if (!address || !isAddress(address, { strict: false })) throw new Error("usage: pnpm report <address> [1|24|168]");
  const hours = parseWindowHours(hoursArg);
  if (hours === null) throw new Error("hours must be 1, 24 or 168");

  const config = getConfig();
  const client = createArcClient(
    arcTransport(config.ARC_RPC_URL, { callsPerSecond: config.RPC_MAX_CALLS_PER_SECOND, burst: config.RPC_BURST }),
  );
  const started = Date.now();
  const report = await buildReport(
    {
      client,
      chainId: config.ARC_CHAIN_ID,
      sourcifyUrl: config.SOURCIFY_URL,
      signatureDbUrl: config.SIGNATURE_DB_URL,
      maxTxs: config.MAX_TXS_PER_REPORT,
      fallbackBlocks: config.SCAN_FALLBACK_BLOCKS,
    },
    address.toLowerCase() as Hex,
    hours,
    { onProgress: (e) => log.debug(e, "progress") },
  );
  process.stderr.write(`report built in ${Date.now() - started} ms\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  log.error({ err: error instanceof Error ? error.message : String(error) }, "report failed");
  process.exitCode = 1;
});
