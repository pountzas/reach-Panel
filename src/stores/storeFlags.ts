import type { PointerInputKind } from "../lib/types";

/**
 * Module-level mutable flags/timers owned by the app store.
 * Kept in one object so slices can read/write without TS import-assignment errors.
 * Each field still "belongs" to a domain slice conceptually (see comments).
 */
export const storeFlags = {
  /** errors slice — avoid re-toasting the same backend error until it clears. */
  lastAnnouncedError: null as string | null,
  /** typing slice — block OS→UI language sync while a switch is in flight. */
  typingLanguageSwitchInFlight: false,
  /** suggestions slice — drop stale cmd_get_suggestions results. */
  suggestionsRequestId: 0,
  /** window slice — last live-preview window height ratio. */
  liveHeightRatioPreview: null as number | null,
  /** window slice — coalesce live resize IPC to one apply per frame. */
  liveHeightRatioRaf: null as number | null,
  liveHeightRatioPending: null as number | null,
  liveHeightRatioInFlight: false,
  /** focusMode slice — retry mini layout sync after in-flight animation. */
  pendingFocusLayoutSync: null as boolean | null,
  focusLayoutSyncInFlight: false,
  /** focusMode slice — in-flight mode-menu window expand. */
  modeMenuExpandPending: null as Promise<void> | null,
  /** profile slice — coalesce rapid touch↔mouse pointerdowns. */
  pendingPointerInputKind: null as PointerInputKind | null,
  pointerInputKindDebounceTimer: null as ReturnType<typeof setTimeout> | null,
};
