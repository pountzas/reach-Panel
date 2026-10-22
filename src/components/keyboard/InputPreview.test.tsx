// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const sampleFrame = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  width: 4,
  height: 2,
};

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: "en" as const,
  },
  focusModeActive: false,
  inputPreviewFrame: sampleFrame as typeof sampleFrame | null,
  externalInputFocused: false,
};

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { InputPreview } from "./InputPreview";

describe("InputPreview blank placeholder", () => {
  beforeEach(() => {
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: "en",
    };
    storeState.focusModeActive = false;
    storeState.inputPreviewFrame = sampleFrame;
    storeState.externalInputFocused = false;
  });

  it("renders an empty frame when no text field is focused, even if a stale frame exists", () => {
    render(<InputPreview />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Waiting for preview…")).toBeNull();
    const frame = screen.getByRole("status", {
      name: "No text field selected",
    });
    expect(frame.getAttribute("aria-disabled")).toBeNull();
  });

  it("keeps a fixed frame size when unfocused so the layout does not shrink", () => {
    const { unmount } = render(<InputPreview />);
    const blank = screen.getByLabelText("No text field selected");
    expect(blank.style.width).toBe("320px");
    expect(blank.style.height).toBe("48px");
    unmount();

    storeState.externalInputFocused = true;
    storeState.inputPreviewFrame = sampleFrame;
    render(<InputPreview />);
    const live = screen.getByLabelText("Target input");
    expect(live.style.width).toBe("320px");
    expect(live.style.height).toBe("48px");
  });

  it("shows waiting text when focused and no frame has arrived", () => {
    storeState.externalInputFocused = true;
    storeState.inputPreviewFrame = null;
    render(<InputPreview />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Waiting for preview…")).toBeTruthy();
  });
});

describe("InputPreview object URL lifecycle", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let nextId: number;

  beforeEach(() => {
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: "en",
    };
    storeState.focusModeActive = false;
    storeState.inputPreviewFrame = {
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      width: 4,
      height: 2,
    };
    storeState.externalInputFocused = true;

    nextId = 0;
    createObjectURL = vi.fn(() => `blob:preview-${++nextId}`);
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates one object URL per frame and uses it as img src (no data URL)", () => {
    render(<InputPreview />);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("image/jpeg");

    const img = screen.getByRole("img", { name: "Target input" });
    expect(img.getAttribute("src")).toBe("blob:preview-1");
    expect(img.getAttribute("src")?.startsWith("data:")).toBe(false);
    expect(img.className).toContain("object-contain");
    expect(img.className).toContain("object-center");
    expect(img.getAttribute("draggable")).toBe("false");
  });

  it("revokes the previous URL when a new frame arrives", () => {
    const { rerender } = render(<InputPreview />);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    storeState.inputPreviewFrame = {
      bytes: new Uint8Array([0xff, 0xd8, 0x00, 0xd9]),
      width: 4,
      height: 2,
    };
    rerender(<InputPreview />);

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview-2");
  });

  it("revokes on clear when the frame is cleared", () => {
    const { rerender } = render(<InputPreview />);
    expect(screen.getByRole("img")).toBeTruthy();

    storeState.inputPreviewFrame = null;
    rerender(<InputPreview />);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Waiting for preview…")).toBeTruthy();
  });

  it("revokes on unmount", () => {
    const { unmount } = render(<InputPreview />);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });
});
