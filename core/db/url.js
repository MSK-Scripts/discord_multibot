/**
 * `DATABASE_URL` to a driver descriptor.
 *
 * Unset means SQLite in `data/multibot.db`, which is the whole point: a
 * self-hoster gets a working bot without installing a database server.
 *
 * A URL this cannot parse THROWS rather than falling back to SQLite. A silent
 * fallback would write to a local file while the operator sits in front of
 * their MariaDB wondering why it stays empty.
 */

const { join } = require('path');
const { DATA_DIR } = require('../config');

/** What each dialect needs from a URL, and which package speaks it. */
const DIALECTS = {
  sqlite: { driver: 'sqlite', package: null },
  mysql: { driver: 'mysql', package: 'mysql2' },
  mariadb: { driver: 'mysql', package: 'mysql2' },
  postgres: { driver: 'postgres', package: 'pg' },
  postgresql: { driver: 'postgres', package: 'pg' },
};

/**
 * @param {string} [raw] the DATABASE_URL value, or nothing
 * @returns {{driver: string, dialect: string, file?: string, url?: string}}
 */
function parse(raw) {
  const value = String(raw ?? '').trim();

  if (!value) {
    return { driver: 'sqlite', dialect: 'sqlite', file: join(DATA_DIR, 'multibot.db') };
  }

  // sqlite:./somewhere.db and sqlite::memory: are useful for tests and for
  // moving the file, and neither survives the URL parser below.
  if (value.startsWith('sqlite:')) {
    const file = value.slice('sqlite:'.length).replace(/^\/\//, '') || join(DATA_DIR, 'multibot.db');
    return { driver: 'sqlite', dialect: 'sqlite', file };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `DATABASE_URL is not a URL: "${value}". Expected something like `
      + 'mysql://user:pass@host:3306/dbname, postgres://user:pass@host:5432/dbname, '
      + 'or nothing at all for SQLite.',
    );
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  const known = DIALECTS[scheme];
  if (!known) {
    throw new Error(
      `DATABASE_URL uses an unsupported scheme "${scheme}". `
      + `Supported: ${Object.keys(DIALECTS).join(', ')}.`,
    );
  }

  if (known.driver !== 'sqlite' && !parsed.pathname.replace(/^\//, '')) {
    throw new Error(`DATABASE_URL has no database name: "${value}".`);
  }

  return { driver: known.driver, dialect: scheme, url: value, package: known.package };
}

module.exports = { parse, DIALECTS };
