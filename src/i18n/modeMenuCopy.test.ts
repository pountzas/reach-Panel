import { describe, expect, it } from "vitest";
import { de } from "./de";
import { el } from "./el";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it as itLocale } from "./it";
import { pt } from "./pt";

const locales = { en, el, de, fr, it: itLocale, es, pt } as const;

describe("FAB mode menu Close app copy", () => {
  it("is a non-empty string in every locale, and exactly Close app in English", () => {
    expect(en.modeMenuCloseApp).toBe("Close app");

    for (const [locale, dict] of Object.entries(locales)) {
      const value = dict.modeMenuCloseApp;
      expect(typeof value, `${locale}.modeMenuCloseApp`).toBe("string");
      expect(value, `${locale}.modeMenuCloseApp`).not.toBe("");
    }
  });
});
