import { describe, expect, it } from "vitest";
import { parseInputPreviewFrame } from "./inputPreviewChannel";

describe("parseInputPreviewFrame", () => {
  it("reads little-endian width/height then JPEG bytes", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const buffer = new ArrayBuffer(8 + jpeg.length);
    const view = new DataView(buffer);
    view.setUint32(0, 640, true);
    view.setUint32(4, 120, true);
    new Uint8Array(buffer, 8).set(jpeg);

    const frame = parseInputPreviewFrame(buffer);
    expect(frame).toEqual({
      width: 640,
      height: 120,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
  });

  it("returns null for a zero-length clear message", () => {
    expect(parseInputPreviewFrame(new ArrayBuffer(0))).toBeNull();
  });

  it("returns null when the header is truncated", () => {
    expect(parseInputPreviewFrame(new ArrayBuffer(7))).toBeNull();
  });
});
