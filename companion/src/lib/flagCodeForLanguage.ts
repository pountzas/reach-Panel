/** ISO language tag → svg-flags country code for the Lang key. */
export function flagCodeForLanguage(langTag: string): string {
  const parts = langTag.toLowerCase().split('-');
  const primary = parts[0] ?? 'en';

  let i = 1;
  if (parts[i] && /^[a-z]{4}$/.test(parts[i])) {
    i += 1;
  }
  const region = parts[i];
  if (region && /^[a-z]{2}$/.test(region)) {
    return region;
  }

  const map: Record<string, string> = {
    en: 'gb',
    el: 'gr',
    de: 'de',
    fr: 'fr',
    es: 'es',
    it: 'it',
    pt: 'pt',
    ru: 'ru',
    tr: 'tr',
    pl: 'pl',
    nl: 'nl',
    ja: 'jp',
    zh: 'cn',
    ko: 'kr',
    ar: 'sa',
    hu: 'hu',
    cs: 'cz',
    sk: 'sk',
    hr: 'hr',
    ro: 'ro',
    uk: 'ua',
    fi: 'fi',
    sv: 'se',
    no: 'no',
    da: 'dk',
  };
  return map[primary] ?? 'gb';
}

export function languageDisplayCode(langTag: string): string {
  return (langTag.split('-')[0] ?? langTag).toUpperCase();
}
