/**
 * MySQL and MariaDB, through `mysql2/promise`.
 *
 * THE ENGINE WITH THE LEAST HELP. It has no `RETURNING`, so `addBalance`
 * cannot be one statement the way it can be on the other two, and it must not
 * be two statements against a POOL either: `BEGIN` and `COMMIT` sent as
 * separate queries can land on different pooled connections, and the
 * transaction then silently does nothing.
 *
 * So `addBalance` pins one connection out of the pool, runs the whole thing on
 * it, and gives it back. `SELECT ... FOR UPDATE` holds the row so a second
 * player finishing at the same moment waits instead of reading a stale
 * balance. That is the same guarantee the other two drivers get for free.
 */

const { SCHEMA } = require('../schema');

function create({ url }) {
  let pool = null;

  return {
    dialect: 'mysql',

    async connect() {
      if (pool) return;
      let mysql;
      try {
        mysql = require('mysql2/promise');
      } catch {
        throw new Error('DATABASE_URL points at MySQL/MariaDB but the "mysql2" package is missing. Run `npm install mysql2`.');
      }
      pool = mysql.createPool(url);
      // Take a connection immediately, so bad credentials or an unreachable
      // host fail at boot rather than on the first minigame somebody plays.
      await this.applySchema();
    },

    /** Runs on every start, so every statement is IF NOT EXISTS. */
    async applySchema() {
      const conn = await pool.getConnection();
      try {
        for (const statement of SCHEMA.mysql) await conn.query(statement);
      } finally {
        conn.release();
      }
    },

    async close() {
      if (pool) await pool.end();
      pool = null;
    },

    async getMeta(key, fallback) {
      const [rows] = await pool.query('SELECT meta_value FROM meta WHERE meta_key = ?', [String(key)]);
      return rows.length ? rows[0].meta_value : fallback;
    },

    async setMeta(key, value) {
      await pool.query(
        `INSERT INTO meta (meta_key, meta_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
        [String(key), String(value)],
      );
    },

    async getBalance(userId) {
      const [rows] = await pool.query('SELECT balance FROM points WHERE user_id = ?', [String(userId)]);
      return rows.length ? Number(rows[0].balance) : 0;
    },

    async addBalance(userId, delta) {
      const id = String(userId);
      const amount = Number(delta) || 0;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // FOR UPDATE is the whole point: without it two players finishing
        // together both read the old balance and the second write wins.
        const [rows] = await conn.query('SELECT balance FROM points WHERE user_id = ? FOR UPDATE', [id]);
        const old = rows.length ? Number(rows[0].balance) : 0;
        const next = Math.max(0, old + amount);

        await conn.query(
          `INSERT INTO points (user_id, balance) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
          [id, next],
        );

        await conn.commit();
        return { old, new: next };
      } catch (err) {
        try { await conn.rollback(); } catch { /* the connection is going back either way */ }
        throw err;
      } finally {
        conn.release();
      }
    },

    async topBalances(limit) {
      const [rows] = await pool.query(
        'SELECT user_id, balance FROM points ORDER BY balance DESC, user_id ASC LIMIT ?',
        [Number(limit) || 10],
      );
      return rows.map(r => ({ user_id: r.user_id, balance: Number(r.balance) }));
    },

    // -- dashboard access -------------------------------------------------
    //
    // Who may open the web dashboard and what they may do there. Written by
    // the dashboard while it runs, which is why it is a table and not a
    // second config file the bot would also be reading at boot.

    async getAccessRows() {
      const [rows] = await pool.query('SELECT * FROM dashboard_access ORDER BY subject_type, subject_id');
      return rows.map(r => ({ ...r, active: Number(r.active) === 1 }));
    },

    async setAccessRow({ subjectType, subjectId, permissions, active, label }) {
      await pool.query(
        `INSERT INTO dashboard_access (subject_type, subject_id, permissions, active, label, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           permissions = VALUES(permissions),
           active      = VALUES(active),
           label       = VALUES(label),
           updated_at  = VALUES(updated_at)`,
        [String(subjectType), String(subjectId), JSON.stringify(permissions ?? []),
          active === false ? 0 : 1, label ?? null, Date.now()],
      );
    },

    async deleteAccessRow(subjectType, subjectId) {
      const [result] = await pool.query(
        'DELETE FROM dashboard_access WHERE subject_type = ? AND subject_id = ?',
        [String(subjectType), String(subjectId)],
      );
      return result.affectedRows > 0;
    },
  };
}

module.exports = { create };
