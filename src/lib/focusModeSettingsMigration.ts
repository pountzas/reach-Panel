/**
 * Maps persisted Mini Mode settings keys onto Focus mode keys.
 * Prefer already-migrated focusMode* values when both are present.
 */
export function migrateLegacyFocusModeSettingsKeys(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...parsed };

  const take = (legacyKey: string, nextKey: string) => {
    if (next[nextKey] === undefined && legacyKey in next) {
      next[nextKey] = next[legacyKey];
    }
    delete next[legacyKey];
  };

  take("miniModeOverride", "focusModeOverride");
  take("miniModeTransparent", "focusModeTransparent");
  take("inputPreviewMiniModeVisible", "inputPreviewFocusModeVisible");

  return next;
}
