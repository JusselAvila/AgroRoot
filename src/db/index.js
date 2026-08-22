const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "data", "agroroot.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let db;

function getDatabasePath() {
  return process.env.DATABASE_PATH || DEFAULT_DB_PATH;
}

function connect() {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

  return db;
}

function getDb() {
  if (!db) {
    throw new Error("Database is not connected. Call connect() first.");
  }
  return db;
}

function listTables() {
  const rows = getDb()
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('Farmers', 'Impact_Points')
       ORDER BY name`,
    )
    .all();

  return rows.map((row) => row.name);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  connect,
  getDb,
  listTables,
  close,
  getDatabasePath,
};
