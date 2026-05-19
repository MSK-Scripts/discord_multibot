require('dotenv').config();
const { Client, Events, REST, Routes } = require('discord.js');
const { tokens, guild: gcfg } = require('./core/config');

const botModules = [
  { name: 'Commands Bot',  module: require('./bots/commands/bot'),  token: tokens.COMMANDS },
  { name: 'Events Bot',    module: require('./bots/events/bot'),    token: tokens.EVENTS },
  { name: 'Minigames Bot', module: require('./bots/minigames/bot'), token: tokens.MINIGAMES },
];

function createRegistry() {
  const commands = [];
  return {
    addCommand: data => commands.push(data),
    getAll:     ()   => commands,
  };
}

async function runGroup(group, token) {
  const roleNames = group.map(g => g.name);
  const label     = roleNames.join(' + ');

  while (true) {
    // Union of intents and partials across all bots sharing this token
    const intentSet  = new Set();
    const partialSet = new Set();
    for (const b of group) {
      for (const i of b.module.intents  || []) intentSet.add(i);
      for (const p of b.module.partials || []) partialSet.add(p);
    }

    const client   = new Client({ intents: [...intentSet], partials: [...partialSet] });
    const registry = createRegistry();

    for (const b of group) {
      try {
        b.module.attach(client, registry, { botName: b.name });
      } catch (err) {
        console.error(`[${b.name}] attach() failed: ${err.message}`);
      }
    }

    // Combined command registration — one PUT per Discord application.
    // Also wipes any leftover GLOBAL commands from earlier code versions, which
    // would otherwise appear alongside the guild commands in the Discord autocomplete
    // and look like duplicates.
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
        await rest.put(
          Routes.applicationGuildCommands(appId, String(gcfg.ID)),
          { body },
        );
        console.log(`[${label}] ${body.length} guild commands registered (combined for application ${client.user.tag}).`);
      } catch (err) {
        console.error(`[${label}] Failed to register commands (code ${err.code}): ${err.message}`);
        if (err.code === 50001) {
          console.error(`  -> Bot is missing the "applications.commands" OAuth2 scope. Re-invite the bot with that scope.`);
        }
      }
    });

    try {
      console.log(`[${label}] Starting...`);
      await client.login(token);
      await new Promise(() => {}); // keep alive until error
    } catch (err) {
      console.error(`[${label}] Crashed: ${err.message}. Restarting in 10s...`);
      try { client.destroy(); } catch {}
      await new Promise(r => setTimeout(r, 10_000));
    }
  }
}

async function main() {
  const active  = botModules.filter(b => b.token);
  const skipped = botModules.filter(b => !b.token);

  skipped.forEach(({ name }) => console.warn(`[main] '${name}' skipped - no token in .env`));

  if (!active.length) {
    console.error('[main] No bots with a valid token found. Check your .env file.');
    return;
  }

  // Group bots that share the same Discord application token into a single client.
  // This prevents duplicate slash-command registration and 10062 "Unknown interaction"
  // race conditions caused by two processes responding to the same interaction.
  const byToken = new Map();
  for (const b of active) {
    if (!byToken.has(b.token)) byToken.set(b.token, []);
    byToken.get(b.token).push(b);
  }

  console.log('='.repeat(55));
  console.log('  MSK Scripts Discord Multi-Bot starting');
  console.log(`  Roles: ${active.length}, unique Discord applications: ${byToken.size}`);
  for (const [, group] of byToken) {
    if (group.length === 1) console.log(`    - ${group[0].name}`);
    else                    console.log(`    - ${group.map(g => g.name).join(' + ')} (shared token)`);
  }
  console.log('='.repeat(55));

  const tasks = [];
  for (const [token, group] of byToken) tasks.push(runGroup(group, token));
  await Promise.all(tasks);
}

main().catch(console.error);
