#!/usr/bin/env node
/**
 * .env  ->  config/config.jsonc
 *
 * Everything that is not a credential moved out of .env. This turns an existing
 * installation over without anybody retyping thirty ids, which is the step
 * where they get lost: a value nobody carries across looks exactly like a
 * feature somebody switched off on purpose.
 *
 * WHAT IT WRITES IS A MINIMAL OVERRIDE, not a full copy of the defaults. Only
 * the values actually found in the .env end up in the file. Everything else
 * keeps coming from config/config.example.jsonc, so the next update's new
 * settings and improved defaults still reach this installation.
 *
 * IT NEVER OVERWRITES. An existing config.jsonc stops the script unless --force
 * is given, and even then the old file is kept as config.jsonc.bak.
 *
 * It carries NO text over. The rules, the guides and the panel wording used to
 * be hardcoded in the source and are shipped as neutral defaults now; putting
 * one installation's rules into a tracked migration script would hand them to
 * everybody, which is the mistake this whole change is undoing.
 *
 * Usage:  node scripts/migrate-config.js [--force] [--dry-run]
 */

require('dotenv').config({ quiet: true });

const { join } = require('path');
const { existsSync, readFileSync, writeFileSync, copyFileSync } = require('fs');

const BASE_DIR = join(__dirname, '..');
const CONFIG_PATH = join(BASE_DIR, 'config', 'config.jsonc');
const POINTS_PATH = join(BASE_DIR, 'bots', 'minigames', 'points_config.json');

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

const env = (key) => String(process.env[key] ?? '').trim();

/** Drop empty strings, empty arrays and empty objects, recursively. */
function prune(value) {
  if (Array.isArray(value)) {
    const out = value.map(prune).filter(v => v !== undefined);
    return out.length ? out : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = prune(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === '' || value === undefined || value === null) return undefined;
  return value;
}

function buildConfig() {
  const carried = [];
  const take = (key, target) => {
    const value = env(key);
    if (value) carried.push(`${key} -> ${target}`);
    return value;
  };

  // ── the /roles panel ──────────────────────────────────────────────────────
  // Only buttons whose role is actually set are carried. A button without a
  // role would render and then fail on the first click.
  //
  // THESE IDS AND LABELS ARE DELIBERATELY NOT NEUTRAL, unlike the ones in
  // config.example.jsonc. This path runs once, for an installation that already
  // has a panel posted, and rebuilds the buttons that panel is carrying from the
  // env variables that fed them. `id` is what Discord sends back on a click, so
  // renaming one here turns a live button into a dead one. An operator without
  // GARAGE_ROLE_ID and friends gets none of these: the filter below drops every
  // entry whose role is empty.
  const roleButtons = [
    ['giveaway_notify', 'Giveaway Notify', '🎁', 'Primary', 'giveawayNotify', env('GIVEAWAY_NOTIFY_ROLE_ID')],
    ['garage',          'Garage',          '⏰', 'Success', '',               take('GARAGE_ROLE_ID', 'features.roleMenu.buttons[garage]')],
    ['handcuffs',       'Handcuffs',       '⏰', 'Success', '',               take('HANDCUFFS_ROLE_ID', 'features.roleMenu.buttons[handcuffs]')],
    ['storage',         'Storage',         '⏰', 'Success', '',               take('STORAGE_ROLE_ID', 'features.roleMenu.buttons[storage]')],
    ['vehicle_keys',    'Vehicle Keys',    '⏰', 'Success', '',               take('VEHICLEKEYS_ROLE_ID', 'features.roleMenu.buttons[vehicle_keys]')],
  ]
    .filter(([, , , , named, id]) => named || id)
    .map(([id, label, emoji, style, named, roleId]) => ({
      id, label, emoji, style, role: named || roleId,
    }));

  // ── the /information role legend ──────────────────────────────────────────
  // The wording is the shipped default; only the roles it points at are yours.
  const infoRoles = [
    ['INFO_CUSTOMER_ROLE_ID',  'Has purchased a product from our shop'],
    ['INFO_TESTER_ROLE_ID',    'Tests new releases before they go public'],
    ['INFO_SUPPORTER_ROLE_ID', 'Helps members in the support channels'],
    ['INFO_MODERATOR_ROLE_ID', 'Keeps order and enforces the server rules'],
  ]
    .map(([key, text]) => ({ role: take(key, 'features.information.roleList'), text }))
    .filter(entry => entry.role);

  // ── points and rewards ────────────────────────────────────────────────────
  // points_config.json is being retired: the values move into the config file
  // where the reward ROLE can sit next to its threshold instead of being
  // resolved through an env variable named after the tier.
  let points;
  let rewards;
  if (existsSync(POINTS_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(POINTS_PATH, 'utf8'));
      if (legacy.games && typeof legacy.games === 'object') {
        points = legacy.games;
        carried.push('bots/minigames/points_config.json games -> features.minigames.points');
      }
      if (Array.isArray(legacy.rewards)) {
        rewards = legacy.rewards.map(r => ({
          points: r.points,
          label: r.label ?? r.description ?? '',
          role: env('REWARD_' + String(r.role ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '') + '_ROLE_ID'),
        }));
        carried.push('bots/minigames/points_config.json rewards -> features.minigames.rewards');
      }
    } catch (err) {
      console.warn(`[migrate] points_config.json could not be read (${err.message}), skipping it.`);
    }
  }

  const config = {
    guildId: take('GUILD_ID', 'guildId'),

    branding: {
      name:         take('BRAND_NAME', 'branding.name'),
      color:        take('BRAND_COLOR', 'branding.color'),
      thumbnailUrl: take('BRAND_THUMBNAIL_URL', 'branding.thumbnailUrl'),
      links: [
        { label: 'Website',       url: take('BRAND_WEBSITE_URL', 'branding.links[Website]') },
        { label: 'Documentation', url: take('BRAND_DOCS_URL', 'branding.links[Documentation]') },
        { label: 'Github',        url: take('BRAND_GITHUB_URL', 'branding.links[Github]') },
      ].filter(l => l.url),
    },

    roles: {
      member:         take('MEMBER_ROLE_ID', 'roles.member'),
      founder:        take('FOUNDER_ROLE_ID', 'roles.founder'),
      manager:        take('MANAGER_ROLE_ID', 'roles.manager'),
      developer:      take('DEVELOPER_ROLE_ID', 'roles.developer'),
      team:           take('TEAM_ROLE_ID', 'roles.team'),
      giveawayNotify: take('GIVEAWAY_NOTIFY_ROLE_ID', 'roles.giveawayNotify'),
    },

    channels: {
      log:         take('LOG_CHANNEL_ID', 'channels.log'),
      memberCount: take('MEMBER_COUNT_CHANNEL_ID', 'channels.memberCount'),
      feedback:    take('FEEDBACK_CHANNEL_ID', 'channels.feedback'),
    },

    features: {
      autoReply: {
        // Only switched on when both halves are there. A trigger without a
        // contact pings nobody; a contact without a trigger never fires.
        enabled:   Boolean(env('AUTOREPLY_TRIGGER') && env('AUTOREPLY_CONTACT_ID')),
        trigger:   take('AUTOREPLY_TRIGGER', 'features.autoReply.trigger'),
        contactId: take('AUTOREPLY_CONTACT_ID', 'features.autoReply.contactId'),
      },
      information: {
        sections: env('INFO_RULES_CHANNEL_ID')
          ? [{
              heading: 'Channel Access',
              text: 'To gain access to all channels, please head over to {channel}, read the rules carefully and confirm them. You will then automatically receive access to the full server.',
              channel: take('INFO_RULES_CHANNEL_ID', 'features.information.sections[0].channel'),
            }]
          : [],
        roleList: infoRoles,
        inviteUrl: take('INVITE_URL', 'features.information.inviteUrl'),
      },
      rules: {
        button: { grantsRole: env('MEMBER_ROLE_ID') ? 'member' : '' },
      },
      roleMenu: { buttons: roleButtons },
      minigames: { points, rewards },
    },
  };

  // A support channel only ever appeared inside one sentence of the role
  // legend, so it is folded into that sentence rather than kept as an id.
  const supportChannel = env('INFO_SUPPORT_CHANNEL_ID');
  if (supportChannel && infoRoles.length >= 3) {
    infoRoles[2].text = `Helps members in <#${supportChannel}>`;
    carried.push('INFO_SUPPORT_CHANNEL_ID -> features.information.roleList[2].text');
  }

  return { config: prune(config) ?? {}, carried };
}

const HEADER = `// Generated by \`npm run migrate:config\` from the .env of this installation.
//
// This is an OVERRIDE file: only the values found in the .env are in here.
// Everything else comes from config/config.example.jsonc, which is where every
// setting is documented and where new settings arrive with an update.
//
// Edit it freely. It is not tracked in git and survives every deploy.
//
// Anything still in .env is a credential and belongs there: the three bot
// tokens, DB_* for /backup_database and DATABASE_URL for the bot's own storage.
`;

function main() {
  if (existsSync(CONFIG_PATH) && !force && !dryRun) {
    console.error('[migrate] config/config.jsonc already exists.');
    console.error('[migrate] Nothing was changed. Re-run with --force to replace it (the old file is kept as config.jsonc.bak),');
    console.error('[migrate] or with --dry-run to see what would be written.');
    process.exitCode = 1;
    return;
  }

  const { config, carried } = buildConfig();
  const body = `${HEADER}\n${JSON.stringify(config, null, 2)}\n`;

  if (!carried.length) {
    console.warn('[migrate] Nothing found in .env to carry over. Is this the right directory, and does the .env still have the old settings?');
  }

  if (dryRun) {
    console.log(body);
    console.log(`[migrate] --dry-run: nothing written. ${carried.length} value(s) would be carried over.`);
    return;
  }

  if (existsSync(CONFIG_PATH)) {
    copyFileSync(CONFIG_PATH, `${CONFIG_PATH}.bak`);
    console.log('[migrate] Existing config.jsonc kept as config.jsonc.bak');
  }

  writeFileSync(CONFIG_PATH, body, 'utf8');

  console.log(`[migrate] Wrote config/config.jsonc with ${carried.length} value(s):`);
  for (const line of carried) console.log(`[migrate]   ${line}`);
  console.log('');
  console.log('[migrate] Next:');
  console.log('[migrate]   1. Open config/config.jsonc and check it.');
  console.log('[migrate]   2. Compare against config/config.example.jsonc for everything that is NOT in there');
  console.log('[migrate]      yet: the rules text, the support guides, the panel wording. Those shipped as');
  console.log('[migrate]      neutral defaults and are yours to write.');
  console.log('[migrate]   3. Remove the migrated keys from .env. They are ignored from now on, except');
  console.log('[migrate]      GUILD_ID, which still works but warns at boot.');
  console.log('[migrate]   4. Run `npm test`, then restart the bot.');
}

main();
