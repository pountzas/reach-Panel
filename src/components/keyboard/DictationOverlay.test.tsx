// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { DictationOverlay } from "./DictationOverlay";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ engine: "whisper" })),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
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
});
