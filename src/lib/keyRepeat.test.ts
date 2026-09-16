import { describe, expect, it, vi } from "vitest";
import {
  KEY_REPEAT_INITIAL_DELAY_MS,
  KEY_REPEAT_INTERVAL_MS,
  createSkipWhileInFlight,
} from "./keyRepeat";

describe("keyRepeat constants", () => {
  it("matches Windows-like initial delay and repeat interval", () => {
    expect(KEY_REPEAT_INITIAL_DELAY_MS).toBe(500);
    expect(KEY_REPEAT_INTERVAL_MS).toBe(33);
  });
});

describe("createSkipWhileInFlight", () => {
  it("skips while a prior async call is in flight, then accepts the next", async () => {
    const gate = createSkipWhileInFlight();
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const fn = vi.fn(() => first);

    gate.run(fn);
    gate.run(fn);
    gate.run(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(gate.isInFlight()).toBe(true);

    resolveFirst();
    await first;
    await Promise.resolve();
    expect(gate.isInFlight()).toBe(false);

    gate.run(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("allows the next run after a sync throw settles", async () => {
    const gate = createSkipWhileInFlight();
    const fn = vi.fn(() => {
      throw new Error("boom");
    });

    gate.run(fn);
    await Promise.resolve();
    await Promise.resolve();
    expect(gate.isInFlight()).toBe(false);

    const ok = vi.fn();
    gate.run(ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
