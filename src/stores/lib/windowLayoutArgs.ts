import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../../lib/types";
import { prefersReducedMotion } from "../../lib/motion";
import { resolveWindowHeightRatio } from "../../lib/sectionLayouts";
import { teachingFullWorkAreaActive } from "./teachingVisibility";

export function heightRatioFromSettings(
  settings: AppSettings,
  musicTeachingEnabled = false,
  focusMode = false,
): number {
  return resolveWindowHeightRatio(settings.windowHeightRatio, {
    teachingFullWorkArea: teachingFullWorkAreaActive(
      settings,
      musicTeachingEnabled,
    ),
    focusMode,
  });
}

export function windowLayoutInvokeArgs(
  settings: AppSettings,
  musicTeachingEnabled: boolean,
  extras?: {
    collapsed?: boolean;
    collapsedDictation?: boolean;
    collapsedSettings?: boolean;
    focusMode?: boolean;
    focusKeyboardVisible?: boolean;
    focusKeyboardHeightRatio?: number;
    heightRatio?: number;
  },
) {
  const fullWorkArea = teachingFullWorkAreaActive(
    settings,
    musicTeachingEnabled,
  );
  return {
    monitorId: settings.accessibilityMonitorId,
    collapsed: extras?.collapsed ?? settings.collapsed,
    collapsedDictation: extras?.collapsedDictation ?? false,
    collapsedSettings: extras?.collapsedSettings,
    heightRatio:
      extras?.heightRatio ??
      heightRatioFromSettings(settings, musicTeachingEnabled),
    focusMode: extras?.focusMode,
    focusKeyboardVisible: extras?.focusKeyboardVisible,
    focusKeyboardHeightRatio: extras?.focusKeyboardHeightRatio,
    fullWorkArea,
  };
}

export async function syncWindowLayoutFromSettings(
  settings: AppSettings,
  preferAnimate: boolean,
  musicTeachingEnabled = false,
) {
  const args = windowLayoutInvokeArgs(settings, musicTeachingEnabled);
  if (preferAnimate && !settings.collapsed && !prefersReducedMotion()) {
    await invoke("cmd_animate_window_layout", args);
  } else {
    await invoke("cmd_apply_window_layout", args);
  }
}
