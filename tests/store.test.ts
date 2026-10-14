import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AttestationRecord, Report } from "@/lib/report";
import { openStore, type Store } from "@/server/store";
import { makeReport, TARGET } from "./helpers/report";

const HASH_A = `0x${"aa".repeat(32)}` as const;
const HASH_B = `0x${"bb".repeat(32)}` as const;
const HASH_C = `0x${"cc".repeat(32)}` as const;
const OTHER = `0x${"cd".repeat(20)}` as const;

const reportFor = (target: `0x${string}`, toBlock: string, hours: Report["window"]["hours"] = 1): Report => {
  const base = makeReport();
  return makeReport({ target, window: { ...base.window, toBlock, hours } });
};

const attestation = (reportHash: `0x${string}`, blockNumber: number, tx: string): AttestationRecord => ({
  reportHash,
  txHash: `0x${tx.repeat(64)}` as `0x${string}`,
  attester: `0x${"ee".repeat(20)}`,
  blockNumber,
  createdAt: "2026-10-14T12:00:00.000Z",
});

describe("Store", () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(":memory:");
  });

  describe("reports", () => {
    it("returns null when nothing is stored", () => {
      expect(store.latestReport(TARGET, 1)).toBeNull();
      expect(store.latestReportAnyWindow(TARGET)).toBeNull();
      expect(store.recentReports(10)).toEqual([]);
    });

    it("round-trips a report with its hash and creation time", () => {
      // Arrange
      const report = makeReport();

      // Act
      store.saveReport(report, HASH_A, "2026-10-14T12:00:00.000Z");
      const stored = store.latestReport(TARGET, 1);

      // Assert
      expect(stored).toEqual({ report, reportHash: HASH_A, createdAt: "2026-10-14T12:00:00.000Z" });
    });

    it("finds the newest report per window, matching the target case-insensitively", () => {
      // Arrange
      store.saveReport(reportFor(TARGET, "100"), HASH_A, "2026-10-14T10:00:00.000Z");
      store.saveReport(reportFor(TARGET, "200"), HASH_B, "2026-10-14T11:00:00.000Z");
      store.saveReport(reportFor(TARGET, "300", 24), HASH_C, "2026-10-14T12:00:00.000Z");

      // Act / Assert
      expect(store.latestReport(TARGET.toUpperCase().replace("0X", "0x"), 1)?.reportHash).toBe(HASH_B);
      expect(store.latestReport(TARGET, 24)?.reportHash).toBe(HASH_C);
      expect(store.latestReport(TARGET, 168)).toBeNull();
      expect(store.latestReportAnyWindow(TARGET)?.reportHash).toBe(HASH_C);
    });

    it("replaces a report for the same target, window and end block", () => {
      store.saveReport(reportFor(TARGET, "100"), HASH_A, "2026-10-14T10:00:00.000Z");
      store.saveReport(reportFor(TARGET, "100"), HASH_B, "2026-10-14T10:05:00.000Z");
      expect(store.latestReport(TARGET, 1)?.reportHash).toBe(HASH_B);
      expect(store.recentReports(10)).toHaveLength(1);
    });

    it("stamps the current time when no creation time is given", () => {
      const before = Date.now();
      store.saveReport(makeReport(), HASH_A);
      const createdAt = Date.parse(store.latestReport(TARGET, 1)?.createdAt ?? "");
      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(createdAt).toBeLessThanOrEqual(Date.now());
    });

    it("lists recent distinct contracts, newest first, up to the limit", () => {
      // Arrange
      const third = `0x${"ef".repeat(20)}` as const;
      store.saveReport(reportFor(TARGET, "100"), HASH_A, "2026-10-14T10:00:00.000Z");
      store.saveReport(reportFor(OTHER, "100"), HASH_B, "2026-10-14T11:00:00.000Z");
      store.saveReport(reportFor(TARGET, "200"), HASH_C, "2026-10-14T12:00:00.000Z");
      store.saveReport(reportFor(third, "50"), `0x${"dd".repeat(32)}`, "2026-10-14T09:00:00.000Z");

      // Act
      const recent = store.recentReports(2);

      // Assert
      expect(recent.map((r) => [r.report.target, r.reportHash])).toEqual([
        [TARGET, HASH_C],
        [OTHER, HASH_B],
      ]);
      expect(store.recentReports(10).map((r) => r.report.target)).toEqual([TARGET, OTHER, third]);
    });

    it("ignores a stored row that no longer matches the report schema", () => {
      // Arrange: written without validation, e.g. by an older schema version.
      const stale = { ...makeReport(), schemaVersion: 0 } as unknown as Report;
      store.saveReport(stale, HASH_A, "2026-10-14T12:00:00.000Z");
      store.saveReport(reportFor(OTHER, "1"), HASH_B, "2026-10-14T11:00:00.000Z");

      // Act / Assert
      expect(store.latestReport(TARGET, 1)).toBeNull();
      expect(store.latestReportAnyWindow(TARGET)).toBeNull();
      expect(store.recentReports(10).map((r) => r.reportHash)).toEqual([HASH_B]);
    });
  });

  describe("attestations", () => {
    it("returns null for an unknown hash or target", () => {
      expect(store.attestationForHash(HASH_A)).toBeNull();
      expect(store.latestAttestation(TARGET)).toBeNull();
    });

    it("stores attestations and finds the highest-block one per target", () => {
      // Arrange
      const older = attestation(HASH_A, 10, "1");
      const newer = attestation(HASH_B, 20, "2");

      // Act
      store.saveAttestation(TARGET.toUpperCase().replace("0X", "0x"), newer);
      store.saveAttestation(TARGET, older);
      store.saveAttestation(OTHER, attestation(HASH_C, 99, "3"));

      // Assert
      expect(store.attestationForHash(HASH_A)).toEqual(older);
      expect(store.latestAttestation(TARGET)).toEqual(newer);
    });

    it("keeps the first record when the same hash is attested twice", () => {
      store.saveAttestation(TARGET, attestation(HASH_A, 10, "1"));
      store.saveAttestation(TARGET, attestation(HASH_A, 11, "2"));
      expect(store.attestationForHash(HASH_A)?.blockNumber).toBe(10);
    });
  });

  describe("consumeRateLimit", () => {
    it("allows up to max hits per fixed window, then reports the wait", () => {
      // Act
      const results = [0, 10, 20, 30].map((t) => store.consumeRateLimit("k", 1_000, 3, 1_000_000 + t));

      // Assert
      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
      expect(results[3]?.retryAfterMs).toBe(970);
      expect(results[0]?.retryAfterMs).toBe(0);
    });

    it("opens a fresh window once the old one has elapsed", () => {
      store.consumeRateLimit("k", 1_000, 1, 0);
      expect(store.consumeRateLimit("k", 1_000, 1, 999).allowed).toBe(false);
      expect(store.consumeRateLimit("k", 1_000, 1, 1_000)).toEqual({ allowed: true, retryAfterMs: 0 });
      expect(store.consumeRateLimit("k", 1_000, 1, 1_001).allowed).toBe(false);
    });

    it("counts keys independently", () => {
      expect(store.consumeRateLimit("a", 1_000, 1, 0).allowed).toBe(true);
      expect(store.consumeRateLimit("b", 1_000, 1, 0).allowed).toBe(true);
      expect(store.consumeRateLimit("a", 1_000, 1, 1).allowed).toBe(false);
    });

    it("prunes windows older than a day without affecting live keys", () => {
      // Arrange
      const day = 86_400_000;
      store.consumeRateLimit("old", 1_000, 1, 0);
      store.consumeRateLimit("live", day * 2, 1, day);

      // Act: opening any new window prunes rows that started more than a day ago.
      store.consumeRateLimit("trigger", 1_000, 1, day + 10);

      // Assert: "old" starts over, "live" is still limited.
      expect(store.consumeRateLimit("old", day * 10, 1, day + 20).allowed).toBe(true);
      expect(store.consumeRateLimit("old", day * 10, 1, day + 30).allowed).toBe(false);
      expect(store.consumeRateLimit("live", day * 2, 1, day + 40).allowed).toBe(false);
    });

    it("uses the wall clock by default", () => {
      expect(store.consumeRateLimit("wall", 60_000, 1).allowed).toBe(true);
      const blocked = store.consumeRateLimit("wall", 60_000, 1);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(59_000);
    });
  });
});

describe("openStore on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "centscan-store-"));

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates missing parent directories and persists across opens", () => {
    // Arrange
    const path = join(dir, "nested", "deeper", "centscan.db");

    // Act
    openStore(path).saveReport(makeReport(), HASH_A, "2026-10-14T12:00:00.000Z");
    const reopened = openStore(path);

    // Assert
    expect(reopened.latestReport(TARGET, 1)?.reportHash).toBe(HASH_A);
  });
});
