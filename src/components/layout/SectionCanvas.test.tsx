// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { act, render } from "@testing-library/react";
import { createDefaultSectionStack } from "../../lib/sectionStack";

const { storeState } = vi.hoisted(() => {
  const storeState = {
    musicTeachingEnabled: false,
    teachingLesson: "spelling" as const,
    teachingKeyboardMinimized: false,
  };
  return { storeState };
});

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock("./DockedSection", () => ({
  DockedSection: ({
    width,
    children,
  }: {
    width: number;
    children: React.ReactNode;
  }) => (
    <div data-testid="docked" data-width={width}>
      {children}
    </div>
  ),
  HolePlaceholder: () => <div data-testid="hole" />,
}));

vi.mock("./FloatingSection", () => ({
  FloatingSection: () => <div data-testid="floating" />,
}));

import { SectionCanvas } from "./SectionCanvas";

type ResizeObserverCallback = () => void;

describe("SectionCanvas resize updates", () => {
  let resizeCallback: ResizeObserverCallback | null = null;
  let observeSpy: ReturnType<typeof vi.fn>;
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let addEventListenerSpy: MockInstance;
  let size = { width: 800, height: 600 };

  beforeEach(() => {
    resizeCallback = null;
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();
    size = { width: 800, height: 600 };

    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe = observeSpy;
      disconnect = disconnectSpy;
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    addEventListenerSpy = vi.spyOn(window, "addEventListener");

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: size.height,
          right: size.width,
          width: size.width,
          height: size.height,
          toJSON: () => ({}),
        }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderCanvas() {
    let commitCount = 0;
    const onRender: ProfilerOnRenderCallback = (_id, phase) => {
      if (phase === "mount" || phase === "update") {
        commitCount += 1;
      }
    };

    const view = render(
      <Profiler id="section-canvas" onRender={onRender}>
        <SectionCanvas
          teachingVisible
          savedStack={createDefaultSectionStack()}
          onStackChange={() => undefined}
          teaching={<div data-testid="teaching">teaching</div>}
          inputRow={<div data-testid="input-row">input</div>}
        />
      </Profiler>,
    );

    return {
      view,
      commits: () => commitCount,
      fireResizeObserver: () => {
        expect(resizeCallback).toBeTypeOf("function");
        const cb = resizeCallback;
        if (!cb) throw new Error("expected resize callback");
        act(() => {
          cb();
        });
      },
    };
  }

  it("does not re-render when ResizeObserver reports an unchanged size", () => {
    vi.useFakeTimers();
    const { commits, fireResizeObserver } = renderCanvas();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    const baseline = commits();

    fireResizeObserver();
    expect(commits()).toBe(baseline);

    vi.useRealTimers();
  });

  it("re-renders at most once when ResizeObserver reports a new size", () => {
    vi.useFakeTimers();
    const { commits, fireResizeObserver } = renderCanvas();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    const baseline = commits();

    size = { width: 640, height: 480 };
    fireResizeObserver();
    expect(commits() - baseline).toBeLessThanOrEqual(1);
    expect(commits()).toBeGreaterThan(baseline);

    vi.useRealTimers();
  });

  it("registers ResizeObserver and does not listen to window resize", () => {
    vi.useFakeTimers();
    renderCanvas();
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(observeSpy).toHaveBeenCalled();
    const resizeListeners = addEventListenerSpy.mock.calls.filter(
      ([type]) => type === "resize",
    );
    expect(resizeListeners).toHaveLength(0);

    vi.useRealTimers();
  });

  it("commits at most once per changing resize frame across a 25-frame animation", () => {
    vi.useFakeTimers();
    const { commits, fireResizeObserver } = renderCanvas();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    const baseline = commits();

    const frames = 25;
    for (let i = 1; i <= frames; i++) {
      size = { width: 800, height: 600 - i * 8 };
      fireResizeObserver();
    }

    const updates = commits() - baseline;
    // Before: window resize + ResizeObserver ≈ 2 commits/frame (≈50).
    // After: one ResizeObserver path ⇒ one commit per changed frame.
    expect(updates).toBe(frames);

    vi.useRealTimers();
  });
});
