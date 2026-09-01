/**
 * Points: what a minigame pays out, what somebody owns, and the roles that come
 * with crossing a threshold.
 *
 * TWO KINDS OF DATA, AND THEY LIVE IN DIFFERENT PLACES. The balances are STATE
 * and belong in the database. The point VALUES per game and the reward
 * thresholds are SETTINGS: they are set up once, want to be diffable and
 * repairable by hand, and stay in `points_config.json`. Mixing the two is how a
 * config change ends up needing a database migration.
 *
 * `getPts()` and `pointsFooter()` are therefore synchronous — they only read
 * settings. `getPoints()` and `addPoints()` are ASYNC and every call site
 * awaits them. See the note in `core/db.js` for why the interface is async even
 * though better-sqlite3 is not.
 */

const { join } = require('path');
const { MessageFlags } = require('discord.js');
const { DATA_DIR, BASE_DIR } = require('./config');
const { readJson } = require('./utils');
const db = require('./db');

const LEGACY_FILE = join(DATA_DIR, 'points.json');
const CONFIG_FILE = join(BASE_DIR, 'bots', 'minigames', 'points_config.json');

/** Marks the one-off import, so it never runs twice. */
const IMPORTED_KEY = 'points_imported';

let _configCache = null;
let _ready = null;

// ─── settings ────────────────────────────────────────────────────────────────

function getConfig() {
  if (!_configCache) _configCache = readJson(CONFIG_FILE, {});
  return _configCache;
}

function getPts(game, ...keys) {
  let cfg = (getConfig().games ?? {})[game] ?? {};
  for (const key of keys) {
    cfg = typeof cfg === 'object' ? (cfg[key] ?? 0) : 0;
  }
  return typeof cfg === 'number' ? cfg : 0;
}

// ─── start-up ────────────────────────────────────────────────────────────────

/**
 * Connect and, once, carry the old `data/points.json` over.
 *
 * IDEMPOTENT, and every public function awaits it, so a caller cannot reach the
 * database before the import ran. `main.js` calls it before any client logs in,
 * so a broken database fails at boot rather than on the first minigame.
 *
 * The flag is set even when there was no file, or a restart would re-scan for
 * one for ever. It is set only AFTER the rows are in, so a crash halfway
 * through leaves the import to be retried rather than silently skipped.
 *
 * The old file is renamed rather than deleted: if this import is ever wrong,
 * the only copy of the balances should not be gone.
 */
async function init() {
  if (_ready) return _ready;

  _ready = (async () => {
    await db.connect();
    if (await db.getMeta(IMPORTED_KEY, '')) return;

    const legacy = readJson(LEGACY_FILE, null);
    if (legacy && typeof legacy === 'object') {
      let imported = 0;
      let skipped = 0;
      for (const [userId, balance] of Object.entries(legacy)) {
        const amount = Number(balance);
        if (!/^\d{17,20}$/.test(userId) || !Number.isFinite(amount)) { skipped += 1; continue; }
        await db.addBalance(userId, amount);
        imported += 1;
      }

      const { renameSync } = require('fs');
      let kept = '';
      try {
        renameSync(LEGACY_FILE, `${LEGACY_FILE}.bak`);
        kept = ' Old file kept as points.json.bak.';
      } catch { /* already gone, or read-only: not worth failing the boot over */ }

      console.log(
        `[points] imported ${imported} balance(s) from points.json`
        + (skipped ? `, skipped ${skipped} malformed entr${skipped === 1 ? 'y' : 'ies'}` : '')
        + `.${kept}`,
      );
    }

    await db.setMeta(IMPORTED_KEY, String(Date.now()));
  })();

  return _ready;
}

// ─── balances ────────────────────────────────────────────────────────────────

async function getPoints(userId) {
  await init();
  return db.getBalance(userId);
}

/**
 * @returns {Promise<{old: number, new: number}>}
 */
async function addPoints(userId, amount) {
  await init();
  return db.addBalance(userId, amount);
}

async function topPoints(limit = 10) {
  await init();
  return db.topBalances(limit);
}

// ─── rewards ─────────────────────────────────────────────────────────────────

function getNewlyUnlockedRewards(old, next) {
  const rewards = getConfig().rewards ?? [];
  return rewards.filter(r => old < r.points && r.points <= next);
}

async function notifyRewards(interaction, old, next) {
  const unlocked = getNewlyUnlockedRewards(old, next);
  for (const reward of unlocked) {
    if (reward.role_id && interaction.guild) {
      const role = interaction.guild.roles.cache.get(String(reward.role_id));
      if (role) {
        try { await interaction.member.roles.add(role); } catch {}
      }
    }
    try {
      await interaction.followUp({
        content: `🎉 **Reward unlocked!** You reached **${reward.points.toLocaleString()} points** and earned: **${reward.description}**!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {}
  }
}

function pointsFooter(amount, newTotal) {
  const delta = amount > 0 ? `+${amount}` : amount < 0 ? String(amount) : '±0';
  return `${delta} 🪙  (Total: ${newTotal.toLocaleString()} 🪙)`;
}

module.exports = {
  init, getConfig, getPts, getPoints, addPoints, topPoints,
  notifyRewards, pointsFooter, getNewlyUnlockedRewards,
  IMPORTED_KEY, LEGACY_FILE,
};
