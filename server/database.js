import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(rootDirectory, "data");
mkdirSync(dataDirectory, { recursive: true });

const database = new Database(resolve(dataDirectory, "production-worker.sqlite"));
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workerNumber TEXT NOT NULL DEFAULT '',
    workerName TEXT NOT NULL DEFAULT '',
    product TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL DEFAULT '',
    comments TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_summaries (
    date TEXT PRIMARY KEY,
    items TEXT NOT NULL,
    created TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    name TEXT PRIMARY KEY COLLATE NOCASE,
    created TEXT NOT NULL
  );

  INSERT OR IGNORE INTO products (name, created)
  SELECT DISTINCT trim(product), CURRENT_TIMESTAMP
  FROM workers
  WHERE trim(product) <> '';
`);

export default database;