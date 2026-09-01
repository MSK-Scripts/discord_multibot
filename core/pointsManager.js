/**
 * Points: what a minigame pays out, what somebody owns, and the roles that come
 * with crossing a threshold.
 *
 * TWO KINDS OF DATA, AND THEY LIVE IN DIFFERENT PLACES. The balances are STATE
 * and belong in the database. The point VALUES per game, the reward thresholds
 * and the bonus roles are SETTINGS and live in config/config.jsonc under
 * `features.minigames`. Mixing the two is how a config change ends up needing a
 * database migration.
 *
 * They used to sit in bots/minigames/points_config.json, which was TRACKED —
 * so the four reward role ids in it were one installation's roles shipped to
 * everybody. Working around that needed a REWARD_<TIER>_ROLE_ID env variable
 * per tier, resolved by name at runtime and invisible to every check that looks
 * for a literal. In the config file the role sits next to its threshold and the
 * indirection is gone.
 *
 * `getPts()`, `pointsFor()` and `pointsFooter()` are therefore synchronous —
 * they only read settings. `getPoints()` and `addPoints()` are ASYNC and every
 * call site awaits them. See the note in core/db/index.js for why the interface
 * is async even though better-sqlite3 is not.
 */

const { join } = require('path');
const { MessageFlags } = require('discord.js');
const config = require('./config');
const { t } = require('./i18n');
const { readJson } = require('./utils');
const db = require('./db');

const LEGACY_FILE = join(config.DATA_DIR, 'points.json');

/** Marks the one-off import, so it never runs twice. */
const IMPORTED_KEY = 'points_imported';

let _ready = null;

// ─── settings ────────────────────────────────────────────────────────────────

/**
 * What one outcome of one game is worth.
 *
 * Returns 0 for anything unknown rather than throwing: a game that gains an
 * outcome the operator has not configured should pay nothing, not crash the
 * interaction after the player already saw the result.
 */
function getPts(game, ...keys) {
  let node = config.get(`features.minigames.points.${game}`, {});
  for (const key of keys) {
    node = (node && typeof node === 'object') ? node[key] : undefined;
  }
  return typeof node === 'number' && Number.isFinite(node) ? node : 0;
}

/**
 * The configured bonus roles, HIGHEST FACTOR FIRST, with anything malformed
 * dropped.
 *
 * A factor of 0 or less is dropped rather than obeyed. An empty number field in
 * the dashboard arrives here as 0, and `Number(undefined)` is NaN: taking
 * either at face value turns a role somebody meant as a perk into one that pays
 * nothing, which looks exactly like the points system being broken.
 */
function multipliers() {
  const list = config.get('features.minigames.multipliers', []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(m => m && typeof m === 'object')
    .map(m => ({ role: String(m.role ?? '').trim(), factor: Number(m.factor) }))
    .filter(m => m.role && Number.isFinite(m.factor) && m.factor > 0)
    .sort((a, b) => b.factor - a.factor);
}

/**
 * What this member's payouts are multiplied by. 1 when no bonus role matches,
 * which is the normal case and costs one config read.
 *
 * THE HIGHEST MATCH WINS AND THEY DO NOT STACK, hence the sort above and the
 * early return here. Multiplying the factors together is the obvious other
 * reading, and it is the one that quietly produces x12 for a member who happens
 * to hold three bonus roles.
 *
 * A role reference that does not resolve becomes '' and matches nobody, so a
 * typo denies the bonus rather than handing it to everyone. Same rule as every
 * other role check in the repo.
 */
function multiplierFor(member) {
  for (const m of multipliers()) {
    const id = config.roleId(m.role);
    if (id && member?.roles?.cache?.has(id)) return m.factor;
  }
  return 1;
}

/**
 * A base payout, multiplied by what this member earns.
 *
 * LOSSES ARE LEFT ALONE unless `multiplyLosses` says otherwise: a perk that
 * doubles what a bad round costs is a punishment, and nobody reads "your role
 * gives you double points" as "and double losses".
 */
function applyMultiplier(member, base) {
  if (!Number.isFinite(base) || base === 0) return 0;
  if (base < 0 && config.get('features.minigames.multiplyLosses', false) !== true) return base;
  const factor = multiplierFor(member);
  return factor === 1 ? base : Math.round(base * factor);
}

/**
 * What one outcome of one game is worth TO THIS PLAYER.
 *
 * This is what the games call. Applying the bonus here rather than inside
 * `addPoints` is what keeps the number on screen and the number in the database
 * the same one: the games hand this same value to their footer.
 */
function pointsFor(interaction, game, ...keys) {
  return applyMultiplier(interaction?.member, getPts(game, ...keys));
}

/** The reward tiers, lowest threshold first, with anything malformed dropped. */
function rewards() {
  const list = config.get('features.minigames.rewards', []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(r => r && Number.isFinite(Number(r.points)))
    .map(r => ({
      points: Number(r.points),
      label:  String(r.label ?? ''),
      role:   String(r.role ?? ''),
    }))
    .sort((a, b) => a.points - b.points);
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
  return rewards().filter(r => old < r.points && r.points <= next);
}

async function notifyRewards(interaction, old, next) {
  for (const reward of getNewlyUnlockedRewards(old, next)) {
    // A tier without a role is not a fault: the congratulation still goes out,
    // there is simply nothing to hand over.
    const roleId = config.roleId(reward.role);
    if (roleId && interaction.guild) {
      const role = interaction.guild.roles.cache.get(String(roleId));
      if (role) {
        try { await interaction.member.roles.add(role); } catch { /* missing permission, not worth failing the game over */ }
      }
    }
    try {
      await interaction.followUp({
        content: t('points.rewardUnlocked', {
          points: reward.points.toLocaleString(config.dateLocale()),
          label:  reward.label,
        }),
        flags: MessageFlags.Ephemeral,
      });
    } catch { /* the interaction is gone; the points are already booked */ }
  }
}

/**
 * The "+5 (Total: 120)" line under a game result. Returns an empty string when
 * the footer is switched off, and every call site treats that as "no footer".
 */
function pointsFooter(amount, newTotal) {
  if (config.get('features.minigames.showPointsFooter', true) === false) return '';
  const delta = amount > 0 ? `+${amount}` : amount < 0 ? String(amount) : '±0';
  return t('points.footer', { delta, total: Number(newTotal ?? 0).toLocaleString(config.dateLocale()) });
}

module.exports = {
  init, getPts, pointsFor, rewards, getPoints, addPoints, topPoints,
  multipliers, multiplierFor, applyMultiplier,
  notifyRewards, pointsFooter, getNewlyUnlockedRewards,
  IMPORTED_KEY, LEGACY_FILE,
};
