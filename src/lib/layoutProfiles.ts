import type { AppSettings, LayoutSnapshot, PointerInputKind } from "./types";

/** Fields swapped between touchLayout / mouseLayout. Height is shared (#224 / #299). */
const LAYOUT_PARTIAL_KEYS = [
  "sectionStack",
  "inputRowRightRatio",
] as const satisfies readonly (keyof AppSettings)[];

/** Ignore synthetic mouse events for this long after a real touch/pen. */
export const POINTER_MOUSE_GUARD_MS = 500;

export type PointerKindEventInput = {
  pointerType: string;
  isPrimary: boolean;
  button: number;
};

export type PointerKindContext = {
  lastTouchAtMs?: number | null;
  nowMs?: number;
};

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

/**
 * Classify pointer input for touch↔mouse layout swap.
 * Mouse only when primary left-button mouse and no touch/pen in the guard window.
 * Pen counts as touch. Unknown types / non-left / non-primary / guarded mouse → null (ignore).
 */
export function pointerKindFromEvent(
  input: PointerKindEventInput,
  context: PointerKindContext = {},
): PointerInputKind | null {
  const pointerType = input.pointerType.toLowerCase();
  if (pointerType === "touch" || pointerType === "pen") {
    return "touch";
  }
  // Unknown types and non-primary / non-left mouse buttons never swap layouts.
  if (pointerType !== "mouse" || !input.isPrimary || input.button !== 0) {
    return null;
  }
  const nowMs = context.nowMs ?? 0;
  const lastTouchAtMs = context.lastTouchAtMs;
  if (
    lastTouchAtMs != null &&
    nowMs - lastTouchAtMs < POINTER_MOUSE_GUARD_MS
  ) {
    // Synthetic mouse right after a touch/pen: ignore.
    return null;
  }
  return "mouse";
}

/**
 * #299: old pointer-kind swaps copied a stale ~1.0 snapshot height into the flat
 * ratio and persisted it. Clear the flat value when that signature is present.
 */
export function repairStaleFullscreenFlatHeight(
  settings: AppSettings,
): { settings: AppSettings; repaired: boolean } {
  const hadStaleSnapshotHeight =
    (settings.touchLayout?.windowHeightRatio ?? 0) >= 0.999 ||
    (settings.mouseLayout?.windowHeightRatio ?? 0) >= 0.999;
  const repair =
    hadStaleSnapshotHeight && (settings.windowHeightRatio ?? 0) >= 0.999;
  if (!repair) {
    return { settings, repaired: false };
  }
  const next = { ...settings };
  delete next.windowHeightRatio;
  return { settings: next, repaired: true };
}
