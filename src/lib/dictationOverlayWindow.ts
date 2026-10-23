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

function tauriErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") {
    return String(payload);
  }
  return fallback;
}

/** Groq/cpal owns the mic; a second getUserMedia stream can silence capture. */
export function overlayShouldCaptureMic(
  engine: string | null | undefined,
): boolean {
  return engine === "winrt";
}

export type OverlayPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayRect = OverlayPlacement;

/**
 * Keep the dictation pill off the on-screen keyboard: sit above `windowRect`
 * when the two overlap. Collapsed FAB stacks that do not overlap stay put.
 */
export function liftPlacementAboveWindow(
  placement: OverlayPlacement,
  windowRect: OverlayRect,
  monitorTopLogical: number,
  gap = 8,
): OverlayPlacement {
  const overlaps =
    placement.x < windowRect.x + windowRect.width &&
    placement.x + placement.width > windowRect.x &&
    placement.y < windowRect.y + windowRect.height &&
    placement.y + placement.height > windowRect.y;
  if (!overlaps) return placement;
  return {
    ...placement,
    y: Math.round(
      Math.max(monitorTopLogical, windowRect.y - placement.height - gap),
    ),
  };
}

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
): OverlayPlacement {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  const mx = monitor.x / scale;
  const my = monitor.y / scale;
  const mw = monitor.width / scale;
  const mh = monitor.height / scale;
  const w = Math.max(1, Math.min(width, Math.floor(mw)));
  const h = Math.max(1, Math.min(height, Math.floor(mh)));
  return {
    x: Math.round(mx + (mw - w) / 2),
    y: Math.round(Math.max(my, my + mh - h - marginBottom)),
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

async function resolvePlacement(): Promise<OverlayPlacement | null> {
  const monitors = await getMonitors();
  const monitor = await resolveMainWindowMonitor(monitors);
  if (!monitor) return null;
  const scale = resolveMonitorScaleFactor(monitor);
  const placement = bottomCenterOnMonitor(
    monitor,
    DICTATION_OVERLAY_SIZE.width,
    DICTATION_OVERLAY_SIZE.height,
    24,
    scale,
  );
  try {
    const main = await WebviewWindow.getByLabel("main");
    if (main && (await main.isVisible())) {
      const pos = await main.outerPosition();
      const size = await main.outerSize();
      return liftPlacementAboveWindow(
        placement,
        {
          x: pos.x / scale,
          y: pos.y / scale,
          width: size.width / scale,
          height: size.height / scale,
        },
        monitor.y / scale,
      );
    }
  } catch {
    /* keep bottom-center */
  }
  return placement;
}

async function applyOverlayPlacement(
  webview: WebviewWindow,
  placement: OverlayPlacement,
): Promise<void> {
  await webview.setSize(new LogicalSize(placement.width, placement.height));
  await webview.setPosition(new LogicalPosition(placement.x, placement.y));
}

/** Desired visibility, updated synchronously so late async work can bail out. */
let overlayWanted = false;
let overlayCreation: Promise<WebviewWindow> | null = null;

async function createOverlay(
  placement: OverlayPlacement | null,
): Promise<WebviewWindow> {
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
    visible: false, // shown by showDictationOverlay only if still wanted
  });

  await new Promise<void>((resolve, reject) => {
    void webview.once("tauri://created", () => {
      resolve();
    });
    void webview.once("tauri://error", (event) => {
      reject(
        event.payload instanceof Error
          ? event.payload
          : new Error(
              tauriErrorMessage(
                event.payload,
                "Failed to create dictation overlay",
              ),
            ),
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

  return webview;
}

function isOverlayWanted(): boolean {
  return overlayWanted;
}

export async function showDictationOverlay(): Promise<void> {
  overlayWanted = true;
  try {
    const placement = await resolvePlacement();
    let webview = await WebviewWindow.getByLabel(DICTATION_OVERLAY_LABEL);
    if (!webview) {
      overlayCreation ??= createOverlay(placement).finally(() => {
        overlayCreation = null;
      });
      webview = await overlayCreation;
    } else if (placement) {
      try {
        await applyOverlayPlacement(webview, placement);
      } catch (error) {
        console.error("Failed to reposition dictation overlay", error);
      }
    }
    // Re-check after await: hide may have won the race while show() was pending.
    if (isOverlayWanted()) await webview.show();
    if (!isOverlayWanted()) await webview.hide();
  } catch (error) {
    console.error("Failed to show dictation overlay", error);
  }
}

export async function hideDictationOverlay(): Promise<void> {
  overlayWanted = false;
  try {
    const existing = await WebviewWindow.getByLabel(DICTATION_OVERLAY_LABEL);
    await existing?.hide();
  } catch (error) {
    console.error("Failed to hide dictation overlay", error);
  }
}
