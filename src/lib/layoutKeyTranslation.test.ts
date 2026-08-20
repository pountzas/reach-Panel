import { describe, expect, it } from "vitest";
import {
  applyGreekLayoutTranslation,
  applyLayoutTranslation,
  greekPhysicalTranslateFallback,
  isGreekTypingLanguage,
} from "./layoutKeyTranslation";
import { applyLayoutKeyLabels, greekPhysicalOutput, QWERTY_ROWS } from "./keyboardLayouts";

describe("isGreekTypingLanguage", () => {
  it("matches el and el-GR", () => {
    expect(isGreekTypingLanguage("el")).toBe(true);
    expect(isGreekTypingLanguage("el-GR")).toBe(true);
    expect(isGreekTypingLanguage("en")).toBe(false);
  });
});

describe("applyLayoutTranslation", () => {
  it("appends composed text from Windows translation", () => {
    expect(
      applyLayoutTranslation("", { text: "\u03AF", dead: false }),
    ).toEqual({
      buffer: "\u03AF",
      inject: "\u03AF",
    });
  });

  it("leaves buffer unchanged for dead keys", () => {
    expect(
      applyLayoutTranslation("abc", { text: "", dead: true }),
    ).toEqual({
      buffer: "abc",
      inject: "",
    });
  });

  it("ignores spacing accent text when dead is true", () => {
    expect(
      applyLayoutTranslation("", { text: "\u0384", dead: true }),
    ).toEqual({
      buffer: "",
      inject: "",
    });
  });

  it("treats spacing accent-only text as dead", () => {
    expect(
      applyLayoutTranslation("", { text: "\u0384", dead: false }),
    ).toEqual({
      buffer: "",
      inject: "",
    });
  });

  it("strips a leading tonos when Windows returns tonos + vowel together", () => {
    expect(
      applyLayoutTranslation("", { text: "\u0384\u03CC", dead: false }),
    ).toEqual({
      buffer: "\u03CC",
      inject: "\u03CC",
    });
  });
});

describe("applyGreekLayoutTranslation", () => {
  it("stores tonos pending on dead key without changing buffer", () => {
    expect(
      applyGreekLayoutTranslation("", null, { text: "", dead: true }, {
        physicalKey: ";",
        greekCompose: true,
      }),
    ).toEqual({
      buffer: "",
      pending: "tonos",
      inject: "",
    });
  });

  it("composes tonos + vowel when Windows returns plain vowel", () => {
    expect(
      applyGreekLayoutTranslation("", "tonos", { text: "\u03BF", dead: false }, {
        greekCompose: true,
      }),
    ).toEqual({
      buffer: "\u03CC",
      pending: null,
      inject: "\u03CC",
    });
  });

  it("appends literal semicolon from Windows instead of treating it as tonos", () => {
    expect(
      applyGreekLayoutTranslation("", null, { text: ";", dead: false }, {
        physicalKey: ";",
        greekCompose: true,
      }),
    ).toEqual({
      buffer: ";",
      pending: null,
      inject: ";",
    });
  });

  it("uses label fallback when Windows mis-reports dead on the q slot (Greek ;)", () => {
    expect(
      applyGreekLayoutTranslation("", null, { text: "", dead: true }, {
        physicalKey: "q",
        fallbackOutput: ";",
        greekCompose: true,
      }),
    ).toEqual({
      buffer: ";",
      pending: null,
      inject: ";",
    });
  });

  it("maps q slot to ; when Windows returns the Latin letter", () => {
    expect(
      applyGreekLayoutTranslation("", null, { text: "q", dead: false }, {
        physicalKey: "q",
        greekCompose: true,
      }),
    ).toEqual({
      buffer: ";",
      pending: null,
      inject: ";",
    });
  });

  it("resolves q physical fallback for hardware keyboard path", () => {
    expect(greekPhysicalTranslateFallback("q", false)).toBe(";");
    expect(greekPhysicalTranslateFallback("q", true)).toBeUndefined();
  });
});

describe("greekPhysicalOutput / applyLayoutKeyLabels", () => {
  it("maps q slot to ; when Windows returns an empty label", () => {
    expect(greekPhysicalOutput("q", false)).toBe(";");
    const rows = applyLayoutKeyLabels(QWERTY_ROWS, [
      { key: "q", label: "" },
    ]);
    const qKey = rows[1]?.find((k) => k.physicalKey === "q");
    expect(qKey?.key).toBe(";");
    expect(qKey?.label).toBe(";");
  });
});
