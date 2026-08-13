import { describe, expect, it } from "vitest";
import {
  GREEK_ROWS,
  QWERTY_ROWS,
  vkForLayoutKey,
} from "./keyboardLayouts";

describe("dictate key layout", () => {
  it("places dictate after Right Ctrl on QWERTY and Greek bottom rows", () => {
    for (const rows of [QWERTY_ROWS, GREEK_ROWS]) {
      const bottom = rows[rows.length - 1];
      const last = bottom[bottom.length - 1];
      const before = bottom[bottom.length - 2];
      expect(before?.key).toBe("ctrl");
      expect(last?.key).toBe("dictate");
      expect(last?.width).toBe(1.3);
    }
  });

  it("returns null VK for the dictate key", () => {
    const bottom = QWERTY_ROWS[QWERTY_ROWS.length - 1];
    const col = bottom.findIndex((k) => k.key === "dictate");
    expect(col).toBeGreaterThanOrEqual(0);
    expect(vkForLayoutKey(QWERTY_ROWS.length - 1, col)).toBeNull();
  });
});
