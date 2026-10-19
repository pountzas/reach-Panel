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
    teachingKeyboardMinimized: false,
  },
}));

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock("../../hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../hooks/useFlipLayoutTransition", () => ({
  useFlipLayoutTransition: () => undefined,
}));

vi.mock("./InputAreaViewButtons", () => ({
  InputAreaViewButtons: () => null,
}));

vi.mock("./TeachingKeyboardHeaderControls", () => ({
  TeachingKeyboardHeaderControls: () => null,
}));

vi.mock("../teaching/TeachingLessonModeToggle", () => ({
  TeachingLessonModeToggle: () => null,
}));

import { DockedSection } from "./DockedSection";

describe("DockedSection paint containment", () => {
  beforeEach(() => {
    storeState.musicTeachingEnabled = false;
    storeState.teachingKeyboardMinimized = false;
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      appBgColor: "#f1f5f9",
    };
  });

  it("applies contain layout paint on the section container", () => {
    const { container } = render(
      <DockedSection
        slot={{
          id: "teaching",
          y: 0,
          height: 200,
          isHole: false,
          isMinimized: false,
        }}
        width={400}
        onToggleMinimize={() => undefined}
        onUndock={() => undefined}
        onReorderDrag={() => undefined}
      >
        <div>content</div>
      </DockedSection>,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.style.contain).toBe("layout paint");
  });
});
