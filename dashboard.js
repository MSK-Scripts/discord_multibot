/**
 * Dashboard entry point (`npm run dashboard`).
 *
 * Starts the supervisor, which runs the bot as a CHILD process and, when the
 * dashboard is switched on, serves the web UI next to it. The web server is the
 * PARENT, which is what lets it survive a bot crash and restart the bot; a
 * dashboard living inside the bot process could do neither.
 *
 * `node main.js` remains the plain, dashboard-free entry point and is completely
 * unaffected by this file. It does not even load the web stack.
 */

require('dotenv').config();

const { loadDashboardConfig, validateDashboardConfig, ensureSessionSecret } = require('./core/dashboard/config');
const { BotSupervisor } = require('./core/dashboard/supervisor');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Stop the child bot on shutdown, then exit.
 *
 * Without this the forked bot is orphaned on SIGTERM and keeps its gateway
 * connection, so the next dashboard start forks a SECOND bot on the same token
 * and Discord kicks both. Idempotent: a second signal during shutdown is
 * ignored rather than racing the first.
 */
function installShutdownHandlers(supervisor) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${DIM}[Dashboard] ${signal} received, stopping the bot...${RESET}`);
    try { await supervisor.stop(); } catch { /* already down */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main() {
  const cfg = loadDashboardConfig();
  const supervisor = new BotSupervisor();
  installShutdownHandlers(supervisor);

  // ── Dashboard off, which is the default ────────────────────────────────────
  // Behave exactly like a plain bot start, only supervised. No port is opened
  // and none of the web dependencies are even required().
  if (!cfg.enabled) {
    console.log(`${DIM}[Dashboard] off (set DASHBOARD_ENABLED=true in .env to enable it)${RESET}`);
    supervisor.start();
    return;
  }

  // ── Refuse an unsafe configuration ─────────────────────────────────────────
  // Better a loud refusal at boot than a panel with bot control and session
  // cookies quietly served over plaintext.
  const errors = validateDashboardConfig(cfg);
  if (errors.length > 0) {
    console.error('');
    console.error(`${RED}[Dashboard] Refusing to start, the configuration is not safe:${RESET}`);
    for (const e of errors) console.error(`${RED}  x ${e}${RESET}`);
    console.error('');
    process.exit(1);
  }

  try {
    if (ensureSessionSecret() === 'generated') {
      console.log(`${GREEN}[Dashboard] Generated a new SESSION_SECRET and saved it to .env${RESET}`);
    }
  } catch (err) {
    console.error('');
    console.error(`${RED}[Dashboard] ${err.message}${RESET}`);
    console.error('');
    process.exit(1);
  }

  // Required lazily: somebody who never enables the dashboard never needs the
  // web dependencies installed at all, which is why they are optional.
  let startServer;
  try {
    ({ startServer } = require('./core/dashboard/server'));
  } catch (err) {
    console.error('');
    console.error(`${RED}[Dashboard] The web dependencies are missing: ${err.message}${RESET}`);
    console.error(`${RED}[Dashboard] Install them with:  npm install express helmet${RESET}`);
    console.error('');
    process.exit(1);
  }

  await startServer({ config: cfg, supervisor });

  console.log('');
  console.log(`${GREEN}[Dashboard] listening on http://${cfg.host}:${cfg.port}${RESET}`);
  console.log(`${DIM}[Dashboard] public URL: ${cfg.publicUrl}${RESET}`);
  if (!cfg.exposed) {
    console.log(`${DIM}[Dashboard] bound to loopback, reach it through an SSH tunnel or a reverse proxy${RESET}`);
  } else {
    console.log(`${YELLOW}[Dashboard] bound to ${cfg.host}, make sure your reverse proxy terminates TLS${RESET}`);
  }
  console.log('');

  supervisor.start();
}

// A supervisor that dies takes the bot with it, so anything unexpected is
// surfaced loudly instead of leaving a half-dead process behind.
process.on('unhandledRejection', (err) => {
  console.error(`${RED}[Dashboard] Unhandled rejection:${RESET}`, err);
});

main().catch((err) => {
  console.error(`${RED}[Dashboard] Fatal:${RESET}`, err);
  process.exit(1);
});
