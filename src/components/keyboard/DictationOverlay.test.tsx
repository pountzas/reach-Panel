// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { DictationOverlay } from "./DictationOverlay";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ engine: "whisper" })),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

vi.mock("../../hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    language: "en",
  }),
}));

vi.mock("./DictationVisualizer", () => ({
  DictationVisualizer: () => null,
}));

describe("DictationOverlay", () => {
  it("uses opacity/transform tokens instead of transition-all", () => {
    const { container } = render(<DictationOverlay />);
    const pill = container.querySelector("div.rounded-full");
    expect(pill).toBeTruthy();
    expect(pill?.className).toContain("transition-[opacity,transform]");
    expect(pill?.className).not.toContain("transition-all");
    expect((pill as HTMLElement).style.transitionDuration).toBe(
      "var(--rp-dur-base)",
    );
    expect((pill as HTMLElement).style.transitionTimingFunction).toBe(
      "var(--rp-ease-out)",
    );
  });

  it("Stop hides the pill and emits dictation-overlay-stop without waiting on invoke", async () => {
    const { emit } = await import("@tauri-apps/api/event");
    const { invoke } = await import("@tauri-apps/api/core");
    const { getByRole, container } = render(<DictationOverlay />);
    const stop = getByRole("button", { name: "dictationStop" });
    fireEvent.click(stop);
    const pill = container.querySelector("div.rounded-full");
    expect(pill?.parentElement?.className).toContain("items-end");
    expect(pill?.className).toContain("opacity-0");
    expect(emit).toHaveBeenCalledWith("dictation-overlay-stop");
    expect(invoke).not.toHaveBeenCalledWith("cmd_stop_dictation");
  });
});
