"use client";

import { useSyncExternalStore } from "react";

/** One reading from GET /api/chain (see src/server/chain.ts). */
export interface ChainReading {
  blockNumber: string;
  baseFeeGwei: string;
  /** Unix seconds of the block. */
  timestamp: number;
  transferMicroUsd: string;
}

export interface ChainFeed {
  latest: ChainReading | null;
  /** True after a failed poll; `latest` keeps the last good reading. */
  paused: boolean;
  /** Recent readings with the client time they arrived, oldest first, for rates and the sparkline. */
  history: readonly { block: number; at: number }[];
}

/** The route caches for 2 s; 3 s keeps every poll fresh without queueing behind the cache. */
export const CHAIN_POLL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 5_000;
const HISTORY_LENGTH = 30;

const INITIAL: ChainFeed = { latest: null, paused: false, history: [] };

let state: ChainFeed = INITIAL;
const listeners = new Set<() => void>();
let timer: number | undefined;
let controller: AbortController | null = null;

function publish(next: ChainFeed): void {
  state = next;
  for (const listener of listeners) listener();
}

function isReading(value: unknown): value is ChainReading {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.blockNumber === "string" &&
    /^\d+$/.test(v.blockNumber) &&
    typeof v.baseFeeGwei === "string" &&
    Number.isFinite(Number(v.baseFeeGwei)) &&
    typeof v.timestamp === "number" &&
    typeof v.transferMicroUsd === "string" &&
    /^\d+$/.test(v.transferMicroUsd)
  );
}

async function readOnce(signal: AbortSignal): Promise<ChainReading | null> {
  const response = await fetch("/api/chain", { cache: "no-store", signal });
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || (body as { ok?: unknown }).ok !== true) return null;
  const data = (body as { data?: unknown }).data;
  return isReading(data) ? data : null;
}

function schedule(): void {
  window.clearTimeout(timer);
  if (listeners.size > 0 && document.visibilityState === "visible") timer = window.setTimeout(poll, CHAIN_POLL_MS);
}

async function poll(): Promise<void> {
  controller?.abort();
  const own = new AbortController();
  controller = own;
  const timeout = window.setTimeout(() => own.abort(), REQUEST_TIMEOUT_MS);
  let reading: ChainReading | null = null;
  try {
    reading = await readOnce(own.signal);
  } catch {
    // Network failure, timeout or a non-JSON body: the HUD shows "Live readout paused" with the last good value.
    reading = null;
  } finally {
    window.clearTimeout(timeout);
  }
  // A newer poll or a stop() took over while this one was in flight.
  if (controller !== own) return;
  controller = null;
  if (reading) {
    const block = Number(reading.blockNumber);
    const last = state.history.at(-1);
    const history = last?.block === block ? state.history : [...state.history, { block, at: Date.now() }].slice(-HISTORY_LENGTH);
    publish({ latest: reading, paused: false, history });
  } else {
    publish({ ...state, paused: true });
  }
  schedule();
}

function onVisibility(): void {
  if (document.visibilityState === "visible") void poll();
  else {
    window.clearTimeout(timer);
    controller?.abort();
    controller = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") void poll();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
      controller?.abort();
      controller = null;
    }
  };
}

/** Live Arc readout shared by every subscriber on the page: one poll every 3 s, only while the tab is visible. */
export function useChainFeed(): ChainFeed {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
