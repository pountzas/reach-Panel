import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { MonitorInfo } from "./types";

export const TOOL_WINDOW_LABELS = [
  "settings",
  "macro-builder",
  "head-tracking",
] as const;

export type ToolWindowLabel = (typeof TOOL_WINDOW_LABELS)[number];

export const PROFILE_UPDATED_EVENT = "profile-updated";

export const TOOL_WINDOW_SIZE = { width: 900, height: 700 } as const;

export const TOOL_WINDOW_TITLES: Record<ToolWindowLabel, string> = {
  settings: "Settings",
  "macro-builder": "Macro Builder",
  "head-tracking": "Head Tracking",
};

export function isToolWindowLabel(label: string): label is ToolWindowLabel {
  return (TOOL_WINDOW_LABELS as readonly string[]).includes(label);
}

export function centerOnMonitor(
  monitor: MonitorInfo,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: Math.round(monitor.x + (monitor.width - width) / 2),
    y: Math.round(monitor.y + (monitor.height - height) / 2),
  };
}

export function resolveMonitor(
  monitors: MonitorInfo[],
  monitorId: number,
): MonitorInfo | undefined {
  return (
    monitors.find((m) => m.id === monitorId) ??
    monitors.find((m) => m.is_primary) ??
    monitors[0]
  );
}

export async function openToolWindow(
  label: ToolWindowLabel,
  options: {
    title: string;
    monitor?: MonitorInfo;
    onDestroyed?: () => void;
  },
): Promise<void> {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const { width, height } = TOOL_WINDOW_SIZE;
  const position = options.monitor
    ? centerOnMonitor(options.monitor, width, height)
    : null;

  const webview = new WebviewWindow(label, {
    url: "/",
    title: options.title,
    width,
    height,
    ...(position ? { x: position.x, y: position.y } : { center: true }),
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    focus: true,
    focusable: true,
    visible: true,
  });

  await new Promise<void>((resolve, reject) => {
    void webview.once("tauri://created", () => resolve());
    void webview.once("tauri://error", (event) => {
      reject(
        event.payload instanceof Error
          ? event.payload
          : new Error(String(event.payload ?? "Failed to create tool window")),
      );
    });
  });

  if (options.onDestroyed) {
    const onDestroyed = options.onDestroyed;
    void webview.once("tauri://destroyed", () => {
      onDestroyed();
    });
  }
}

export async function closeToolWindow(label: ToolWindowLabel): Promise<void> {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.close();
  }
}

export async function closeAllToolWindows(): Promise<void> {
  await Promise.all(TOOL_WINDOW_LABELS.map((label) => closeToolWindow(label)));
}
