import { toFunctionSelector, type AbiFunction, type AbiParameter } from "viem";
import { z } from "zod";
import type { Verdict } from "@/lib/report";
import { fetchJson, type FetchLike } from "./http";
import { errorFields, log } from "./log";

const abiParameter: z.ZodType<AbiParameter> = z.lazy(() =>
  z.object({
    name: z.string().optional(),
    type: z.string(),
    internalType: z.string().optional(),
    components: z.array(abiParameter).optional(),
  }),
) as z.ZodType<AbiParameter>;

const abiItem = z.looseObject({
  type: z.string(),
  name: z.string().optional(),
  inputs: z.array(abiParameter).optional(),
});

const contractResponse = z.looseObject({
  match: z.enum(["exact_match", "match"]).nullable(),
  abi: z.array(abiItem).nullable().optional(),
});

export interface SourceStatus {
  verdict: Verdict;
  match: "exact_match" | "match" | null;
  sourcifyUrl: string;
  /** selector -> canonical signature, from the verified ABI. Empty when unverified. */
  abiNames: ReadonlyMap<string, string>;
}

export interface SourcifyOptions {
  baseUrl: string;
  chainId: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

export const sourcifyLookupUrl = (address: string): string => `https://sourcify.dev/#/lookup/${address}`;

function selectorsFromAbi(abi: readonly z.infer<typeof abiItem>[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const item of abi) {
    if (item.type !== "function" || !item.name) continue;
    const fn: AbiFunction = {
      type: "function",
      name: item.name,
      inputs: item.inputs ?? [],
      outputs: [],
      stateMutability: "nonpayable",
    };
    const signature = `${fn.name}(${fn.inputs.map(formatParameterType).join(",")})`;
    names.set(toFunctionSelector(fn), signature);
  }
  return names;
}

function formatParameterType(p: AbiParameter): string {
  if (!p.type.startsWith("tuple")) return p.type;
  const components = "components" in p && p.components ? p.components : [];
  return `(${components.map(formatParameterType).join(",")})${p.type.slice("tuple".length)}`;
}

/** Sourcify is the source of truth for verification. Failure to reach it is "unknown", never "fail". */
export async function getSourceStatus(address: string, opts: SourcifyOptions): Promise<SourceStatus> {
  const url = `${opts.baseUrl}/v2/contract/${opts.chainId}/${address}?fields=abi`;
  const sourcifyUrl = sourcifyLookupUrl(address);
  try {
    const { data } = await fetchJson(url, contractResponse, {
      fetchImpl: opts.fetchImpl,
      signal: opts.signal,
      acceptStatus: [404],
    });
    if (!data || data.match === null) return { verdict: "fail", match: null, sourcifyUrl, abiNames: new Map() };
    return { verdict: "pass", match: data.match, sourcifyUrl, abiNames: selectorsFromAbi(data.abi ?? []) };
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    log.warn({ address, ...errorFields(error) }, "sourcify lookup failed");
    return { verdict: "unknown", match: null, sourcifyUrl, abiNames: new Map() };
  }
}
