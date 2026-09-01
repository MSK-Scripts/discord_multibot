// Boot harness for discord_multibot. Run with `npm test`.
//
// Mirrors what main.js does, minus a real login: it unions the intents, builds
// the shared registry through every role's attach(), serializes the exact
// rest.put payload, and dispatches mock interactions through the real
// InteractionCreate listeners. No Discord token is needed, and nothing is
// written outside data/points.json, which is restored afterwards.
//
// THE CONFIG IS A FIXTURE, NOT THE DEVELOPER'S OWN. A temporary config.jsonc
// with fake snowflakes is written before anything requires core/config, and
// MULTIBOT_CONFIG points at it. Reading whoever's real config happened to be on
// the machine made the role gates pass or fail depending on the developer, and
// on a fresh CI checkout there is no config at all.
//
// The last section does hit the network: it calls client.login() with an
// obviously invalid token and asserts that Discord rejects it. That single
// unauthenticated request is what proves the REST stack actually works, and it
// is the check that caught undici 8 breaking @discordjs/rest. Set
// SKIP_NETWORK_TESTS=1 to leave it out on a machine without internet access.
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
const os = require('os');

const REPO = process.argv[2] ?? path.join(__dirname, '..');
process.chdir(REPO);

// ── the fixture config ───────────────────────────────────────────────────────
/**
 * Distinct fake snowflakes.
 *
 * BUILT AS A STRING, NOT BY ADDING TO A NUMBER. `900000000000001000 + n` is
 * past Number.MAX_SAFE_INTEGER, so every n produced the SAME id and half the
 * checks below silently compared a value with itself. That is the repo's own
 * "snowflakes are strings, always" rule, broken in the one place nobody was
 * looking: the test helper.
 */
const FAKE = (n) => `9000000000000${String(10000 + n)}`;

const FIXTURE = {
  guildId: FAKE(0),
  language: 'en',
  roles: {
    member: FAKE(1), founder: FAKE(2), manager: FAKE(3),
    developer: FAKE(4), team: FAKE(5), giveawayNotify: FAKE(6),
  },
  channels: { log: FAKE(10), memberCount: FAKE(11), feedback: FAKE(12) },
  features: {
    rules: { button: { grantsRole: 'member' } },
    roleMenu: { buttons: [{ id: 'announcements', label: 'Announcements', emoji: '📣', style: 'Primary', role: FAKE(20) }] },
    autoReply: { enabled: true, trigger: 'harness-trigger', contactId: FAKE(21) },
    supportGuides: {
      guides: [{ value: 'demo', name: 'Demo', title: 'Demo guide', description: 'A demo guide body.' }],
    },
    information: {
      sections: [{ heading: 'Access', text: 'Head to {channel} first.', channel: FAKE(12) }],
      roleList: [{ role: 'founder', text: 'Runs the place' }],
      inviteUrl: 'https://example.com/invite',
    },
    backupDatabase: { enabled: true },
  },
};

const FIXTURE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'multibot-harness-')), 'config.jsonc');
fs.writeFileSync(FIXTURE_PATH, JSON.stringify(FIXTURE, null, 2), 'utf8');
process.env.MULTIBOT_CONFIG = FIXTURE_PATH;

// A throwaway database, set before anything connects. Without this the harness
// would write into data/multibot.db and hand out points to a made-up user on
// the real installation.
process.env.DATABASE_URL = 'sqlite::memory:';

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

/**
 * Tracked source files, minus the tests and everything GENERATED.
 *
 * graphify-out/ is built from the source and web/dist/ is built from web/src/,
 * so a hit in either is an echo of the real thing rather than a second
 * occurrence of it. The minified bundle would also sail into the id scan on the
 * day a hash happens to contain eighteen digits in a row.
 */
const GENERATED = ['graphify-out/', 'web/dist/'];
const trackedSources = (patterns) => execSync(`git ls-files ${patterns}`, { cwd: REPO })
  .toString().trim().split(/\r?\n/)
  .filter(f => f && !f.startsWith('test/') && !GENERATED.some(d => f.startsWith(d))
    && fs.existsSync(path.join(REPO, f)));

/**
 * Whole-line and block comments removed.
 *
 * Several files EXPLAIN what used to be hardcoded, and prose about a mistake is
 * not the mistake. Without this the scans below report the comment that warns
 * about them.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

// ---------------------------------------------------------------- versions
section('A) installed dependency versions');
const v = (p, dir = path.join(REPO, 'node_modules'), depth = 0) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, p, 'package.json'), 'utf8')).version;
  } catch {
    if (depth > 2) return null;
    for (const scope of ['discord.js', '@discordjs/rest', '@discordjs/ws']) {
      const nested = path.join(dir, scope, 'node_modules');
      if (fs.existsSync(path.join(nested, p))) return v(p, nested, depth + 1);
    }
    return null;
  }
};
for (const p of [
  'discord.js', 'undici', '@discordjs/rest', '@discordjs/ws',
  '@discordjs/collection', '@discordjs/builders', 'dotenv', 'better-sqlite3',
]) {
  const ver = v(p);
  check(`${p} @ ${ver ?? 'not found'}`, () => assert.ok(ver, p + ' not installed'));
}

// ---------------------------------------------------------------- load
section('B) module loading (what main.js requires)');
let djs, modules;
check('discord.js loads', () => { djs = require(path.join(REPO, 'node_modules/discord.js')); });
check('core/jsonc loads', () => req('core/jsonc'));
check('core/config loads', () => req('core/config'));
check('core/i18n loads', () => req('core/i18n'));
check('core/utils loads', () => req('core/utils'));
check('core/commandKit loads', () => req('core/commandKit'));
check('core/gameKit loads', () => req('core/gameKit'));
check('core/pointsManager loads', () => req('core/pointsManager'));
check('all three bot modules load', () => {
  modules = [
    { name: 'Commands Bot',  module: req('bots/commands/bot') },
    { name: 'Events Bot',    module: req('bots/events/bot') },
    { name: 'Minigames Bot', module: req('bots/minigames/bot') },
  ];
  for (const m of modules) {
    assert.ok(Array.isArray(m.module.intents), m.name + ' has no intents array');
    assert.strictEqual(typeof m.module.attach, 'function', m.name + ' has no attach()');
  }
});

const config = req('core/config');
const i18n = req('core/i18n');

check('the fixture config is the one in use', () => {
  assert.strictEqual(config.guildId(), FAKE(0), 'a different config was loaded');
  assert.strictEqual(config.roleId('team'), FAKE(5));
});

// ---------------------------------------------------------------- intents
section('C) intents and partials resolve to real enum values');
const intentSet = new Set(), partialSet = new Set();
for (const m of modules) {
  for (const i of m.module.intents  || []) intentSet.add(i);
  for (const p of m.module.partials || []) partialSet.add(p);
}
check('intents are known GatewayIntentBits', () => {
  const known = new Set(Object.values(djs.GatewayIntentBits));
  for (const i of intentSet) assert.ok(known.has(i), 'unknown intent ' + String(i));
  assert.ok(intentSet.size >= 4, 'suspiciously few intents');
});
check('partials are known Partials', () => {
  const known = new Set(Object.values(djs.Partials));
  for (const p of partialSet) assert.ok(known.has(p), 'unknown partial ' + String(p));
});

// ---------------------------------------------------------------- registry
section('D) command registry and the exact rest.put payload');
const client = new EventEmitter();
client.user = { id: '1', tag: 'Harness#0000', setPresence: () => {} };
client.ws = { ping: 42 };
client.guilds = { cache: new Map() };
client.channels = { cache: new Map() };
client.users = { fetch: async () => ({ send: async () => {} }) };

const commands = [];
const registry = { addCommand: d => commands.push(d), getAll: () => commands };

check('attach() runs for all three roles', () => {
  for (const m of modules) m.module.attach(client, registry, { botName: m.name });
  assert.ok(commands.length > 0, 'no commands registered');
});

let body;
check('every command serializes via toJSON()', () => {
  body = commands.map(d => d.toJSON());
  assert.strictEqual(body.length, commands.length);
});
check(`payload has ${commands.length} commands, all with a name`, () => {
  for (const c of body) assert.ok(c.name, 'command without a name');
});
check('no duplicate command names', () => {
  const seen = new Map();
  for (const c of body) {
    const key = `${c.type ?? 1}:${c.name}`;
    assert.ok(!seen.has(key), 'duplicate: ' + key);
    seen.set(key, true);
  }
});
check('slash command names match Discord rules', () => {
  for (const c of body) {
    if (c.type && c.type !== 1) continue;
    assert.match(c.name, /^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u, 'bad name: ' + c.name);
    assert.ok(c.description && c.description.length <= 100, 'bad description on ' + c.name);
  }
});
check('context menu commands are typed 2 or 3 and carry no description', () => {
  for (const c of body.filter(x => x.type && x.type !== 1)) {
    assert.ok([2, 3].includes(c.type), c.name + ' has type ' + c.type);
    assert.ok(!c.description, c.name + ' has a description');
  }
});
check('payload stays under the 100 guild command limit', () => assert.ok(body.length <= 100, String(body.length)));
check('payload is JSON serializable end to end', () => {
  assert.ok(JSON.parse(JSON.stringify(body)).length === body.length);
});
check('InteractionCreate listeners: one stack per role', () => {
  const n = client.listeners('interactionCreate').length;
  assert.ok(n >= 3, 'expected at least 3 listeners, got ' + n);
});

// ---------------------------------------------------------------- mocks
function mockInteraction({ name, opts = {}, roles = [], userId = 'test-user-1', type = 'chat' }) {
  const out = { replies: [], followUps: [], edits: [], modals: [] };
  const i = {
    _out: out,
    commandName: name,
    client,
    replied: false,
    deferred: false,
    user: {
      id: userId, tag: 'Tester#0001', displayName: 'Tester', username: 'Tester',
      toString: () => `<@${userId}>`, displayAvatarURL: () => 'https://example.com/a.png',
      avatarURL: () => 'https://example.com/a.png', createdAt: new Date(0),
    },
    member: {
      roles: { cache: new Map(roles.map(r => [r, { id: r, name: 'x', toString: () => `<@&${r}>` }])), add: async () => {} },
      joinedAt: new Date(0),
    },
    guild: {
      id: config.guildId(), name: 'Harness Guild',
      roles: { cache: new Map() },
      members: { cache: new Map() },
      channels: { cache: new Map() },
    },
    channel: { id: '1', send: async m => m, bulkDelete: async () => ({ size: 3 }) },
    options: {
      getInteger: n => opts[n] ?? null,
      getString:  n => opts[n] ?? null,
      getUser:    n => opts[n] ?? null,
      getMember:  n => opts[n] ?? null,
      getBoolean: n => opts[n] ?? null,
      getChannel: n => opts[n] ?? null,
    },
    isChatInputCommand:          () => type === 'chat',
    isButton:                    () => type === 'button',
    isUserContextMenuCommand:    () => type === 'user',
    isMessageContextMenuCommand: () => type === 'message',
    isContextMenuCommand:        () => type === 'user' || type === 'message',
    isModalSubmit:               () => false,
    isAutocomplete:              () => false,
    reply:      async r => { out.replies.push(r); i.replied = true; return r; },
    followUp:   async r => { out.followUps.push(r); return r; },
    editReply:  async r => { out.edits.push(r); return r; },
    deleteReply: async () => {},
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
  const r = i._out.replies.at(-1) ?? i._out.edits.at(-1);
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (r.content) return r.content;
  const e = r.embeds?.[0];
  const d = e?.data ?? e ?? {};
  return [d.title, d.description].filter(Boolean).join(' | ');
};

const dispatch = async i => {
  for (const l of client.listeners('interactionCreate')) await l(i);
  return i;
};

/** The registered name for a command key, which is what an interaction carries. */
const nameOf = key => config.command(key).name;

(async () => {
  // ------------------------------------------------------------ dispatch
  section('E) real dispatch through the attached InteractionCreate listeners');

  await acheck('/ping answers', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('ping') }));
    assert.ok(i._out.replies.length, 'no reply');
  });

  await acheck('/random is denied without the Team role', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('random'), opts: { number1: 1, number2: 10 } }));
    assert.strictEqual(lastText(i), i18n.t('common.noPermission'));
  });

  await acheck('/random is granted with the configured Team role id', async () => {
    const i = await dispatch(mockInteraction({
      name: nameOf('random'), opts: { number1: 1, number2: 50 }, roles: [config.roleId('team')],
    }));
    assert.ok(lastText(i).includes(i18n.t('guess.title')), lastText(i));
  });

  await acheck('a role gate is by id: another snowflake stays denied', async () => {
    const i = await dispatch(mockInteraction({
      name: nameOf('random'), opts: { number1: 1, number2: 50 }, roles: ['999999999999999999'],
    }));
    assert.strictEqual(lastText(i), i18n.t('common.noPermission'));
  });

  await acheck('an EMPTY roles list means everyone, an unresolvable one means nobody', () => {
    const { allowedByRoles } = req('core/utils');
    const nobody = mockInteraction({ name: 'x', roles: [] });
    assert.strictEqual(allowedByRoles(nobody, []), true, 'an empty list must allow');
    assert.strictEqual(allowedByRoles(nobody, ['no_such_role']), false, 'an unresolvable list must deny');
  });

  await acheck('/rg first guess accepted, second hits the cooldown', async () => {
    // Wide round so the probe guesses cannot accidentally be correct, which
    // would start a fresh round and clear the very cooldown under test.
    await dispatch(mockInteraction({
      name: nameOf('random'), opts: { number1: 1, number2: 100000 }, roles: [config.roleId('team')],
    }));
    const a = await dispatch(mockInteraction({ name: nameOf('rg'), opts: { number: 7 }, userId: 'guesser-1' }));
    assert.ok(!a._out.replies.at(-1).content?.includes('⏳'), 'first guess was blocked');
    const b = await dispatch(mockInteraction({ name: nameOf('rg'), opts: { number: 8 }, userId: 'guesser-1' }));
    assert.ok(b._out.replies.at(-1).content?.includes('⏳'), 'no cooldown on the second guess');
  });

  await acheck('/rg out-of-range guess is rejected without burning a guess', async () => {
    await dispatch(mockInteraction({
      name: nameOf('random'), opts: { number1: 1, number2: 100000 }, roles: [config.roleId('team')],
    }));
    const i = await dispatch(mockInteraction({ name: nameOf('rg'), opts: { number: 999999 }, userId: 'guesser-2' }));
    assert.ok(lastText(i).includes('100000'), lastText(i));
    const j = await dispatch(mockInteraction({ name: nameOf('rg'), opts: { number: 5 }, userId: 'guesser-2' }));
    assert.ok(!j._out.replies.at(-1).content?.includes('⏳'), 'the rejected guess consumed the budget');
  });

  await acheck('/rg refuses the 6th guess in a round', async () => {
    await dispatch(mockInteraction({
      name: nameOf('random'), opts: { number1: 1, number2: 100000 }, roles: [config.roleId('team')],
    }));
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t;
    let text = '';
    try {
      for (let n = 0; n < 6; n++) {
        t += 60_000;
        const i = await dispatch(mockInteraction({ name: nameOf('rg'), opts: { number: 1 + n }, userId: 'guesser-3' }));
        text = lastText(i);
      }
    } finally { Date.now = realNow; }
    assert.ok(text.includes('**5**'), 'the budget was not enforced: ' + text);
  });

  await acheck('/flachwitz answers', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('flachwitz') }));
    assert.ok(i._out.replies.length);
  });

  await acheck('/script_guides serves a configured guide', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('script_guides'), opts: { script: 'demo' } }));
    assert.ok(lastText(i).includes('Demo guide'), lastText(i));
  });

  await acheck('/information builds a panel from the config', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('information'), roles: [config.roleId('manager')] }));
    assert.strictEqual(lastText(i), i18n.t('panels.sentInformation'), lastText(i));
  });

  await acheck('/rules builds a panel from the config', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('rules'), roles: [config.roleId('founder')] }));
    assert.strictEqual(lastText(i), i18n.t('panels.sentRules'), lastText(i));
  });

  await acheck('/roles builds a panel from the config', async () => {
    const i = await dispatch(mockInteraction({ name: nameOf('roles'), roles: [config.roleId('founder')] }));
    assert.strictEqual(lastText(i), i18n.t('panels.sentRoles'), lastText(i));
  });

  await acheck('/userinfo answers', async () => {
    const member = {
      user: {
        id: '900000000000000090', username: 'Someone', displayName: 'Someone',
        createdAt: new Date(0), avatarURL: () => 'https://example.com/a.png',
      },
      joinedAt: new Date(0),
      roles: { cache: new Map() },
      toString: () => '<@900000000000000090>',
    };
    member.roles.cache.filter = () => ({ map: () => [] });
    const i = await dispatch(mockInteraction({ name: nameOf('userinfo'), opts: { member } }));
    assert.ok(i._out.replies.length, 'no reply');
  });

  for (const key of ['dice', '8ball', 'flipcoin', 'rps', 'slots', 'points', 'blackjack', 'wordle', 'hangman', 'connect4', 'tictactoe']) {
    const opts = key === 'dice' ? { sides: 6, count: 3 } : key === '8ball' ? { question: 'Does it work?' } : {};
    await acheck(`minigame /${key} executes`, async () => {
      const i = await dispatch(mockInteraction({ name: nameOf(key), opts }));
      assert.ok(i._out.replies.length, 'no reply from /' + key);
    });
  }

  await acheck('unknown command is ignored silently', async () => {
    const i = await dispatch(mockInteraction({ name: 'does_not_exist' }));
    assert.strictEqual(i._out.replies.length, 0);
  });

  await acheck('admin command is gated by the configured roles', async () => {
    const denied = await dispatch(mockInteraction({ name: nameOf('send_message'), roles: [] }));
    assert.strictEqual(lastText(denied), i18n.t('common.noPermission'));
    const granted = await dispatch(mockInteraction({ name: nameOf('send_message'), roles: [config.roleId('manager')] }));
    assert.strictEqual(granted._out.modals.length, 1, 'the manager did not get the modal');
  });

  await acheck('the role menu button grants the configured role', async () => {
    const roleId = FAKE(20);
    const i = mockInteraction({ name: '', type: 'button' });
    i.customId = 'rolemenu_announcements';
    i.guild.roles.cache.set(roleId, { id: roleId, toString: () => `<@&${roleId}>` });
    await dispatch(i);
    assert.ok(lastText(i).includes(roleId), 'the button did not grant the role: ' + lastText(i));
  });

  await acheck('a role menu button posted before the rename still works', async () => {
    // Panels posted months ago carry the OLD custom ids. Dropping them turns
    // every button in every server already running this bot into a dead click.
    const roleId = FAKE(20);
    const i = mockInteraction({ name: '', type: 'button' });
    i.customId = 'roles_announcements';
    i.guild.roles.cache.set(roleId, { id: roleId, toString: () => `<@&${roleId}>` });
    await dispatch(i);
    assert.ok(lastText(i).includes(roleId), 'the legacy custom id was ignored: ' + lastText(i));
  });

  // ------------------------------------------------------------ config paths
  section('F0) every config path the code reads exists in config.example.jsonc');
  {
    const { parseJsonc, getPath } = req('core/jsonc');
    const exampleSrc = fs.readFileSync(path.join(REPO, 'config/config.example.jsonc'), 'utf8');
    const parsed = parseJsonc(exampleSrc, 'config.example.jsonc');

    check('config.example.jsonc parses as JSONC', () => {
      assert.ok(parsed.ok, (parsed.lines || []).join('\n'));
    });

    check('config.example.jsonc carries no Discord ids', () => {
      // It is TRACKED. An id in there is one installation's server shipped to
      // everybody, which is the whole reason this file exists.
      const ids = [...new Set(stripComments(exampleSrc).match(/\b\d{17,20}\b/g) || [])];
      assert.deepStrictEqual(ids, [], 'ids in the shipped defaults: ' + ids.join(', '));
    });

    // Read by the code but deliberately absent from the defaults, with a
    // reason. An exemption is a decision somebody wrote down; a missing path is
    // one nobody noticed.
    const NOT_IN_EXAMPLE = {};

    const used = new Map();
    for (const f of trackedSources('"*.js"')) {
      const src = stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'));
      for (const m of src.matchAll(/config\.get\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
        if (!used.has(m[1])) used.set(m[1], f);
      }
    }

    check('the scan actually found config paths', () => {
      assert.ok(used.size >= 20, `only ${used.size} config paths found, the scan broke`);
    });

    check('no config path is read that the defaults do not define', () => {
      const missing = [...used.keys()]
        .filter(p => !(p in NOT_IN_EXAMPLE))
        // A path under a list of things the operator names themselves cannot
        // be predefined: `roles.<whatever>` and `channels.<whatever>` are
        // looked up by whatever the operator called them.
        .filter(p => !/^(roles|channels)\./.test(p))
        .filter(p => getPath(parsed.value ?? {}, p, undefined) === undefined);
      assert.deepStrictEqual(missing, [], 'read by the code, absent from the defaults: '
        + missing.map(p => `${p} (${used.get(p)})`).join(', '));
    });

    check('every command key used in the code is in the command table', () => {
      const table = new Set(config.commandKeys());
      const keys = new Set();
      for (const f of trackedSources('"*.js"')) {
        const src = stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'));
        for (const m of src.matchAll(/(?:applyMeta\([^,]+,\s*|guard\(interaction,\s*|config\.command\(|optionText\(\s*)['"]([a-z0-9_]+)['"]/g)) {
          keys.add(m[1]);
        }
      }
      assert.ok(keys.size >= 20, `only ${keys.size} command keys found, the scan broke`);
      const missing = [...keys].filter(k => !table.has(k));
      assert.deepStrictEqual(missing, [], 'command used in code but not in the table: ' + missing.join(', '));
    });

    check('every command in the table is actually implemented', () => {
      // The other direction: a key left in the table after the command was
      // removed is a switch that does nothing, which reads as a broken feature.
      const implemented = new Set();
      for (const dir of ['bots/commands/commands', 'bots/minigames/commands']) {
        for (const file of fs.readdirSync(path.join(REPO, dir)).filter(f => f.endsWith('.js'))) {
          const src = fs.readFileSync(path.join(REPO, dir, file), 'utf8');
          for (const m of src.matchAll(/key:\s*['"]([a-z0-9_]+)['"]/g)) implemented.add(m[1]);
        }
      }
      const orphans = config.commandKeys().filter(k => !implemented.has(k));
      assert.deepStrictEqual(orphans, [], 'in the table, implemented nowhere: ' + orphans.join(', '));
    });

    check('every command file declares a key', () => {
      // Without one the command is registered under whatever it happens to be
      // named, and renaming it in the config silently stops routing.
      const missing = [];
      for (const dir of ['bots/commands/commands', 'bots/minigames/commands']) {
        for (const file of fs.readdirSync(path.join(REPO, dir)).filter(f => f.endsWith('.js'))) {
          const src = fs.readFileSync(path.join(REPO, dir, file), 'utf8');
          const keys = [...src.matchAll(/key:\s*['"]/g)].length;
          const execs = [...src.matchAll(/async execute\(/g)].length;
          if (keys < execs) missing.push(`${dir}/${file} (${execs} commands, ${keys} keys)`);
        }
      }
      assert.deepStrictEqual(missing, [], missing.join(', '));
    });

    check('every feature a command hangs off has an explicit switch', () => {
      // `featureEnabled()` treats a missing switch as OFF, `commandKit.enabled()`
      // treats it as ON. A block without one therefore answers differently
      // depending on who asks, and the command would register while the feature
      // reports itself disabled.
      const missing = [];
      for (const dir of ['bots/commands/commands', 'bots/minigames/commands']) {
        for (const file of fs.readdirSync(path.join(REPO, dir)).filter(f => f.endsWith('.js'))) {
          const src = fs.readFileSync(path.join(REPO, dir, file), 'utf8');
          for (const m of src.matchAll(/feature:\s*['\"]([a-zA-Z0-9_]+)['\"]/g)) {
            if (getPath(parsed.value ?? {}, `features.${m[1]}.enabled`, undefined) === undefined) {
              missing.push(`${m[1]} (${dir}/${file})`);
            }
          }
        }
      }
      assert.deepStrictEqual([...new Set(missing)], [], 'feature without an "enabled" in the defaults: ' + missing.join(', '));
    });

    check('a renamed command is registered AND routed under the new name', () => {
      // The whole point of the key/name split. Both halves read the same table,
      // so this proves they cannot drift apart.
      const { applyMeta } = req('core/commandKit');
      const builder = applyMeta(new djs.SlashCommandBuilder(), 'ping');
      assert.strictEqual(builder.toJSON().name, config.command('ping').name);
    });

    check('an invalid configured name falls back instead of throwing', () => {
      // discord.js throws on a bad name, and that throw happens while the
      // command FILE is being required, taking every command in the directory
      // with it and blaming discord.js rather than the setting.
      const { validName } = req('core/commandKit');
      assert.strictEqual(validName('Not A Name', 'ping'), 'ping');
      assert.strictEqual(validName('', 'ping'), 'ping');
      assert.strictEqual(validName('pong', 'ping'), 'pong');
    });
  }

  // ------------------------------------------------------------ env template
  section('F1) .env holds secrets only, and every one is in .env.example');
  {
    // .env.example is what a self-hoster copies. A setting that reaches the
    // code without reaching the template is invisible: nobody can switch it on
    // because nobody knows it exists. DATABASE_URL shipped exactly that way.
    const PATTERN = /process\.env\.([A-Z][A-Z0-9_]*)\b|process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]|_env\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*[,)]/g;

    const NOT_IN_TEMPLATE = {
      SKIP_NETWORK_TESTS: 'a switch for this harness, not a setting an installation has',
      MULTIBOT_CONFIG: 'an override for the config path, used by the harness and by tooling',
      MULTIBOT_TEXTS: 'the same for the message-override file, so a test cannot write into the real one',
      DASHBOARD_DATA_DIR: 'lets a test point the dashboard settings at a throwaway directory',
      GUILD_ID: 'moved into config.jsonc; still read so an old .env keeps working, loudly',
    };

    // The harness itself IS scanned here, unlike everywhere else: it reads
    // switches of its own, and an exemption for one has to stay checkable.
    const envFiles = execSync('git ls-files "*.js"', { cwd: REPO }).toString().trim().split(/\r?\n/)
      .filter(f => f && !GENERATED.some(d => f.startsWith(d)) && fs.existsSync(path.join(REPO, f)));

    const used = new Map();
    for (const f of envFiles) {
      const src = stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'));
      for (const m of src.matchAll(PATTERN)) {
        const name = m[1] || m[2] || m[3];
        if (!used.has(name)) used.set(name, f);
      }
    }

    const template = fs.readFileSync(path.join(REPO, '.env.example'), 'utf8');

    check('the scan actually found the variables', () => {
      assert.ok(used.size >= 6, `only ${used.size} env variables found, the scan broke`);
    });

    check('no variable is read without being in .env.example', () => {
      const missing = [...used.keys()]
        .filter(n => !(n in NOT_IN_TEMPLATE))
        .filter(n => !new RegExp('^' + n + '=', 'm').test(template));
      assert.deepStrictEqual(missing, [], 'read by the code, absent from the template: '
        + missing.map(n => n + ' (' + used.get(n) + ')').join(', '));
    });

    check('an exemption still names a variable the code reads', () => {
      const stale = Object.keys(NOT_IN_TEMPLATE).filter(n => !used.has(n));
      assert.deepStrictEqual(stale, [], 'exempt but nothing reads it any more: ' + stale.join(', '));
    });

    check('.env.example offers credentials and the dashboard, and nothing else', () => {
      // Every id, switch and piece of text about the SERVER moved into
      // config.jsonc; one left behind here is a second home for it, and the two
      // will disagree. The DASHBOARD_* group is the deliberate exception: a bind
      // address and a port describe the machine, not the Discord server, and the
      // dashboard reads them before it has any reason to look at a guild.
      const ALLOWED = /^(COMMANDS_BOT_TOKEN|EVENTS_BOT_TOKEN|MINIGAMES_BOT_TOKEN|DB_HOST|DB_USER|DB_PASS|DB_NAME|DATABASE_URL|DASHBOARD_[A-Z_]+|CLIENT_ID|CLIENT_SECRET|SESSION_SECRET)$/;
      const declared = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]);
      assert.ok(declared.length >= 5, 'the template scan found almost nothing');
      const strays = declared.filter(n => !ALLOWED.test(n));
      assert.deepStrictEqual(strays, [], 'not a secret, belongs in config.jsonc: ' + strays.join(', '));
    });
  }

  // ------------------------------------------------------------ no ids in source
  section('F1b) nothing installation-specific in the tracked source');
  {
    // A fresh clone must not point at anybody's server. A snowflake is 17 to 20
    // digits; test files are excluded because their whole job is to make up ids.
    const SNOWFLAKE = /\b\d{17,20}\b/g;
    const tracked = trackedSources('"*.js" "*.json" "*.jsonc"');

    const offenders = [];
    for (const f of tracked) {
      const found = [...new Set(fs.readFileSync(path.join(REPO, f), 'utf8').match(SNOWFLAKE) || [])];
      if (found.length) offenders.push({ file: f, ids: found });
    }

    check('the scan actually looked at the source', () => {
      assert.ok(tracked.length >= 10, `only ${tracked.length} files scanned`);
    });

    check('no tracked source file carries an id', () => {
      const fresh = offenders.map(o => `${o.file} (${o.ids.join(', ')})`);
      assert.deepStrictEqual(fresh, [], 'ids in the source:\n' + fresh.join('\n'));
    });

    check('no Discord invite link is baked into the source', () => {
      const withInvite = tracked
        .filter(f => /discord\.gg\//.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
      assert.deepStrictEqual(withInvite, [], 'invite link in: ' + withInvite.join(', '));
    });

    // Colour, logo, bot name, link buttons, the rules text and the support
    // guides are all configuration now. The debt list is EMPTY, and an entry
    // that outlived its cleanup would quietly permit brand text again.
    const BRAND_DEBT = {
      'package.json': 'the repository description, never shown to a Discord user',
    };
    const BRAND = /msk-scripts\.de|MSK[ -]Scripts/i;

    const branded = tracked
      .filter(f => BRAND.test(stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'))));

    check('no NEW file started carrying brand text', () => {
      const fresh = branded.filter(f => !(f in BRAND_DEBT));
      assert.deepStrictEqual(fresh, [], 'brand text in: ' + fresh.join(', '));
    });

    check('the brand-debt list still describes reality', () => {
      const stale = Object.keys(BRAND_DEBT).filter(f => !branded.includes(f));
      assert.deepStrictEqual(stale, [], 'listed as debt but already clean: ' + stale.join(', '));
    });

    check('nothing the bot sends to Discord hardcodes a brand colour or logo', () => {
      // Scoped to the BOT's source. web/ is the dashboard, an operator-facing
      // panel whose palette is a design-system default, lives in index.css and
      // is overridable at runtime from its own Appearance page. A colour there
      // reaches nobody's Discord server; a colour in an embed reaches everyone's,
      // which is what this check is actually about.
      for (const f of tracked.filter(x => !x.startsWith('web/'))) {
        const src = stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'));
        assert.ok(!/5EB131/i.test(src), 'the brand green is back in ' + f);
        assert.ok(!/cdn.msk-scripts.de/i.test(src), 'the brand logo URL is back in ' + f);
      }
    });
  }

  // ------------------------------------------------------------ messages
  section('F1c) every message the code asks for exists in the catalogue');
  {
    const enPath = path.join(REPO, 'locales/en.json');
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const { leafPaths, getPath } = req('core/jsonc');

    const localeFiles = fs.readdirSync(path.join(REPO, 'locales')).filter(f => f.endsWith('.json'));

    check('the catalogue is a real catalogue', () => {
      assert.ok(leafPaths(en).length >= 200, 'suspiciously few keys in locales/en.json');
    });

    check('every shipped translation has exactly the English key set', () => {
      // A translation missing a key falls back to English at runtime, which is
      // fine to READ but invisible: nobody notices the file is incomplete. An
      // EXTRA key is worse, it is a message no code path ever asks for.
      const base = new Set(leafPaths(en));
      for (const file of localeFiles.filter(f => f !== 'en.json')) {
        const other = JSON.parse(fs.readFileSync(path.join(REPO, 'locales', file), 'utf8'));
        const keys = new Set(leafPaths(other));
        const missing = [...base].filter(k => !keys.has(k));
        const extra = [...keys].filter(k => !base.has(k));
        assert.deepStrictEqual(missing, [], `${file} is missing: ` + missing.slice(0, 8).join(', '));
        assert.deepStrictEqual(extra, [], `${file} has keys English does not: ` + extra.slice(0, 8).join(', '));
      }
    });

    const asked = new Map();
    for (const f of trackedSources('"*.js"')) {
      const src = stripComments(fs.readFileSync(path.join(REPO, f), 'utf8'));
      for (const m of src.matchAll(/\b(?:t|tList|tData|raw)\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
        if (!asked.has(m[1])) asked.set(m[1], f);
      }
    }

    check('the message scan actually found keys', () => {
      assert.ok(asked.size >= 80, `only ${asked.size} message keys found, the scan broke`);
    });

    check('no message key is asked for that the catalogue does not have', () => {
      const missing = [...asked.keys()].filter(k => getPath(en, k, undefined) === undefined);
      assert.deepStrictEqual(missing, [], 'asked for, not in locales/en.json: '
        + missing.map(k => `${k} (${asked.get(k)})`).join(', '));
    });

    check('nothing asked for a missing key while the commands were built', () => {
      // The scan above only sees literal keys. This catches the computed ones,
      // e.g. t(`games.rps.${choice}`), for every path the build actually took.
      assert.deepStrictEqual(i18n.missing(), [], 'missing at runtime: ' + i18n.missing().join(', '));
    });

    check('the text override file is valid and empty by default', () => {
      const { parseJsonc } = req('core/jsonc');
      const src = fs.readFileSync(path.join(REPO, 'config/texts.example.jsonc'), 'utf8');
      const result = parseJsonc(src, 'texts.example.jsonc');
      assert.ok(result.ok, (result.lines || []).join('\n'));
      assert.deepStrictEqual(result.value, {}, 'the shipped override file overrides something');
    });

    check('an override actually overrides, in every language', () => {
      const { deepMerge } = req('core/jsonc');
      const merged = deepMerge({ common: { none: 'a', unknown: 'b' } }, { common: { none: 'z' } });
      assert.strictEqual(merged.common.none, 'z');
      assert.strictEqual(merged.common.unknown, 'b', 'the merge dropped a sibling key');
    });

    check('a list in the catalogue replaces rather than merges', () => {
      // Arrays are lists the operator owns end to end: the rules, the guides,
      // the 8-ball answers. Merging by index would leave the shipped fourth
      // entry hanging under a list of three.
      const { deepMerge } = req('core/jsonc');
      assert.deepStrictEqual(deepMerge({ a: [1, 2, 3] }, { a: [9] }).a, [9]);
    });

    check('a missing key reads as the key, never as an empty string', () => {
      // An empty string is a blank embed field, which Discord then refuses with
      // an error about a field the code says is fine.
      assert.strictEqual(i18n.t('no.such.key.at.all'), 'no.such.key.at.all');
      assert.deepStrictEqual(i18n.tList('no.such.list'), []);
    });

    check('an unfilled placeholder is left standing, not blanked', () => {
      // "{user} joined" with no user reads as an obvious mistake. " joined"
      // reads as a bug in the bot.
      assert.ok(i18n.t('guess.correctBody', { number: 5 }).includes('{user}'));
    });
  }

  // ------------------------------------------------------------ builders
  section('F) discord.js builders still behave');
  const { makeEmbed, linkRow, presenceOptions } = req('core/utils');
  check('makeEmbed produces a serializable embed', () => {
    const e = makeEmbed({ title: 'T', description: 'D', guildName: 'Example' });
    const j = e.toJSON();
    assert.strictEqual(j.title, 'T');
    assert.ok(j.footer.text.includes('Example'));
  });

  check('an unconfigured thumbnail means no thumbnail, not an empty one', () => {
    // setThumbnail('') is an invalid-URL error from Discord, not a quiet no-op,
    // so every embed the bot sends would fail on an installation with no logo.
    // This used to be hidden by one company's logo being the hardcoded default.
    const j = makeEmbed({ title: 'T', guildName: 'Example' }).toJSON();
    if (config.thumbnailUrl()) assert.strictEqual(j.thumbnail.url, config.thumbnailUrl());
    else {
      assert.strictEqual(j.thumbnail, undefined, 'a thumbnail appeared without one being configured');
      assert.strictEqual(j.footer.icon_url, undefined, 'a footer icon appeared without one being configured');
    }
  });

  check('an explicit thumbnail still wins', () => {
    const j = makeEmbed({ title: 'T', thumbnail: 'https://example.com/a.png' }).toJSON();
    assert.strictEqual(j.thumbnail.url, 'https://example.com/a.png');
  });

  check('no configured links means NO button row, not an empty one', () => {
    // Discord refuses an ActionRow without components, so an empty row is a
    // panel that fails to post rather than a panel without buttons.
    assert.deepStrictEqual(linkRow(), []);
  });

  check('a configured link becomes exactly one row', () => {
    const original = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify({
      ...original,
      branding: { links: [{ label: 'Site', url: 'https://example.com' }] },
    }), 'utf8');
    config.reload();
    try {
      const rows = linkRow();
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].toJSON().components.length, 1);
      // A link without a URL is dropped rather than crashing the builder.
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify({
        ...original,
        branding: { links: [{ label: 'Site', url: '' }, { label: '', url: 'https://example.com' }] },
      }), 'utf8');
      config.reload();
      assert.deepStrictEqual(linkRow(), []);
    } finally {
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(original, null, 2), 'utf8');
      config.reload();
    }
  });

  check('an unset presence text means no presence at all', () => {
    // Not a fallback to something: every installation of this bot used to
    // advertise one company's name under its own bot.
    assert.strictEqual(presenceOptions('commands'), null);
    const events = presenceOptions('events', { guild: 'Example' });
    assert.ok(events === null || typeof events.activities[0].name === 'string');
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

  // ------------------------------------------------------------ jsonc
  section('F3) the config parser');
  {
    const { stripJsonComments, parseJsonc, deepMerge } = req('core/jsonc');

    check('comments go, and the line layout survives', () => {
      // The stripper blanks rather than deletes, so a JSON.parse offset still
      // maps onto the line the operator is looking at. Deleting shifts every
      // position after the first comment and the caret points at an innocent
      // line, which is worse than no caret at all.
      const src = '{\n  // a comment\n  "a": 1\n}';
      const out = stripJsonComments(src);
      assert.strictEqual(out.length, src.length);
      assert.strictEqual(out.split('\n').length, src.split('\n').length);
      assert.deepStrictEqual(JSON.parse(out), { a: 1 });
    });

    check('a // inside a string is not a comment', () => {
      const parsed = parseJsonc('{"url": "https://example.com/x"}');
      assert.ok(parsed.ok);
      assert.strictEqual(parsed.value.url, 'https://example.com/x');
    });

    check('an escaped quote does not end the string', () => {
      const parsed = parseJsonc('{"a": "say \\"hi\\" // not a comment"}');
      assert.ok(parsed.ok, (parsed.lines || []).join('\n'));
      assert.ok(parsed.value.a.includes('//'));
    });

    check('a trailing comma is forgiven', () => {
      assert.deepStrictEqual(parseJsonc('{"a": 1, "b": [1, 2,], }').value, { a: 1, b: [1, 2] });
    });

    check('a syntax error names the line and points at the column', () => {
      const result = parseJsonc('{\n  "a": 1\n  "b": 2\n}', 'x.jsonc');
      assert.ok(!result.ok, 'that should not have parsed');
      const text = result.lines.join('\n');
      assert.match(text, /line 3/);
      assert.match(text, /\^/);
    });

    check('a key the operator never mentions keeps its default', () => {
      // The reason the example file is also the defaults: an update that adds a
      // setting must not require editing an existing installation's file.
      const merged = deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 9 } });
      assert.deepStrictEqual(merged, { a: { b: 1, c: 9 } });
    });
  }

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
    } finally { try { c2.destroy(); } catch { /* nothing to clean up */ } }
  });

  // ------------------------------------------------------------ points
  section('G) points system, database backed');
  {
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
      check('the shipped defaults define points and rewards', () => {
        const points = config.get('features.minigames.points', {});
        assert.ok(Object.keys(points).length >= 8, 'no per-game point values');
        assert.ok(pm.rewards().length >= 1, 'no rewards');
      });

      check('a reward names a role, not an env variable', () => {
        // points_config.json was TRACKED, so the four reward role ids in it
        // were one installation's roles shipped to everybody. Working around
        // that needed a REWARD_<TIER>_ROLE_ID variable per tier, resolved by a
        // computed name that no check could see.
        for (const r of pm.rewards()) assert.strictEqual(typeof r.role, 'string');
        const src = fs.readFileSync(path.join(REPO, 'core/pointsManager.js'), 'utf8');
        assert.ok(!/REWARD_.*_ROLE_ID/.test(stripComments(src)), 'the tier indirection is back');
        assert.ok(!fs.existsSync(path.join(REPO, 'bots/minigames/points_config.json')),
          'points_config.json is back, and it is tracked');
      });

      check('every game the config knows has an implementation', () => {
        const dir = path.join(REPO, 'bots/minigames/commands');
        const files = new Set(fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)));
        const missing = Object.keys(config.get('features.minigames.games', {})).filter(g => !files.has(g));
        assert.deepStrictEqual(missing, [], 'switchable but not implemented: ' + missing.join(', '));
      });

      check('getPts traverses the config and answers 0 for the unknown', () => {
        assert.strictEqual(typeof pm.getPts('slots', 'jackpot'), 'number');
        assert.strictEqual(pm.getPts('slots', 'jackpot'), 50);
        assert.strictEqual(pm.getPts('trivia', 'hard', 'win'), 20);
        assert.strictEqual(pm.getPts('nope', 'nope'), 0);
      });

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
        // IF NOT EXISTS wrong is a silently emptied installation.
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
        // to check, expensive to notice in production. The dispatch tests do
        // NOT catch it, verified by removing an await and watching them pass.
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
    assert.ok(/token|unauthorized|401/i.test(msg), 'did not reach Discord, got instead: ' + msg);
  });

  try { realClient?.destroy(); } catch { /* nothing to clean up */ }
  try { fs.rmSync(path.dirname(FIXTURE_PATH), { recursive: true, force: true }); } catch { /* temp dir */ }

  console.log('\n' + '='.repeat(60));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) console.log('  failed: ' + failures.join(', '));
  console.log('='.repeat(60));
  process.exitCode = fail ? 1 : 0;
  // Give discord.js' teardown a tick. Calling process.exit() straight after
  // destroy() trips a libuv assertion on Windows.
  setTimeout(() => process.exit(process.exitCode), 100).unref();
})();
