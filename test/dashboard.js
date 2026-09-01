// Dashboard harness. Run with `npm run test:dashboard`.
//
// Starts the real Express app on a loopback port and drives it over HTTP with
// real cookies. THE DISCORD CALLS ARE STUBBED and nothing else is: the auth
// chain, the CSRF check, the permission gates, the config writer and the
// database all run for real. Stubbing the permission layer instead would test
// the stub.
//
// Everything it writes goes into a temp directory: its own config.jsonc, its own
// .env, its own dashboard settings, and an in-memory database. A test run
// cannot touch the real installation.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..');
process.chdir(REPO);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'multibot-dash-'));
/**
 * Distinct fake snowflakes.
 *
 * BUILT AS A STRING, NOT BY ADDING TO A NUMBER. `900000000000001000 + n` is
 * past Number.MAX_SAFE_INTEGER, so every n produced the SAME id and half the
 * checks below silently compared a value with itself. That is the repo's own
 * "snowflakes are strings, always" rule, broken in the one place nobody was
 * looking: the test helper.
 */
const FAKE = (n) => `9000000000000${String(20000 + n)}`;

const OWNER = FAKE(1);
const STAFF = FAKE(2);
const OUTSIDER = FAKE(3);
const STAFF_ROLE = FAKE(4);

// ── the fixture installation ─────────────────────────────────────────────────
const CONFIG_PATH = path.join(TMP, 'config.jsonc');
fs.writeFileSync(CONFIG_PATH, JSON.stringify({
  guildId: FAKE(0),
  roles: { team: STAFF_ROLE },
  channels: { log: FAKE(10) },
}, null, 2));

process.env.MULTIBOT_CONFIG = CONFIG_PATH;
// Without this the message-override checks below write into the REAL
// config/texts.jsonc: MULTIBOT_CONFIG only redirects the config file.
process.env.MULTIBOT_TEXTS = path.join(TMP, 'texts.jsonc');
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.DASHBOARD_DATA_DIR = path.join(TMP, 'data');
process.env.SESSION_SECRET = crypto.randomBytes(48).toString('base64url');
process.env.CLIENT_SECRET = 'test-client-secret';
process.env.CLIENT_ID = '123456789012345678';
// Port 0 asks the OS for a free one, so nothing here can collide with a
// dashboard the developer happens to have running.
process.env.DASHBOARD_ENABLED = 'true';
process.env.DASHBOARD_HOST = '127.0.0.1';
process.env.DASHBOARD_PORT = '0';
process.env.DASHBOARD_PUBLIC_URL = '';
process.env.DASHBOARD_ALLOW_INSECURE = '';
process.env.COMMANDS_BOT_TOKEN = 'test-token';

let pass = 0, fail = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n         ' + (e && e.message)); }
}
const section = (t) => console.log('\n' + t);

// ── stubs ────────────────────────────────────────────────────────────────────

const discord = require(path.join(REPO, 'core/dashboard/discord'));

const MEMBERS = {
  [OWNER]:    { inGuild: true, isOwner: true, roleIds: [], nickname: null, guildName: 'Test Guild' },
  [STAFF]:    { inGuild: true, isOwner: false, roleIds: [STAFF_ROLE], nickname: null, guildName: 'Test Guild' },
  [OUTSIDER]: { inGuild: false, isOwner: false, roleIds: [], nickname: null, guildName: 'Test Guild' },
};

discord.resolveMemberContext = async (guildId, userId) =>
  MEMBERS[userId] ?? { inGuild: false, isOwner: false, roleIds: [], nickname: null, guildName: 'Test Guild' };
discord.getGuildLookups = async () => ({
  roles: [{ id: STAFF_ROLE, name: 'Team', color: 0 }],
  channels: [{ id: FAKE(10), name: 'log', type: 0 }],
  categories: [],
});
discord.resolveUsers = async (guildId, ids) =>
  Object.fromEntries(ids.map(id => [id, { id, name: `User ${id.slice(-2)}`, avatar: null, inGuild: true }]));

/** A supervisor stand-in. The real one forks a bot, which a test must not do. */
const supervisor = new (require('events').EventEmitter)();
Object.assign(supervisor, {
  status: 'stopped',
  calls: [],
  getState() { return { status: this.status, pid: null, startedAt: null, uptimeMs: 0 }; },
  getLogs() { return ['line one', 'line two']; },
  async start() { this.calls.push('start'); this.status = 'running'; return { ok: true }; },
  async stop() { this.calls.push('stop'); this.status = 'stopped'; return { ok: true }; },
  async restart() { this.calls.push('restart'); this.status = 'running'; return { ok: true }; },
  async update() { this.calls.push('update'); return { ok: true, output: 'done' }; },
});

// ── the server under test ────────────────────────────────────────────────────

const sec = require(path.join(REPO, 'core/dashboard/security'));
const db = require(path.join(REPO, 'core/db'));
const { loadDashboardConfig } = require(path.join(REPO, 'core/dashboard/config'));
const { startServer } = require(path.join(REPO, 'core/dashboard/server'));

let baseUrl = '';

/** A signed-in browser: session cookie plus the matching CSRF pair. */
function client(userId) {
  const session = sec.createSession({ userId, name: 'Tester', avatar: null });
  const csrf = sec.createCsrfToken();
  const cookie = `${sec.SESSION_COOKIE}=${session}; ${sec.CSRF_COOKIE}=${csrf}`;

  return async (method, url, body, extraHeaders = {}) => {
    const headers = { cookie, ...extraHeaders };
    if (method !== 'GET') {
      headers['content-type'] = 'application/json';
      if (!('x-csrf-token' in extraHeaders)) headers[sec.CSRF_HEADER] = csrf;
    }
    const res = await fetch(`${baseUrl}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* not every response is JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  };
}

const anonymous = async (method, url) => {
  const res = await fetch(`${baseUrl}${url}`, { method, redirect: 'manual' });
  return { status: res.status, headers: res.headers };
};

(async () => {
  await db.connect();
  // The owner is implicit; the staff role gets a couple of permissions.
  await db.setAccessRow({
    subjectType: 'role', subjectId: STAFF_ROLE,
    permissions: ['config.view', 'bot.control'], active: true, label: 'Team',
  });

  const cfg = loadDashboardConfig();
  const { server, port } = await startServer({ config: cfg, supervisor });
  baseUrl = `http://127.0.0.1:${port}`;

  // ── auth ───────────────────────────────────────────────────────────────────
  section('A) authentication');

  await check('an anonymous API call is 401, not a redirect', async () => {
    const res = await anonymous('GET', '/api/status');
    assert.strictEqual(res.status, 401);
  });

  await check('/auth/login redirects to Discord and sets a state cookie', async () => {
    const res = await anonymous('GET', '/auth/login');
    assert.strictEqual(res.status, 302);
    assert.match(res.headers.get('location') ?? '', /^https:\/\/discord\.com\/oauth2\/authorize/);
    assert.match(String(res.headers.getSetCookie?.() ?? ''), /mb_oauth_state=/);
  });

  await check('a forged session cookie is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/status`, {
      headers: { cookie: `${sec.SESSION_COOKIE}=eyJhIjoxfQ.not-a-real-signature` },
    });
    assert.strictEqual(res.status, 401);
  });

  await check('somebody who is not in the guild gets 403', async () => {
    const res = await client(OUTSIDER)('GET', '/api/status');
    assert.strictEqual(res.status, 403);
  });

  await check('a member with no permissions is turned away as staff-only', async () => {
    const nobody = FAKE(9);
    MEMBERS[nobody] = { inGuild: true, isOwner: false, roleIds: [], nickname: null, guildName: 'Test Guild' };
    const res = await client(nobody)('GET', '/api/status');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.portalClosed, true);
  });

  await check('/api/me reports the owner as owner with every permission', async () => {
    const res = await client(OWNER)('GET', '/api/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isOwner, true);
    const { PERMISSIONS } = require(path.join(REPO, 'core/dashboard/permissions'));
    assert.deepStrictEqual([...res.body.permissions].sort(), [...PERMISSIONS].sort());
  });

  await check('a role row grants exactly what it lists, and nothing else', async () => {
    const res = await client(STAFF)('GET', '/api/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isOwner, false);
    assert.deepStrictEqual([...res.body.permissions].sort(), ['bot.control', 'config.view']);
  });

  // ── CSRF ───────────────────────────────────────────────────────────────────
  section('B) CSRF and origin');

  await check('a write without the CSRF header is refused', async () => {
    const res = await client(OWNER)('PATCH', '/api/config', { patch: {} }, { 'x-csrf-token': '' });
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /CSRF/);
  });

  await check('a write from another origin is refused', async () => {
    const res = await client(OWNER)('PATCH', '/api/config', { patch: {} }, { origin: 'https://evil.example' });
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /origin/i);
  });

  await check('a GET needs no CSRF token', async () => {
    const res = await client(OWNER)('GET', '/api/status');
    assert.strictEqual(res.status, 200);
  });

  // ── permissions ────────────────────────────────────────────────────────────
  section('C) permission gates');

  await check('config.view may read the configuration', async () => {
    const res = await client(STAFF)('GET', '/api/config');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.defaults.features, 'no defaults came back');
  });

  await check('config.view may NOT write it', async () => {
    const res = await client(STAFF)('PATCH', '/api/config', { patch: { 'branding.name': 'Nope' } });
    assert.strictEqual(res.status, 403);
  });

  await check('bot.control may drive the bot', async () => {
    const res = await client(STAFF)('POST', '/api/bot/restart');
    assert.strictEqual(res.status, 200);
    assert.ok(supervisor.calls.includes('restart'));
  });

  await check('access.manage is needed to see the access list', async () => {
    assert.strictEqual((await client(STAFF)('GET', '/api/access')).status, 403);
    assert.strictEqual((await client(OWNER)('GET', '/api/access')).status, 200);
  });

  await check('only the owner may pull and install a new version', async () => {
    // A permission that lets somebody restart a process is not the same as one
    // that runs whatever the remote happens to contain.
    const res = await client(STAFF)('POST', '/api/bot/update');
    assert.strictEqual(res.status, 403);
  });

  // ── config writing ─────────────────────────────────────────────────────────
  section('D) writing the configuration');

  await check('a patch lands in the override file', async () => {
    const res = await client(OWNER)('PATCH', '/api/config', { patch: { 'branding.name': 'Test Brand' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.overrides.branding.name, 'Test Brand');
    assert.match(fs.readFileSync(CONFIG_PATH, 'utf8'), /Test Brand/);
  });

  await check('the running config sees it immediately', async () => {
    const config = require(path.join(REPO, 'core/config'));
    assert.strictEqual(config.brandName(), 'Test Brand');
  });

  await check('setting a value back to the default REMOVES it from the override', async () => {
    // The whole reason the file is a difference and not a copy: a value pinned
    // at today's default would never pick up tomorrow's better one.
    const res = await client(OWNER)('PATCH', '/api/config', { patch: { 'branding.color': '#5865F2' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.overrides.branding?.color, undefined, 'the default was written into the override');
  });

  await check('an override object left empty is cleaned up', async () => {
    await client(OWNER)('PATCH', '/api/config', { patch: { 'branding.name': '' } });
    const res = await client(OWNER)('GET', '/api/config');
    assert.strictEqual(res.body.overrides.branding, undefined, 'an empty branding object was left behind');
  });

  await check('raw text that does not parse is refused with a line number', async () => {
    const res = await client(OWNER)('PUT', '/api/config/raw', { text: '{ "a": 1\n  "b": 2 }' });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /line 2/);
  });

  await check('raw text that does parse is written, comments and all', async () => {
    const text = '// kept\n{\n  "guildId": "' + FAKE(0) + '",\n  "language": "de"\n}\n';
    const res = await client(OWNER)('PUT', '/api/config/raw', { text });
    assert.strictEqual(res.status, 200);
    assert.match(fs.readFileSync(CONFIG_PATH, 'utf8'), /\/\/ kept/);
    const config = require(path.join(REPO, 'core/config'));
    assert.strictEqual(config.language(), 'de');
  });

  await check('the previous file is kept as .bak', async () => {
    assert.ok(fs.existsSync(`${CONFIG_PATH}.bak`), 'no backup was written');
  });

  // ── messages ───────────────────────────────────────────────────────────────
  section('E) message overrides');

  await check('every catalogue key is listed with its shipped wording', async () => {
    const res = await client(OWNER)('GET', '/api/texts');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.entries.length >= 200, `only ${res.body.entries.length} entries`);
    const entry = res.body.entries.find(e => e.key === 'common.noPermission');
    assert.ok(entry, 'common.noPermission is missing from the list');
    assert.strictEqual(entry.overridden, false);
  });

  await check('an override takes effect and is marked as one', async () => {
    const res = await client(OWNER)('PATCH', '/api/texts', { patch: { 'common.noPermission': 'Staff only.' } });
    assert.strictEqual(res.status, 200);
    const i18n = require(path.join(REPO, 'core/i18n'));
    assert.strictEqual(i18n.t('common.noPermission'), 'Staff only.');
    const after = await client(OWNER)('GET', '/api/texts');
    assert.strictEqual(after.body.entries.find(e => e.key === 'common.noPermission').overridden, true);
  });

  await check('clearing an override restores the shipped wording', async () => {
    // An empty string means "back to the shipped text", not "an override that
    // happens to be blank": a blank embed field is refused by Discord.
    await client(OWNER)('PATCH', '/api/texts', { patch: { 'common.noPermission': '' } });
    const i18n = require(path.join(REPO, 'core/i18n'));
    assert.notStrictEqual(i18n.t('common.noPermission'), 'Staff only.');
    assert.ok(i18n.t('common.noPermission').length > 0, 'the message came back empty');
    const after = await client(OWNER)('GET', '/api/texts');
    assert.strictEqual(after.body.entries.find(e => e.key === 'common.noPermission').overridden, false);
  });

  // ── .env ───────────────────────────────────────────────────────────────────
  section('F) the .env editor');

  await check('a secret is reported as set, never sent back', async () => {
    const res = await client(OWNER)('GET', '/api/env');
    assert.strictEqual(res.status, 200);
    const token = res.body.keys.find(k => k.key === 'COMMANDS_BOT_TOKEN');
    assert.strictEqual(token.secret, true);
    assert.strictEqual(token.value, null, 'a token was sent to the browser');
  });

  await check('a key outside the allowlist is refused', async () => {
    // .env is the file with the tokens in it. A route that can write any key
    // there can write anything.
    const res = await client(OWNER)('PATCH', '/api/env', { patch: { SESSION_SECRET: 'x' } });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /SESSION_SECRET/);
  });

  // ── access ─────────────────────────────────────────────────────────────────
  section('G) managing access');

  await check('a new role row shows up in the list', async () => {
    const other = FAKE(20);
    const put = await client(OWNER)('PUT', '/api/access', {
      subjectType: 'role', subjectId: other, permissions: ['points.view'], active: true, label: 'Helpers',
    });
    assert.strictEqual(put.status, 200);
    const list = await client(OWNER)('GET', '/api/access');
    assert.ok(list.body.rows.some(r => r.subjectId === other && r.permissions.includes('points.view')));
  });

  await check('an unknown permission is refused', async () => {
    const res = await client(OWNER)('PUT', '/api/access', {
      subjectType: 'role', subjectId: FAKE(21), permissions: ['everything'],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Unknown permission/);
  });

  await check('a subject id that is not a snowflake is refused', async () => {
    const res = await client(OWNER)('PUT', '/api/access', {
      subjectType: 'role', subjectId: 'admins', permissions: [],
    });
    assert.strictEqual(res.status, 400);
  });

  await check('nobody can escalate their own permissions', async () => {
    // Granting to OTHERS is fine; granting to yourself is how one compromised
    // account with access.manage becomes full control.
    await db.setAccessRow({
      subjectType: 'user', subjectId: STAFF, permissions: ['access.manage'], active: true, label: null,
    });
    const res = await client(STAFF)('PUT', '/api/access', {
      subjectType: 'user', subjectId: STAFF, permissions: ['access.manage', 'config.edit'], active: true,
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /grant yourself/);
  });

  await check('nobody can lock themselves out', async () => {
    const res = await client(STAFF)('PUT', '/api/access', {
      subjectType: 'user', subjectId: STAFF, permissions: [], active: true,
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Manage permissions/);
  });

  await check('deleting a row works and 404s the second time', async () => {
    const other = FAKE(20);
    assert.strictEqual((await client(OWNER)('DELETE', `/api/access/role/${other}`)).status, 200);
    assert.strictEqual((await client(OWNER)('DELETE', `/api/access/role/${other}`)).status, 404);
  });

  // ── bot control and points ─────────────────────────────────────────────────
  section('H) bot control, points, settings');

  await check('the log buffer comes back', async () => {
    const res = await client(OWNER)('GET', '/api/bot/logs');
    assert.deepStrictEqual(res.body.lines, ['line one', 'line two']);
  });

  await check('points can be adjusted and read back', async () => {
    const user = FAKE(30);
    const res = await client(OWNER)('POST', `/api/points/${user}`, { delta: 42 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.new, 42);
    const list = await client(OWNER)('GET', '/api/points');
    assert.ok(list.body.rows.some(r => r.userId === user && r.balance === 42));
  });

  await check('a zero adjustment is refused rather than pretending to work', async () => {
    const res = await client(OWNER)('POST', `/api/points/${FAKE(30)}`, { delta: 0 });
    assert.strictEqual(res.status, 400);
  });

  await check('the accent colour round trips and rejects nonsense', async () => {
    assert.strictEqual((await client(OWNER)('PUT', '/api/settings', { accent: '#123456' })).status, 200);
    assert.strictEqual((await client(OWNER)('GET', '/api/settings')).body.accent, '#123456');
    assert.strictEqual((await client(OWNER)('PUT', '/api/settings', { accent: 'red' })).status, 400);
  });

  await check('the pre-login appearance is served without a session', async () => {
    const res = await fetch(`${baseUrl}/dashboard-settings.json`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).accent, '#123456');
  });

  // ── the tiles ──────────────────────────────────────────────────────────────
  section('I) the feature tiles');

  await check('every feature reports off, ready or incomplete', async () => {
    const res = await client(OWNER)('GET', '/api/status');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.features.length >= 10, 'suspiciously few features');
    for (const f of res.body.features) {
      assert.ok(['off', 'ready', 'incomplete'].includes(f.state), `${f.id} is "${f.state}"`);
    }
  });

  await check('a feature switched on without its channel reads as incomplete', async () => {
    // The failure this whole layer exists to make visible: enabled, and doing
    // nothing at all, silently.
    await client(OWNER)('PATCH', '/api/config', {
      patch: { 'features.memberCount.enabled': true, 'channels.memberCount': '' },
    });
    const res = await client(OWNER)('GET', '/api/status');
    const tile = res.body.features.find(f => f.id === 'memberCount');
    assert.strictEqual(tile.state, 'incomplete');
    assert.ok(tile.missing.includes('features.memberCount.channelId'));
  });

  await check('filling it in flips the tile to ready', async () => {
    await client(OWNER)('PATCH', '/api/config', { patch: { 'channels.memberCount': FAKE(11) } });
    const res = await client(OWNER)('GET', '/api/status');
    assert.strictEqual(res.body.features.find(f => f.id === 'memberCount').state, 'ready');
  });

  await check('a bonus role saved in the panel reaches the points system', async () => {
    // The whole path in one go: the form writes a list of objects, the file
    // takes it, the running config reads it back and the points system applies
    // it. Anything in between silently dropping the row would be invisible on
    // screen, because the panel shows what you typed either way.
    await client(OWNER)('PATCH', '/api/config', {
      // A raw id rather than a name from the `roles` block, because the raw
      // editor above replaced the whole file and that block is gone by now.
      patch: { 'features.minigames.multipliers': [{ role: STAFF_ROLE, factor: 2 }] },
    });
    const pm = require(path.join(REPO, 'core/pointsManager'));
    const member = { roles: { cache: new Map([[STAFF_ROLE, {}]]) } };
    assert.strictEqual(pm.multiplierFor(member), 2, 'the saved bonus never arrived');
    assert.strictEqual(pm.applyMultiplier(member, 10), 20);
  });

  await check('a bonus row without a role makes the tile incomplete', async () => {
    // A row nobody can match pays nobody anything and reports nothing, which is
    // the exact shape of failure the tiles exist for.
    await client(OWNER)('PATCH', '/api/config', {
      patch: { 'features.minigames.multipliers': [{ role: '', factor: 2 }] },
    });
    const res = await client(OWNER)('GET', '/api/status');
    const tile = res.body.features.find(f => f.id === 'minigames');
    assert.strictEqual(tile.state, 'incomplete');
    assert.ok(tile.missing.includes('features.minigames.multipliers'));
    await client(OWNER)('PATCH', '/api/config', { patch: { 'features.minigames.multipliers': [] } });
  });

  await check('a feature switched off is "off", not "incomplete"', async () => {
    // A feature somebody turned off is not a problem to be fixed, and reporting
    // it as one is how a list of warnings becomes noise nobody reads.
    await client(OWNER)('PATCH', '/api/config', { patch: { 'features.autoReply.enabled': false } });
    const res = await client(OWNER)('GET', '/api/status');
    assert.strictEqual(res.body.features.find(f => f.id === 'autoReply').state, 'off');
  });

  // ──────────────────────────────────────────────────────────────────────────
  section('J) the panel translations');

  // The panel's own language is a BROWSER concern, so none of this is reachable
  // over HTTP. What is worth checking here is the contract between the server
  // and the bundles: features.js and permissions.js name things in English, and
  // the bundles translate them BY THAT NAME. A rename on the server is silent
  // otherwise, because a missing key legitimately falls back to English.
  const { lookup, resolve } = await import('../web/src/i18n-core.js');
  const { FEATURES } = require(path.join(REPO, 'core/dashboard/features'));
  const { PERMISSIONS: PERMS } = require(path.join(REPO, 'core/dashboard/permissions'));
  const bundle = (code) =>
    JSON.parse(fs.readFileSync(path.join(REPO, 'web', 'src', 'locales', code + '.json'), 'utf8'));
  const EN = bundle('en');
  const DE = bundle('de');

  // A separator no key can contain, so "a.b" nested under "x" never collides
  // with a literal key "a" holding "b".
  const SEP = String.fromCharCode(31);
  const flatKeys = (node, prefix = '') => Object.entries(node).flatMap(([k, v]) => (
    v && typeof v === 'object' && !Array.isArray(v) ? flatKeys(v, prefix + k + SEP) : [prefix + k]
  ));

  await check('every locale bundle carries the same keys', () => {
    // A key only English has shows English on a German panel: not a crash, and
    // therefore invisible until somebody notices one label in the wrong
    // language. The two files are written together, so drift is a mistake.
    const en = new Set(flatKeys(EN));
    const de = new Set(flatKeys(DE));
    const onlyEn = [...en].filter(k => !de.has(k));
    const onlyDe = [...de].filter(k => !en.has(k));
    assert.deepStrictEqual(onlyEn, [], 'only in en: ' + onlyEn.join(', '));
    assert.deepStrictEqual(onlyDe, [], 'only in de: ' + onlyDe.join(', '));
  });

  await check('a key whose own name contains dots is found', () => {
    // permissions.config.view is ONE key "config.view" inside "permissions",
    // not three levels. Splitting naively on every dot walks to
    // permissions.config, finds nothing, and every label falls back to English.
    assert.strictEqual(typeof lookup(DE, 'permissions.config.view'), 'string');
    assert.strictEqual(typeof lookup(DE, 'fields.features.rules.button.label.label'), 'string');
  });

  await check('every feature tile is translated in every language', () => {
    for (const feature of FEATURES) {
      for (const [code, b] of [['en', EN], ['de', DE]]) {
        for (const part of ['label', 'description']) {
          const key = `features.${feature.id}.${part}`;
          assert.strictEqual(typeof lookup(b, key), 'string', `${code} is missing ${key}`);
        }
      }
    }
  });

  await check('every config field is translated in every language', () => {
    for (const feature of FEATURES) {
      for (const field of feature.fields ?? []) {
        if (!field.path) continue;
        for (const [code, b] of [['en', EN], ['de', DE]]) {
          const key = `fields.${field.path}.label`;
          assert.strictEqual(typeof lookup(b, key), 'string', `${code} is missing ${key}`);
          if (field.help) {
            const helpKey = `fields.${field.path}.help`;
            assert.strictEqual(typeof lookup(b, helpKey), 'string', `${code} is missing ${helpKey}`);
          }
        }
      }
    }
  });

  await check('every permission is translated in every language', () => {
    for (const permission of PERMS) {
      for (const [code, b] of [['en', EN], ['de', DE]]) {
        const key = `permissions.${permission}`;
        assert.strictEqual(typeof lookup(b, key), 'string', `${code} is missing ${key}`);
      }
    }
  });

  await check('a miss falls back to English and then to the key itself', () => {
    const bundles = { en: EN, de: DE };
    // Showing "nav.nope" beats showing an empty string: it names what is missing.
    assert.strictEqual(resolve(bundles, 'de', 'en', 'nav.nope'), 'nav.nope');
    assert.strictEqual(resolve(bundles, 'xx', 'en', 'nav.config'), lookup(EN, 'nav.config'));
    assert.strictEqual(resolve(bundles, 'de', 'en', 'app.title', {}), lookup(DE, 'app.title'));
  });

  // ──────────────────────────────────────────────────────────────────────────
  section('K) the built stylesheet');

  await check('no declaration takes a bare custom-property name as its value', () => {
    // "max-height: --radix-select-content-available-height" is not a value. The
    // browser drops the whole declaration WITHOUT a warning, so the rule looks
    // present in the source and does nothing on the page.
    //
    // It is the shape Tailwind v3 accepted and v4 does not: v3 read the bare
    // name inside the brackets as shorthand for var(), v4 passes it through. The
    // one that got through made every role and channel picker unusable, because
    // the popup lost its ceiling, had nothing to overflow, and would not scroll.
    // Anything past the bottom of the window was simply unreachable.
    //
    // Scanning the BUILT css is what makes this catchable: the source looks
    // fine, and only the emitted declaration shows the mistake.
    const dir = path.join(REPO, 'web', 'dist', 'assets');
    const sheets = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.css')) : [];
    assert.ok(sheets.length > 0, 'no built stylesheet in web/dist/assets');

    const bad = [];
    for (const file of sheets) {
      const css = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of css.matchAll(/[{;]\s*([a-z-]+)\s*:\s*(--[a-zA-Z0-9-]+)\s*[;}]/g)) {
        bad.push(`${file}: ${m[1]}: ${m[2]}`);
      }
    }
    assert.deepStrictEqual(bad, [], 'invalid declarations: ' + bad.join(' | '));
  });

  await check('the popup components keep the ceiling that lets them scroll', () => {
    // The pickers are the only way to choose a role or a channel, and a list
    // longer than the window is the normal case on a real server. Radix
    // publishes the space it measured; consuming it is what makes the list
    // scrollable, so the rule has to exist and has to use var().
    const dir = path.join(REPO, 'web', 'dist', 'assets');
    const css = fs.readdirSync(dir).filter(f => f.endsWith('.css'))
      .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    for (const name of ['select', 'dropdown-menu']) {
      const needle = `max-height:var(--radix-${name}-content-available-height)`;
      assert.ok(css.includes(needle), `missing in the built css: ${needle}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  section('L) the limits the scanner cannot see');

  // CodeQL reports js/missing-rate-limiting across this server because it only
  // recognises a handful of middleware packages, and the limiter here is our
  // own. Dismissing those alerts is only honest if the limiter demonstrably
  // works, so these checks are the evidence: they drive it over HTTP and
  // require a real 429. Every request below carries its own X-Forwarded-For, so
  // one check cannot spend another check's budget.

  const withIp = (ip) => async (method, url, headers = {}) => {
    const res = await fetch(`${baseUrl}${url}`, {
      method, redirect: 'manual', headers: { 'x-forwarded-for': ip, ...headers },
    });
    return { status: res.status, headers: res.headers };
  };

  await check('the login route stops answering once its budget is spent', async () => {
    const call = withIp('203.0.113.10');
    const seen = [];
    // The auth budget is the small one, ten in five minutes.
    for (let i = 0; i < 12; i++) seen.push((await call('GET', '/auth/login')).status);
    assert.ok(seen.includes(429), 'never rate limited: ' + seen.join(','));
    assert.strictEqual(seen[0], 302, 'the first attempt should still redirect to Discord');
  });

  await check('the global limiter answers 429 with a Retry-After', async () => {
    const call = withIp('203.0.113.11');
    let limited = null;
    // The global budget is 240 a minute. Unauthenticated calls are 401 until it
    // trips, which is the point: the limiter runs BEFORE the auth check, so it
    // protects the routes an anonymous caller can reach.
    for (let i = 0; i < 260 && !limited; i++) {
      const res = await call('GET', '/api/status');
      if (res.status === 429) limited = res;
    }
    assert.ok(limited, 'the global limiter never tripped');
    assert.ok(Number(limited.headers.get('retry-after')) > 0, 'no usable Retry-After header');
  });

  await check('one caller being limited does not lock everybody out', async () => {
    // A fixed window keyed per IP. If this ever came back 429 it would mean the
    // limiter had become a way for one client to take the panel down for all.
    const res = await withIp('203.0.113.12')('GET', '/api/status');
    assert.strictEqual(res.status, 401);
  });

  await check('the Discord client refuses a path that would leave discord.com', async () => {
    // CodeQL reports js/request-forgery here because an id reaches the URL. The
    // ids are snowflakes, and the path is matched against a strict pattern
    // before it is ever concatenated. These are the shapes that would matter if
    // it were not.
    const real = require(path.join(REPO, 'core/dashboard/discord'));
    const evil = [
      '//evil.example.com/x',
      '/guilds/../../../evil',
      '/guilds/1?redirect=http://evil.example.com',
      '/guilds/1#@evil.example.com',
      '/guilds/1\\@evil.example.com',
      'https://evil.example.com/x',
    ];
    for (const pathname of evil) {
      await assert.rejects(
        () => real.request(pathname),
        /unexpected path/,
        `accepted a path it should refuse: ${pathname}`,
      );
    }
  });

  // ── done ───────────────────────────────────────────────────────────────────
  server.close();
  await db.close().catch(() => {});
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ }

  console.log('\n' + '='.repeat(60));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) console.log('  failed: ' + failures.join(', '));
  console.log('='.repeat(60));
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 100).unref();
})();
