/**
 * The tables, once per dialect.
 *
 * `dashboard_access` is who may open the web dashboard and what they may do
 * there. It is in the DATABASE and not in config.jsonc on purpose: the
 * dashboard writes it while it runs, and a file the bot also reads at boot
 * would mean two writers on one file.
 *
 * Kept together rather than inside each driver so the three stay comparable:
 * when a column is added, the three statements sit under one another and a
 * missing one is visible instead of being three files away.
 *
 * Two MySQL traps are handled here so nothing else has to think about them:
 * `key` and `value` are reserved words (hence `meta_key` / `meta_value`
 * everywhere, including SQLite and Postgres, because one column name across
 * engines beats a per-dialect alias), and MySQL cannot index a TEXT column
 * without a prefix length (hence `VARCHAR(191)` for the primary keys there).
 *
 * `applySchema` runs on EVERY start, so every statement is `IF NOT EXISTS`.
 * Getting that wrong means either a crash on the second boot or a silently
 * reset installation.
 */

const SCHEMA = {
  sqlite: [
    `CREATE TABLE IF NOT EXISTS meta (
       meta_key   TEXT PRIMARY KEY,
       meta_value TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS points (
       user_id TEXT PRIMARY KEY,
       balance INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS dashboard_access (
       subject_type TEXT NOT NULL,
       subject_id   TEXT NOT NULL,
       permissions  TEXT NOT NULL,
       active       INTEGER NOT NULL DEFAULT 1,
       label        TEXT,
       updated_at   INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (subject_type, subject_id)
     )`,
  ],

  mysql: [
    `CREATE TABLE IF NOT EXISTS meta (
       meta_key   VARCHAR(191) NOT NULL PRIMARY KEY,
       meta_value TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS points (
       user_id VARCHAR(191) NOT NULL PRIMARY KEY,
       balance BIGINT NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS dashboard_access (
       subject_type VARCHAR(16) NOT NULL,
       subject_id   VARCHAR(32) NOT NULL,
       permissions  TEXT NOT NULL,
       active       TINYINT NOT NULL DEFAULT 1,
       label        VARCHAR(191),
       updated_at   BIGINT NOT NULL DEFAULT 0,
       PRIMARY KEY (subject_type, subject_id)
     )`,
  ],

  postgres: [
    `CREATE TABLE IF NOT EXISTS meta (
       meta_key   TEXT PRIMARY KEY,
       meta_value TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS points (
       user_id TEXT PRIMARY KEY,
       balance BIGINT NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS dashboard_access (
       subject_type TEXT NOT NULL,
       subject_id   TEXT NOT NULL,
       permissions  TEXT NOT NULL,
       active       BOOLEAN NOT NULL DEFAULT TRUE,
       label        TEXT,
       updated_at   BIGINT NOT NULL DEFAULT 0,
       PRIMARY KEY (subject_type, subject_id)
     )`,
  ],
};

module.exports = { SCHEMA };
