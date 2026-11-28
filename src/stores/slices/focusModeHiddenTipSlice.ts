import type { StateCreator } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AppStore, FocusModeHiddenTipSlice } from "../types";
import { logError } from "../../lib/log";
import { focusModeHiddenTipOverlaySize } from "../../lib/focusMode";

const FOCUS_MODE_HIDDEN_TIP_AUTO_HIDE_MS = 6000;
import { syncFocusModeWindowLayout } from "../storeShared";
import { storeFlags } from "../storeFlags";

function focusFabCount(state: AppStore): 1 | 2 | 3 {
  const showDictation = state.settings.micMode === true;
  return showDictation ? 3 : 2;
}

export const createFocusModeHiddenTipSlice: StateCreator<
  AppStore,
  [],
  [],
  FocusModeHiddenTipSlice
> = (set, get) => ({
  focusModeHiddenTipDismissed: false,
  focusModeHiddenTipVisible: false,
  focusModeHiddenTipArmed: false,
  hydrateFocusModeHiddenTipDismissed: async () => {
    try {
      const dismissed = await invoke<boolean>(
        "cmd_get_focus_mode_hidden_tip_dismissed",
      );
      set({ focusModeHiddenTipDismissed: dismissed });
    } catch {
      /* unavailable in tests */
    }
  },
  clearFocusModeHiddenTipArming: () => {
    if (storeFlags.focusModeHiddenTipAutoHideTimer !== null) {
      window.clearTimeout(storeFlags.focusModeHiddenTipAutoHideTimer);
      storeFlags.focusModeHiddenTipAutoHideTimer = null;
    }
    const hideVisible = get().focusModeHiddenTipVisible;
    set({
      focusModeHiddenTipArmed: false,
      ...(hideVisible ? { focusModeHiddenTipVisible: false } : {}),
    });
  },
  presentFocusModeHiddenTip: async () => {
    const state = get();
    if (state.focusModeHiddenTipVisible) {
      return;
    }
    if (!state.focusModeHiddenTipArmed) {
      return;
    }
    const eligibleExceptAnim =
      !state.focusModeHiddenTipDismissed &&
      state.settings.micMode !== true &&
      !state.showSettings &&
      !state.modeMenuOpen &&
      state.focusModeActive &&
      !state.focusModeKeyboardVisible;
    if (!eligibleExceptAnim) {
      get().clearFocusModeHiddenTipArming();
      return;
    }
    if (state.isAnimatingWindow) {
      return;
    }
    const { menuWidth, menuHeight } = focusModeHiddenTipOverlaySize(
      focusFabCount(state),
    );
    set({
      focusModeHiddenTipVisible: true,
      focusModeHiddenTipArmed: false,
    });
    try {
      await invoke("cmd_expand_window_for_mode_menu", {
        menuWidth,
        menuHeight,
      });
    } catch (error: unknown) {
      logError("focusMode", "tip overlay expand failed", { error });
      set({ focusModeHiddenTipVisible: false });
      return;
    }
    if (storeFlags.focusModeHiddenTipAutoHideTimer !== null) {
      window.clearTimeout(storeFlags.focusModeHiddenTipAutoHideTimer);
    }
    storeFlags.focusModeHiddenTipAutoHideTimer = setTimeout(() => {
      storeFlags.focusModeHiddenTipAutoHideTimer = null;
      void get().dismissFocusModeHiddenTip({ persist: true });
    }, FOCUS_MODE_HIDDEN_TIP_AUTO_HIDE_MS);
  },
  dismissFocusModeHiddenTip: async ({ persist }) => {
    if (storeFlags.focusModeHiddenTipAutoHideTimer !== null) {
      window.clearTimeout(storeFlags.focusModeHiddenTipAutoHideTimer);
      storeFlags.focusModeHiddenTipAutoHideTimer = null;
    }
    const wasVisible = get().focusModeHiddenTipVisible;
    set({
      focusModeHiddenTipVisible: false,
      focusModeHiddenTipArmed: false,
    });
    if (!wasVisible) return;
    if (persist) {
      try {
        await invoke("cmd_set_focus_mode_hidden_tip_dismissed", {
          dismissed: true,
        });
        set({ focusModeHiddenTipDismissed: true });
      } catch (error: unknown) {
        logError("focusMode", "tip dismiss persist failed", { error });
      }
    }
    if (get().focusModeActive && !get().modeMenuOpen) {
      await syncFocusModeWindowLayout(get, set, false);
    }
  },
});
