// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getSurfaceColors } from "../../lib/colorProfiles";

const mocks = vi.hoisted(() => {
  const storeState = {
    resetSettingsToDefaults: vi.fn(async () => undefined),
    wipeActiveProfile: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(async () => undefined),
    updateCheckStatus: "idle" as const,
    updateCheckError: null as string | null,
    settings: {
      autoSendLogsWeekly: undefined as boolean | undefined,
      lastAutoSendLogsAt: undefined as string | undefined,
      uiLanguage: "en",
    },
    updateSettings: vi.fn(async () => undefined),
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
  useTranslation: () => ({
    t: (key: string) =>
      key === "autoSendLogsLastSent" ? "Last sent: {date}" : key,
    language: "en",
  }),
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
const BUNDLE_FILES = [
  { name: "diagnostics.txt", size: 120 },
  { name: "reach-panel.log", size: 2048 },
  { name: "breadcrumbs.log", size: 80 },
];
const REPORT_ID = "A1B2C3D4";

describe("ToolsMaintenanceSection diagnostics", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (cmd: unknown, args?: unknown) => {
      if (cmd === "cmd_get_log_dir") return LOG_DIR;
      if (cmd === "cmd_open_log_dir") return undefined;
      if (cmd === "cmd_collect_diagnostics") return REPORT;
      if (cmd === "cmd_diagnostics_upload_available") return true;
      if (cmd === "cmd_send_diagnostics") {
        const send =
          args !== null &&
          typeof args === "object" &&
          "send" in args &&
          (args as { send?: boolean }).send === true;
        if (send) {
          return { configured: true, files: BUNDLE_FILES, reportId: REPORT_ID };
        }
        return { configured: true, files: BUNDLE_FILES };
      }
      return undefined;
    });
    mocks.notify.success.mockReset();
    mocks.notify.error.mockReset();
    mocks.writeText.mockReset();
    mocks.storeState.settings.autoSendLogsWeekly = undefined;
    mocks.storeState.settings.lastAutoSendLogsAt = undefined;
    mocks.storeState.settings.uiLanguage = "en";
    mocks.storeState.updateSettings.mockReset();
    mocks.storeState.updateSettings.mockImplementation(async () => undefined);
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
    expect(mocks.invoke).not.toHaveBeenCalledWith("cmd_send_diagnostics", {
      send: false,
    });
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

  it("hides Send logs when upload is not configured", async () => {
    mocks.invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "cmd_get_log_dir") return LOG_DIR;
      if (cmd === "cmd_diagnostics_upload_available") return false;
      return undefined;
    });
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    expect(screen.getByRole("button", { name: "openLogsFolder" })).toBeTruthy();
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith(
        "cmd_diagnostics_upload_available",
      );
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      "cmd_send_diagnostics",
      expect.anything(),
    );
    expect(screen.queryByRole("button", { name: "sendLogs" })).toBeNull();
  });

  it("opens a consent dialog that lists bundle contents", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "sendLogs" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("diagnostics.txt")).toBeTruthy();
    expect(within(dialog).getByText("reach-panel.log")).toBeTruthy();
    expect(within(dialog).getByText("breadcrumbs.log")).toBeTruthy();
    expect(within(dialog).getByText("sendLogsPrivacyTyped")).toBeTruthy();
    expect(within(dialog).getByText("sendLogsPrivacyUsername")).toBeTruthy();
    expect(within(dialog).getByText("sendLogsDestination")).toBeTruthy();
  });

  it("sends logs through cmd_send_diagnostics and shows the report id", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "sendLogs" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "sendLogsSend" }),
    );
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("cmd_send_diagnostics", {
        send: true,
        note: null,
      });
    });
    expect(await screen.findByText(REPORT_ID)).toBeTruthy();
    expect(screen.getByRole("button", { name: "sendLogsCopyId" })).toBeTruthy();
  });

  it("shows the open-logs fallback when sending fails", async () => {
    mocks.invoke.mockImplementation(async (cmd: unknown, args?: unknown) => {
      if (cmd === "cmd_get_log_dir") return LOG_DIR;
      if (cmd === "cmd_open_log_dir") return undefined;
      if (cmd === "cmd_diagnostics_upload_available") return true;
      if (cmd === "cmd_send_diagnostics") {
        const send =
          args !== null &&
          typeof args === "object" &&
          "send" in args &&
          (args as { send?: boolean }).send === true;
        if (send) throw new Error("http_429");
        return { configured: true, files: BUNDLE_FILES };
      }
      return undefined;
    });
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "sendLogs" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "sendLogsSend" }),
    );
    expect(await screen.findByText("sendLogsFailedRateLimited")).toBeTruthy();
    expect(screen.getByRole("button", { name: "sendLogsSend" })).toBeTruthy();
    const fallback = screen.getAllByRole("button", { name: "openLogsFolder" });
    expect(fallback.length).toBeGreaterThan(0);
    fireEvent.click(fallback[fallback.length - 1]);
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("cmd_open_log_dir");
    });
  });

  it("shows the weekly auto-send switch off when upload is configured and the setting is unset", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    const toggle = await screen.findByRole("switch", {
      name: "autoSendLogsWeekly",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getAllByText("sendLogsDestination").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("hides the weekly auto-send switch when upload is not configured", async () => {
    mocks.invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "cmd_get_log_dir") return LOG_DIR;
      if (cmd === "cmd_diagnostics_upload_available") return false;
      return undefined;
    });
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith(
        "cmd_diagnostics_upload_available",
      );
    });
    expect(
      screen.queryByRole("switch", { name: "autoSendLogsWeekly" }),
    ).toBeNull();
  });

  it("persists the weekly auto-send switch through updateSettings", async () => {
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    fireEvent.click(
      await screen.findByRole("switch", { name: "autoSendLogsWeekly" }),
    );
    expect(mocks.storeState.updateSettings).toHaveBeenCalledWith({
      autoSendLogsWeekly: true,
    });
  });

  it("shows last sent when lastAutoSendLogsAt is a parseable date", async () => {
    mocks.storeState.settings.lastAutoSendLogsAt = "2026-01-15T12:00:00.000Z";
    const formatted = new Date("2026-01-15T12:00:00.000Z").toLocaleDateString(
      "en",
    );
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    expect(await screen.findByText(`Last sent: ${formatted}`)).toBeTruthy();
  });

  it("does not show last sent when lastAutoSendLogsAt is not a parseable date", async () => {
    mocks.storeState.settings.lastAutoSendLogsAt = "not-a-date";
    render(
      <ToolsMaintenanceSection
        surface={surface}
        secondaryButtonStyle={secondaryButtonStyle}
      />,
    );

    expect(
      await screen.findByRole("switch", { name: "autoSendLogsWeekly" }),
    ).toBeTruthy();
    expect(screen.queryByText(/Last sent:/)).toBeNull();
  });
});
