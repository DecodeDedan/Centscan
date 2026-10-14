import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentVersion, migrateDown, migrateUp, MIGRATIONS, type Migration } from "@/server/migrations";

const tables = (db: Database.Database): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const indexes = (db: Database.Database): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );

const SECOND: Migration = {
  version: 2,
  name: "notes",
  up: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
  down: "DROP TABLE notes;",
};

describe("migrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("starts an empty database at version 0", () => {
    expect(currentVersion(db)).toBe(0);
  });

  it("creates the documented schema and records the version", () => {
    // Act
    const version = migrateUp(db);

    // Assert
    expect(version).toBe(1);
    expect(tables(db)).toEqual(["attestations", "rate_limits", "reports", "schema_migrations"]);
    expect(indexes(db)).toEqual(["attestations_target", "reports_latest", "reports_recent"]);
    const applied = db.prepare("SELECT version, name, applied_at FROM schema_migrations").all() as { version: number; name: string; applied_at: string }[];
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ version: 1, name: "init" });
    expect(Number.isNaN(Date.parse(applied[0]?.applied_at ?? ""))).toBe(false);
  });

  it("is idempotent", () => {
    migrateUp(db);
    expect(migrateUp(db)).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n).toBe(1);
  });

  it("enforces the primary keys", () => {
    migrateUp(db);
    const insert = db.prepare("INSERT INTO attestations (report_hash, target, tx_hash, attester, block_number, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    insert.run("0x01", "0xt", "0xa", "0xb", 1, "now");
    expect(() => insert.run("0x02", "0xt", "0xa", "0xb", 2, "now")).toThrow(/UNIQUE/);
  });

  it("rolls all the way down and back up", () => {
    // Arrange
    migrateUp(db);

    // Act
    const down = migrateDown(db, 0);

    // Assert
    expect(down).toBe(0);
    expect(tables(db)).toEqual(["schema_migrations"]);
    expect(migrateUp(db)).toBe(1);
    expect(tables(db)).toContain("reports");
  });

  it("applies and reverts only the steps between versions, newest first", () => {
    // Arrange
    const all = [...MIGRATIONS, SECOND];
    expect(migrateUp(db, all)).toBe(2);

    // Act
    const afterOne = migrateDown(db, 1, all);

    // Assert
    expect(afterOne).toBe(1);
    expect(tables(db)).not.toContain("notes");
    expect(tables(db)).toContain("reports");
    expect(migrateDown(db, 1, all)).toBe(1);
  });

  it("leaves no partial schema when a migration fails", () => {
    // Arrange
    const broken: Migration = { version: 2, name: "broken", up: "CREATE TABLE half (id INTEGER); CREATE TABLE oops (", down: "" };
    migrateUp(db);

    // Act / Assert
    expect(() => migrateUp(db, [...MIGRATIONS, broken])).toThrow();
    expect(currentVersion(db)).toBe(1);
    expect(tables(db)).not.toContain("half");
  });
});
