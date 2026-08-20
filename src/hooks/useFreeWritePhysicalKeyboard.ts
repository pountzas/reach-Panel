import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { greekComposeEnabled } from "../lib/keyboardCharacterInput";
import { isFreeWriteCaptureActive } from "../lib/teaching";
import { isShiftActive } from "../lib/keyboardLayouts";
import {
  physicalKeyFromKeyboardCode,
  greekPhysicalTranslateFallback,
  type LayoutKeyTranslation,
} from "../lib/layoutKeyTranslation";
import { useAppStore } from "../stores/appStore";

function freeWriteModeFromStore(state: ReturnType<typeof useAppStore.getState>) {
  return {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    settings: state.settings,
    languageSubjectTab: state.languageSubjectTab,
    freeWriteFocus: state.freeWriteFocus,
  };
}

/**
 * While Free write notepad capture is active, capture hardware keyboard input
 * on the host window (touchscreen typing still goes through Keyboard.tsx).
 */
export function useFreeWritePhysicalKeyboard() {
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const settings = useAppStore((s) => s.settings);
  const languageSubjectTab = useAppStore((s) => s.languageSubjectTab);
  const freeWriteFocus = useAppStore((s) => s.freeWriteFocus);
  const freeWriteNotepadInput = useAppStore((s) => s.freeWriteNotepadInput);
  const freeWriteNotepadBackspace = useAppStore((s) => s.freeWriteNotepadBackspace);
  const applyFreeWriteLayoutTranslation = useAppStore((s) => s.applyFreeWriteLayoutTranslation);
  const syncWindowFocusable = useAppStore((s) => s.syncWindowFocusable);

  const active = isFreeWriteCaptureActive({
    musicTeachingEnabled,
    teachingLesson,
    settings,
    languageSubjectTab,
    freeWriteFocus,
  });

  useEffect(() => {
    if (!active) return;

    void syncWindowFocusable();
    void WebviewWindow.getCurrent().setFocus().catch(() => {
      // Focus may fail if another app holds foreground.
    });

    let translateQueue = Promise.resolve();

    const queueLayoutTranslation = (physicalKey: string, shift: boolean) => {
      translateQueue = translateQueue.then(async () => {
        const state = useAppStore.getState();
        if (!isFreeWriteCaptureActive(freeWriteModeFromStore(state))) return;
        const translation = await invoke<LayoutKeyTranslation>(
          "cmd_translate_layout_key",
          {
            physicalKey,
            shift,
            hkl: state.physicalKeyState.systemHkl || null,
          },
        );
        applyFreeWriteLayoutTranslation(translation, {
          physicalKey,
          shift,
          fallbackOutput: greekPhysicalTranslateFallback(physicalKey, shift),
        });
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const state = useAppStore.getState();
      if (!isFreeWriteCaptureActive(freeWriteModeFromStore(state))) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) freeWriteNotepadBackspace();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) freeWriteNotepadInput("\n");
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) freeWriteNotepadInput(" ");
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const greek = greekComposeEnabled({
        typingLanguage: state.settings.typingLanguage,
        keyboardLayout: state.keyboardLayout,
        onscreenLayout: state.settings.onscreenLayout,
        languageLessonActive: false,
      });
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

      if (event.key.length !== 1) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;

      if (greek && physicalKey) {
        queueLayoutTranslation(physicalKey, shift);
        return;
      }

      freeWriteNotepadInput(event.key);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      void syncWindowFocusable();
    };
  }, [
    active,
    applyFreeWriteLayoutTranslation,
    freeWriteNotepadBackspace,
    freeWriteNotepadInput,
    syncWindowFocusable,
  ]);
}
