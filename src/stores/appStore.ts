import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { prefersReducedMotion } from "../lib/motion";
import type { AppStore } from "./types";
import {
  beginFocusContentAnimWait,
  syncFocusModeWindowLayout,
} from "./storeShared";
import { createErrorsSlice } from "./slices/errorsSlice";
import { createSuggestionsSlice } from "./slices/suggestionsSlice";
import { createDictationSlice } from "./slices/dictationSlice";
import { createCompanionSlice } from "./slices/companionSlice";
import { createTeachingSlice } from "./slices/teachingSlice";
import { createSpellingSlice } from "./slices/spellingSlice";
import { createLanguagePacksSlice } from "./slices/languagePacksSlice";
import { createNotepadSlice } from "./slices/notepadSlice";
import { createPdfSlice } from "./slices/pdfSlice";
import { createPianoSlice } from "./slices/pianoSlice";
import { createPartituresSlice } from "./slices/partituresSlice";
import { createPianoRangeSlice } from "./slices/pianoRangeSlice";
import { createTypingSlice } from "./slices/typingSlice";
import { createWindowSlice } from "./slices/windowSlice";
import { createFocusModeSlice } from "./slices/focusModeSlice";
import { createModeSlice } from "./slices/modeSlice";
import { createProfileSlice } from "./slices/profileSlice";

export type {
  AppStore,
  DictationState,
  SttCapability,
  TeachingLesson,
  LanguageListAuthoringField,
  LanguageListAuthoringHandlers,
  AppModeTablet,
  WindowHeightRatioBeforeTeaching,
} from "./types";

export { notifyFocusContentAnimDone } from "./storeShared";

export const useAppStore = create<AppStore>()((...a) => ({
  ...createProfileSlice(...a),
  ...createErrorsSlice(...a),
  ...createSuggestionsSlice(...a),
  ...createDictationSlice(...a),
  ...createCompanionSlice(...a),
  ...createTeachingSlice(...a),
  ...createSpellingSlice(...a),
  ...createLanguagePacksSlice(...a),
  ...createNotepadSlice(...a),
  ...createPdfSlice(...a),
  ...createPianoSlice(...a),
  ...createPartituresSlice(...a),
  ...createPianoRangeSlice(...a),
  ...createTypingSlice(...a),
  ...createWindowSlice(...a),
  ...createFocusModeSlice(...a),
  ...createModeSlice(...a),
}));


void listen<{ data_url: string }>("input-preview-frame", (event) => {
  useAppStore.setState({ inputPreviewFrame: event.payload.data_url });
});

void listen("input-preview-cleared", () => {
  useAppStore.setState({ inputPreviewFrame: null });
});

/**
 * Focus mode: show keyboard on external editable focus; hide when focus is lost.
 * Manual Expand keeps the keyboard until focus is lost (does not exit Focus mode).
 */
void listen<{ focused: boolean }>("input-focus-changed", (event) => {
  useAppStore.setState({
    externalInputFocused: event.payload.focused,
    ...(event.payload.focused ? {} : { inputPreviewFrame: null }),
  });
  const state = useAppStore.getState();
  if (!state.focusModeActive) return;
  const focused = event.payload.focused;
  if (focused) {
    if (state.modeMenuOpen) {
      useAppStore.setState({ modeMenuOpen: false });
    }
    if (state.settings.micMode === true) {
      if (state.modeMenuOpen) {
        void syncFocusModeWindowLayout(
          useAppStore.getState,
          useAppStore.setState,
          false,
        );
      }
      return;
    }
    if (!state.focusModeKeyboardVisible && !state.focusModeSuppressAutoShow) {
      useAppStore.setState({
        focusModeKeyboardVisible: true,
        isAnimatingWindow: true,
      });
      void syncFocusModeWindowLayout(
        useAppStore.getState,
        useAppStore.setState,
        true,
        { continueHeld: true },
      );
    } else if (state.modeMenuOpen) {
      void syncFocusModeWindowLayout(
        useAppStore.getState,
        useAppStore.setState,
        false,
      );
    }
    return;
  }
  // Focus lost → hide keyboard and clear manual expand / collapse suppression.
  if (
    state.focusModeKeyboardVisible ||
    state.focusModeManualExpand ||
    state.focusModeSuppressAutoShow ||
    state.modeMenuOpen
  ) {
    const animateContent =
      state.focusModeKeyboardVisible && !prefersReducedMotion();
    if (animateContent) {
      beginFocusContentAnimWait();
    }
    useAppStore.setState({
      modeMenuOpen: false,
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusModeSuppressAutoShow: false,
      isAnimatingWindow: true,
      focusContentAnim: animateContent ? "exit" : "idle",
    });
    void syncFocusModeWindowLayout(
      useAppStore.getState,
      useAppStore.setState,
      true,
      { continueHeld: true },
    );
  }
});

// Startup hydration: input-focus-changed only fires on change, so read the current value once.
void invoke<boolean>("cmd_get_input_focused")
  .then((focused) => {
    useAppStore.setState({
      externalInputFocused: focused,
      ...(focused ? {} : { inputPreviewFrame: null }),
    });
  })
  .catch(() => {
    /* keep false */
  });


