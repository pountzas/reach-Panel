/** Collapsed FAB geometry — keep in sync with src-tauri/src/window/mod.rs */

import type { CSSProperties } from "react";
import type { AppSettings, MonitorInfo, TransparentKeyColor } from "./types";

export const COLLAPSED_FAB_SIZE = 56;
export const COLLAPSED_FAB_GAP = 12;
export const COLLAPSED_FAB_PAD = 10;
/** Extra px for hover scale headroom (~5% of 56px). */
export const FAB_HOVER_SLACK = 6;

/** Default mini-mode keyboard height as fraction of full monitor height. Keep in sync with Rust. */
export const MINI_KEYBOARD_HEIGHT_RATIO = 0.42;

/** Fraction of the smaller monitor area that must overlap to count as mirrored. */
export const MIRROR_OVERLAP_RATIO = 0.9;

export const TRANSPARENT_KEY_COLORS: readonly TransparentKeyColor[] = [
  "white",
  "dark-gray",
  "silver",
] as const;

export type CollapsedFabCount = 1 | 2 | 3;

function collapsedFabStackHeight(count: CollapsedFabCount): number {
  switch (count) {
    case 1:
      return COLLAPSED_FAB_SIZE;
    case 2:
      return COLLAPSED_FAB_SIZE * 2 + COLLAPSED_FAB_GAP;
    case 3:
      return COLLAPSED_FAB_SIZE * 3 + COLLAPSED_FAB_GAP * 2;
    default: {
      const _exhaustive: never = count;
      return _exhaustive;
    }
  }
}

/** Minimum content area inside padding; matches Rust compute_collapsed_dimensions minus pad. */
export function collapsedFabContentMinSize(count: CollapsedFabCount): {
  minWidth: number;
  minHeight: number;
} {
  const stackHeight = collapsedFabStackHeight(count);
  return {
    minWidth: COLLAPSED_FAB_SIZE + FAB_HOVER_SLACK,
    minHeight: stackHeight + FAB_HOVER_SLACK,
  };
}

function monitorArea(m: MonitorInfo): number {
  return Math.max(0, m.width) * Math.max(0, m.height);
}

function intersectionArea(a: MonitorInfo, b: MonitorInfo): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  return (ix2 - ix1) * (iy2 - iy1);
}

/** True when work areas overlap by ≥90% of the smaller monitor area (mirrored duplicate). */
export function monitorsOverlap(a: MonitorInfo, b: MonitorInfo): boolean {
  const smaller = Math.min(monitorArea(a), monitorArea(b));
  if (smaller <= 0) return false;
  return intersectionArea(a, b) / smaller >= MIRROR_OVERLAP_RATIO;
}

/** True when two or more listed monitors significantly overlap (typical Windows mirror duplicate entries). */
export function isMirroredSetup(monitors: MonitorInfo[]): boolean {
  const hasMirrorFlag = monitors.some((m) => m.is_mirror_duplicate !== undefined);
  if (hasMirrorFlag) {
    return monitors.some((m) => m.is_mirror_duplicate === true);
  }
  for (let i = 0; i < monitors.length; i++) {
    for (let j = i + 1; j < monitors.length; j++) {
      if (monitorsOverlap(monitors[i]!, monitors[j]!)) return true;
    }
  }
  return false;
}

/** Mini mode is eligible on a single display or a mirrored multi-display setup. */
export function isMiniModeEligible(monitors: MonitorInfo[]): boolean {
  if (monitors.length === 0) return false;
  return monitors.length === 1 || isMirroredSetup(monitors);
}

/**
 * Resolve whether mini mode should be active.
 * - `miniModeOverride: true` → force on
 * - `miniModeOverride: false` → force off
 * - `null` / `undefined` → auto (eligible = single or mirrored)
 */
export function resolveMiniModeEnabled(
  settings: AppSettings,
  monitors: MonitorInfo[],
): boolean {
  const override = settings.miniModeOverride;
  if (override === true) return true;
  if (override === false) return false;
  return isMiniModeEligible(monitors);
}

/** True when mini mode is active and the transparent keyboard setting is on. */
export function isTransparentUiActive(
  settings: AppSettings,
  miniModeActive: boolean,
): boolean {
  return Boolean(miniModeActive && settings.miniModeTransparent);
}

export function resolveTransparentKeyColor(
  id?: string | null,
): TransparentKeyColor {
  switch (id) {
    case "white":
    case "dark-gray":
    case "silver":
      return id;
    default:
      return "white";
  }
}

export function transparentKeyPalette(id?: string | null): {
  border: string;
  text: string;
} {
  const resolved = resolveTransparentKeyColor(id);
  switch (resolved) {
    case "white":
      return { border: "rgba(255,255,255,0.9)", text: "#ffffff" };
    case "dark-gray":
      return { border: "#4b5563", text: "#4b5563" };
    case "silver":
      return { border: "#c0c0c0", text: "#c0c0c0" };
    default: {
      const _exhaustive: never = resolved;
      return _exhaustive;
    }
  }
}

export function nextTransparentKeyColor(
  current?: string | null,
): TransparentKeyColor {
  const resolved = resolveTransparentKeyColor(current);
  const idx = TRANSPARENT_KEY_COLORS.indexOf(resolved);
  const next = TRANSPARENT_KEY_COLORS[(idx + 1) % TRANSPARENT_KEY_COLORS.length];
  return next ?? "white";
}

/** High-contrast outlined control style for transparent mini mode. */
export function transparentOutlineStyle(
  options: {
    active?: boolean;
    color?: string;
    outlineColor?: TransparentKeyColor | string | null;
  } = {},
): CSSProperties {
  const palette = transparentKeyPalette(options.outlineColor);
  const outlineShadow = "0 0 0 1px rgba(0,0,0,0.5)";
  return {
    backgroundColor: "transparent",
    border: `2px solid ${palette.border}`,
    boxShadow: options.active
      ? `${outlineShadow}, inset 0 0 0 2px rgba(147,197,253,0.95)`
      : outlineShadow,
    color: options.color ?? palette.text,
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  };
}
