import { describe, expect, it } from "vitest";

import { isAbortedViewTransition } from "./registerGlobalErrorHandlers";

describe("isAbortedViewTransition", () => {
  it("matches an aborted view-transition DOMException", () => {
    const reason = new DOMException(
      "Transition was aborted because of invalid state. Viewport size changed",
      "InvalidStateError",
    );
    expect(isAbortedViewTransition(reason)).toBe(true);
  });

  it("matches AbortError with the viewport-size message", () => {
    const reason = new DOMException(
      "Transition was aborted because of invalid state. Viewport size changed",
      "AbortError",
    );
    expect(isAbortedViewTransition(reason)).toBe(true);
  });

  it("does not match a generic InvalidStateError with another message", () => {
    const reason = new DOMException(
      "The object is in an invalid state.",
      "InvalidStateError",
    );
    expect(isAbortedViewTransition(reason)).toBe(false);
  });

  it("does not match a plain Error", () => {
    expect(isAbortedViewTransition(new Error("Transition was aborted"))).toBe(
      false,
    );
  });

  it("does not match a non-Error reason", () => {
    expect(isAbortedViewTransition("Viewport size changed")).toBe(false);
    expect(isAbortedViewTransition(null)).toBe(false);
  });
});
