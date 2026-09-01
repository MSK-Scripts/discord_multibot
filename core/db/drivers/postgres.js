/**
 * PostgreSQL, through `pg`.
 *
 * Two things differ from the other two engines and both are handled here rather
 * than leaking into `core/db`:
 *
 * PLACEHOLDERS ARE `$1`, `$2`, not `?`. The statements below are written with
 * the numbered form directly instead of rewriting `?` at runtime — a rewriter
 * has to know what is a placeholder and what is a question mark inside a
 * string literal, and getting that wrong is a quiet corruption rather than an
 * error.
 *
 * A POOLED CONNECTION IS NOT A SESSION. `BEGIN` and `COMMIT` sent as separate
 * queries can land on different connections, which would make a transaction
 * silently do nothing. `addBalance` therefore needs no transaction at all: it
 * is one statement, and one statement is atomic by definition.
 */

const { SCHEMA } = require('../schema');

function create({ url }) {
  let pool = null;

  return {
    dialect: 'postgres',

    async connect() {
      if (pool) return;
      let pg;
      try {
        pg = require('pg');
      } catch {
        throw new Error('DATABASE_URL points at PostgreSQL but the "pg" package is missing. Run `npm install pg`.');
      }
      pool = new pg.Pool({ connectionString: url, max: 5 });
      // Take a connection immediately, so bad credentials or an unreachable
      // host fail at boot rather than on the first minigame somebody plays.
      await this.applySchema();
    },

    /** Runs on every start, so every statement is IF NOT EXISTS. */
    async applySchema() {
      const conn = await pool.connect();
      try {
        for (const statement of SCHEMA.postgres) await conn.query(statement);
      } finally {
        conn.release();
      }
    },

    async close() {
      if (pool) await pool.end();
      pool = null;
    },

    async getMeta(key, fallback) {
      const { rows } = await pool.query('SELECT meta_value FROM meta WHERE meta_key = $1', [String(key)]);
      return rows.length ? rows[0].meta_value : fallback;
    },

    async setMeta(key, value) {
      await pool.query(
        `INSERT INTO meta (meta_key, meta_value) VALUES ($1, $2)
         ON CONFLICT (meta_key) DO UPDATE SET meta_value = EXCLUDED.meta_value`,
        [String(key), String(value)],
      );
    },

    async getBalance(userId) {
      const { rows } = await pool.query('SELECT balance FROM points WHERE user_id = $1', [String(userId)]);
      return rows.length ? Number(rows[0].balance) : 0;
    },

    /**
     * One statement, so no transaction is needed and the pool cannot split it.
     *
     * The CTE reads the balance as it was; the INSERT writes the new one. Both
     * see the same snapshot, so `old` is the value that actually preceded this
     * write rather than whatever a second round trip would have found.
     *
     * `GREATEST(0, ...)` is the clamp: subtracting more than somebody owns
     * leaves them at zero rather than in debt.
     */
    async addBalance(userId, delta) {
      const id = String(userId);
      const amount = Number(delta) || 0;

      const { rows } = await pool.query(
        `WITH before AS (SELECT balance FROM points WHERE user_id = $1)
         INSERT INTO points (user_id, balance) VALUES ($1, GREATEST(0, $2::bigint))
         ON CONFLICT (user_id) DO UPDATE SET balance = GREATEST(0, points.balance + $2::bigint)
         RETURNING COALESCE((SELECT balance FROM before), 0) AS old_balance, balance AS new_balance`,
        [id, amount],
      );

      // BIGINT comes back as a string from pg, which would turn arithmetic into
      // string concatenation further up.
      return { old: Number(rows[0].old_balance), new: Number(rows[0].new_balance) };
    },

    async topBalances(limit) {
      const { rows } = await pool.query(
        'SELECT user_id, balance FROM points ORDER BY balance DESC, user_id ASC LIMIT $1',
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
      const { rows } = await pool.query('SELECT * FROM dashboard_access ORDER BY subject_type, subject_id');
      return rows.map(r => ({ ...r, active: r.active === true }));
    },

    async setAccessRow({ subjectType, subjectId, permissions, active, label }) {
      await pool.query(
        `INSERT INTO dashboard_access (subject_type, subject_id, permissions, active, label, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (subject_type, subject_id) DO UPDATE SET
           permissions = EXCLUDED.permissions,
           active      = EXCLUDED.active,
           label       = EXCLUDED.label,
           updated_at  = EXCLUDED.updated_at`,
        [String(subjectType), String(subjectId), JSON.stringify(permissions ?? []),
          active !== false, label ?? null, Date.now()],
      );
    },

    async deleteAccessRow(subjectType, subjectId) {
      const result = await pool.query(
        'DELETE FROM dashboard_access WHERE subject_type = $1 AND subject_id = $2',
        [String(subjectType), String(subjectId)],
      );
      return result.rowCount > 0;
    },
  };
}

module.exports = { create };
