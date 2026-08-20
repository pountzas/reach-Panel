import { describe, expect, it } from "vitest";
import { applyGreekKeystroke, type GreekPendingAccent } from "./greekCompose";

describe("applyGreekKeystroke", () => {
  it("composes Greek tonos mark (U+0384) then vowel", () => {
    let buffer = "";
    let pending: GreekPendingAccent | null = null;

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u0384"));
    expect(buffer).toBe("");
    expect(pending).toBe("tonos");

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u03B9"));
    expect(buffer).toBe("\u03AF");
    expect(pending).toBeNull();
  });

  it("composes tonos then vowel like a physical Greek keyboard", () => {
    let buffer = "";
    let pending: GreekPendingAccent | null = null;

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u00B4"));
    expect(buffer).toBe("");
    expect(pending).toBe("tonos");

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u03B1"));
    expect(buffer).toBe("\u03AC");
    expect(pending).toBeNull();
  });

  it("recognizes tonos from empty live-layout output on the ; key", () => {
    let buffer = "";
    let pending: GreekPendingAccent | null = null;

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "", ";"));
    expect(pending).toBe("tonos");

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u03B5"));
    expect(buffer).toBe("\u03AD");
    expect(pending).toBeNull();
  });

  it("appends a literal semicolon when Windows returns ; as text", () => {
    const result = applyGreekKeystroke("", null, ";", ";");
    expect(result.pending).toBeNull();
    expect(result.buffer).toBe(";");
  });

  it("appends a literal apostrophe when Windows returns ' as text", () => {
    const result = applyGreekKeystroke("", null, "'", "'");
    expect(result.pending).toBeNull();
    expect(result.buffer).toBe("'");
  });

  it("composes dialytika then iota", () => {
    let buffer = "";
    let pending: GreekPendingAccent | null = null;

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "", "'"));
    expect(pending).toBe("dialytika");

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u03B9"));
    expect(buffer).toBe("\u03CA");
    expect(pending).toBeNull();
  });

  it("composes tonos + dialytika on upsilon", () => {
    let buffer = "";
    let pending: GreekPendingAccent | null = null;

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u00B4"));
    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u00A8"));
    expect(pending).toBe("tonos_dialytika");

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u03C5"));
    expect(buffer).toBe("\u03B0");
    expect(pending).toBeNull();
  });

  it("drops pending accent when the next key cannot take it", () => {
    let buffer = "";
    let pending: GreekPendingAccent | null = null;

    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u00B4"));
    ({ buffer, pending } = applyGreekKeystroke(buffer, pending, "\u03C1"));
    expect(buffer).toBe("\u03C1");
    expect(pending).toBeNull();
  });

  it("passes through already-composed characters from hardware input", () => {
    const result = applyGreekKeystroke("", null, "\u03AC");
    expect(result).toEqual({ buffer: "\u03AC", pending: null });
  });
});
