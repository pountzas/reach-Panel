import type { AppSettings, LayoutSnapshot, PointerInputKind } from "./types";

const LAYOUT_PARTIAL_KEYS = [
  "sectionStack",
  "inputRowRightRatio",
  "windowHeightRatio",
] as const satisfies ReadonlyArray<keyof AppSettings>;

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

/** True when a settings patch includes any layout-profile fields. */
export function partialContainsLayoutFields(
  partial: Partial<AppSettings>,
): boolean {
  return LAYOUT_PARTIAL_KEYS.some((key) => partial[key] !== undefined);
}

/**
 * Merge a settings patch; when layout fields change, also snapshot into the
 * active pointer-kind profile (`touchLayout` / `mouseLayout`).
 */
export function applySettingsWithLayoutPersist(
  settings: AppSettings,
  partial: Partial<AppSettings>,
  kind: PointerInputKind,
): AppSettings {
  const next = { ...settings, ...partial };
  if (!partialContainsLayoutFields(partial)) {
    return next;
  }
  return persistLayoutForKind(next, kind);
}

/**
 * On pointer-kind switch: snapshot the outgoing kind from current flat
 * settings, then apply the incoming kind's stored layout.
 */
export function switchPointerInputKindLayout(
  settings: AppSettings,
  fromKind: PointerInputKind,
  toKind: PointerInputKind,
): AppSettings {
  if (fromKind === toKind) {
    return settings;
  }
  const withOutgoing = persistLayoutForKind(settings, fromKind);
  return resolveActiveLayout(withOutgoing, toKind);
}

export function pointerKindFromEvent(
  pointerType: string,
): PointerInputKind {
  return pointerType === "touch" ? "touch" : "mouse";
}
