import { describe, expect, it } from "vitest";
import {
  computeLanguagePickerPosition,
  LANGUAGE_PICKER_GAP_PX,
} from "./languagePickerPosition";

describe("computeLanguagePickerPosition", () => {
  const viewport = { width: 800, height: 600 };
  const popup = { width: 224, height: 288 };

  it("opens upward with default gap above anchor", () => {
    const anchor = { left: 100, top: 400, width: 80, height: 40 };
    const pos = computeLanguagePickerPosition(anchor, popup, viewport);
    expect(pos.top).toBe(anchor.top - LANGUAGE_PICKER_GAP_PX - popup.height);
    expect(pos.left).toBe(anchor.left);
  });

  it("clamps top to 0 when popup would extend above viewport", () => {
    const anchor = { left: 100, top: 200, width: 80, height: 40 };
    const pos = computeLanguagePickerPosition(anchor, popup, viewport);
    expect(pos.top).toBe(0);
  });

  it("shifts left when popup would overflow right edge", () => {
    const anchor = { left: 700, top: 400, width: 80, height: 40 };
    const pos = computeLanguagePickerPosition(anchor, popup, viewport);
    expect(pos.left).toBe(viewport.width - popup.width);
  });

  it("clamps left to 0 when popup is wider than viewport", () => {
    const widePopup = { width: 900, height: 200 };
    const anchor = { left: 50, top: 400, width: 80, height: 40 };
    const pos = computeLanguagePickerPosition(anchor, widePopup, viewport);
    expect(pos.left).toBe(0);
  });
});
