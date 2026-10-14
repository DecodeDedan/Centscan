export const EXPLORER_URL = "https://explorer.arc.io";

const MICRO_USD_PER_CENT = 10_000;
const CENTS_PER_DOLLAR = 100;

/** Formats a micro-USD amount as cents with 3 significant digits (0.440¢), or dollars at $1 and above. */
export function formatMicroUsd(microUsd: string | bigint): string {
  const micro = typeof microUsd === "bigint" ? microUsd : BigInt(microUsd);
  if (micro === 0n) return "0¢";
  const cents = Number(micro) / MICRO_USD_PER_CENT;
  const rounded = cents.toPrecision(3);
  // Compare after rounding so 99.99¢ becomes "$1.00", not "100¢".
  if (Number(rounded) < CENTS_PER_DOLLAR) return `${rounded}¢`;
  return `$${(cents / CENTS_PER_DOLLAR).toFixed(2)}`;
}

/** Formats a decimal USD string such as "0.440000" for headlines ("$0.44", "<$0.01"). */
export function formatUsd(usd: string): string {
  const value = Number(usd);
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

export function formatInt(value: number | string): string {
  return BigInt(value).toLocaleString("en-US");
}

export function shortHex(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export const explorerTx = (hash: string): string => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string): string => `${EXPLORER_URL}/address/${address}`;
