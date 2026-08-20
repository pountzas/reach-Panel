import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { greekComposeEnabled } from "../lib/keyboardCharacterInput";
import {
  getLanguagePackById,
  isLanguageLessonCaptureActive,
  isLanguageLessonSpellingActive,
} from "../lib/language";
import { isShiftActive } from "../lib/keyboardLayouts";
import {
  physicalKeyFromKeyboardCode,
  greekPhysicalTranslateFallback,
  type LayoutKeyTranslation,
} from "../lib/layoutKeyTranslation";
import { useAppStore } from "../stores/appStore";

function languageLessonModeFromStore(state: ReturnType<typeof useAppStore.getState>) {
  return {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    settings: state.settings,
    languageLessonPlaying: state.languageLessonPlaying,
    languageListAuthoringActive: state.languageListAuthoringActive,
    languageSubjectTab: state.languageSubjectTab,
  };
}

function greekLessonComposeContext(state: ReturnType<typeof useAppStore.getState>) {
  const pack = getLanguagePackById(state.languagePackId, state.customLanguagePacks);
  return {
    typingLanguage: state.settings.typingLanguage,
    keyboardLayout: state.keyboardLayout,
    onscreenLayout: state.settings.onscreenLayout,
    languageLessonActive: true as const,
    lessonLanguage: pack?.lessonLanguage ?? state.settings.languageLessonLanguage,
  };
}

/**
 * While Language lesson capture is active (Play or list authoring), capture hardware
 * keyboard input on the host window (touchscreen typing still goes through Keyboard.tsx).
 */
export function useLanguageLessonPhysicalKeyboard() {
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const settings = useAppStore((s) => s.settings);
  const languageLessonPlaying = useAppStore((s) => s.languageLessonPlaying);
  const languageListAuthoringActive = useAppStore((s) => s.languageListAuthoringActive);
  const languageSubjectTab = useAppStore((s) => s.languageSubjectTab);
  const languageKeyInput = useAppStore((s) => s.languageKeyInput);
  const languageBackspace = useAppStore((s) => s.languageBackspace);
  const checkLanguageAnswer = useAppStore((s) => s.checkLanguageAnswer);
  const applyLanguageLayoutTranslation = useAppStore(
    (s) => s.applyLanguageLayoutTranslation,
  );
  const syncWindowFocusable = useAppStore((s) => s.syncWindowFocusable);

  const active = isLanguageLessonCaptureActive({
    musicTeachingEnabled,
    teachingLesson,
    settings,
    languageLessonPlaying,
    languageListAuthoringActive,
    languageSubjectTab,
  });

  useEffect(() => {
    if (!active) return;

    void syncWindowFocusable();
    void WebviewWindow.getCurrent().setFocus().catch(() => {
      // Focus may fail if another app holds foreground; keydown still works when focused.
    });

    // Serialize layout translations so tonos + vowel cannot reorder across async IPC.
    let translateQueue = Promise.resolve();

    const queueLayoutTranslation = (physicalKey: string, shift: boolean) => {
      translateQueue = translateQueue.then(async () => {
        const state = useAppStore.getState();
        const translation = await invoke<LayoutKeyTranslation>(
          "cmd_translate_layout_key",
          {
            physicalKey,
            shift,
            hkl: state.physicalKeyState.systemHkl || null,
          },
        );
        const options = {
          physicalKey,
          shift,
          fallbackOutput: greekPhysicalTranslateFallback(physicalKey, shift),
        };
        if (state.languageListAuthoringActive) {
          state.languageListAuthoringHandlers?.layoutTranslation(translation, options);
          return;
        }
        applyLanguageLayoutTranslation(translation, options);
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const state = useAppStore.getState();
      if (!isLanguageLessonCaptureActive(languageLessonModeFromStore(state))) return;

      const authoring = state.languageListAuthoringActive;
      const handlers = state.languageListAuthoringHandlers;

      if (event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          if (authoring) {
            handlers?.backspace();
          } else {
            languageBackspace();
            if (greekComposeEnabled(greekLessonComposeContext(state))) {
              void invoke("cmd_reset_layout_compose_state", {
                hkl: state.physicalKeyState.systemHkl || null,
              });
            }
          }
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          if (authoring) {
            handlers?.enter();
          } else if (isLanguageLessonSpellingActive(languageLessonModeFromStore(state))) {
            checkLanguageAnswer();
          }
        }
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && authoring) {
          handlers?.keyInput(" ");
        }
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const greek = greekComposeEnabled(greekLessonComposeContext(state));
      const physicalKey = physicalKeyFromKeyboardCode(event.code);
      const shift = isShiftActive(state.physicalKeyState, state.stickyModifiers);

      if (event.key === "Dead") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && greek && physicalKey) {
          queueLayoutTranslation(physicalKey, shift);
        }
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;

      if (greek && physicalKey) {
        queueLayoutTranslation(physicalKey, shift);
        return;
      }

      if (authoring) {
        handlers?.keyInput(event.key, { physicalKey });
        return;
      }

      if (isLanguageLessonSpellingActive(languageLessonModeFromStore(state))) {
        languageKeyInput(event.key, { physicalKey });
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      void syncWindowFocusable();
    };
  }, [
    active,
    applyLanguageLayoutTranslation,
    checkLanguageAnswer,
    languageBackspace,
    languageKeyInput,
    syncWindowFocusable,
  ]);
}
