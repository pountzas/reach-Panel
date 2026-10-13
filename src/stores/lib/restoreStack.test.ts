import { describe, expect, it } from "vitest";
import {
  peekRestore,
  popRestoreEntry,
  pushRestoreEntry,
  type RestoreStackEntry,
} from "./restoreStack";

describe("restoreStack", () => {
  it("pushRestoreEntry appends a reason/patch frame", () => {
    const next = pushRestoreEntry([], "focusMode", { mouseVisible: true });
    expect(next).toEqual([
      { reason: "focusMode", patch: { mouseVisible: true } },
    ]);
  });

  it("pushRestoreEntry skips when reason is already on the stack", () => {
    const stack: RestoreStackEntry[] = [
      { reason: "widePiano", patch: { mouseVisible: true } },
    ];
    const next = pushRestoreEntry(stack, "widePiano", { mouseVisible: false });
    expect(next).toBe(stack);
    expect(peekRestore(next, "widePiano")).toEqual({ mouseVisible: true });
  });

  it("popRestoreEntry removes the most recent matching reason and returns its patch", () => {
    const stack: RestoreStackEntry[] = [
      { reason: "focusMode", patch: { mouseVisible: true } },
      {
        reason: "teaching",
        patch: { mode: "focus", windowHeightRatio: 0.7 },
      },
    ];
    const { stack: next, patch } = popRestoreEntry(stack, "teaching");
    expect(patch).toEqual({ mode: "focus", windowHeightRatio: 0.7 });
    expect(next).toEqual([
      { reason: "focusMode", patch: { mouseVisible: true } },
    ]);
  });

  it("nested modes restore in reverse order without clobbering outer frames", () => {
    let stack: RestoreStackEntry[] = [];
    stack = pushRestoreEntry(stack, "focusMode", { mouseVisible: true });
    stack = pushRestoreEntry(stack, "widePiano", { mouseVisible: false });
    stack = pushRestoreEntry(stack, "teaching", {
      mode: "focus",
      windowHeightRatio: "unset",
    });
    stack = pushRestoreEntry(stack, "companion", { mode: "teaching" });

    const companion = popRestoreEntry(stack, "companion");
    expect(companion.patch).toEqual({ mode: "teaching" });
    stack = companion.stack;

    const teaching = popRestoreEntry(stack, "teaching");
    expect(teaching.patch).toEqual({
      mode: "focus",
      windowHeightRatio: "unset",
    });
    stack = teaching.stack;

    const wide = popRestoreEntry(stack, "widePiano");
    expect(wide.patch).toEqual({ mouseVisible: false });
    stack = wide.stack;

    const focus = popRestoreEntry(stack, "focusMode");
    expect(focus.patch).toEqual({ mouseVisible: true });
    expect(focus.stack).toEqual([]);
  });

  it("peekRestore reads without mutating", () => {
    const stack: RestoreStackEntry[] = [
      { reason: "companion", patch: { mode: "normal" } },
    ];
    expect(peekRestore(stack, "companion")).toEqual({ mode: "normal" });
    expect(peekRestore(stack, "teaching")).toBeNull();
    expect(stack).toHaveLength(1);
  });

  it("popRestoreEntry returns null when reason is absent", () => {
    const stack: RestoreStackEntry[] = [
      { reason: "focusMode", patch: { mouseVisible: true } },
    ];
    const result = popRestoreEntry(stack, "teaching");
    expect(result.patch).toBeNull();
    expect(result.stack).toBe(stack);
  });
});
