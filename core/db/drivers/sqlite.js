/**
 * SQLite, through better-sqlite3. The default: one file, no server, no
 * credentials to hand a self-hoster.
 *
 * better-sqlite3 is SYNCHRONOUS. Every method here is still declared async, so
 * the three drivers present one interface and `core/db` never has to know which
 * one it is talking to.
 */

const { SCHEMA } = require('../schema');

function create({ file }) {
  let db = null;

  return {
    dialect: 'sqlite',

    async connect() {
      // Idempotent. A second call would otherwise open a second handle, and
      // with `:memory:` that is a brand new EMPTY database rather than the one
      // holding the data.
      if (db) return;
      // Required lazily so a broken native build fails with a stack that names
      // this file rather than something unrelated at require-time.
      const Database = require('better-sqlite3');
      db = new Database(file);
      // WAL lets a reader and a writer coexist. The bot is one process today,
      // but a shell or a migration script attaching must not block it.
      db.pragma('journal_mode = WAL');
      // Without this a concurrent writer fails instantly instead of waiting.
      db.pragma('busy_timeout = 5000');
      await this.applySchema();
    },

    /** Runs on every start, so every statement is IF NOT EXISTS. */
    async applySchema() {
      for (const statement of SCHEMA.sqlite) db.exec(statement);
    },

    async close() {
      if (db) db.close();
      db = null;
    },

    async getMeta(key, fallback) {
      const row = db.prepare('SELECT meta_value FROM meta WHERE meta_key = ?').get(String(key));
      return row ? row.meta_value : fallback;
    },

    async setMeta(key, value) {
      db.prepare(
        `INSERT INTO meta (meta_key, meta_value) VALUES (?, ?)
         ON CONFLICT(meta_key) DO UPDATE SET meta_value = excluded.meta_value`,
      ).run(String(key), String(value));
    },

    async getBalance(userId) {
      const row = db.prepare('SELECT balance FROM points WHERE user_id = ?').get(String(userId));
      return row ? Number(row.balance) : 0;
    },

    /**
     * The arithmetic and the clamp happen in SQL, the read and the write share
     * one transaction. better-sqlite3 transactions are synchronous, so nothing
     * can interleave inside them at all.
     */
    async addBalance(userId, delta) {
      const id = String(userId);
      const amount = Number(delta) || 0;

      const run = db.transaction(() => {
        const before = db.prepare('SELECT balance FROM points WHERE user_id = ?').get(id);
        const old = before ? Number(before.balance) : 0;
        const after = db.prepare(
          `INSERT INTO points (user_id, balance) VALUES (?, MAX(0, ?))
           ON CONFLICT(user_id) DO UPDATE SET balance = MAX(0, balance + ?)
           RETURNING balance`,
        ).get(id, amount, amount);
        return { old, new: Number(after.balance) };
      });

      return run();
    },

    async topBalances(limit) {
      return db.prepare(
        'SELECT user_id, balance FROM points ORDER BY balance DESC, user_id ASC LIMIT ?',
      ).all(Number(limit) || 10).map(r => ({ user_id: r.user_id, balance: Number(r.balance) }));
    },

    // -- dashboard access -------------------------------------------------
    //
    // Who may open the web dashboard and what they may do there. Written by
    // the dashboard while it runs, which is why it is a table and not a
    // second config file the bot would also be reading at boot.

    async getAccessRows() {
      return db.prepare('SELECT * FROM dashboard_access ORDER BY subject_type, subject_id').all()
        .map(r => ({ ...r, active: Number(r.active) === 1 }));
    },

    async setAccessRow({ subjectType, subjectId, permissions, active, label }) {
      db.prepare(
        `INSERT INTO dashboard_access (subject_type, subject_id, permissions, active, label, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(subject_type, subject_id) DO UPDATE SET
           permissions = excluded.permissions,
           active      = excluded.active,
           label       = excluded.label,
           updated_at  = excluded.updated_at`,
      ).run(String(subjectType), String(subjectId), JSON.stringify(permissions ?? []),
        active === false ? 0 : 1, label ?? null, Date.now());
    },

    async deleteAccessRow(subjectType, subjectId) {
      const info = db.prepare('DELETE FROM dashboard_access WHERE subject_type = ? AND subject_id = ?')
        .run(String(subjectType), String(subjectId));
      return info.changes > 0;
    },
  };
}

module.exports = { create };
