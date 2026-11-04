// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getSurfaceColors } from "../../lib/colorProfiles";

const mocks = vi.hoisted(() => {
  const storeState = {
    resetSettingsToDefaults: vi.fn(async () => undefined),
    wipeActiveProfile: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(async () => undefined),
    updateCheckStatus: "idle" as const,
    updateCheckError: null as string | null,
  };
  return {
    invoke: vi.fn(),
    notify: {
      success: vi.fn(),
      error: vi.fn(),
    },
    writeText: vi.fn(async () => undefined),
    storeState,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("../../lib/notify", () => ({
  notify: mocks.notify,
}));

vi.mock("../../hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../stores/appStore", () => {
  const useAppStore = (selector: (s: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState);
  useAppStore.getState = () => mocks.storeState;
  return { useAppStore };
});

import { ToolsMaintenanceSection } from "./ToolsMaintenanceSection";

const surface = getSurfaceColors("#e5e7eb");
const secondaryButtonStyle = {
  backgroundColor: surface.panelButtonBg,
  borderColor: surface.panelBorder,
  color: surface.panelText,
};
const LOG_DIR = "C:\\Users\\nik\\AppData\\Local\\com.nik.reach-panel\\logs";
const REPORT = "version: 0.17.5\nwindows_build: 22000\n";

describe("ToolsMaintenanceSection diagnostics", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "cmd_get_log_dir") return LOG_DIR;
      if (cmd === "cmd_open_log_dir") return undefined;
      if (cmd === "cmd_collect_diagnostics") return REPORT;
      return undefined;
    });
    mocks.notify.success.mockReset();
    mocks.notify.error.mockReset();
    mocks.writeText.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: mocks.writeText },
    });
  });

  it("renders open-logs and copy-diagnostics controls and the log path", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    expect(screen.getByRole("button", { name: "openLogsFolder" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "copyDiagnostics" }),
    ).toBeTruthy();
    expect(await screen.findByText(LOG_DIR)).toBeTruthy();
  });

  it("opens the logs folder through cmd_open_log_dir", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "openLogsFolder" }));
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("cmd_open_log_dir");
    });
  });

  it("copies the diagnostics report returned by cmd_collect_diagnostics", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "copyDiagnostics" }));
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("cmd_collect_diagnostics");
      expect(mocks.writeText).toHaveBeenCalledWith(REPORT);
    });
    expect(mocks.notify.success).toHaveBeenCalledWith("diagnosticsCopied");
  });

  it("toasts when copying diagnostics fails", async () => {
    mocks.writeText.mockRejectedValueOnce(new Error("denied"));
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "copyDiagnostics" }));
    await waitFor(() => {
      expect(mocks.notify.error).toHaveBeenCalledWith("copyDiagnosticsFailed");
    });
    expect(mocks.notify.success).not.toHaveBeenCalled();
  });
});
