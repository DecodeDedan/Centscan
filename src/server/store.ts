import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { reportSchema, type AttestationRecord, type Report, type WindowHours } from "@/lib/report";
import { getConfig } from "./config";
import { errorFields, log } from "./log";
import { migrateUp } from "./migrations";

export interface StoredReport {
  report: Report;
  reportHash: `0x${string}`;
  createdAt: string;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface ReportRow {
  report_json: string;
  report_hash: string;
  created_at: string;
}

interface AttestationRow {
  report_hash: string;
  tx_hash: string;
  attester: string;
  block_number: number;
  created_at: string;
}

const RATE_LIMIT_RETENTION_MS = 86_400_000;
const RECENT_SCAN_ROWS = 200;

const toAttestation = (row: AttestationRow): AttestationRecord => ({
  reportHash: row.report_hash as `0x${string}`,
  txHash: row.tx_hash as `0x${string}`,
  attester: row.attester as `0x${string}`,
  blockNumber: row.block_number,
  createdAt: row.created_at,
});

export class Store {
  constructor(private readonly db: Database.Database) {}

  private parseRow(row: ReportRow | undefined): StoredReport | null {
    if (!row) return null;
    const parsed = reportSchema.safeParse(JSON.parse(row.report_json));
    if (!parsed.success) {
      log.error({ reportHash: row.report_hash }, "stored report failed schema validation; ignoring it");
      return null;
    }
    return { report: parsed.data, reportHash: row.report_hash as `0x${string}`, createdAt: row.created_at };
  }

  saveReport(report: Report, reportHash: `0x${string}`, createdAt: string = new Date().toISOString()): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO reports (target, window_hours, to_block, report_json, report_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(report.target, report.window.hours, Number(report.window.toBlock), JSON.stringify(report), reportHash, createdAt);
  }

  latestReport(target: string, hours: WindowHours): StoredReport | null {
    const row = this.db
      .prepare("SELECT report_json, report_hash, created_at FROM reports WHERE target = ? AND window_hours = ? ORDER BY created_at DESC LIMIT 1")
      .get(target.toLowerCase(), hours) as ReportRow | undefined;
    return this.parseRow(row);
  }

  /** Newest report for a target regardless of window; used by the badge and attestation. */
  latestReportAnyWindow(target: string): StoredReport | null {
    const row = this.db
      .prepare("SELECT report_json, report_hash, created_at FROM reports WHERE target = ? ORDER BY created_at DESC LIMIT 1")
      .get(target.toLowerCase()) as ReportRow | undefined;
    return this.parseRow(row);
  }

  /** Most recently scanned distinct contracts, newest first. */
  recentReports(limit: number): StoredReport[] {
    const rows = this.db
      .prepare("SELECT target, report_json, report_hash, created_at FROM reports ORDER BY created_at DESC LIMIT ?")
      .all(RECENT_SCAN_ROWS) as (ReportRow & { target: string })[];
    const seen = new Set<string>();
    const result: StoredReport[] = [];
    for (const row of rows) {
      if (seen.has(row.target)) continue;
      seen.add(row.target);
      const parsed = this.parseRow(row);
      if (parsed) result.push(parsed);
      if (result.length >= limit) break;
    }
    return result;
  }

  saveAttestation(target: string, record: AttestationRecord): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO attestations (report_hash, target, tx_hash, attester, block_number, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(record.reportHash, target.toLowerCase(), record.txHash, record.attester, record.blockNumber, record.createdAt);
  }

  attestationForHash(reportHash: string): AttestationRecord | null {
    const row = this.db
      .prepare("SELECT report_hash, tx_hash, attester, block_number, created_at FROM attestations WHERE report_hash = ?")
      .get(reportHash) as AttestationRow | undefined;
    return row ? toAttestation(row) : null;
  }

  latestAttestation(target: string): AttestationRecord | null {
    const row = this.db
      .prepare(
        "SELECT report_hash, tx_hash, attester, block_number, created_at FROM attestations WHERE target = ? ORDER BY block_number DESC LIMIT 1",
      )
      .get(target.toLowerCase()) as AttestationRow | undefined;
    return row ? toAttestation(row) : null;
  }

  /** Forgets a counter, e.g. when the work it guarded failed and the user should be able to retry at once. */
  clearRateLimit(key: string): void {
    this.db.prepare("DELETE FROM rate_limits WHERE key = ?").run(key);
  }

  /** Fixed-window counter, atomic under SQLite's write lock. */
  consumeRateLimit(key: string, windowMs: number, max: number, nowMs: number = Date.now()): RateLimitResult {
    return this.db.transaction((): RateLimitResult => {
      const row = this.db.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").get(key) as
        | { window_start: number; count: number }
        | undefined;
      if (!row || nowMs - row.window_start >= windowMs) {
        this.db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(nowMs - RATE_LIMIT_RETENTION_MS);
        this.db.prepare("INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)").run(key, nowMs);
        return { allowed: true, retryAfterMs: 0 };
      }
      if (row.count < max) {
        this.db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: row.window_start + windowMs - nowMs };
    })();
  }
}

export function openStore(path: string): Store {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  const version = migrateUp(db);
  log.info({ path, version }, "database ready");
  return new Store(db);
}

// Survives Next.js dev hot reloads, which re-evaluate modules but keep globalThis.
const globalStore = globalThis as unknown as { centscanStore?: Store };

export function getStore(): Store {
  if (!globalStore.centscanStore) {
    try {
      globalStore.centscanStore = openStore(getConfig().DATABASE_PATH);
    } catch (error) {
      log.fatal(errorFields(error), "could not open database");
      throw error;
    }
  }
  return globalStore.centscanStore;
}
