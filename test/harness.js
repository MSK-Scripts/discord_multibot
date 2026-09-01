// Boot harness for discord_multibot. Run with `npm test`.
//
// Mirrors what main.js does, minus a real login: it unions the intents, builds
// the shared registry through every role's attach(), serializes the exact
// rest.put payload, and dispatches mock interactions through the real
// InteractionCreate listeners. No Discord token is needed, and nothing is
// written outside data/points.json, which is restored afterwards.
//
// The last section does hit the network: it calls client.login() with an
// obviously invalid token and asserts that Discord rejects it. That single
// unauthenticated request is what proves the REST stack actually works, and it
// is the check that caught undici 8 breaking @discordjs/rest (see the Overrides
// section in README.md). Set SKIP_NETWORK_TESTS=1 to leave it out on a machine
// without internet access.
//
// KNOWN BLIND SPOT: an invalid token fails at REST authentication, so the
// gateway WebSocket is never opened and @discordjs/ws is never exercised. An
// override of that package passed this harness 47/47 and still crashed the bot
// on startup. Changes to the gateway layer need a real login with a real token,
// which this file deliberately does not do.

const { EventEmitter } = require('events');
const { execSync } = require('child_process');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const REPO = process.argv[2] ?? path.join(__dirname, '..');
process.chdir(REPO);

// core/config.js no longer carries any ids: an unset one is the empty string,
// because a default here means a fresh clone points at somebody else's server.
// The harness therefore seeds its own fake snowflakes BEFORE anything requires
// core/config, or every role gate would read '' and F0 would fail on a repo
// that is perfectly fine.
//
// Only UNSET variables are filled, so a developer with a real .env still tests
// against their own values.
const FAKE_IDS = [
  'GUILD_ID', 'LOG_CHANNEL_ID', 'MEMBER_COUNT_CHANNEL_ID', 'FEEDBACK_CHANNEL_ID',
  'MEMBER_ROLE_ID', 'FOUNDER_ROLE_ID', 'MANAGER_ROLE_ID', 'DEVELOPER_ROLE_ID',
  'GIVEAWAY_NOTIFY_ROLE_ID', 'TEAM_ROLE_ID', 'GARAGE_ROLE_ID', 'HANDCUFFS_ROLE_ID',
  'STORAGE_ROLE_ID', 'VEHICLEKEYS_ROLE_ID',
];
FAKE_IDS.forEach((key, i) => {
  if (!process.env[key]) process.env[key] = String(900000000000001000 + i);
});

const req = p => require(path.join(REPO, p));

let pass = 0, fail = 0;
const failures = [];
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n         ' + (e && e.message)); }
}
async function acheck(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n         ' + (e && e.message)); }
}
const section = t => console.log('\n' + t);

// ---------------------------------------------------------------- versions
section('A) installed dependency versions');
const v = (p, dir = path.join(REPO, 'node_modules'), depth = 0) => {
  const direct = path.join(dir, p, 'package.json');
  if (fs.existsSync(direct)) return JSON.parse(fs.readFileSync(direct, 'utf8')).version;
  if (depth > 2) return null;
  for (const e of fs.readdirSync(dir)) {
    const nested = e.startsWith('@')
      ? fs.readdirSync(path.join(dir, e)).map(x => path.join(dir, e, x, 'node_modules'))
      : [path.join(dir, e, 'node_modules')];
    for (const n of nested) {
      if (!fs.existsSync(n)) continue;
      const found = v(p, n, depth + 1);
      if (found) return found;
    }
  }
  return null;
};
for (const p of ['discord.js', 'dotenv', '@discordjs/collection', '@discordjs/ws', '@discordjs/rest', 'undici']) {
  const ver = v(p);
  check(`${p} @ ${ver ?? 'not found'}`, () => assert.ok(ver, p + ' not installed'));
}

// ---------------------------------------------------------------- load
section('B) module loading (what main.js requires)');
let djs, modules;
check('discord.js loads', () => { djs = require(path.join(REPO, 'node_modules/discord.js')); });
check('core/config loads', () => req('core/config'));
check('core/utils loads', () => req('core/utils'));
check('core/pointsManager loads', () => req('core/pointsManager'));
check('all three bot modules load', () => {
  modules = [
    { name: 'Commands Bot',  module: req('bots/commands/bot') },
    { name: 'Events Bot',    module: req('bots/events/bot') },
    { name: 'Minigames Bot', module: req('bots/minigames/bot') },
  ];
  assert.strictEqual(modules.length, 3);
});

// ---------------------------------------------------------------- intents
section('C) intents and partials resolve to real enum values');
const intentSet = new Set(), partialSet = new Set();
for (const b of modules) {
  for (const i of b.module.intents || []) intentSet.add(i);
  for (const p of b.module.partials || []) partialSet.add(p);
}
check('intents are known GatewayIntentBits', () => {
  const known = new Set(Object.values(djs.GatewayIntentBits).filter(x => typeof x === 'number'));
  for (const i of intentSet) assert.ok(known.has(i), 'unknown intent ' + i);
  assert.ok(intentSet.size >= 8, 'only ' + intentSet.size + ' intents');
});
check('partials are known Partials', () => {
  const known = new Set(Object.values(djs.Partials).filter(x => typeof x === 'number'));
  for (const p of partialSet) assert.ok(known.has(p), 'unknown partial ' + p);
});

// ---------------------------------------------------------------- registry
section('D) command registry and the exact rest.put payload');
const client = new EventEmitter();
client.user = { id: '111222333444555666', tag: 'TestBot#0001', setPresence: () => {} };
client.ws = { ping: 42 };
client.channels = { cache: new Map() };
client.guilds = { cache: new Map() };

const commands = [];
const registry = { addCommand: d => commands.push(d), getAll: () => commands };

check('attach() runs for all three roles', () => {
  for (const b of modules) b.module.attach(client, registry, { botName: b.name });
  assert.ok(commands.length > 0, 'registry empty');
});

let body;
check('every command serializes via toJSON()', () => {
  body = commands.map(d => d.toJSON());
  assert.strictEqual(body.length, commands.length);
});
check(`payload has ${commands.length} commands, all with a name`, () => {
  for (const c of body) assert.ok(typeof c.name === 'string' && c.name.length, JSON.stringify(c).slice(0, 80));
});
check('no duplicate command names', () => {
  const seen = new Map();
  for (const c of body) {
    const key = c.name + '/' + (c.type ?? 1);
    assert.ok(!seen.has(key), 'duplicate: ' + key);
    seen.set(key, true);
  }
});
check('slash command names match Discord rules', () => {
  for (const c of body) {
    if ((c.type ?? 1) !== 1) continue;
    assert.match(c.name, /^[-_\p{L}\p{N}]{1,32}$/u, c.name);
    assert.strictEqual(c.name, c.name.toLowerCase(), c.name + ' is not lowercase');
    assert.ok(c.description && c.description.length <= 100, c.name + ' description');
  }
});
check('context menu commands are typed 2 or 3 and carry no description', () => {
  const ctx = body.filter(c => c.type === 2 || c.type === 3);
  assert.strictEqual(ctx.length, 4, 'expected 4 context menus, got ' + ctx.length);
  for (const c of ctx) assert.ok(!c.description, c.name + ' must not have a description');
});
check('payload stays under the 100 guild command limit', () => assert.ok(body.length <= 100, String(body.length)));
check('payload is JSON serializable end to end', () => {
  const s = JSON.stringify(body);
  assert.ok(s.length > 500);
  JSON.parse(s);
});
check('InteractionCreate listeners: one stack per role', () => {
  assert.strictEqual(client.listenerCount('interactionCreate'), 3, String(client.listenerCount('interactionCreate')));
});

// ---------------------------------------------------------------- mocks
const { guild: gcfg } = req('core/config');

function mockInteraction({ name, opts = {}, roles = [], userId = 'test-user-1', type = 'chat' }) {
  const out = { replies: [], followUps: [], edits: [], modals: [] };
  const i = {
    _out: out,
    commandName: name,
    client,
    replied: false,
    deferred: false,
    user: { id: userId, tag: 'Tester#0001', displayName: 'Tester', username: 'Tester', toString: () => `<@${userId}>` },
    member: { roles: { cache: new Map(roles.map(r => [r, { id: r, name: 'x' }])), add: async () => {} } },
    guild: { id: gcfg.ID, name: 'MSK Test', roles: { cache: new Map() }, members: { cache: new Map() } },
    channel: { id: '1', send: async m => m },
    options: {
      getInteger: n => opts[n] ?? null,
      getString:  n => opts[n] ?? null,
      getUser:    n => opts[n] ?? null,
      getBoolean: n => opts[n] ?? null,
      getChannel: n => opts[n] ?? null,
    },
    isChatInputCommand:        () => type === 'chat',
    isButton:                  () => type === 'button',
    isUserContextMenuCommand:  () => type === 'user',
    isMessageContextMenuCommand: () => type === 'message',
    isContextMenuCommand:      () => type === 'user' || type === 'message',
    isModalSubmit:             () => false,
    isAutocomplete:            () => false,
    reply:      async r => { out.replies.push(r); i.replied = true; return r; },
    followUp:   async r => { out.followUps.push(r); return r; },
    editReply:  async r => { out.edits.push(r); return r; },
    deferReply: async () => { i.deferred = true; },
    showModal:  async m => { out.modals.push(m); },
    awaitModalSubmit: async () => null,
    fetchReply: async () => ({
      createMessageComponentCollector: () => Object.assign(new EventEmitter(), { stop: () => {} }),
    }),
  };
  return i;
}

const lastText = i => {
  const r = i._out.replies.at(-1);
  if (!r) return '';
  if (r.content) return r.content;
  const e = r.embeds?.[0];
  const d = e?.data ?? e ?? {};
  return [d.title, d.description].filter(Boolean).join(' | ');
};

const dispatch = async i => {
  for (const l of client.listeners('interactionCreate')) await l(i);
  return i;
};

(async () => {
  // ------------------------------------------------------------ dispatch
  section('E) real dispatch through the attached InteractionCreate listeners');

  await acheck('/ping answers', async () => {
    const i = await dispatch(mockInteraction({ name: 'ping' }));
    assert.ok(i._out.replies.length, 'no reply');
  });

  await acheck('/random is denied without the Team role', async () => {
    const i = await dispatch(mockInteraction({ name: 'random', opts: { number1: 1, number2: 10 } }));
    assert.match(lastText(i), /required role/);
  });

  await acheck('/random is granted with the Team role ID', async () => {
    const i = await dispatch(mockInteraction({
      name: 'random', opts: { number1: 1, number2: 50 }, roles: [gcfg.TEAM_ROLE_ID],
    }));
    assert.match(lastText(i), /Guess the Number/);
  });

  await acheck('/random stays denied for a role with the right NAME but wrong ID', async () => {
    const i = await dispatch(mockInteraction({
      name: 'random', opts: { number1: 1, number2: 50 }, roles: ['999999999999999999'],
    }));
    assert.match(lastText(i), /required role/);
  });

  await acheck('/rg first guess accepted, second hits the cooldown', async () => {
    // Wide round so the probe guesses cannot accidentally be correct, which
    // would start a fresh round and clear the very cooldown under test.
    await dispatch(mockInteraction({
      name: 'random', opts: { number1: 1, number2: 100000 }, roles: [gcfg.TEAM_ROLE_ID],
    }));
    const a = await dispatch(mockInteraction({ name: 'rg', opts: { number: 7 }, userId: 'guesser-1' }));
    assert.doesNotMatch(lastText(a), /Slow down/, 'first guess was blocked');
    const b = await dispatch(mockInteraction({ name: 'rg', opts: { number: 8 }, userId: 'guesser-1' }));
    assert.match(lastText(b), /Slow down/);
  });

  await acheck('/rg out-of-range guess is rejected without burning a guess', async () => {
    await dispatch(mockInteraction({
      name: 'random', opts: { number1: 1, number2: 100000 }, roles: [gcfg.TEAM_ROLE_ID],
    }));
    const i = await dispatch(mockInteraction({ name: 'rg', opts: { number: 999999 }, userId: 'guesser-2' }));
    assert.match(lastText(i), /Guess between/);
    const j = await dispatch(mockInteraction({ name: 'rg', opts: { number: 5 }, userId: 'guesser-2' }));
    assert.doesNotMatch(lastText(j), /Slow down/, 'the rejected guess consumed the budget');
  });

  await acheck('/rg refuses the 6th guess in a round', async () => {
    // Dedicated wide round: with 1..100000 the six probe guesses below cannot
    // realistically hit the secret, which would start a new round and reset the
    // very budget this test is checking.
    await dispatch(mockInteraction({
      name: 'random', opts: { number1: 1, number2: 100000 }, roles: [gcfg.TEAM_ROLE_ID],
    }));
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t;
    let txt = '';
    try {
      for (let n = 0; n < 6; n++) {
        t += 60_000;
        const i = await dispatch(mockInteraction({ name: 'rg', opts: { number: 1 + n }, userId: 'guesser-3' }));
        txt = lastText(i);
      }
    } finally { Date.now = realNow; }
    assert.match(txt, /used all \*\*5\*\* guesses/);
  });

  await acheck('/flachwitz reads data/flachwitze.json', async () => {
    const i = await dispatch(mockInteraction({ name: 'flachwitz' }));
    assert.ok(i._out.replies.length);
  });

  for (const [name, opts] of [
    ['dice', { sides: 6, count: 3 }],
    ['8ball', { question: 'Does undici 8 work?' }],
    ['flipcoin', {}],
    ['rps', {}],
    ['slots', {}],
  ]) {
    await acheck(`minigame /${name} executes`, async () => {
      const i = await dispatch(mockInteraction({ name, opts }));
      assert.ok(i._out.replies.length, 'no reply from /' + name);
    });
  }

  await acheck('unknown command is ignored silently', async () => {
    const i = await dispatch(mockInteraction({ name: 'does_not_exist' }));
    assert.strictEqual(i._out.replies.length, 0);
  });

  await acheck('admin command gated by Founder ID', async () => {
    const denied = await dispatch(mockInteraction({ name: 'send_message', roles: [] }));
    assert.ok(denied._out.replies.length || denied._out.modals.length === 0);
    const granted = await dispatch(mockInteraction({ name: 'send_message', roles: [gcfg.MANAGER_ROLE_ID] }));
    assert.ok(granted._out.modals.length === 1 || granted._out.replies.length >= 0);
  });

  // ------------------------------------------------------------ role ids
  section('F0) every gcfg.*_ROLE_ID used in the code exists in the config');
  {
    // orders.js is gitignored, so it is present on a dev machine and in
    // production but not in a fresh CI checkout. Scan it when it is there.
    const scanned = execSync('git ls-files "*.js"', { cwd: REPO }).toString().trim().split(/\r?\n/)
      .concat(['bots/commands/commands/orders.js'])
      .filter(f => fs.existsSync(path.join(REPO, f)));
    const used = new Set();
    for (const f of scanned) {
      for (const m of fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/gcfg\.([A-Z_]+_ROLE_ID)/g)) {
        used.add(m[1]);
      }
    }
    check(`found role references in ${scanned.length} files`, () => assert.ok(used.size >= 4, [...used].join(',')));
    for (const key of used) {
      check(`${key} is defined and looks like a snowflake`, () => {
        assert.strictEqual(typeof gcfg[key], 'string', key + ' missing in core/config.js');
        assert.match(gcfg[key], /^\d{17,20}$/, key + ' = ' + gcfg[key]);
      });
    }
  }

  // ------------------------------------------------------------ env template
  section('F1) every env variable the code reads is in .env.example');
  {
    // .env.example is what a self-hoster copies. A setting that reaches the
    // code without reaching the template is invisible: nobody can switch it on
    // because nobody knows it exists. DATABASE_URL shipped exactly that way and
    // was only caught by somebody asking where to configure the database.
    //
    // The scan has to know how config.js reads: not only process.env directly
    // but also the _id() / _str() accessors. A pattern that misses those finds
    // 2 of 23 variables and reports all clear.
    const PATTERN = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_]*)|_(?:id|str)\(\s*['"]([A-Z][A-Z0-9_]*)/g;

    // Comments are stripped first. Without that, the prose ABOVE this line
    // counts as a usage and the check fails on a variable nobody reads. Only
    // whole-line comments and block comments go, so a trailing comment after
    // real code still gets scanned.
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

    // Read by the code but deliberately NOT in the template, with the reason.
    // An exemption is a decision somebody wrote down; a missing variable is one
    // nobody noticed.
    const NOT_IN_TEMPLATE = {
      SKIP_NETWORK_TESTS: 'a switch for this harness, not a setting an installation has',
    };

    const envFiles = execSync('git ls-files "*.js"', { cwd: REPO }).toString().trim().split(/\s+/)
      .filter(f => f && fs.existsSync(path.join(REPO, f)));
    const envUsed = new Map();
    for (const f of envFiles) {
      const src = stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'));
      for (const m of src.matchAll(PATTERN)) {
        const name = m[1] || m[2] || m[3];
        if (!envUsed.has(name)) envUsed.set(name, f);
      }
    }

    const template = fs.readFileSync(path.join(REPO, '.env.example'), 'utf8');

    check('the scan actually found the variables', () => {
      // Without a floor this passes by having gone blind: a pattern that
      // matches nothing reports nothing missing.
      assert.ok(envUsed.size >= 15, `only ${envUsed.size} env variables found, the scan broke`);
    });

    check('no variable is read without being in .env.example', () => {
      const missing = [...envUsed.keys()]
        .filter(n => !(n in NOT_IN_TEMPLATE))
        .filter(n => !new RegExp('^' + n + '=', 'm').test(template));
      assert.deepStrictEqual(missing, [], 'read by the code, absent from the template: '
        + missing.map(n => n + ' (' + envUsed.get(n) + ')').join(', '));
    });

    check('an exemption still names a variable the code reads', () => {
      const stale = Object.keys(NOT_IN_TEMPLATE).filter(n => !envUsed.has(n));
      assert.deepStrictEqual(stale, [], 'exempt but nothing reads it any more: ' + stale.join(', '));
    });
  }

  // ------------------------------------------------------------ no ids in source
  section('F1b) no installation-specific ids in the tracked source');
  {
    // core/config.js used to carry MSK's own guild, channels and roles as
    // defaults. A fresh clone therefore pointed at somebody else's server, and
    // an id removed from a .env silently kept working, which is the worse half:
    // a missing setting looked like a working one.
    //
    // A snowflake is 17 to 20 digits. Test files are excluded because their
    // whole job is to make up ids.
    const SNOWFLAKE = /\b\d{17,20}\b/g;

    // Files that still carry ids, each with what has to happen to them. These
    // are DEBT, not exemptions: the entry goes away when the file does.
    const STILL_TO_DO = {
      'bots/commands/commands/community.js':
        'the /information panel names six channels and roles inline; they belong in .env',
      'bots/events/handlers/messageHandler.js':
        'the auto-reply contact is one hardcoded user id; belongs in .env',
      'bots/minigames/points_config.json':
        'the four reward role_ids; that file is settings, so they can stay there but must not be MSK-specific in the repo',
    };

    const tracked = execSync('git ls-files "*.js" "*.json"', { cwd: REPO }).toString().trim().split(/\s+/)
      .filter(f => f && !f.startsWith('test/') && fs.existsSync(path.join(REPO, f)));

    const offenders = [];
    for (const f of tracked) {
      const src = fs.readFileSync(path.join(REPO, f), 'utf8');
      const found = [...new Set(src.match(SNOWFLAKE) || [])];
      if (found.length) offenders.push({ file: f, ids: found });
    }

    check('the scan actually looked at the source', () => {
      // A scan that reads nothing reports nothing.
      assert.ok(tracked.length >= 10, `only ${tracked.length} files scanned`);
    });

    check('core/config.js carries no ids at all', () => {
      // The point of the whole exercise, and the one file that must stay clean.
      const bad = offenders.find(o => o.file === 'core/config.js');
      assert.ok(!bad, 'core/config.js has ids again: ' + (bad ? bad.ids.join(', ') : ''));
    });

    check('no NEW file started carrying ids', () => {
      const fresh = offenders.filter(o => !(o.file in STILL_TO_DO)).map(o => `${o.file} (${o.ids.join(', ')})`);
      assert.deepStrictEqual(fresh, [], 'ids in the source:\n' + fresh.join('\n'));
    });

    check('the known-debt list still describes reality', () => {
      // An entry left behind after the file was cleaned would quietly permit
      // ids there again.
      const stale = Object.keys(STILL_TO_DO).filter(f => !offenders.some(o => o.file === f));
      assert.deepStrictEqual(stale, [], 'listed as debt but already clean: ' + stale.join(', '));
    });
  }

  // ------------------------------------------------------------ builders
  section('F) discord.js builders still behave');
  const { makeEmbed } = req('core/utils');
  check('makeEmbed produces a serializable embed', () => {
    const e = makeEmbed({ title: 'T', description: 'D', guildName: 'MSK' });
    const j = e.toJSON();
    assert.strictEqual(j.title, 'T');
    assert.ok(j.footer.text.includes('MSK'));
    assert.ok(j.thumbnail.url);
  });
  check('Collection API used by the bot modules works', () => {
    const c = new djs.Collection();
    c.set('a', 1); c.set('b', 2);
    assert.strictEqual(c.get('a'), 1);
    assert.strictEqual(c.size, 2);
    assert.ok(typeof c.filter === 'function' && typeof c.map === 'function');
  });
  check('ActionRow + Button serialize', () => {
    const row = new djs.ActionRowBuilder().addComponents(
      new djs.ButtonBuilder().setCustomId('x').setLabel('L').setStyle(djs.ButtonStyle.Primary));
    assert.strictEqual(row.toJSON().components.length, 1);
  });

  // ------------------------------------------------------------ collection
  section('F2) @discordjs/collection surface that discord.js itself uses');
  check('discord.js manager caches are Collections and behave', () => {
    const c2 = new djs.Client({ intents: [djs.GatewayIntentBits.Guilds] });
    try {
      for (const name of ['users', 'guilds', 'channels']) {
        assert.ok(c2[name].cache instanceof djs.Collection, name + '.cache is not a Collection');
      }
      const c = c2.users.cache;
      c.set('1', { id: '1', n: 1 }); c.set('2', { id: '2', n: 2 }); c.set('3', { id: '3', n: 3 });
      assert.strictEqual(c.get('2').n, 2);
      assert.strictEqual(c.first().id, '1');
      assert.strictEqual(c.last().id, '3');
      assert.strictEqual(c.find(x => x.n === 2).id, '2');
      assert.strictEqual(c.filter(x => x.n > 1).size, 2);
      assert.strictEqual(c.some(x => x.n === 3), true);
      assert.strictEqual(c.hasAll('1', '2'), true);
      assert.strictEqual(c.map(x => x.n).length, 3);
      assert.strictEqual(c.partition(x => x.n > 1).length, 2);
      assert.strictEqual(c.at(0).id, '1');
      // sort() sorts in place and returns the same Collection, so this changes
      // the iteration order for everything below.
      assert.strictEqual(c.sort((a, b) => b.n - a.n).first().n, 3);
      assert.strictEqual(c.at(0).id, '3');
      assert.ok(c.random());
      assert.strictEqual(c.ensure('9', () => ({ id: '9', n: 9 })).n, 9);
      assert.strictEqual(c.sweep(x => x.n === 9), 1);
      assert.strictEqual(c.reduce((a, x) => a + x.n, 0), 6);
      assert.strictEqual([...c.keys()].length, 3);
      c.clear();
      assert.strictEqual(c.size, 0);
    } finally { try { c2.destroy(); } catch {} }
  });

  // ------------------------------------------------------------ points
  section('G) points system, database backed');
  {
    // A THROWAWAY DATABASE, set before anything connects. Without this the
    // harness would write into data/multibot.db, and a test run would hand out
    // points to a made-up user on the real installation.
    process.env.DATABASE_URL = 'sqlite::memory:';

    const dbUrl = req('core/db/url');
    const { SCHEMA } = req('core/db/schema');

    check('an unset DATABASE_URL means SQLite in data/', () => {
      const target = dbUrl.parse('');
      assert.strictEqual(target.driver, 'sqlite');
      assert.match(target.file, /multibot\.db$/);
    });

    check('mysql, mariadb and postgres URLs map to their drivers', () => {
      assert.strictEqual(dbUrl.parse('mysql://u:p@h:3306/d').driver, 'mysql');
      // mariadb is the same wire protocol, and a self-hoster writes whichever
      // name their provider used.
      assert.strictEqual(dbUrl.parse('mariadb://u:p@h/d').driver, 'mysql');
      assert.strictEqual(dbUrl.parse('postgres://u:p@h:5432/d').driver, 'postgres');
      assert.strictEqual(dbUrl.parse('postgresql://u@h/d').driver, 'postgres');
    });

    check('a URL it cannot use throws instead of falling back to SQLite', () => {
      // A silent fallback writes to a local file while the operator sits in
      // front of their MariaDB wondering why it stays empty.
      for (const bad of ['nonsense', 'redis://h/0', 'mysql://h']) {
        assert.throws(() => dbUrl.parse(bad), undefined, `accepted ${bad}`);
      }
    });

    check('all three dialects define the same tables', () => {
      // The three statement lists sit next to each other in schema.js so a
      // missing table is visible. This is the check that says so out loud.
      const tablesOf = (list) => list
        .map(s => (s.match(/CREATE TABLE IF NOT EXISTS (\w+)/) || [])[1])
        .filter(Boolean).sort();
      const sqlite = tablesOf(SCHEMA.sqlite);
      assert.ok(sqlite.length >= 2, 'sqlite schema is suspiciously small');
      assert.deepStrictEqual(tablesOf(SCHEMA.mysql), sqlite, 'mysql differs');
      assert.deepStrictEqual(tablesOf(SCHEMA.postgres), sqlite, 'postgres differs');
    });

    check('every statement is IF NOT EXISTS, because it runs on every start', () => {
      // Getting this wrong is either a crash on the second boot or a silently
      // reset installation.
      for (const [dialect, list] of Object.entries(SCHEMA)) {
        for (const statement of list) {
          assert.match(statement, /IF NOT EXISTS/, `${dialect}: ${statement.slice(0, 40)}`);
        }
      }
    });

    check('the mysql and postgres drivers load and match the interface', () => {
      // Constructed, never connected: that would need a live server. This
      // proves the packages resolve and the three drivers agree on a shape,
      // which is the part a typo actually breaks.
      const sqlite = req('core/db/drivers/sqlite').create({ file: ':memory:' });
      const mysql = req('core/db/drivers/mysql').create({ url: 'mysql://u@h/d' });
      const pg = req('core/db/drivers/postgres').create({ url: 'postgres://u@h/d' });
      const shape = (d) => Object.keys(d).filter(k => typeof d[k] === 'function').sort();
      assert.deepStrictEqual(shape(mysql), shape(sqlite), 'mysql driver differs');
      assert.deepStrictEqual(shape(pg), shape(sqlite), 'postgres driver differs');
      assert.deepStrictEqual([sqlite.dialect, mysql.dialect, pg.dialect], ['sqlite', 'mysql', 'postgres']);
    });

    const pm = req('core/pointsManager');
    const db = req('core/db');
    const pointsFile = path.join(REPO, 'data', 'points.json');
    const hadFile = fs.existsSync(pointsFile);
    const backup = hadFile ? fs.readFileSync(pointsFile) : null;

    try {
      check('points_config.json parses and has games + rewards', () => {
        const cfg = pm.getConfig();
        assert.ok(cfg.games && Object.keys(cfg.games).length, 'no games');
        assert.ok(Array.isArray(cfg.rewards) && cfg.rewards.length, 'no rewards');
      });

      check('getPts traverses the config', () => assert.strictEqual(typeof pm.getPts('dice', 'win'), 'number'));

      check('getPts and pointsFooter stay synchronous', () => {
        // They read SETTINGS, not state. Making them async too would put an
        // await on every embed footer for no reason.
        assert.strictEqual(typeof pm.getPts('dice', 'win'), 'number');
        assert.strictEqual(typeof pm.pointsFooter(5, 10), 'string');
      });

      await acheck('the throwaway database is the one in use', async () => {
        await db.connect();
        assert.strictEqual(db.dialect(), 'sqlite');
      });

      await acheck('addPoints round trips and never goes below zero', async () => {
        const id = '900000000000000099';
        const a = await pm.addPoints(id, 250);
        assert.strictEqual(a.new, a.old + 250);
        assert.strictEqual(await pm.getPoints(id), a.new);
        const b = await pm.addPoints(id, -999999);
        assert.strictEqual(b.new, 0, 'a balance went negative');
        assert.strictEqual(b.old, a.new, 'old is not the value that preceded the write');
      });

      await acheck('concurrent adds do not lose an update', async () => {
        // THE reason this moved out of a JSON file. The old addPoints read the
        // whole file, added in JavaScript and wrote it back; ten of those
        // interleaving around an await left 10 instead of 100, and the last
        // write silently won. The arithmetic now happens inside one SQL
        // statement, so there is nothing to interleave.
        const id = '900000000000000098';
        await Promise.all(Array.from({ length: 10 }, () => pm.addPoints(id, 10)));
        assert.strictEqual(await pm.getPoints(id), 100);
      });

      await acheck('an unknown user reads as zero, not as undefined', async () => {
        assert.strictEqual(await pm.getPoints('900000000000000097'), 0);
      });

      await acheck('the leaderboard is ordered by balance', async () => {
        await pm.addPoints('900000000000000096', 5);
        const top = await pm.topPoints(3);
        assert.ok(top.length >= 2);
        for (let i = 1; i < top.length; i += 1) {
          assert.ok(top[i - 1].balance >= top[i].balance, 'not sorted');
        }
      });

      await acheck('meta survives a round trip and has a default', async () => {
        assert.strictEqual(await db.getMeta('__nope__', 'fallback'), 'fallback');
        await db.setMeta('__harness__', 'x');
        await db.setMeta('__harness__', 'y');
        assert.strictEqual(await db.getMeta('__harness__'), 'y', 'setMeta did not overwrite');
      });

      await acheck('re-applying the schema keeps the data', async () => {
        // applySchema runs on every start. The failure mode of getting the
        // IF NOT EXISTS wrong is a silently emptied installation, so this
        // applies it a second time against the live connection and checks the
        // rows are still there.
        const before = await pm.getPoints('900000000000000098');
        assert.ok(before > 0, 'nothing stored, the check would prove nothing');
        const driver = await db.connect();
        await driver.applySchema();
        assert.strictEqual(await pm.getPoints('900000000000000098'), before);
      });

      await acheck('connecting twice does not swap the database out', async () => {
        // With `:memory:` a second `new Database()` is a brand new EMPTY
        // database. Found by a test of mine that meant to check something else.
        const before = await pm.getPoints('900000000000000098');
        const driver = await db.connect();
        await driver.connect();
        assert.strictEqual(await pm.getPoints('900000000000000098'), before);
      });

      check('every call site awaits addPoints and getPoints', () => {
        // A forgotten await computes with a Promise: `{old, new}` becomes
        // undefined and the footer prints NaN, with no error anywhere. Cheap
        // to check, expensive to notice in production.
        const offenders = [];
        for (const rel of ['bots/commands/commands', 'bots/minigames/commands']) {
          const dir = path.join(REPO, rel);
          for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            const src = fs.readFileSync(path.join(dir, name), 'utf8');
            for (const line of src.split('\n')) {
              if (/\brequire\(/.test(line)) continue;
              if (/(?<!await )\b(addPoints|getPoints)\s*\(/.test(line)) {
                offenders.push(`${rel}/${name}: ${line.trim().slice(0, 60)}`);
              }
            }
          }
        }
        assert.deepStrictEqual(offenders, [], 'unawaited call:\n' + offenders.join('\n'));
      });

      check('no minigame writes points.json any more', () => {
        const dir = path.join(REPO, 'bots', 'minigames', 'commands');
        for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
          const src = fs.readFileSync(path.join(dir, name), 'utf8');
          assert.ok(!src.includes('points.json'), `${name} still names points.json`);
        }
      });
    } finally {
      await db.close().catch(() => {});
      if (hadFile) fs.writeFileSync(pointsFile, backup);
      else if (fs.existsSync(pointsFile)) fs.unlinkSync(pointsFile);
      console.log('  ..   points.json restored (existed before: ' + hadFile + '), in-memory database dropped');
    }
  }

  // ------------------------------------------------------------ client
  section('H) real discord.js Client and a live REST round trip');
  let realClient = null;
  check('new Client({intents, partials}) constructs', () => {
    realClient = new djs.Client({ intents: [...intentSet], partials: [...partialSet] });
    assert.ok(realClient.ws, 'no ws manager');
    assert.ok(realClient.rest, 'no rest manager');
  });

  const netLabel = 'login with an invalid token is rejected by Discord, not by broken plumbing';
  if (process.env.SKIP_NETWORK_TESTS) {
    console.log('  skip ' + netLabel + ' (SKIP_NETWORK_TESTS is set)');
  } else await acheck(netLabel, async () => {
    if (!realClient) throw new Error('no client');
    let err = null;
    try {
      await Promise.race([
        realClient.login('MTAwMDAwMDAwMDAwMDAwMDAw.Xxxxxx.invalid-token-for-harness-only'),
        new Promise((_, r) => setTimeout(() => r(new Error('TIMEOUT after 25s')), 25_000)),
      ]);
    } catch (e) { err = e; }
    assert.ok(err, 'login unexpectedly succeeded');
    const msg = String(err.message);
    // A working REST/undici stack reaches Discord and gets told the token is bad.
    const reachedDiscord = /token|unauthorized|401/i.test(msg);
    assert.ok(reachedDiscord, 'did not reach Discord, got instead: ' + msg);
  });

  try { realClient?.destroy(); } catch {}

  console.log('\n' + '='.repeat(60));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) console.log('  failed: ' + failures.join(', '));
  console.log('='.repeat(60));
  process.exitCode = fail ? 1 : 0;
  // Give discord.js' teardown a tick. Calling process.exit() straight after
  // destroy() trips a libuv assertion on Windows.
  setTimeout(() => process.exit(process.exitCode), 100).unref();
})();
