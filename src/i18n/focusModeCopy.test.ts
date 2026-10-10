import { describe, expect, it } from "vitest";
import { de } from "./de";
import { el } from "./el";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it as itLocale } from "./it";
import { pt } from "./pt";

/** Keys that name the Focus typing profile in the UI. */
const focusNameKeys = [
  "modeFocus",
  "focusModeOverrideLabel",
  "focusModeCollapse",
  "showInputPreviewFocusMode",
  "modeTabletsHint",
] as const;

const locales = { en, el, de, fr, it: itLocale, es, pt } as const;

describe("Focus mode user-facing copy", () => {
  it("uses Focus / Focus mode in English (not Mini Mode)", () => {
    expect(en.modeFocus).toBe("Focus");
    expect(en.focusModeOverrideLabel).toBe("Focus mode");
    expect(en.focusModeCollapse).toBe("Back to Focus mode");
    expect(en.showInputPreviewFocusMode).toBe(
      "Live input preview (Focus mode)",
    );
    expect(en.modeTabletsHint).toContain("Focus");
    expect(en.modeTabletsHint).not.toMatch(/\bMini\b/i);
  });

  it("does not keep Mini / Mini Mode wording in any locale for Focus labels", () => {
    for (const [locale, dict] of Object.entries(locales)) {
      for (const key of focusNameKeys) {
        const value = dict[key];
        expect(value, `${locale}.${key}`).not.toMatch(
          /\bMini(?:[\s-]?Mode|[- ]?Modus)?\b|\bModo Mini\b|\bMode Mini\b|\bModalità Mini\b/i,
        );
      }
    }
  });
});
