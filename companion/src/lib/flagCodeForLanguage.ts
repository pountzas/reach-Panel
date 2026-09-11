/** ISO language tag → svg-flags country code for the Lang key. */
export function flagCodeForLanguage(langTag: string): string {
  const primary = langTag.toLowerCase().split("-")[0] ?? "en";
  const map: Record<string, string> = {
    en: "gb",
    el: "gr",
    de: "de",
    fr: "fr",
    es: "es",
    it: "it",
    pt: "pt",
    ru: "ru",
    tr: "tr",
    pl: "pl",
    nl: "nl",
    ja: "jp",
    zh: "cn",
    ko: "kr",
    ar: "sa",
    hu: "hu",
    cs: "cz",
    sk: "sk",
    hr: "hr",
    ro: "ro",
    uk: "ua",
    fi: "fi",
    sv: "se",
    no: "no",
    da: "dk",
  };
  return map[primary] ?? "gb";
}

export function languageDisplayCode(langTag: string): string {
  return (langTag.split("-")[0] ?? langTag).toUpperCase();
}
