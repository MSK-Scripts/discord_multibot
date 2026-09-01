/**
 * Dashboard configuration and the safety rails around it.
 *
 * Two hard rules live here, and they are why a badly configured panel cannot
 * quietly end up on the open internet:
 *
 *   1. The dashboard is DISABLED by default and binds to 127.0.0.1 by default.
 *      One somebody started by accident is not reachable from another machine.
 *   2. If it IS bound to a public interface without HTTPS, the process REFUSES
 *      to start unless the operator explicitly opted out. Better a loud refusal
 *      at boot than session cookies and a "restart the bot" button served over
 *      plaintext.
 *
 * EVERYTHING HERE IS IN .ENV, NOT IN config.jsonc, AND THAT IS THE ONE PLACE
 * THE SPLIT GOES THE OTHER WAY. config.jsonc answers "what does this bot do on
 * this Discord server"; the panel's bind address, port and public URL answer
 * "how is this MACHINE set up", which is the same question the tokens answer.
 * Two installations of the same server config can want different ports, and the
 * dashboard has to read this before it has any reason to look at a guild.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const { setEnvValue } = require('./envFile');

const ENV_PATH = path.join(config.BASE_DIR, '.env');

const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

/** Loopback means not reachable from another machine. */
function isLoopback(host) {
  const h = String(host).trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

function loadDashboardConfig(env = process.env) {
  const host = (env.DASHBOARD_HOST || '127.0.0.1').trim();
  const rawPort = Number.parseInt(env.DASHBOARD_PORT || '3020', 10);
  const port = Number.isFinite(rawPort) ? rawPort : 3020;

  return {
    enabled: truthy(env.DASHBOARD_ENABLED),
    host,
    port,
    // Where the BROWSER reaches the dashboard. Behind a reverse proxy this is
    // the public https address, not the bind address.
    publicUrl: (env.DASHBOARD_PUBLIC_URL || `http://${host}:${port}`).replace(/\/+$/, ''),
    allowInsecure: truthy(env.DASHBOARD_ALLOW_INSECURE),
    // The Discord application whose OAuth is used for the login.
    clientId: (env.CLIENT_ID || '').trim(),
    clientSecret: (env.CLIENT_SECRET || '').trim(),
    // The one thing that still comes from config.jsonc: which server this bot
    // is for is a property of the BOT, not of the machine it runs on.
    guildId: config.guildId(),
    exposed: !isLoopback(host),
  };
}

/** The OAuth redirect URI. Must match the one registered in the Discord portal exactly. */
const redirectUri = (cfg) => `${cfg.publicUrl}/auth/callback`;

/**
 * Validate the configuration. Returns a list of fatal problems, empty when it
 * is fine. The caller prints them and exits: the same fail-fast contract the
 * bot deliberately does NOT use, because a misconfigured dashboard is a
 * security problem while a misconfigured bot is a missing feature.
 */
function validateDashboardConfig(cfg) {
  const errors = [];

  if (!Number.isFinite(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    errors.push(`DASHBOARD_PORT is not a valid port: "${cfg.port}"`);
  }

  let url = null;
  try {
    url = new URL(cfg.publicUrl);
  } catch {
    errors.push(`DASHBOARD_PUBLIC_URL is not a valid URL: "${cfg.publicUrl}"`);
  }

  // ── The important one ──────────────────────────────────────────────────────
  if (cfg.exposed && url && url.protocol !== 'https:' && !cfg.allowInsecure) {
    errors.push(
      `The dashboard is bound to a public interface (DASHBOARD_HOST=${cfg.host}) but\n`
      + `           DASHBOARD_PUBLIC_URL is not https ("${cfg.publicUrl}").\n`
      + '           Serving it over plaintext would expose session cookies and bot control\n'
      + '           to anyone on the network. Fix one of these:\n'
      + '             - Recommended: keep DASHBOARD_HOST=127.0.0.1 and put a reverse proxy\n'
      + '               with TLS in front of it.\n'
      + '             - Or set DASHBOARD_PUBLIC_URL to your https:// address.\n'
      + '             - Only if you terminate TLS somewhere the bot cannot see:\n'
      + '               DASHBOARD_ALLOW_INSECURE=true',
    );
  }

  if (!cfg.clientId) errors.push('CLIENT_ID is not set (the Discord application id, needed for the login).');
  if (!cfg.clientSecret) errors.push('CLIENT_SECRET is not set (Discord developer portal, OAuth2 -> Client Secret).');
  if (!cfg.guildId) errors.push('guildId is not set in config/config.jsonc, so the dashboard cannot tell who is in your server.');

  return errors;
}

/**
 * Make sure a signing secret exists.
 *
 * Generated per installation and written to .env. Never shipped as a default,
 * because one default secret would let anyone forge a session on EVERY
 * installation at once. In .env rather than in memory so sessions survive a
 * restart.
 *
 * @returns {'existing'|'generated'}
 */
function ensureSessionSecret() {
  const current = process.env.SESSION_SECRET;
  if (current && current.length >= 32) return 'existing';

  const secret = crypto.randomBytes(48).toString('base64url');

  try {
    // setEnvValue UPDATES an existing line and only appends when there is none.
    // A blind append would add a duplicate key every time the value happened to
    // be too short.
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    fs.writeFileSync(ENV_PATH, setEnvValue(existing, 'SESSION_SECRET', secret), 'utf-8');
  } catch (err) {
    throw new Error(
      `SESSION_SECRET is not set and .env could not be written (${err.message}).\n`
      + `Add this line to your .env by hand:\n  SESSION_SECRET="${secret}"`,
    );
  }

  process.env.SESSION_SECRET = secret;
  return 'generated';
}

module.exports = {
  loadDashboardConfig, validateDashboardConfig, ensureSessionSecret,
  redirectUri, isLoopback, truthy, ENV_PATH,
};
