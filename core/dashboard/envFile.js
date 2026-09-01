/**
 * Line-based .env reading and patching.
 *
 * Never regenerates the file: only the matching KEY=… line is rewritten, so
 * comments, blank lines and unknown keys survive untouched.
 *
 * CRLF IS THE WHOLE REASON THIS IS ONE SHARED MODULE. Splitting on '\n' leaves a
 * trailing '\r' on every line of a Windows file, and a regex ending in `(.*)$`
 * then FAILS to match, because in JavaScript `.` does not match '\r' and `$`
 * does not match before it. The consequence is silent and nasty: the patcher
 * decides the key is absent and APPENDS a duplicate instead of updating it. So
 * this splits on /\r?\n/ and writes back with whatever line ending the file
 * already used.
 */

const KEY_LINE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

const detectEol = (content) => (content.includes('\r\n') ? '\r\n' : '\n');
const splitLines = (content) => content.split(/\r?\n/);

/** Strip one layer of matching quotes, reversing the escaping done by setEnvValue. */
function unquote(raw) {
  const t = String(raw ?? '').trim();
  if (t.length >= 2 && t[0] === '"' && t.at(-1) === '"') {
    return t.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (t.length >= 2 && t[0] === "'" && t.at(-1) === "'") {
    return t.slice(1, -1); // single-quoted values are literal in .env
  }
  return t;
}

/** @returns {Map<string, {value: string, line: number}>} */
function parseEnvFile(content) {
  const map = new Map();
  splitLines(content).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const m = KEY_LINE.exec(line);
    if (m) map.set(m[2], { value: unquote(m[3]), line: i });
  });
  return map;
}

/** Quote a value so it can never break out of its surrounding quotes. */
const quote = (key, value) =>
  `${key}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Set `key` to `value`, updating the existing line if there is one and
 * appending otherwise. Everything else in the file is preserved byte for byte.
 */
function setEnvValue(content, key, value) {
  const eol = detectEol(content);
  const lines = splitLines(content);
  const next = quote(key, value);

  for (let i = 0; i < lines.length; i++) {
    const m = KEY_LINE.exec(lines[i]);
    if (m && m[2] === key) {
      lines[i] = `${m[1]}${next}`;
      return lines.join(eol);
    }
  }

  // Not present. Append, keeping a single trailing newline.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines[lines.length - 1] = next;
  else lines.push(next);
  lines.push('');

  return lines.join(eol);
}

module.exports = { parseEnvFile, setEnvValue, unquote, KEY_LINE };
