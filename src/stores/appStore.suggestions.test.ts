import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";

const pending: ((v: { word: string }[]) => void)[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_suggestions") {
      return new Promise<{ word: string }[]>((resolve) => {
        pending.push(resolve);
      });
    }
    if (cmd === "cmd_get_input_focused") {
      return Promise.resolve(false);
    }
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

import { useAppStore } from "./appStore";

describe("loadSuggestions stale-result guard", () => {
  beforeEach(() => {
    pending.length = 0;
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
      },
      typedBuffer: "",
      suggestions: [],
    });
  });

  it("drops a stale result that resolves after a newer request", async () => {
    useAppStore.setState({ typedBuffer: "he" });
    const first = useAppStore.getState().loadSuggestions();
    useAppStore.setState({ typedBuffer: "hel" });
    const second = useAppStore.getState().loadSuggestions();

    expect(pending).toHaveLength(2);
    pending[1]([{ word: "hello" }]);
    await second;
    pending[0]([{ word: "hey" }]);
    await first;

    expect(useAppStore.getState().suggestions).toEqual(["hello"]);
  });

  it("keeps suggestions empty when a request resolves after the buffer was cleared", async () => {
    useAppStore.setState({ typedBuffer: "he", suggestions: ["hey"] });
    const inFlight = useAppStore.getState().loadSuggestions();
    expect(pending).toHaveLength(1);

    useAppStore.getState().appendTyped(" ");
    expect(useAppStore.getState().suggestions).toEqual([]);

    pending[0]([{ word: "hey" }]);
    await inFlight;

    expect(useAppStore.getState().suggestions).toEqual([]);
  });
});
