import type { AppSettings, LayoutSnapshot, PointerInputKind } from "./types";

const LAYOUT_PARTIAL_KEYS = [
  "sectionStack",
  "inputRowRightRatio",
  "windowHeightRatio",
] as const satisfies ReadonlyArray<keyof AppSettings>;

export function snapshotFromSettings(settings: AppSettings): LayoutSnapshot {
  // Build via Object.assign so union-keyed indexed writes stay assignable.
  const snap: LayoutSnapshot = {};
  for (const key of LAYOUT_PARTIAL_KEYS) {
    Object.assign(snap, { [key]: settings[key] });
  }
  return snap;
}

export function applyLayoutSnapshot(
  settings: AppSettings,
  snap: LayoutSnapshot,
): AppSettings {
  const patch: Partial<AppSettings> = {};
  for (const key of LAYOUT_PARTIAL_KEYS) {
    if (snap[key] !== undefined) {
      Object.assign(patch, { [key]: snap[key] });
    }
  }
  return { ...settings, ...patch };
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
  return LAYOUT_PARTIAL_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(partial, key),
  );
}

function isFullscreenHeightRatio(ratio: number | undefined): boolean {
  return ratio == null || ratio >= 0.999;
}

function stripFullscreenHeightFromSnapshot(
  snap: LayoutSnapshot | undefined,
): LayoutSnapshot | undefined {
  if (!snap) {
    return snap;
  }
  if (!isFullscreenHeightRatio(snap.windowHeightRatio)) {
    return snap;
  }
  if (!Object.prototype.hasOwnProperty.call(snap, "windowHeightRatio")) {
    return snap;
  }
  const next: LayoutSnapshot = { ...snap };
  delete next.windowHeightRatio;
  return next;
}

/**
 * Drop Teaching fullscreen (null / ≥ 0.999) height from both pointer-kind
 * layout snapshots so a later pointer switch cannot re-apply 1.0 onto Normal.
 */
export function stripFullscreenHeightFromLayoutSnapshots(
  settings: AppSettings,
): AppSettings {
  return {
    ...settings,
    touchLayout: stripFullscreenHeightFromSnapshot(settings.touchLayout),
    mouseLayout: stripFullscreenHeightFromSnapshot(settings.mouseLayout),
  };
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
  let next = { ...settings, ...partial };
  const clearingHeight =
    Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio") &&
    partial.windowHeightRatio === undefined;
  if (clearingHeight) {
    delete next.windowHeightRatio;
    next = stripFullscreenHeightFromLayoutSnapshots(next);
  }
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
