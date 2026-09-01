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
    `CREATE TABLE IF NOT EXISTS announcement_templates (
       id         TEXT PRIMARY KEY,
       owner_id   TEXT NOT NULL,
       name       TEXT NOT NULL,
       shared     INTEGER NOT NULL DEFAULT 0,
       mode       TEXT NOT NULL DEFAULT 'embed',
       title      TEXT NOT NULL DEFAULT '',
       body       TEXT NOT NULL DEFAULT '',
       thumbnail  TEXT NOT NULL DEFAULT '',
       image      TEXT NOT NULL DEFAULT '',
       footer     TEXT NOT NULL DEFAULT '',
       color      TEXT NOT NULL DEFAULT '',
       ping       TEXT NOT NULL DEFAULT 'none',
       role_id    TEXT NOT NULL DEFAULT '',
       updated_at INTEGER NOT NULL DEFAULT 0
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
    `CREATE TABLE IF NOT EXISTS announcement_templates (
       id         VARCHAR(191) NOT NULL PRIMARY KEY,
       owner_id   VARCHAR(32) NOT NULL,
       name       VARCHAR(191) NOT NULL,
       shared     TINYINT NOT NULL DEFAULT 0,
       mode       VARCHAR(16) NOT NULL DEFAULT 'embed',
       title      TEXT,
       body       TEXT,
       thumbnail  TEXT,
       image      TEXT,
       footer     TEXT,
       color      VARCHAR(16) NOT NULL DEFAULT '',
       ping       VARCHAR(16) NOT NULL DEFAULT 'none',
       role_id    VARCHAR(32) NOT NULL DEFAULT '',
       updated_at BIGINT NOT NULL DEFAULT 0
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
    `CREATE TABLE IF NOT EXISTS announcement_templates (
       id         TEXT PRIMARY KEY,
       owner_id   TEXT NOT NULL,
       name       TEXT NOT NULL,
       shared     BOOLEAN NOT NULL DEFAULT FALSE,
       mode       TEXT NOT NULL DEFAULT 'embed',
       title      TEXT NOT NULL DEFAULT '',
       body       TEXT NOT NULL DEFAULT '',
       thumbnail  TEXT NOT NULL DEFAULT '',
       image      TEXT NOT NULL DEFAULT '',
       footer     TEXT NOT NULL DEFAULT '',
       color      TEXT NOT NULL DEFAULT '',
       ping       TEXT NOT NULL DEFAULT 'none',
       role_id    TEXT NOT NULL DEFAULT '',
       updated_at BIGINT NOT NULL DEFAULT 0
     )`,
  ],
};

/**
 * The columns of `announcement_templates`, in the order the INSERTs above list
 * them, and one row as a matching value list.
 *
 * WRITTEN ONCE, NEXT TO THE TABLE. Fourteen positional parameters repeated in
 * three drivers is exactly the list where one of them silently ends up with
 * `image` and `footer` the wrong way round, and nothing fails until somebody
 * looks at a template on MariaDB.
 *
 * `boolean` is for Postgres, which wants a real boolean where the other two
 * want 0 or 1.
 */
const TEMPLATE_COLUMNS = Object.freeze([
  'id', 'owner_id', 'name', 'shared', 'mode', 'title', 'body',
  'thumbnail', 'image', 'footer', 'color', 'ping', 'role_id', 'updated_at',
]);

function templateValues(row, boolean = false) {
  const shared = row.shared === true;
  return [
    String(row.id), String(row.ownerId), String(row.name), boolean ? shared : (shared ? 1 : 0),
    String(row.mode ?? 'embed'), String(row.title ?? ''), String(row.body ?? ''),
    String(row.thumbnail ?? ''), String(row.image ?? ''), String(row.footer ?? ''),
    String(row.color ?? ''), String(row.ping ?? 'none'), String(row.roleId ?? ''),
    Date.now(),
  ];
}

module.exports = { SCHEMA, TEMPLATE_COLUMNS, templateValues };
