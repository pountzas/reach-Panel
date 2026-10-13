// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { DictationVisualizer } from "./DictationVisualizer";

const motionMocks = vi.hoisted(() => ({
  prefersReducedMotion: vi.fn(() => false),
}));

vi.mock("../../lib/motion", () => ({
  prefersReducedMotion: motionMocks.prefersReducedMotion,
  subscribePrefersReducedMotion: () => () => {},
  MOTION: { fast: 120, base: 200, slow: 300 },
}));

describe("DictationVisualizer", () => {
  beforeEach(() => {
    motionMocks.prefersReducedMotion.mockReturnValue(false);
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) =>
        window.setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) =>
      window.clearTimeout(id),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not use height style on bars when active with captureAudio false", async () => {
    const { container } = render(
      <DictationVisualizer active captureAudio={false} />,
    );
    await vi.waitFor(() => {
      const bar = container.querySelector("span");
      expect(bar).toBeTruthy();
      expect((bar as HTMLElement).style.height).toBe(`${22 /* MAX_BAR */}px`);
      expect((bar as HTMLElement).style.transform).toMatch(/scaleY/);
    });
  });

  it("paints a static scaleY once when reduced motion is preferred", () => {
    motionMocks.prefersReducedMotion.mockReturnValue(true);
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);

    const { container } = render(
      <DictationVisualizer active captureAudio={false} />,
    );

    const bar = container.querySelector("span") as HTMLElement | null;
    expect(bar).toBeTruthy();
    expect(bar?.style.height).toBe("22px");
    expect(bar?.style.transform).toMatch(/scaleY\(0\.265/);
    expect(raf).not.toHaveBeenCalled();
  });

  it("sets will-change transform only while active and unmounts when idle", () => {
    const { container, rerender } = render(
      <DictationVisualizer active captureAudio={false} />,
    );
    const graph = container.querySelector("[aria-hidden] > div") as HTMLElement;
    expect(graph.style.willChange).toBe("transform");
    rerender(<DictationVisualizer active={false} captureAudio={false} />);
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });
});
