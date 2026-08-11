import type { AppSettings, LayoutSnapshot, PointerInputKind } from "./types";

export function snapshotFromSettings(settings: AppSettings): LayoutSnapshot {
  return {
    sectionStack: settings.sectionStack,
    inputRowRightRatio: settings.inputRowRightRatio,
    windowHeightRatio: settings.windowHeightRatio,
  };
}

export function applyLayoutSnapshot(
  settings: AppSettings,
  snap: LayoutSnapshot,
): AppSettings {
  return {
    ...settings,
    ...(snap.sectionStack !== undefined
      ? { sectionStack: snap.sectionStack }
      : {}),
    ...(snap.inputRowRightRatio !== undefined
      ? { inputRowRightRatio: snap.inputRowRightRatio }
      : {}),
    ...(snap.windowHeightRatio !== undefined
      ? { windowHeightRatio: snap.windowHeightRatio }
      : {}),
  };
}

export function resolveActiveLayout(
  settings: AppSettings,
  kind: PointerInputKind,
): AppSettings {
  const snap =
    kind === "touch" ? settings.touchLayout : settings.mouseLayout;
  if (!snap) {
    return settings;
  }
  return applyLayoutSnapshot(settings, snap);
}

export function persistLayoutForKind(
  settings: AppSettings,
  kind: PointerInputKind,
): AppSettings {
  const snap = snapshotFromSettings(settings);
  switch (kind) {
    case "touch":
      return { ...settings, touchLayout: snap };
    case "mouse":
      return { ...settings, mouseLayout: snap };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
