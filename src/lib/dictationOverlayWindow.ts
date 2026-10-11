import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { MonitorInfo } from "./types";
import {
  resolveMainWindowMonitor,
  resolveMonitorScaleFactor,
} from "./toolWindows";

export const DICTATION_OVERLAY_LABEL = "dictation-overlay";
export const DICTATION_OVERLAY_SIZE = { width: 300, height: 76 } as const;

/**
 * Win32 monitor rects are physical pixels; Tauri WebviewWindow x/y/size are
 * logical. Place at bottom-center with a margin above the bottom edge.
 */
export function bottomCenterOnMonitor(
  monitor: MonitorInfo,
  width: number,
  height: number,
  marginBottom = 24,
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
    y: Math.round(my + mh - h - marginBottom),
    width: w,
    height: h,
  };
}

async function getMonitors(): Promise<MonitorInfo[]> {
  try {
    return await invoke<MonitorInfo[]>("cmd_list_monitors");
  } catch {
    return [];
  }
}

async function resolvePlacement(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  const monitors = await getMonitors();
  const monitor = await resolveMainWindowMonitor(monitors);
  if (!monitor) return null;
  return bottomCenterOnMonitor(
    monitor,
    DICTATION_OVERLAY_SIZE.width,
    DICTATION_OVERLAY_SIZE.height,
    24,
    resolveMonitorScaleFactor(monitor),
  );
}

async function applyOverlayPlacement(
  webview: WebviewWindow,
  placement: { x: number; y: number; width: number; height: number },
): Promise<void> {
  await webview.setSize(new LogicalSize(placement.width, placement.height));
  await webview.setPosition(new LogicalPosition(placement.x, placement.y));
}

export async function showDictationOverlay(): Promise<void> {
  const placement = await resolvePlacement();
  const existing = await WebviewWindow.getByLabel(DICTATION_OVERLAY_LABEL);
  if (existing) {
    if (placement) {
      try {
        await applyOverlayPlacement(existing, placement);
      } catch (error) {
        console.error("Failed to reposition dictation overlay", error);
      }
    }
    await existing.show();
    return;
  }

  const webview = new WebviewWindow(DICTATION_OVERLAY_LABEL, {
    url: "/",
    width: placement?.width ?? DICTATION_OVERLAY_SIZE.width,
    height: placement?.height ?? DICTATION_OVERLAY_SIZE.height,
    ...(placement ? { x: placement.x, y: placement.y } : { center: true }),
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    focus: false,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    shadow: false,
    visible: true,
  });

  await new Promise<void>((resolve, reject) => {
    void webview.once("tauri://created", () => resolve());
    void webview.once("tauri://error", (event) => {
      reject(
        event.payload instanceof Error
          ? event.payload
          : new Error(String(event.payload ?? "Failed to create dictation overlay")),
      );
    });
  });

  if (placement) {
    try {
      await applyOverlayPlacement(webview, placement);
    } catch (error) {
      console.error("Failed to place dictation overlay", error);
    }
  }

  try {
    await invoke("cmd_exclude_window_from_capture", {
      label: DICTATION_OVERLAY_LABEL,
    });
  } catch (error) {
    console.error("Failed to exclude dictation overlay from capture", error);
  }
}

export async function hideDictationOverlay(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(DICTATION_OVERLAY_LABEL);
  await existing?.hide();
}
