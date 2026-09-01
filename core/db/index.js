/**
 * The bot's own storage.
 *
 * SQLite by default, in `data/multibot.db`. `DATABASE_URL` switches to
 * MySQL/MariaDB (`mysql://`, `mariadb://`) or PostgreSQL (`postgres://`).
 *
 * Not to be confused with the FiveM MariaDB in `core/config.js` under
 * `database` — that one belongs to the game server and is only read by
 * `/backup_database`.
 *
 * WHY THIS EXISTS. Points used to live in `data/points.json`, and `addPoints`
 * read the whole file, did the arithmetic in JavaScript and wrote it back. Two
 * minigames finishing at the same moment read the same old balance, and the
 * second write threw the first one away. `writeJson` is atomic over the FILE
 * (temp plus rename), which is exactly the half of the problem that was never
 * the problem.
 *
 * THE ABSTRACTION IS AT THE LEVEL OF OPERATIONS, not of raw SQL. There is no
 * shared query builder and no `?`-to-`$1` rewriter, because the three engines
 * disagree in ways a rewriter cannot paper over: MySQL has no `RETURNING`, and
 * a pooled connection is not a session, so `BEGIN` and `COMMIT` as separate
 * queries can land on different connections. Each driver therefore implements
 * `addBalance` the way its engine can actually make it atomic, and what they
 * share is the interface, not the SQL.
 *
 * EVERY METHOD IS ASYNC, even under SQLite where better-sqlite3 is
 * synchronous. Converting an interface after the fact is a repo-wide
 * mechanical change where one forgotten `await` silently computes with a
 * Promise instead of a number.
 *
 * `connect()` is idempotent and shares its in-flight promise, so several
 * callers during boot still open one handle.
 */

const { parse } = require('./url');

const DRIVERS = {
  sqlite: () => require('./drivers/sqlite'),
  mysql: () => require('./drivers/mysql'),
  postgres: () => require('./drivers/postgres'),
};

let driver = null;
let opening = null;

/** @returns {Promise<object>} the active driver */
async function connect() {
  if (driver) return driver;
  if (opening) return opening;

  opening = (async () => {
    // Parsed here rather than at require-time so a broken DATABASE_URL throws
    // where somebody is waiting for an answer, not while loading a module.
    const target = parse(process.env.DATABASE_URL);
    const made = DRIVERS[target.driver]().create(target);
    await made.connect();

    driver = made;
    opening = null;
    return made;
  })();

  try {
    return await opening;
  } catch (err) {
    opening = null;
    throw err;
  }
}

async function close() {
  if (!driver) return;
  const closing = driver;
  driver = null;
  await closing.close();
}

/** Which engine is actually in use. For the boot banner and the harness. */
function dialect() {
  return driver ? driver.dialect : null;
}

// ─── meta ────────────────────────────────────────────────────────────────────
//
// Small key/value bookkeeping: which one-off migrations have run. In the
// database rather than in a marker file, so a restored backup carries it.

async function getMeta(key, fallback = '') {
  return (await connect()).getMeta(key, fallback);
}

async function setMeta(key, value) {
  return (await connect()).setMeta(key, value);
}

// ─── points ──────────────────────────────────────────────────────────────────

async function getBalance(userId) {
  return (await connect()).getBalance(userId);
}

/**
 * Add to a balance and report what it was and what it became.
 *
 * Do not turn this back into read, add in JavaScript, write: that is precisely
 * the race the JSON file had. The clamp at zero belongs in the same operation.
 *
 * @returns {Promise<{old: number, new: number}>}
 */
async function addBalance(userId, delta) {
  return (await connect()).addBalance(userId, delta);
}

/** Every balance, biggest first. For a leaderboard. */
async function topBalances(limit = 10) {
  return (await connect()).topBalances(limit);
}

module.exports = {
  connect, close, dialect,
  getMeta, setMeta,
  getBalance, addBalance, topBalances,
};
