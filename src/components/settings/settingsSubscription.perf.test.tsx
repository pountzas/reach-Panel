// @vitest-environment jsdom
/**
 * React Profiler harness for issue #281 (one settings change scenario).
 * Mounts components that currently subscribe to the whole `settings` object and
 * counts update commits when an unrelated field (`mouseSpeed`) changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { act, render } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
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

vi.mock("../../lib/dictationOverlayWindow", () => ({
  showDictationOverlay: vi.fn(() => Promise.resolve()),
  hideDictationOverlay: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: vi.fn(() => true),
  afterNextPaint: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../hooks/useCompanionTabletEnabled", () => ({
  useCompanionTabletEnabled: () => false,
}));

import { useAppStore } from "../../stores/appStore";
import { MathLessonPanel } from "../teaching/MathLessonPanel";
import { InputAreaViewButtons } from "../layout/InputAreaViewButtons";
import { InputPreview } from "../keyboard/InputPreview";
import { ModeMenu } from "../layout/ModeMenu";

type Stats = { commits: number; totalActualMs: number };

function makeOnRender(stats: Stats): ProfilerOnRenderCallback {
  return (_id, phase, actualDuration) => {
    if (phase === "update") {
      stats.commits += 1;
      stats.totalActualMs += actualDuration;
    }
  };
}

describe("settings subscription profiler (#281)", () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      focusModeActive: false,
      externalInputFocused: false,
      companionModeActive: false,
      musicTeachingEnabled: false,
      modeMenuOpen: true,
      isAnimatingWindow: false,
      profileHydrated: true,
    });
  });

  it("records commits when an unrelated settings field changes", () => {
    const mathStats: Stats = { commits: 0, totalActualMs: 0 };
    const buttonsStats: Stats = { commits: 0, totalActualMs: 0 };
    const previewStats: Stats = { commits: 0, totalActualMs: 0 };
    const menuStats: Stats = { commits: 0, totalActualMs: 0 };

    render(
      <>
        <Profiler id="math" onRender={makeOnRender(mathStats)}>
          <MathLessonPanel />
        </Profiler>
        <Profiler id="buttons" onRender={makeOnRender(buttonsStats)}>
          <InputAreaViewButtons />
        </Profiler>
        <Profiler id="preview" onRender={makeOnRender(previewStats)}>
          <InputPreview />
        </Profiler>
        <Profiler id="menu" onRender={makeOnRender(menuStats)}>
          <ModeMenu onShowKeyboard={() => undefined} />
        </Profiler>
      </>,
    );

    mathStats.commits = 0;
    buttonsStats.commits = 0;
    previewStats.commits = 0;
    menuStats.commits = 0;
    mathStats.totalActualMs = 0;
    buttonsStats.totalActualMs = 0;
    previewStats.totalActualMs = 0;
    menuStats.totalActualMs = 0;

    act(() => {
      useAppStore.setState({
        settings: {
          ...useAppStore.getState().settings,
          mouseSpeed: "fast",
        },
      });
    });

    const subscriberCommits =
      mathStats.commits +
      buttonsStats.commits +
      previewStats.commits +
      menuStats.commits;
    const totalActualMs =
      mathStats.totalActualMs +
      buttonsStats.totalActualMs +
      previewStats.totalActualMs +
      menuStats.totalActualMs;

    console.log(
      JSON.stringify({
        scenario: "settings-mouseSpeed-change",
        unrelatedField: "mouseSpeed",
        components: {
          MathLessonPanel: mathStats,
          InputAreaViewButtons: buttonsStats,
          InputPreview: previewStats,
          ModeMenu: menuStats,
        },
        subscriberCommits,
        totalActualMs: Number(totalActualMs.toFixed(3)),
      }),
    );

    // After field-level selects, unrelated mouseSpeed must not re-render these.
    expect(mathStats.commits).toBe(0);
    expect(buttonsStats.commits).toBe(0);
    expect(previewStats.commits).toBe(0);
    expect(menuStats.commits).toBe(0);
    expect(subscriberCommits).toBe(0);
  });
});
