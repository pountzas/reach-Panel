import { describe, expect, it } from "vitest";
import {
  greekComposeEnabled,
  processCharacterInput,
} from "./keyboardCharacterInput";

describe("greekComposeEnabled", () => {
  it("enables for Greek typing language", () => {
    expect(greekComposeEnabled({ typingLanguage: "el" })).toBe(true);
  });

  it("enables for Windows Greek keyboard layout", () => {
    expect(greekComposeEnabled({ keyboardLayout: "Greek" })).toBe(true);
  });

  it("enables during Greek language lesson even when UI language is English", () => {
    expect(
      greekComposeEnabled({
        typingLanguage: "en",
        languageLessonActive: true,
        lessonLanguage: "el",
      }),
    ).toBe(true);
  });
});

describe("processCharacterInput", () => {
  it("composes Greek accents for the live input preview buffer", () => {
    let buffer = "";
    let pending = null as ReturnType<typeof processCharacterInput>["pendingAccent"];

    let result = processCharacterInput(buffer, pending, "\u0384", {
      greekCompose: true,
    });
    buffer = result.buffer;
    pending = result.pendingAccent;
    expect(buffer).toBe("");
    expect(pending).toBe("tonos");

    result = processCharacterInput(buffer, pending, "\u03B9", {
      greekCompose: true,
    });
    buffer = result.buffer;
    pending = result.pendingAccent;
    expect(buffer).toBe("\u03AF");
    expect(pending).toBeNull();
  });

  it("continues composing while pending even if greekCompose flag is false", () => {
    let result = processCharacterInput("", "tonos", "\u03B9", {
      greekCompose: false,
    });
    expect(result.buffer).toBe("\u03AF");
    expect(result.pendingAccent).toBeNull();
  });

  it("composes tonos from empty output on the ; physical key", () => {
    const result = processCharacterInput("", null, "", {
      greekCompose: true,
      physicalKey: ";",
    });
    expect(result.pendingAccent).toBe("tonos");
    expect(result.buffer).toBe("");
    expect(result.inject).toBe("");
  });

  it("appends plain characters when Greek compose is disabled", () => {
    const result = processCharacterInput("", null, "a", { greekCompose: false });
    expect(result).toEqual({
      buffer: "a",
      pendingAccent: null,
      inject: "a",
    });
  });
});
