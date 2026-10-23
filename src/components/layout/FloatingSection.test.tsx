// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const { storeState } = vi.hoisted(() => ({
  storeState: {
    setAppMode: vi.fn(async () => undefined),
    restoreStack: [] as unknown[],
    musicTeachingEnabled: false,
    settings: {
      appBgColor: "#f1f5f9",
    },
    teachingLesson: "spelling" as const,
  },
}));

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock("../../hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../lib/pointerDrag", () => ({
  usePointerDragActive: () => false,
}));

vi.mock("../teaching/TeachingLessonModeToggle", () => ({
  TeachingLessonModeToggle: () => null,
}));

vi.mock("react-rnd", () => ({
  Rnd: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

import { FloatingSection } from "./FloatingSection";

describe("FloatingSection paint containment", () => {
  beforeEach(() => {
    storeState.musicTeachingEnabled = false;
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      appBgColor: "#f1f5f9",
    };
  });

  it("applies contain layout paint on the section container", () => {
    const { container } = render(
      <FloatingSection
        id="teaching"
        rect={{ xPct: 10, yPct: 10, wPct: 40, hPct: 40 }}
        minimized={false}
        containerWidth={800}
        containerHeight={600}
        onRectChange={() => undefined}
        onDock={() => undefined}
        onToggleMinimize={() => undefined}
        onDropProbe={() => undefined}
        onDragStop={() => undefined}>
        <div>content</div>
      </FloatingSection>,
    );

    const panel = container.querySelector(".rounded-md.border.shadow-lg");
    expect(panel).toBeTruthy();
    expect((panel as HTMLElement).style.contain).toBe("layout paint");
  });
});
