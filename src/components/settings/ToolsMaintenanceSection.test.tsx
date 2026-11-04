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
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(await screen.findByText("diagnostics.txt")).toBeTruthy();
    expect(screen.getByText("reach-panel.log")).toBeTruthy();
    expect(screen.getByText("breadcrumbs.log")).toBeTruthy();
    expect(screen.getByText("sendLogsPrivacyTyped")).toBeTruthy();
    expect(screen.getByText("sendLogsPrivacyUsername")).toBeTruthy();
    expect(screen.getByText("sendLogsDestination")).toBeTruthy();
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
});
