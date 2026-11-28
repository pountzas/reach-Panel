// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pcMicShortcutFromKeyboardEvent } from "./pcMicShortcutFromEvent";

describe("pcMicShortcutFromKeyboardEvent", () => {
  it("captures right alt as ralt token", () => {
    const combo = pcMicShortcutFromKeyboardEvent({
      key: "Alt",
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
      metaKey: false,
      location: KeyboardEvent.DOM_KEY_LOCATION_RIGHT,
    } as KeyboardEvent);
    expect(combo).toEqual(["ralt"]);
  });

  it("captures win+h style combos", () => {
    const combo = pcMicShortcutFromKeyboardEvent({
      key: "h",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: true,
      location: KeyboardEvent.DOM_KEY_LOCATION_STANDARD,
    } as KeyboardEvent);
    expect(combo).toEqual(["win", "h"]);
  });
});
