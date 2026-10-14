import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import { BaseError } from "viem";

// The logger must exist before config validation so that config errors themselves get logged.
export const log: Logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "centscan" },
  redact: { paths: ["privateKey", "*.privateKey", "ATTESTER_PRIVATE_KEY"], censor: "[redacted]" },
});

export function requestLogger(route: string): Logger {
  return log.child({ route, requestId: randomUUID() });
}

export function errorFields(error: unknown): { err: { name: string; message: string } } {
  // viem's full message embeds the RPC URL (which may carry a provider API key) and request bodies.
  if (error instanceof BaseError) return { err: { name: error.name, message: error.shortMessage } };
  if (error instanceof Error) return { err: { name: error.name, message: error.message } };
  return { err: { name: "NonError", message: String(error) } };
}
