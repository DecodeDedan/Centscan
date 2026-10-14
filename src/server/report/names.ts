import { z } from "zod";
import { fetchJson, type FetchLike } from "../http";
import { errorFields, log } from "../log";

export interface ResolvedName {
  name: string | null;
  source: "abi" | "signature-db" | null;
}

export interface NameOptions {
  signatureDbUrl: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

const LOOKUP_CHUNK = 50;

const lookupResponse = z.object({
  ok: z.boolean(),
  result: z.object({
    function: z.record(z.string(), z.array(z.object({ name: z.string() })).nullable()),
  }),
});

async function lookupSignatures(selectors: readonly string[], opts: NameOptions): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let i = 0; i < selectors.length; i += LOOKUP_CHUNK) {
    const chunk = selectors.slice(i, i + LOOKUP_CHUNK);
    const url = `${opts.signatureDbUrl}/lookup?function=${chunk.join(",")}&filter=true`;
    const { data } = await fetchJson(url, lookupResponse, { fetchImpl: opts.fetchImpl, signal: opts.signal });
    if (!data?.ok) continue;
    for (const [selector, matches] of Object.entries(data.result.function)) {
      const first = matches?.[0];
      if (first) found.set(selector.toLowerCase(), first.name);
    }
  }
  return found;
}

/**
 * Names selectors from the verified ABI first, then the public signature DB, else leaves them unnamed.
 * A signature-DB outage degrades to raw selectors rather than failing the report.
 */
export async function resolveNames(
  selectors: readonly string[],
  abiNames: ReadonlyMap<string, string>,
  opts: NameOptions,
): Promise<Map<string, ResolvedName>> {
  const resolved = new Map<string, ResolvedName>();
  const unknown: string[] = [];
  for (const selector of selectors) {
    if (selector === "receive()") resolved.set(selector, { name: "receive()", source: null });
    else if (selector === "deploy") resolved.set(selector, { name: "deploy (contract creation)", source: null });
    else if (abiNames.has(selector)) resolved.set(selector, { name: abiNames.get(selector) ?? null, source: "abi" });
    else unknown.push(selector);
  }
  if (unknown.length === 0) return resolved;

  let fromDb = new Map<string, string>();
  try {
    fromDb = await lookupSignatures(unknown, opts);
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    log.warn({ count: unknown.length, ...errorFields(error) }, "signature lookup failed; using raw selectors");
  }
  for (const selector of unknown) {
    const name = fromDb.get(selector);
    resolved.set(selector, name ? { name, source: "signature-db" } : { name: null, source: null });
  }
  return resolved;
}
