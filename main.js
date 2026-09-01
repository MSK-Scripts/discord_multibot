require('dotenv').config();
const { Client, Events, REST, Routes } = require('discord.js');
const config = require('./core/config');
const i18n = require('./core/i18n');
const points = require('./core/pointsManager');
const db = require('./core/db');

const botModules = [
  { name: 'Commands Bot',  module: require('./bots/commands/bot'),  token: config.tokens.COMMANDS },
  { name: 'Events Bot',    module: require('./bots/events/bot'),    token: config.tokens.EVENTS },
  { name: 'Minigames Bot', module: require('./bots/minigames/bot'), token: config.tokens.MINIGAMES },
];

function createRegistry() {
  const commands = [];
  return {
    addCommand: data => commands.push(data),
    getAll:     ()   => commands,
  };
}

async function runGroup(group, token) {
  const label = group.map(g => g.name).join(' + ');

  while (true) {
    // Union of intents and partials across all roles sharing this token.
    const intentSet = new Set();
    const partialSet = new Set();
    for (const b of group) {
      for (const i of b.module.intents || []) intentSet.add(i);
      for (const p of b.module.partials || []) partialSet.add(p);
    }

    const client = new Client({ intents: [...intentSet], partials: [...partialSet] });
    const registry = createRegistry();

    for (const b of group) {
      try {
        b.module.attach(client, registry, { botName: b.name });
      } catch (err) {
        console.error(`[${b.name}] attach() failed: ${err.message}`);
      }
    }

    // Combined command registration, one PUT per Discord application.
    // Also wipes any leftover GLOBAL commands from earlier versions, which
    // would otherwise sit next to the guild commands in the autocomplete and
    // look like duplicates.
    client.once(Events.ClientReady, async () => {
      const rest = new REST({ version: '10' }).setToken(client.token);
      const appId = client.user.id;

      try {
        const existingGlobal = await rest.get(Routes.applicationCommands(appId));
        if (Array.isArray(existingGlobal) && existingGlobal.length > 0) {
          await rest.put(Routes.applicationCommands(appId), { body: [] });
          console.log(`[${label}] Cleared ${existingGlobal.length} leftover GLOBAL command(s) from ${client.user.tag}.`);
        }
      } catch (err) {
        console.error(`[${label}] Failed to clear global commands (code ${err.code}): ${err.message}`);
      }

      try {
        const body = registry.getAll().map(d => d.toJSON());
        await rest.put(Routes.applicationGuildCommands(appId, String(config.guildId())), { body });
        console.log(`[${label}] ${body.length} guild commands registered (combined for application ${client.user.tag}).`);
      } catch (err) {
        console.error(`[${label}] Failed to register commands (code ${err.code}): ${err.message}`);
        if (err.code === 50001) {
          console.error('  -> Bot is missing the "applications.commands" OAuth2 scope. Re-invite the bot with that scope.');
        }
      }
    });

    try {
      console.log(`[${label}] Starting...`);
      await client.login(token);
      await new Promise(() => {}); // keep alive until login rejects
    } catch (err) {
      console.error(`[${label}] Crashed: ${err.message}. Restarting in 10s...`);
      try { client.destroy(); } catch { /* already gone */ }
      await new Promise(r => setTimeout(r, 10_000));
    }
  }
}

/**
 * Say what is wrong with the configuration, once, and keep going.
 *
 * A half-configured bot should run the parts that work. Exiting here would turn
 * one forgotten channel id into a crash loop under Restart=on-failure, which is
 * a worse failure than a feature that is quietly off — because the log line
 * below is the thing that tells somebody the feature is off.
 */
function reportConfig() {
  const report = config.report();

  if (!report.hasUserConfig) {
    console.warn('[config] No config/config.jsonc found, running on the shipped defaults.');
    console.warn('[config] Copy config/config.example.jsonc to config/config.jsonc, or run `npm run migrate:config`');
    console.warn('[config] to build one from an older installation\'s .env.');
  }

  for (const line of report.problems) console.warn(`[config] ${line}`);
  for (const line of i18n.problems()) console.warn(`[i18n] ${line}`);

  if (report.missing.length) {
    console.warn(`[config] switched on but not filled in (${report.missing.length}): ${report.missing.join(', ')}`);
    console.warn('[config] those features stay off. See config/config.example.jsonc.');
  }

  if (report.guildMissing) {
    // Commands are registered per guild, so without this every registration
    // fails with a permissions error that says nothing about the real cause.
    console.error('[config] guildId is not set - no commands can be registered.');
  }
}

async function main() {
  const active = botModules.filter(b => b.token);
  const skipped = botModules.filter(b => !b.token);

  skipped.forEach(({ name }) => console.warn(`[main] '${name}' skipped - no token in .env`));

  if (!active.length) {
    console.error('[main] No bots with a valid token found. Check your .env file.');
    return;
  }

  // Roles that share a Discord application token run on ONE client. Two
  // processes on the same application both answer the same interaction, which
  // is where the 10062 races and the duplicate command registrations came from.
  const byToken = new Map();
  for (const b of active) {
    if (!byToken.has(b.token)) byToken.set(b.token, []);
    byToken.get(b.token).push(b);
  }

  console.log('='.repeat(55));
  console.log(`  ${config.brandName() || 'Discord'} Multi-Bot starting`);
  console.log(`  Roles: ${active.length}, unique Discord applications: ${byToken.size}`);
  for (const [, group] of byToken) {
    if (group.length === 1) console.log(`    - ${group[0].name}`);
    else console.log(`    - ${group.map(g => g.name).join(' + ')} (shared token)`);
  }
  console.log(`  Language: ${config.language()}`);
  console.log('='.repeat(55));

  reportConfig();

  // Storage first, and awaited: a broken DATABASE_URL, bad credentials or an
  // unreachable host has to fail HERE, at boot, with a message somebody reads.
  // Connecting lazily would push the failure into the first minigame somebody
  // plays, where it surfaces as a dead interaction instead of an error.
  // init() also runs the one-off import of data/points.json.
  try {
    await points.init();
    console.log(`[main] storage ready (${db.dialect()})`);
  } catch (err) {
    console.error(`[main] storage unavailable: ${err.message}`);
    throw err;
  }

  const tasks = [];
  for (const [token, group] of byToken) tasks.push(runGroup(group, token));
  await Promise.all(tasks);
}

main().catch(console.error);
