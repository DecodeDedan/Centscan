import { keccak256, stringToBytes, type Hex } from "viem";

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace, arrays kept in order.
 * Runs identically in the browser so anyone can recompute an attested report hash.
 * Rejects values JSON cannot represent unambiguously (undefined, bigint, non-finite numbers, functions).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

export function canonicalHash(value: unknown): Hex {
  return keccak256(stringToBytes(canonicalJson(value)));
}
