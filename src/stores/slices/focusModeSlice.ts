import type { StateCreator } from "zustand";
import type { AppStore, FocusModeSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  beginFocusContentAnimWait,
  syncFocusModeWindowLayout,
  refreshFocusModeStateHelper,
  syncWindowLayoutFromSettings,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { MOTION, prefersReducedMotion } from "../../lib/motion";
import { MODE_MENU_WIDTH, modeMenuHeight } from "../../lib/focusMode";
import { APP_MODE_OPTIONS } from "../../lib/appModeLayout";

export const createFocusModeSlice: StateCreator<
  AppStore,
  [],
  [],
  FocusModeSlice
> = (set, get) => ({
  focusModeActive: false,
  focusModeKeyboardVisible: false,
  focusContentAnim: "idle" as "idle" | "enter" | "exit",
  focusModeManualExpand: false,
  focusModeSuppressAutoShow: false,
  modeMenuOpen: false,
  mouseVisibleBeforeFocusMode: null,
  openModeMenu: async () => {
    if (get().isAnimatingWindow || get().modeMenuOpen) {
      return;
    }
    set({ modeMenuOpen: true });
    const pending = invoke<void>("cmd_expand_window_for_mode_menu", {
      menuWidth: MODE_MENU_WIDTH,
      menuHeight: modeMenuHeight(1 + APP_MODE_OPTIONS.length),
    }).catch((error: unknown) => {
      console.error("cmd_expand_window_for_mode_menu failed", error);
      set({ modeMenuOpen: false });
    });
    storeFlags.modeMenuExpandPending = pending;
    try {
      await pending;
    } finally {
      if (storeFlags.modeMenuExpandPending === pending) storeFlags.modeMenuExpandPending = null;
    }
  },
  closeModeMenu: async () => {
    if (!get().modeMenuOpen) {
      return;
    }
    set({ modeMenuOpen: false });
    // Let an in-flight expand finish first so the collapsed restore always lands last.
    if (storeFlags.modeMenuExpandPending) await storeFlags.modeMenuExpandPending;
    if (!prefersReducedMotion()) {
      await new Promise<void>((r) => {
        setTimeout(r, MOTION.fast);
      });
    }
    if (get().modeMenuOpen) {
      return;
    }
    if (get().focusModeActive) {
      await syncFocusModeWindowLayout(false);
    } else {
      await syncWindowLayoutFromSettings(
        get().settings,
        false,
        get().musicTeachingEnabled,
      );
    }
  },
  refreshFocusModeState: async (options) => {
    await refreshFocusModeStateHelper(options);
  },
  expandFocusModeKeyboard: async () => {
    if (!get().focusModeActive || get().isAnimatingWindow) {
      return;
    }
    if (get().focusModeKeyboardVisible && get().focusModeManualExpand) {
      return;
    }
    // Same turn as visible=true so the shell never paints FAB unmount / keyboard flash.
    set({
      modeMenuOpen: false,
      focusModeKeyboardVisible: true,
      focusModeManualExpand: true,
      focusModeSuppressAutoShow: false,
      isAnimatingWindow: true,
    });
    await syncFocusModeWindowLayout(true, { continueHeld: true });
  },
  collapseFocusModeKeyboard: async () => {
    if (!get().focusModeActive || get().isAnimatingWindow) {
      return;
    }
    if (!get().focusModeKeyboardVisible) {
      return;
    }
    const animateContent = !prefersReducedMotion();
    if (animateContent) {
      beginFocusContentAnimWait();
    }
    // Same turn: hide + exit + animating so FAB does not flash on the full strip.
    set({
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusModeSuppressAutoShow: true,
      isAnimatingWindow: true,
      focusContentAnim: animateContent ? "exit" : "idle",
    });
    await syncFocusModeWindowLayout(true, { continueHeld: true });
  },
});
