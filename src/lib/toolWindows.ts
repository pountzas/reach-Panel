import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { monitorsOverlap } from "./miniMode";
import type { MonitorInfo } from "./types";
import { isV1ToolWindowHidden } from "./v1HiddenFeatures";

export const TOOL_WINDOW_LABELS = [
  "settings",
  "macro-builder",
  "head-tracking",
] as const;

export type ToolWindowLabel = (typeof TOOL_WINDOW_LABELS)[number];

export const PROFILE_UPDATED_EVENT = "profile-updated";

/** Child tool windows emit this so main owns open/close and destroy sync. */
export const TOOL_WINDOW_REQUEST_EVENT = "tool-window-request";

export type ToolWindowRequest = {
  label: ToolWindowLabel;
  show: boolean;
};

export const TOOL_WINDOW_SIZE = { width: 900, height: 700 } as const;

export const TOOL_WINDOW_TITLES: Record<ToolWindowLabel, string> = {
  settings: "Settings",
  "macro-builder": "Macro Builder",
  "head-tracking": "Head Tracking",
};

export function isToolWindowLabel(label: string): label is ToolWindowLabel {
  return (TOOL_WINDOW_LABELS as readonly string[]).includes(label);
}

/** Prefer the monitor's reported DPI scale; fall back to 1 when missing/invalid. */
export function resolveMonitorScaleFactor(monitor: MonitorInfo): number {
  const scale = monitor.scale_factor;
  return scale != null && scale > 0 ? scale : 1;
}

/**
 * Win32 monitor rects are physical pixels; Tauri WebviewWindow x/y/size are
 * logical. Convert + center, clamping so the window stays on the work area.
 */
export function centerOnMonitor(
  monitor: MonitorInfo,
  width: number,
  height: number,
  scaleFactor = resolveMonitorScaleFactor(monitor),
): { x: number; y: number; width: number; height: number } {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  const mx = monitor.x / scale;
  const my = monitor.y / scale;
  const mw = monitor.width / scale;
  const mh = monitor.height / scale;
  const w = Math.max(1, Math.min(width, Math.floor(mw)));
  const h = Math.max(1, Math.min(height, Math.floor(mh)));
  return {
    x: Math.round(mx + (mw - w) / 2),
    y: Math.round(my + (mh - h) / 2),
    width: w,
    height: h,
  };
}

/**
 * Prefer a stable, visible target on mirrored setups: primary (or preferred)
 * over mirror-duplicate siblings that share the same work area.
 */
export function resolveToolWindowMonitor(
  monitors: MonitorInfo[],
  preferredId?: number,
): MonitorInfo | undefined {
  if (monitors.length === 0) return undefined;

  const preferred =
    preferredId != null
      ? monitors.find((m) => m.id === preferredId)
      : undefined;
  const primary = monitors.find((m) => m.is_primary);
  const candidate = preferred ?? primary ?? monitors[0];

  if (!candidate?.is_mirror_duplicate) {
    return candidate;
  }

  // Only monitors that geometrically overlap this candidate (not every mirror flag).
  const overlapping = monitors.filter(
    (m) => m.id === candidate.id || monitorsOverlap(m, candidate),
  );
  return (
    overlapping.find((m) => m.is_primary) ??
    overlapping.reduce((best, m) =>
      m.width * m.height > best.width * best.height ? m : best,
    ) ??
    candidate
  );
}

export function resolveMonitor(
  monitors: MonitorInfo[],
  monitorId: number,
): MonitorInfo | undefined {
  return resolveToolWindowMonitor(monitors, monitorId);
}

async function getMonitors(): Promise<MonitorInfo[]> {
  try {
    return await invoke<MonitorInfo[]>("cmd_list_monitors");
  } catch {
    return [];
  }
}

/** Resolve the monitor that currently contains the main window. */
export async function resolveMainWindowMonitor(
  monitors: MonitorInfo[],
): Promise<MonitorInfo | undefined> {
  try {
    const id = await invoke<number>("cmd_get_main_window_monitor");
    return resolveToolWindowMonitor(monitors, id);
  } catch {
    return resolveToolWindowMonitor(monitors);
  }
}

async function resolvePlacement(optionsMonitor?: MonitorInfo): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  const monitors = await getMonitors();
  const monitor = optionsMonitor
    ? resolveToolWindowMonitor(monitors, optionsMonitor.id) ?? optionsMonitor
    : await resolveMainWindowMonitor(monitors);
  if (!monitor) return null;
  return centerOnMonitor(
    monitor,
    TOOL_WINDOW_SIZE.width,
    TOOL_WINDOW_SIZE.height,
    resolveMonitorScaleFactor(monitor),
  );
}

async function applyToolWindowPlacement(
  webview: WebviewWindow,
  placement: { x: number; y: number; width: number; height: number },
): Promise<void> {
  await webview.setSize(new LogicalSize(placement.width, placement.height));
  await webview.setPosition(new LogicalPosition(placement.x, placement.y));
}

async function anyToolWindowOpen(): Promise<boolean> {
  for (const label of TOOL_WINDOW_LABELS) {
    if (await WebviewWindow.getByLabel(label)) {
      return true;
    }
  }
  return false;
}

/** Disable main while any tool window is open so it cannot be used underneath. */
export async function syncMainForToolWindows(): Promise<void> {
  const main = await WebviewWindow.getByLabel("main");
  if (!main) return;
  const blocked = await anyToolWindowOpen();
  await main.setEnabled(!blocked);
}

export async function openToolWindow(
  label: ToolWindowLabel,
  options: {
    title: string;
    monitor?: MonitorInfo;
    onDestroyed?: () => void;
  },
): Promise<void> {
  if (isV1ToolWindowHidden(label)) {
    return;
  }
  const placement = await resolvePlacement(options.monitor);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    // Re-anchor when reopening so a prior off-screen / DPI-wrong place is fixed.
    if (placement) {
      try {
        await applyToolWindowPlacement(existing, placement);
      } catch (error) {
        console.error("Failed to reposition tool window", error);
      }
    }
    await existing.setAlwaysOnTop(true);
    await existing.setFocus();
    await syncMainForToolWindows();
    return;
  }

  const webview = new WebviewWindow(label, {
    url: "/",
    title: options.title,
    width: placement?.width ?? TOOL_WINDOW_SIZE.width,
    height: placement?.height ?? TOOL_WINDOW_SIZE.height,
    ...(placement
      ? { x: placement.x, y: placement.y }
      : { center: true }),
    // Owned by main: stays above main in z-order on Windows.
    parent: "main",
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

  if (placement) {
    try {
      await applyToolWindowPlacement(webview, placement);
    } catch (error) {
      console.error("Failed to place tool window", error);
    }
  }

  await webview.setAlwaysOnTop(true);
  await webview.setFocusable(true);
  await webview.setFocus();
  await syncMainForToolWindows();

  if (options.onDestroyed) {
    const onDestroyed = options.onDestroyed;
    void webview.once("tauri://destroyed", () => {
      void syncMainForToolWindows().finally(() => {
        onDestroyed();
      });
    });
  } else {
    void webview.once("tauri://destroyed", () => {
      void syncMainForToolWindows();
    });
  }
}

export async function closeToolWindow(label: ToolWindowLabel): Promise<void> {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.close();
  }
  await syncMainForToolWindows();
}

export async function closeAllToolWindows(): Promise<void> {
  await Promise.all(TOOL_WINDOW_LABELS.map((label) => closeToolWindow(label)));
  await syncMainForToolWindows();
}
