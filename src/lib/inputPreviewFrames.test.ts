import { afterEach, describe, expect, it, vi } from "vitest";
import { clear, getLatest, publish, subscribe } from "./inputPreviewFrames";
import type { InputPreviewFrame } from "./inputPreviewChannel";

const sample: InputPreviewFrame = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  width: 4,
  height: 2,
};

afterEach(() => {
  clear();
});

describe("inputPreviewFrames", () => {
  it("getLatest starts null and returns the published frame", () => {
    expect(getLatest()).toBeNull();
    publish(sample);
    expect(getLatest()).toBe(sample);
  });

  it("subscribe notifies on publish and clear; unsubscribe stops notifications", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);

    publish(sample);
    expect(cb).toHaveBeenCalledTimes(1);

    clear();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(getLatest()).toBeNull();

    unsub();
    publish(sample);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("publish(null) clears like clear()", () => {
    publish(sample);
    publish(null);
    expect(getLatest()).toBeNull();
  });
});
