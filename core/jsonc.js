/**
 * JSONC: JSON with comments and trailing commas.
 *
 * The config files a self-hoster edits carry their own documentation. Plain
 * JSON cannot, so every setting would need a README somebody has to find. The
 * price is this parser.
 *
 * THE STRIPPER IS POSITION PRESERVING. Comments and trailing commas are
 * replaced with spaces rather than deleted, and newlines inside block comments
 * are kept. The stripped string therefore has the exact same length and line
 * layout as the file on disk, so the offset in a JSON.parse error maps 1:1 onto
 * the line and column the user is looking at. Deleting instead of blanking
 * shifts every position after the first comment, and the caret then points at
 * an innocent line — which is worse than no caret at all.
 */

/**
 * Strip `//` and block comments and neutralize trailing commas.
 *
 * @param {string} text raw JSONC
 * @returns {string} valid JSON, same length and line layout as the input
 */
function stripJsonComments(text) {
  let result = '';
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      if (ch === '\\') {
        // Escaped character: copy both, so an escaped quote does not end the string.
        result += ch + (text[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }

    // Line comment. Blanked to the end of the line, the newline itself stays.
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Block comment. Newlines inside are kept so line numbers still add up.
    if (ch === '/' && text[i + 1] === '*') {
      result += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        result += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < text.length) {
        result += '  ';
        i += 2;
      }
      continue;
    }

    result += ch;
    i++;
  }

  // `{ "a": 1, }` to `{ "a": 1  }` — comma to space, positions unchanged.
  return result.replace(/,(\s*[}\]])/g, ' $1');
}

/**
 * A readable multi-line description of a JSON.parse failure, with a caret under
 * the offending column and the neighbouring lines for context.
 *
 * @param {string} source the stripped JSON (same layout as the file)
 * @param {Error} err the error JSON.parse threw
 * @param {string} fileName shown in the first line
 * @returns {string[]} lines ready to print
 */
function describeParseError(source, err, fileName = 'config file') {
  const match = /at position (\d+)/i.exec(err.message);
  if (!match) return [`[Config] Failed to parse ${fileName}: ${err.message}`];

  const pos = Math.min(Number(match[1]), Math.max(source.length - 1, 0));
  const before = source.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');

  const lines = source.split('\n');
  const gutter = n => `  ${String(n).padStart(4)} | `;
  const out = [];

  out.push(`[Config] Syntax error in ${fileName} at line ${line}, column ${col}.`);
  out.push('');
  if (line > 1) out.push(gutter(line - 1) + lines[line - 2]);
  out.push(gutter(line) + (lines[line - 1] ?? ''));
  out.push(' '.repeat(gutter(line).length + col - 1) + '^');
  if (line < lines.length) out.push(gutter(line + 1) + lines[line]);
  out.push('');
  out.push('[Config] Most common causes:');
  out.push('[Config]   - a missing comma between two entries');
  out.push('[Config]   - one comma too many, usually after the last entry');
  out.push('[Config]   - an unclosed "quote" or a missing { } / [ ] bracket');

  return out;
}

/**
 * Parse JSONC.
 *
 * @param {string} text raw JSONC
 * @param {string} fileName used in the error message
 * @returns {{ok: true, value: any} | {ok: false, lines: string[]}}
 */
function parseJsonc(text, fileName = 'config file') {
  const stripped = stripJsonComments(text);
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch (err) {
    return { ok: false, lines: describeParseError(stripped, err, fileName) };
  }
}

/**
 * Deep merge `override` onto `base`, returning a new object.
 *
 * ARRAYS REPLACE, THEY DO NOT CONCATENATE. Every array in this config is a
 * list the operator owns end to end: the rules, the role buttons, the support
 * guides. Merging by index would leave the shipped example's fourth rule
 * hanging under a list of three, and appending would duplicate everything on
 * each load.
 *
 * `null` in the override also replaces, so a value can be deliberately cleared.
 * `undefined` does not, so a key simply absent from the user's file keeps the
 * default — which is the whole point: an update that adds a setting must not
 * require editing an existing installation's file.
 */
function deepMerge(base, override) {
  if (Array.isArray(override)) return override.slice();
  if (override === null) return null;
  if (typeof override !== 'object') return override === undefined ? base : override;

  const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!isPlain(base)) return deepMerge({}, override);

  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlain(value) && isPlain(base[key]) ? deepMerge(base[key], value) : deepMerge(base[key], value);
  }
  return out;
}

/** Read a dot path out of a nested object. Returns `fallback` on any miss. */
function getPath(object, dotted, fallback = undefined) {
  let node = object;
  for (const key of String(dotted).split('.')) {
    if (node === null || typeof node !== 'object' || !(key in node)) return fallback;
    node = node[key];
  }
  return node === undefined ? fallback : node;
}

/** Every leaf path of a nested object, as `a.b.c` strings. Arrays count as leaves. */
function leafPaths(object, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(object ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) out.push(...leafPaths(value, path));
    else out.push(path);
  }
  return out;
}

module.exports = { stripJsonComments, describeParseError, parseJsonc, deepMerge, getPath, leafPaths };
