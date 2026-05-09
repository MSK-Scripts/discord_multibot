require('dotenv').config();
const { tokens } = require('./core/config');

const { createBot: createCommandsBot }  = require('./bots/commands/bot');
const { createBot: createEventsBot }    = require('./bots/events/bot');
const { createBot: createMinigamesBot } = require('./bots/minigames/bot');

const candidates = [
  { name: 'Commands Bot',  factory: createCommandsBot,  token: tokens.COMMANDS },
  { name: 'Events Bot',    factory: createEventsBot,    token: tokens.EVENTS },
  { name: 'Minigames Bot', factory: createMinigamesBot, token: tokens.MINIGAMES },
];

async function runBot(name, factory, token) {
  while (true) {
    const client = factory();
    try {
      console.log(`[${name}] Starting...`);
      await client.login(token);
      await new Promise(() => {}); // keep alive until error
    } catch (err) {
      console.error(`[${name}] Crashed: ${err.message}. Restarting in 10s...`);
      try { client.destroy(); } catch {}
      await new Promise(r => setTimeout(r, 10_000));
    }
  }
}

async function main() {
  const active = candidates.filter(({ token }) => token);
  const skipped = candidates.filter(({ token }) => !token);

  skipped.forEach(({ name }) => console.warn(`[main] '${name}' skipped – no token in .env`));

  if (!active.length) {
    console.error('[main] No bots with a valid token found. Check your .env file.');
    return;
  }

  console.log('═'.repeat(55));
  console.log('  MSK Scripts Discord Multi-Bot starting');
  console.log(`  Active bots: ${active.length}`);
  active.forEach(({ name }) => console.log(`    • ${name}`));
  console.log('═'.repeat(55));

  await Promise.all(active.map(({ name, factory, token }) => runBot(name, factory, token)));
}

main().catch(console.error);
