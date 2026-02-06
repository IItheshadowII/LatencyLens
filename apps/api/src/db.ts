import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

const ensureDirectory = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const initDb = (dbPath: string) => {
  ensureDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cloud TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      screen TEXT NOT NULL,
      ip TEXT,
      ping_json TEXT NOT NULL,
      download_json TEXT NOT NULL,
      upload_json TEXT NOT NULL,
      classification TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_test_results_cloud ON test_results(cloud);
    CREATE INDEX IF NOT EXISTS idx_test_results_created_at ON test_results(created_at);
  `);

  return db;
};
