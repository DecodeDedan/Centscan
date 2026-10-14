"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CHAIN_POLL_MS, CHAIN_TIMEOUT_MS, parseChainResponse, type ChainReading } from "./chainStatus";

/**
 * One poller for every live readout on the page. It reads /api/chain at most every 2 s, only while the tab is visible,
 * and keeps the last good reading when a read fails so the readouts pause instead of going blank.
 */

export type ChainState =
  | { status: "loading"; reading: null; reason: null }
  | { status: "live"; reading: ChainReading; reason: null }
  | { status: "paused"; reading: ChainReading | null; reason: string };

const ChainContext = createContext<ChainState>({ status: "loading", reading: null, reason: null });
const ClockContext = createContext<number | null>(null);

const CLOCK_MS = 1_000;

async function readChain(signal: AbortSignal): Promise<ReturnType<typeof parseChainResponse>> {
  const response = await fetch("/api/chain", { signal, cache: "no-store", headers: { accept: "application/json" } });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: `Arc readout returned HTTP ${response.status}` };
  }
  return parseChainResponse(body);
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChainState>({ status: "loading", reading: null, reason: null });
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let isStopped = false;

    async function poll(): Promise<void> {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), CHAIN_TIMEOUT_MS);
      try {
        const result = await readChain(controller.signal);
        if (isStopped) return;
        setState((previous) =>
          result.ok ? { status: "live", reading: result.reading, reason: null } : { status: "paused", reading: previous.reading, reason: result.reason },
        );
      } catch (error) {
        if (isStopped) return;
        const reason = error instanceof DOMException && error.name === "AbortError" ? "Arc readout timed out" : "Arc readout unreachable";
        setState((previous) => ({ status: "paused", reading: previous.reading, reason }));
      } finally {
        window.clearTimeout(timeout);
      }
      if (!isStopped && !document.hidden) timer = window.setTimeout(poll, CHAIN_POLL_MS);
    }

    function handleVisibility(): void {
      window.clearTimeout(timer);
      if (document.hidden) {
        controller?.abort();
        return;
      }
      void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      isStopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, CLOCK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  return (
    <ChainContext.Provider value={state}>
      <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
    </ChainContext.Provider>
  );
}

export function useChain(): ChainState {
  return useContext(ChainContext);
}

/** Wall-clock milliseconds, ticking once a second after hydration; null during server render. */
export function useClock(): number | null {
  return useContext(ClockContext);
}
