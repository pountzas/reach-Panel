import { describe, expect, it } from "vitest";
import { resolveOnscreenLayout } from "./keyboardLayouts";

describe("resolveOnscreenLayout", () => {
  it("follows the Windows layout name when present", () => {
    expect(resolveOnscreenLayout("QWERTZ", "en")).toBe("QWERTZ");
    expect(resolveOnscreenLayout("AZERTY", "en")).toBe("AZERTY");
    expect(resolveOnscreenLayout("Greek", "en")).toBe("Greek");
    expect(resolveOnscreenLayout("QWERTY", "de")).toBe("QWERTY");
  });

  it("falls back to language when Windows layout is unknown", () => {
    expect(resolveOnscreenLayout("", "el")).toBe("Greek");
    expect(resolveOnscreenLayout("Unknown", "de")).toBe("QWERTZ");
    expect(resolveOnscreenLayout("Unknown", "fr")).toBe("AZERTY");
    expect(resolveOnscreenLayout("Unknown", "en")).toBe("QWERTY");
  });
});
