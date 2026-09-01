/**
 * Every word the bot says to Discord.
 *
 * THREE LAYERS, RESOLVED IN THIS ORDER:
 *   1. locales/en.json        the catalogue, tracked, complete by definition
 *   2. locales/<lang>.json    the chosen translation, laid on top
 *   3. config/texts.jsonc     the operator's own wording, laid on top of that
 *
 * English is the base rather than a sibling, so a translation that is missing a
 * key falls back to a real sentence instead of to a raw key. A translator can
 * ship a partial file and it works.
 *
 * The override file is separate from the translations on purpose. Editing
 * locales/de.json directly would work until the next update, which ships its
 * own de.json and either overwrites the edit or turns the deploy into a merge
 * conflict. config/texts.jsonc is untracked, survives `git clean -df`, and only
 * ever contains what the operator actually changed.
 *
 * CONSOLE OUTPUT IS NOT IN HERE. Log lines are read by whoever runs the bot,
 * not by members, and translating them makes a search for an error message
 * depend on which language the machine happened to be set to.
 */

const { join } = require('path');
const { existsSync, readFileSync, readdirSync } = require('fs');

const { parseJsonc, deepMerge, getPath, leafPaths } = require('./jsonc');
const config = require('./config');

// Redirectable like MULTIBOT_CONFIG, and for the same reason: a test that only
// moved the config file still wrote its message overrides into the real
// installation, which it then quietly kept.
const TEXTS_PATH = process.env.MULTIBOT_TEXTS || join(config.CONFIG_DIR, 'texts.jsonc');

let catalogue = {};
let baseCatalogue = {};
let problems = [];

/** Keys asked for that do not exist. The harness checks this is empty. */
const missingKeys = new Set();

function readCatalogueFile(path, label) {
  if (!existsSync(path)) return null;
  const result = parseJsonc(readFileSync(path, 'utf8'), label);
  if (result.ok) return result.value;
  problems.push(...result.lines);
  return null;
}

function load() {
  problems = [];
  missingKeys.clear();

  const englishPath = join(config.LOCALES_DIR, 'en.json');
  baseCatalogue = readCatalogueFile(englishPath, 'locales/en.json') ?? {};
  if (!Object.keys(baseCatalogue).length) {
    problems.push('locales/en.json is missing or unreadable. Messages will show their key names.');
  }

  let result = baseCatalogue;

  const lang = config.language();
  if (lang && lang !== 'en') {
    const translation = readCatalogueFile(join(config.LOCALES_DIR, `${lang}.json`), `locales/${lang}.json`);
    if (translation) result = deepMerge(result, translation);
    else problems.push(`language "${lang}" has no locales/${lang}.json, falling back to English.`);
  }

  const overrides = readCatalogueFile(TEXTS_PATH, 'config/texts.jsonc');
  if (overrides) result = deepMerge(result, overrides);

  catalogue = result;
  return catalogue;
}

load();

/**
 * Fill `{name}` placeholders. A placeholder with no matching variable is LEFT
 * STANDING rather than blanked: "{user} joined" with no user reads as an
 * obvious mistake, " joined" reads as a bug in the bot.
 */
function interpolate(text, vars) {
  if (!vars || typeof text !== 'string') return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    (name in vars && vars[name] !== undefined && vars[name] !== null) ? String(vars[name]) : whole);
}

/**
 * A message by dot key.
 *
 * A missing key returns the KEY ITSELF, not an empty string. An empty string
 * would be a silently blank embed field, which Discord then rejects with an
 * error about a field that the code says is fine; the key name is at least a
 * thing somebody can grep for.
 *
 * @param {string} key e.g. "games.slots.title"
 * @param {object} [vars] placeholder values
 * @returns {string}
 */
function t(key, vars) {
  const value = getPath(catalogue, key, undefined);
  if (typeof value === 'string') return interpolate(value, vars);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  missingKeys.add(key);
  return key;
}

/**
 * A list-valued entry, such as the 8-ball answers. Returns [] on a miss, which
 * every call site already has to handle for an operator who emptied the list.
 */
function tList(key) {
  const value = getPath(catalogue, key, undefined);
  if (Array.isArray(value)) return value.map(v => String(v));
  missingKeys.add(key);
  return [];
}

/**
 * A structured entry, returned as it stands: the trivia questions, which are
 * objects rather than strings.
 *
 * They live in the catalogue and not in the config because they are LANGUAGE,
 * not settings. A German installation needs German questions and German Wordle
 * words, and a question list that sits next to the channel ids is one nobody
 * translates. An operator who wants their own still overrides them in
 * config/texts.jsonc like any other message.
 */
function tData(key, fallback = null) {
  const value = getPath(catalogue, key, undefined);
  if (value === undefined) { missingKeys.add(key); return fallback; }
  return value;
}

/** Does this key exist? Used by call sites that treat an empty text as "skip". */
const has = (key) => getPath(catalogue, key, undefined) !== undefined;

/**
 * The message WITHOUT its placeholders filled in.
 *
 * Needed where the code has to recognise its own past output: the "edited at"
 * stamp in an embed footer has to be replaced rather than appended a second
 * time, and finding it means knowing the text around the placeholder. Matching
 * on a hardcoded English word instead is how that check silently stops working
 * the moment somebody switches language.
 */
function raw(key) {
  const value = getPath(catalogue, key, undefined);
  return typeof value === 'string' ? value : '';
}

/**
 * Which translations are installed. Read from disk rather than from a list in
 * the code, so dropping a new locales/xx.json in is all it takes.
 */
function languages() {
  try {
    return readdirSync(config.LOCALES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const code = f.slice(0, -5);
        const parsed = readCatalogueFile(join(config.LOCALES_DIR, f), f);
        return { code, name: String(parsed?._meta?.name ?? code) };
      });
  } catch {
    return [{ code: 'en', name: 'English' }];
  }
}

/** Every key in the shipped English catalogue, as dot paths. Drives the dashboard editor. */
const allKeys = () => leafPaths(baseCatalogue).filter(k => !k.startsWith('_meta'));

/** The English default for a key, whatever the operator overrode it with. */
const defaultOf = (key) => getPath(baseCatalogue, key, undefined);

function reload() {
  return load();
}

module.exports = {
  t, tList, tData, has, raw, load, reload, languages, allKeys, defaultOf,
  TEXTS_PATH,
  catalogue: () => catalogue,
  problems: () => [...problems],
  missing: () => [...missingKeys],
};
