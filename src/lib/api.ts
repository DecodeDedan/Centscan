import type { AttestationRecord, ProgressEvent, Report } from "./report";

/** HTTP contract shared by route handlers and the browser. Every JSON response uses this envelope. */

export const API_ERROR_CODES = [
  "INVALID_ADDRESS",
  "INVALID_WINDOW",
  "NOT_A_CONTRACT",
  "NOT_FOUND",
  "RATE_LIMITED",
  "RPC_UNAVAILABLE",
  "ATTEST_DISABLED",
  "REPORT_TOO_OLD",
  "STALE_WINDOW",
  "ATTESTER_UNFUNDED",
  "INTERNAL",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Present on RATE_LIMITED. */
  retryAfterSeconds?: number;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** A stored report with its canonical hash and, when attested by the official attester, the attestation. */
export interface ReportPayload {
  report: Report;
  reportHash: `0x${string}`;
  createdAt: string;
  attestation: AttestationRecord | null;
}

/** Public attestation settings the report page needs to render the attest and verify panels. */
export interface AttestationInfo {
  registry: `0x${string}`;
  attester: `0x${string}`;
  /** False when the service has no signing key: verification still works, attesting does not. */
  canAttest: boolean;
}

/**
 * Server-Sent Events on GET /api/report/[address]/stream?hours=N.
 * Event names and their JSON `data`: "progress" → ProgressEvent, "done" → ReportPayload, "error" → ApiError.
 */
export type StreamEvent =
  | { event: "progress"; data: ProgressEvent }
  | { event: "done"; data: ReportPayload }
  | { event: "error"; data: ApiError };

/** Minimum time between attestations of one contract, and the maximum report age that may be attested. */
export const ATTEST_COOLDOWN_MS = 10 * 60_000;
export const ATTEST_MAX_REPORT_AGE_MS = 60 * 60_000;
