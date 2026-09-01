/**
 * Dashboard translations.
 *
 * Language files are picked up AUTOMATICALLY: every `src/locales/<code>.json` is
 * pulled in by the Vite glob below, so adding a language means adding one file
 * and rebuilding. There is no list to maintain here, in the switcher, or
 * anywhere else, and the display name comes from the file's own `$meta.name`.
 *
 * The choice is PER USER and lives in localStorage, so it is personal to the
 * browser and needs no server round trip, no database column and no permission.
 *
 * THIS IS THE PANEL'S OWN LANGUAGE and has nothing to do with `language` in
 * config.jsonc, which decides what the BOT writes into Discord. One person
 * switching the panel to German must not change what every embed says to every
 * member of the server.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolve, lookup } from './i18n-core.js';

// eager: the bundles are small and needed for the very first paint, so a lazy
// import would only buy a flash of untranslated UI.
const MODULES = import.meta.glob('./locales/*.json', { eager: true });

const BUNDLES = {};
for (const [path, mod] of Object.entries(MODULES)) {
  const code = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/i, '');
  BUNDLES[code] = mod.default ?? mod;
}

/** English is the source of truth: every key exists there, so it is the fallback. */
const FALLBACK = 'en';
const STORAGE_KEY = 'mb.lang';

/** [{ code, name }] for the switcher, sorted by display name. */
export const LANGUAGES = Object.keys(BUNDLES)
  .map(code => ({ code, name: BUNDLES[code]?.$meta?.name || code.toUpperCase() }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Translate a dotted key. Falls back to English, then to the key itself: a
 * missing translation shows `bot.title` on screen, which is an immediate and
 * obvious bug report rather than a silent blank.
 */
export function translate(lang, path, vars) {
  return resolve(BUNDLES, lang, FALLBACK, path, vars);
}

/**
 * Translate, or use what the server sent.
 *
 * The feature tiles and the field labels come from the API in English, because
 * the server is where they are defined. Translating them here is therefore
 * OPTIONAL per key: anything not in the bundle falls back to the server's own
 * wording instead of to a raw key, so a feature added tomorrow reads correctly
 * in English on a German panel rather than showing `features.newthing.label`.
 */
export function translateOr(lang, path, fallbackText, vars) {
  const found = lookup(BUNDLES[lang], path) ?? lookup(BUNDLES[FALLBACK], path);
  if (found === undefined) return fallbackText;
  return translate(lang, path, vars);
}

/** Stored choice, else the closest match for the browser's languages, else English. */
export function detectLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && BUNDLES[stored]) return stored;
  } catch { /* private mode, or storage blocked */ }

  const wanted = (typeof navigator !== 'undefined' && (navigator.languages?.length
    ? navigator.languages
    : [navigator.language])) || [];
  for (const tag of wanted) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (BUNDLES[base]) return base;
  }
  return FALLBACK;
}

/**
 * The active language as a module-level value, so non-React helpers (the date
 * formatting in ui.jsx) can read it without every caller threading it through.
 * Kept in sync by the provider below.
 */
let activeLocale = FALLBACK;
export const getLocale = () => activeLocale;

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLanguage);

  activeLocale = lang; // set during render too, so the first paint formats correctly

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    languages: LANGUAGES,
    setLang: (next) => {
      if (!BUNDLES[next]) return;
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      activeLocale = next;
      setLangState(next);
    },
    t: (path, vars) => translate(lang, path, vars),
    tOr: (path, fallbackText, vars) => translateOr(lang, path, fallbackText, vars),
    // Two forms is enough for English and German. A language with more would
    // need Intl.PluralRules here, and the key suffixes to match its categories.
    tn: (path, count, vars) =>
      translate(lang, `${path}_${count === 1 ? 'one' : 'other'}`, { count, ...vars }),
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  // Rendering outside the provider is a wiring bug, not a runtime condition, and
  // failing loudly beats every label silently turning into its own key.
  if (!ctx) throw new Error('useI18n() used outside <I18nProvider>');
  return ctx;
}

/** Shorthand for the common case: `const t = useT()`. */
export const useT = () => useI18n().t;
