/**
 * The dashboard's own appearance: accent colour and favicon.
 *
 * These are dashboard-only, per-installation preferences and not bot data, so
 * they live in a small JSON file under data/ rather than in config.jsonc. The
 * favicon binary sits next to it. Both are gitignored runtime state.
 *
 * Everything here is permission-gated at the route layer; this module is pure
 * storage plus validation and has no notion of who is calling.
 */

const fs = require('fs');
const path = require('path');

const config = require('../config');

// Overridable so a test can point it at a throwaway directory instead of the
// real settings file.
const DATA_DIR = path.resolve(process.env.DASHBOARD_DATA_DIR || config.DATA_DIR);
const SETTINGS_PATH = path.join(DATA_DIR, 'dashboard-settings.json');
const FAVICON_BASE = path.join(DATA_DIR, 'dashboard-favicon');

/**
 * The favicons we accept. The extension comes from the file's MAGIC BYTES and
 * never from a client-supplied name, so a request cannot smuggle in a different
 * file type by calling it .png.
 */
const FAVICON_TYPES = {
  png: { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ico: { ext: 'ico', mime: 'image/x-icon', magic: [0x00, 0x00, 0x01, 0x00] },
};
const MAX_FAVICON_BYTES = 256 * 1024;

const ACCENT_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const isValidAccent = (value) => typeof value === 'string' && ACCENT_RE.test(value.trim());

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * The current settings, with safe defaults. A missing or corrupt file reads as
 * "everything default" rather than throwing: appearance must never break boot.
 */
function loadSettings() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    raw = {};
  }
  const accent = isValidAccent(raw.accent) ? raw.accent.trim().toLowerCase() : null;
  const faviconExt = (raw.faviconExt === 'png' || raw.faviconExt === 'ico') ? raw.faviconExt : null;
  // A recorded favicon only counts when the file is actually there.
  const hasFile = faviconExt && fs.existsSync(`${FAVICON_BASE}.${faviconExt}`);
  return {
    accent,
    faviconExt: hasFile ? faviconExt : null,
    faviconVersion: hasFile && Number.isFinite(raw.faviconVersion) ? raw.faviconVersion : null,
  };
}

function writeSettings(next) {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf-8');
}

/** Set, or clear with null, the accent colour. Other settings are preserved. */
function setAccent(accent) {
  const current = loadSettings();
  if (accent === null || accent === '' || accent === undefined) {
    writeSettings({ ...current, accent: null });
    return { ok: true };
  }
  if (!isValidAccent(accent)) return { ok: false, error: 'The accent must be a hex colour like #5865f2.' };
  writeSettings({ ...current, accent: accent.trim().toLowerCase() });
  return { ok: true };
}

/** Identify an uploaded favicon by its magic bytes. @returns {'png'|'ico'|null} */
function detectFaviconType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return null;
  for (const { ext, magic } of Object.values(FAVICON_TYPES)) {
    if (buf.length >= magic.length && magic.every((b, i) => buf[i] === b)) return ext;
  }
  return null;
}

/** Store an uploaded favicon. Any previously stored one is removed first. */
function setFavicon(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return { ok: false, status: 400, error: 'Empty upload.' };
  }
  if (buf.length > MAX_FAVICON_BYTES) {
    return { ok: false, status: 413, error: 'The favicon exceeds the 256 KB limit.' };
  }
  const ext = detectFaviconType(buf);
  if (!ext) return { ok: false, status: 400, error: 'Only PNG or ICO favicons are supported.' };

  ensureDataDir();
  for (const t of Object.values(FAVICON_TYPES)) {
    if (t.ext !== ext) { try { fs.unlinkSync(`${FAVICON_BASE}.${t.ext}`); } catch { /* not there */ } }
  }
  fs.writeFileSync(`${FAVICON_BASE}.${ext}`, buf);

  const version = Date.now();
  writeSettings({ ...loadSettings(), faviconExt: ext, faviconVersion: version });
  return { ok: true, ext, version };
}

/** Remove the custom favicon, reverting to the built-in default. */
function clearFavicon() {
  for (const t of Object.values(FAVICON_TYPES)) {
    try { fs.unlinkSync(`${FAVICON_BASE}.${t.ext}`); } catch { /* not there */ }
  }
  writeSettings({ ...loadSettings(), faviconExt: null, faviconVersion: null });
  return { ok: true };
}

/** Path and mime of the stored favicon, or null when the default is in use. */
function getFaviconFile() {
  const { faviconExt } = loadSettings();
  if (!faviconExt) return null;
  const file = `${FAVICON_BASE}.${faviconExt}`;
  if (!fs.existsSync(file)) return null;
  const mime = Object.values(FAVICON_TYPES).find(t => t.ext === faviconExt)?.mime ?? 'application/octet-stream';
  return { file, mime };
}

/** The non-sensitive subset, served before login so the sign-in page is themed too. */
function publicSettings() {
  const { accent, faviconVersion } = loadSettings();
  return { accent, favicon: faviconVersion };
}

module.exports = {
  SETTINGS_PATH, FAVICON_BASE, MAX_FAVICON_BYTES,
  isValidAccent, loadSettings, setAccent,
  detectFaviconType, setFavicon, clearFavicon, getFaviconFile, publicSettings,
};
