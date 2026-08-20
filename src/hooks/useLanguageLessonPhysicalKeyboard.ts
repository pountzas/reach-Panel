import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { greekComposeEnabled } from "../lib/keyboardCharacterInput";
import { getLanguagePackById, isLanguageLessonActive } from "../lib/language";
import { isShiftActive } from "../lib/keyboardLayouts";
import {
  physicalKeyFromKeyboardCode,
  greekPhysicalTranslateFallback,
  type LayoutKeyTranslation,
} from "../lib/layoutKeyTranslation";
import { useAppStore } from "../stores/appStore";

function greekLessonComposeContext(state: ReturnType<typeof useAppStore.getState>) {
  const pack = getLanguagePackById(state.languagePackId);
  return {
    typingLanguage: state.settings.typingLanguage,
    keyboardLayout: state.keyboardLayout,
    onscreenLayout: state.settings.onscreenLayout,
    languageLessonActive: true as const,
    lessonLanguage: pack?.lessonLanguage ?? state.settings.languageLessonLanguage,
  };
}

/**
 * While Language lesson is active, capture hardware keyboard input on the host
 * window (touchscreen typing still goes through Keyboard.tsx).
 */
export function useLanguageLessonPhysicalKeyboard() {
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const settings = useAppStore((s) => s.settings);
  const languageKeyInput = useAppStore((s) => s.languageKeyInput);
  const languageBackspace = useAppStore((s) => s.languageBackspace);
  const checkLanguageAnswer = useAppStore((s) => s.checkLanguageAnswer);
  const applyLanguageLayoutTranslation = useAppStore(
    (s) => s.applyLanguageLayoutTranslation,
  );
  const syncWindowFocusable = useAppStore((s) => s.syncWindowFocusable);

  const active = isLanguageLessonActive({
    musicTeachingEnabled,
    teachingLesson,
    settings,
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
        applyLanguageLayoutTranslation(translation, {
          physicalKey,
          shift,
          fallbackOutput: greekPhysicalTranslateFallback(physicalKey, shift),
        });
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLanguageLessonActive(useAppStore.getState())) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          languageBackspace();
          const state = useAppStore.getState();
          if (greekComposeEnabled(greekLessonComposeContext(state))) {
            void invoke("cmd_reset_layout_compose_state", {
              hkl: state.physicalKeyState.systemHkl || null,
            });
          }
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          checkLanguageAnswer();
        }
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const state = useAppStore.getState();
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

      languageKeyInput(event.key, { physicalKey });
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
