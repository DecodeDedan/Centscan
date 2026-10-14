import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

/** Ordered, reversible schema migrations. Never edit a shipped migration; add a new one. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "init",
    up: `
      CREATE TABLE reports (
        target TEXT NOT NULL,
        window_hours INTEGER NOT NULL,
        to_block INTEGER NOT NULL,
        report_json TEXT NOT NULL,
        report_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (target, window_hours, to_block)
      );
      CREATE INDEX reports_latest ON reports (target, window_hours, created_at DESC);
      CREATE INDEX reports_recent ON reports (created_at DESC);
      CREATE TABLE attestations (
        report_hash TEXT PRIMARY KEY,
        target TEXT NOT NULL,
        tx_hash TEXT NOT NULL UNIQUE,
        attester TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX attestations_target ON attestations (target, block_number DESC);
      CREATE TABLE rate_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
    `,
    down: `
      DROP TABLE rate_limits;
      DROP TABLE attestations;
      DROP TABLE reports;
    `,
  },
];

const ensureVersionTable = (db: Database.Database): void => {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
};

export function currentVersion(db: Database.Database): number {
  ensureVersionTable(db);
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  return row.v ?? 0;
}

/** Applies pending migrations, each in its own transaction. */
export function migrateUp(db: Database.Database, migrations: readonly Migration[] = MIGRATIONS): number {
  const from = currentVersion(db);
  const record = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  for (const m of migrations.filter((x) => x.version > from)) {
    db.transaction(() => {
      db.exec(m.up);
      record.run(m.version, m.name, new Date().toISOString());
    })();
  }
  return currentVersion(db);
}

/** Rolls back to `target` version (0 = empty), newest first, each step in its own transaction. */
export function migrateDown(db: Database.Database, target: number, migrations: readonly Migration[] = MIGRATIONS): number {
  const from = currentVersion(db);
  const remove = db.prepare("DELETE FROM schema_migrations WHERE version = ?");
  const steps = migrations.filter((m) => m.version > target && m.version <= from).sort((a, b) => b.version - a.version);
  for (const m of steps) {
    db.transaction(() => {
      db.exec(m.down);
      remove.run(m.version);
    })();
  }
  return currentVersion(db);
}
