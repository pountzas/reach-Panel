import { describe, expect, it } from "vitest";
import {
  KEY_REPEAT_INITIAL_DELAY_MS,
  KEY_REPEAT_INTERVAL_MS,
} from "./keyRepeat";

describe("keyRepeat constants", () => {
  it("matches Windows-like initial delay and repeat interval", () => {
    expect(KEY_REPEAT_INITIAL_DELAY_MS).toBe(500);
    expect(KEY_REPEAT_INTERVAL_MS).toBe(33);
  });
});
