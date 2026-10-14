import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, custom, RpcRequestError } from "viem";
import { arc } from "viem/chains";
import { z } from "zod";
import type { ArcClient } from "@/server/arc/client";

/** One recorded JSON-RPC exchange: the request (method, params) and the node's result or error. */
const entrySchema = z.union([
  z.object({ method: z.string(), params: z.array(z.unknown()), result: z.unknown() }),
  z.object({ method: z.string(), params: z.array(z.unknown()), error: z.object({ code: z.number(), message: z.string() }) }),
]);

export const fixtureSchema = z.object({
  description: z.string(),
  rpcUrl: z.string(),
  recordedAt: z.string(),
  /** Scenario parameters the recording was made with; tests replay exactly these. */
  scenario: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  entries: z.array(entrySchema),
});

export type RpcFixture = z.infer<typeof fixtureSchema>;
export type RpcEntry = z.infer<typeof entrySchema>;

export const fixtureKey = (method: string, params: readonly unknown[]): string => JSON.stringify([method, params]);

export function loadFixture(name: string): RpcFixture {
  const raw: unknown = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", name), "utf8"));
  return fixtureSchema.parse(raw);
}

/** A string scenario parameter; throws when the fixture lacks it so a stale recording fails loudly. */
export function scenarioString(fixture: RpcFixture, key: string): string {
  const value = fixture.scenario[key];
  if (typeof value !== "string") throw new Error(`fixture scenario.${key} is not a string`);
  return value;
}

export function scenarioNumber(fixture: RpcFixture, key: string): number {
  const value = fixture.scenario[key];
  if (typeof value !== "number") throw new Error(`fixture scenario.${key} is not a number`);
  return value;
}

export interface RecordedRequest {
  method: string;
  params: readonly unknown[];
}

export class UnrecordedRequestError extends Error {
  constructor(readonly key: string) {
    super(`No recorded response for ${key}`);
    this.name = "UnrecordedRequestError";
  }
}

export interface Replay {
  /** Answers a request from the recording, throwing the node's RPC error or UnrecordedRequestError. */
  answer: (method: string, params: readonly unknown[]) => unknown;
  requests: RecordedRequest[];
}

export function createReplay(fixture: RpcFixture, extra: readonly RpcEntry[] = []): Replay {
  const byKey = new Map<string, RpcEntry>();
  for (const entry of [...fixture.entries, ...extra]) byKey.set(fixtureKey(entry.method, entry.params), entry);
  const requests: RecordedRequest[] = [];
  return {
    requests,
    answer: (method, params) => {
      requests.push({ method, params });
      const key = fixtureKey(method, params);
      const entry = byKey.get(key);
      if (!entry) throw new UnrecordedRequestError(key);
      if ("error" in entry) {
        // The same error the viem http transport raises for a JSON-RPC error body.
        throw new RpcRequestError({ body: { method, params }, error: entry.error, url: fixture.rpcUrl });
      }
      return entry.result;
    },
  };
}

/** An ArcClient whose transport replays the recording; retries are off so a miss surfaces at once. */
export function replayClient(fixture: RpcFixture, extra: readonly RpcEntry[] = []): { client: ArcClient; replay: Replay } {
  const replay = createReplay(fixture, extra);
  const transport = custom(
    { request: async ({ method, params }: { method: string; params?: unknown }) => replay.answer(method, (params ?? []) as unknown[]) },
    { retryCount: 0 },
  );
  return { client: createPublicClient({ chain: arc, transport }), replay };
}

/** Results of every recorded call of one method, for computing expectations independently of the code under test. */
export function resultsOf<T>(fixture: RpcFixture, method: string): { params: unknown[]; result: T }[] {
  return fixture.entries.flatMap((e) => ("result" in e && e.method === method ? [{ params: e.params, result: e.result as T }] : []));
}

export interface RpcTx {
  hash: `0x${string}`;
  from: string;
  to: string | null;
  input: string;
  blockNumber: string;
}

export interface RpcReceipt {
  transactionHash: `0x${string}`;
  gasUsed: string;
  effectiveGasPrice: string;
  status: string;
  contractAddress: string | null;
  blockNumber: string;
}

export interface RpcLog {
  transactionHash: `0x${string}`;
  blockNumber: string;
  logIndex: string;
}

export interface RpcBlock {
  number: string;
  timestamp: string;
  transactions: RpcTx[];
}

type FetchInput = string | URL | Request;
interface JsonRpcRequest {
  id: number | string;
  method: string;
  params?: unknown[];
}

/**
 * A global-fetch double that serves JSON-RPC (single and batch) from the recording at `fixture.rpcUrl`, and any
 * other URL from `routes`. It sits where the real network would, so viem's http transport and throttle run for real.
 */
export function rpcHttpFetch(
  fixture: RpcFixture,
  routes: (url: string) => Response | undefined,
): { fetch: (input: FetchInput, init?: RequestInit) => Promise<Response>; replay: Replay } {
  const replay = createReplay(fixture);
  const answer = (req: JsonRpcRequest): Record<string, unknown> => {
    try {
      return { jsonrpc: "2.0", id: req.id, result: replay.answer(req.method, req.params ?? []) };
    } catch (error) {
      if (error instanceof RpcRequestError) return { jsonrpc: "2.0", id: req.id, error: { code: error.code, message: error.details } };
      const message = error instanceof Error ? error.message : String(error);
      return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message } };
    }
  };
  const fetch = async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input)).href;
    if (url !== new URL(fixture.rpcUrl).href) {
      const routed = routes(url);
      if (!routed) throw new TypeError(`fetch double: no route for ${url}`);
      return routed;
    }
    const body = JSON.parse(String(init?.body)) as JsonRpcRequest | JsonRpcRequest[];
    return Response.json(Array.isArray(body) ? body.map(answer) : answer(body));
  };
  return { fetch, replay };
}
