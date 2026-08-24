/**
 * i18n der Schulungsseite /berater-info.
 *
 * Unterschied zur Quelle (business-schulung/utils/translations.js): Dort wurden die
 * Locale-JSONs per Template-Literal dynamisch importiert. esbuild kann so einen Import
 * nicht statisch aufloesen und laesst ihn zur Laufzeit stehen - im Browser waere das ein
 * 404 (Inventur 2026-08-24, Befund A-2). Hier stehen deshalb sechs statische Importe;
 * esbuild laedt .json nativ und legt die Pakete ins Bundle.
 *
 * Die JSON-Dateien der fuenf Bestandssprachen sind byte-gleiche Kopien der Quelle.
 * Neu ist ausschliesslich hu (Befund D-3).
 */

import React from 'react';

import deCommon from './locales/de/common.json';
import deProfiles from './locales/de/profiles.json';
import itCommon from './locales/it/common.json';
import itProfiles from './locales/it/profiles.json';
import enCommon from './locales/en/common.json';
import enProfiles from './locales/en/profiles.json';
import frCommon from './locales/fr/common.json';
import frProfiles from './locales/fr/profiles.json';
import ruCommon from './locales/ru/common.json';
import ruProfiles from './locales/ru/profiles.json';
import huCommon from './locales/hu/common.json';
import huProfiles from './locales/hu/profiles.json';

import { SUPPORTED_LANGS, DEFAULT_LANG, normalizeLangParam } from './query-contract.js';

export const TRANSLATION_PACKS = {
  de: { common: deCommon, profiles: deProfiles },
  it: { common: itCommon, profiles: itProfiles },
  en: { common: enCommon, profiles: enProfiles },
  fr: { common: frCommon, profiles: frProfiles },
  ru: { common: ruCommon, profiles: ruProfiles },
  hu: { common: huCommon, profiles: huProfiles },
};

// D-9: Das Quiz speichert die Sprache slug-gebunden (src/lib/core.js). Nach dem Cutover
// liegen Quiz und Schulung auf derselben Domain und teilen sich localStorage. Der globale
// Schluessel 'preferredLang' der Altseite wuerde dort ein zweites, unsichtbares
// Sprachgedaechtnis aufmachen. Wir folgen deshalb der Quiz-Konvention.
export const LANG_STORAGE_KEY = 'preferredLang:berater-info';

function readStoredLang() {
  try {
    return normalizeLangParam(window.localStorage.getItem(LANG_STORAGE_KEY));
  } catch (_error) {
    return '';
  }
}

function writeStoredLang(lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (_error) {
    // Private-Mode oder blockierter Storage darf die Seite nicht kippen.
  }
}

function readBrowserLang() {
  const browser = String((window.navigator && window.navigator.language) || '')
    .split('-')[0]
    .toLowerCase();
  return SUPPORTED_LANGS.includes(browser) ? browser : '';
}

/** Prioritaet wie in der Quelle: URL (lang > l) -> localStorage -> Browser -> de. */
export function detectInitialLang(search) {
  const params = new URLSearchParams(String(search || ''));
  const fromUrl = normalizeLangParam(params.get('lang')) || normalizeLangParam(params.get('l'));
  if (fromUrl) return fromUrl;
  return readStoredLang() || readBrowserLang() || DEFAULT_LANG;
}

/** Punkt-Pfad-Aufloesung. Fehlender Key gibt den Key zurueck - wie in der Quelle. */
export function translate(pack, key, category = 'common') {
  const scope = pack && pack[category];
  if (!scope) return key;

  let result = scope;
  for (const part of String(key).split('.')) {
    if (result[part] === undefined) return key;
    result = result[part];
  }
  return result;
}

const TranslationsContext = React.createContext(null);

export function useTranslation() {
  return React.useContext(TranslationsContext);
}

export function TranslationsProvider({ initialLang, children }) {
  const [lang, setLangState] = React.useState(initialLang || DEFAULT_LANG);

  const setLang = React.useCallback((nextLang) => {
    const normalized = normalizeLangParam(nextLang);
    if (!normalized) return;
    setLangState(normalized);
    writeStoredLang(normalized);
  }, []);

  React.useEffect(() => {
    writeStoredLang(lang);
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const value = React.useMemo(() => {
    const pack = TRANSLATION_PACKS[lang] || TRANSLATION_PACKS[DEFAULT_LANG];
    return {
      lang,
      setLang,
      t: (key, category = 'common') => translate(pack, key, category),
    };
  }, [lang, setLang]);

  return React.createElement(TranslationsContext.Provider, { value }, children);
}
