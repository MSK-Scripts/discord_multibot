/**
 * Reading and writing the two files the dashboard edits.
 *
 * THE DASHBOARD EDITS THE OVERRIDE, NOT THE MERGED RESULT. `config.jsonc` is a
 * thin layer on top of the shipped `config.example.jsonc`, and it has to stay
 * that way: writing the whole merged object back would freeze today's defaults
 * into the file, and the next update's improved default would never reach this
 * installation. So a save computes the MINIMAL difference: a value equal to the
 * default is removed from the override rather than written to it.
 *
 * Two ways in, and they are honest about their trade-off:
 *   - a structured patch, which the form uses. It rewrites the file as plain
 *     JSON, so hand-written comments in config.jsonc do NOT survive it.
 *   - a raw text write, which the built-in editor uses. Byte for byte, comments
 *     and all.
 * Either way the previous content is kept as `.bak` first.
 */

const fs = require('fs');
const path = require('path');

const config = require('../config');
const i18n = require('../i18n');
const { parseJsonc, deepMerge, getPath } = require('../jsonc');

const CONFIG_PATH = config.CONFIG_PATH;
const EXAMPLE_PATH = config.EXAMPLE_PATH;
const TEXTS_PATH = i18n.TEXTS_PATH;
const TEXTS_EXAMPLE_PATH = path.join(config.CONFIG_DIR, 'texts.example.jsonc');

const CONFIG_HEADER = `// This installation's own configuration.
//
// Only the values that differ from config/config.example.jsonc are in here, so
// every default an update improves still reaches you. The example file is where
// every setting is documented.
//
// Written by the dashboard. Editing it by hand is fine, but the dashboard's
// form view rewrites this file as plain JSON, so comments you add here only
// survive if you stick to the raw editor.
`;

const TEXTS_HEADER = `// This installation's own wording.
//
// Only the messages you actually changed are in here; everything else comes
// from locales/. See config/texts.example.jsonc.
`;

// ── reading ──────────────────────────────────────────────────────────────────

function readJsoncFile(file, label) {
  if (!fs.existsSync(file)) return { exists: false, raw: '', value: {}, error: null };
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = parseJsonc(raw, label);
  if (!parsed.ok) return { exists: true, raw, value: {}, error: parsed.lines.join('\n') };
  const value = (parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value))
    ? parsed.value
    : {};
  return { exists: true, raw, value, error: null };
}

/**
 * The three layers the UI needs: what ships, what this installation changed,
 * and what the bot actually sees.
 */
function readConfig() {
  const defaults = readJsoncFile(EXAMPLE_PATH, 'config/config.example.jsonc');
  const own = readJsoncFile(CONFIG_PATH, 'config/config.jsonc');
  return {
    defaults: defaults.value,
    overrides: own.value,
    effective: deepMerge(defaults.value, own.value),
    raw: own.raw,
    exists: own.exists,
    error: own.error,
  };
}

function readTexts() {
  const own = readJsoncFile(TEXTS_PATH, 'config/texts.jsonc');
  return {
    catalogue: i18n.catalogue(),
    overrides: own.value,
    raw: own.raw,
    exists: own.exists,
    error: own.error,
  };
}

// ── writing ──────────────────────────────────────────────────────────────────

/**
 * Write a file, keeping the previous content as `.bak` and going through a temp
 * file so a crash halfway cannot leave a half-written config behind.
 */
function writeFileSafely(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, `${file}.bak`); } catch { /* a backup is nice, not required */ }
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Set a dot path inside a nested object, creating the objects on the way. */
function setPath(object, dotted, value) {
  const keys = String(dotted).split('.');
  let node = object;
  for (const key of keys.slice(0, -1)) {
    if (!isPlain(node[key])) node[key] = {};
    node = node[key];
  }
  node[keys.at(-1)] = value;
  return object;
}

/** Remove a dot path, and any object it leaves empty behind it. */
function deletePath(object, dotted) {
  const keys = String(dotted).split('.');
  const stack = [];
  let node = object;
  for (const key of keys.slice(0, -1)) {
    if (!isPlain(node[key])) return object;
    stack.push([node, key]);
    node = node[key];
  }
  delete node[keys.at(-1)];
  // An override object left empty is noise in the file, so it goes too.
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const [parent, key] = stack[i];
    if (isPlain(parent[key]) && Object.keys(parent[key]).length === 0) delete parent[key];
    else break;
  }
  return object;
}

const sameAsDefault = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Apply `{ "a.b.c": value }` to the override file.
 *
 * A value equal to the shipped default is REMOVED from the override instead of
 * written to it. That is what keeps the file a difference rather than a copy,
 * and it is why setting something back to its default really does hand it back
 * to the defaults rather than pinning today's value for ever.
 */
function applyConfigPatch(patch) {
  const { defaults, overrides } = readConfig();
  const next = JSON.parse(JSON.stringify(overrides));

  for (const [dotted, value] of Object.entries(patch ?? {})) {
    if (sameAsDefault(value, getPath(defaults, dotted, undefined))) deletePath(next, dotted);
    else setPath(next, dotted, value);
  }

  const body = `${CONFIG_HEADER}\n${JSON.stringify(next, null, 2)}\n`;
  const check = parseJsonc(body, 'config/config.jsonc');
  if (!check.ok) return { ok: false, error: check.lines.join('\n') };

  writeFileSafely(CONFIG_PATH, body);
  config.reload();
  i18n.reload();
  return { ok: true, overrides: next };
}

/** Replace config.jsonc with raw text, refusing anything that does not parse. */
function writeConfigRaw(text) {
  const parsed = parseJsonc(String(text ?? ''), 'config/config.jsonc');
  if (!parsed.ok) return { ok: false, error: parsed.lines.join('\n') };
  if (!isPlain(parsed.value)) return { ok: false, error: 'The file has to contain a JSON object.' };

  writeFileSafely(CONFIG_PATH, String(text));
  config.reload();
  i18n.reload();
  return { ok: true };
}

/**
 * Apply message overrides. An empty string means "back to the shipped wording",
 * which is a removal rather than an override that happens to be blank: a blank
 * embed field is refused by Discord.
 */
function applyTextsPatch(patch) {
  const { overrides } = readTexts();
  const next = JSON.parse(JSON.stringify(overrides));

  for (const [dotted, value] of Object.entries(patch ?? {})) {
    const shipped = i18n.defaultOf(dotted);
    if (value === null || value === '' || sameAsDefault(value, shipped)) deletePath(next, dotted);
    else setPath(next, dotted, value);
  }

  const body = `${TEXTS_HEADER}\n${JSON.stringify(next, null, 2)}\n`;
  const check = parseJsonc(body, 'config/texts.jsonc');
  if (!check.ok) return { ok: false, error: check.lines.join('\n') };

  writeFileSafely(TEXTS_PATH, body);
  i18n.reload();
  return { ok: true, overrides: next };
}

function writeTextsRaw(text) {
  const parsed = parseJsonc(String(text ?? ''), 'config/texts.jsonc');
  if (!parsed.ok) return { ok: false, error: parsed.lines.join('\n') };
  if (!isPlain(parsed.value)) return { ok: false, error: 'The file has to contain a JSON object.' };

  writeFileSafely(TEXTS_PATH, String(text));
  i18n.reload();
  return { ok: true };
}

/** The shipped example, so the UI can offer "start from the documented defaults". */
const readExampleRaw = () => (fs.existsSync(EXAMPLE_PATH) ? fs.readFileSync(EXAMPLE_PATH, 'utf8') : '');
const readTextsExampleRaw = () => (fs.existsSync(TEXTS_EXAMPLE_PATH) ? fs.readFileSync(TEXTS_EXAMPLE_PATH, 'utf8') : '');

module.exports = {
  CONFIG_PATH, EXAMPLE_PATH, TEXTS_PATH, TEXTS_EXAMPLE_PATH,
  readConfig, readTexts, readExampleRaw, readTextsExampleRaw,
  applyConfigPatch, writeConfigRaw, applyTextsPatch, writeTextsRaw,
  setPath, deletePath, writeFileSafely,
};
