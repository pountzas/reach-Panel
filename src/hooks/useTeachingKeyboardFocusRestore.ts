import { useEffect, useRef } from "react";
import { isLanguageLessonCaptureActive } from "../lib/language";
import {
  isFreeWriteCaptureActive,
  isTeachingKeyboardChromeVisible,
  isTeachingKeyboardTypingTargetActive,
} from "../lib/teaching";
import { useAppStore } from "../stores/appStore";

function isTypingKeyEvent(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const { key } = event;
  if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
    return false;
  }
  if (key === "Escape" || key === "Tab" || key === "CapsLock" || key === "ContextMenu") {
    return false;
  }
  // Printable, Backspace, Enter, Delete, and space restore the keyboard.
  return key.length === 1 || key === "Backspace" || key === "Enter" || key === "Delete";
}

/**
 * Teaching Language/Math: restore a minimized keyboard on in-app input focus or
 * physical typing; when Focus auto-minimize is on, collapse again after blur.
 */
export function useTeachingKeyboardFocusRestore(): void {
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const settings = useAppStore((s) => s.settings);
  const languageSubjectTab = useAppStore((s) => s.languageSubjectTab);
  const freeWriteFocus = useAppStore((s) => s.freeWriteFocus);
  const languageLessonPlaying = useAppStore((s) => s.languageLessonPlaying);
  const languageListAuthoringActive = useAppStore(
    (s) => s.languageListAuthoringActive,
  );
  const minimized = useAppStore((s) => s.teachingKeyboardMinimized);
  const autoFocus = useAppStore((s) => s.teachingKeyboardAutoFocus);
  const setMinimized = useAppStore((s) => s.setTeachingKeyboardMinimized);

  const chromeVisible = isTeachingKeyboardChromeVisible({
    musicTeachingEnabled,
    teachingLesson,
  });

  const typingTargetActive = isTeachingKeyboardTypingTargetActive({
    freeWriteCapture: isFreeWriteCaptureActive({
      musicTeachingEnabled,
      teachingLesson,
      settings,
      languageSubjectTab,
      freeWriteFocus,
    }),
    spellingCapture: isLanguageLessonCaptureActive({
      musicTeachingEnabled,
      teachingLesson,
      settings,
      languageLessonPlaying,
      languageListAuthoringActive,
      languageSubjectTab,
    }),
  });

  const prevTypingRef = useRef(typingTargetActive);

  useEffect(() => {
    const wasActive = prevTypingRef.current;
    prevTypingRef.current = typingTargetActive;
    if (!chromeVisible) return;

    // Rising edge only: an in-app input was just selected → restore.
    if (!wasActive && typingTargetActive) {
      if (minimized) setMinimized(false);
      return;
    }

    // Falling edge with Focus on: the input was left → minimize again.
    if (autoFocus && wasActive && !typingTargetActive && !minimized) {
      setMinimized(true);
    }
  }, [
    chromeVisible,
    typingTargetActive,
    minimized,
    autoFocus,
    setMinimized,
  ]);

  useEffect(() => {
    if (!chromeVisible || !minimized) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTypingKeyEvent(event)) return;
      // Enter/Space on a focused control (e.g. the Restore button) must not
      // restore here, or the button's own click toggles it back to minimized.
      if (
        event.target instanceof Element &&
        event.target.closest("button, [role='button'], [role='tab'], select")
      ) {
        return;
      }
      const state = useAppStore.getState();
      if (
        !isTeachingKeyboardChromeVisible({
          musicTeachingEnabled: state.musicTeachingEnabled,
          teachingLesson: state.teachingLesson,
        })
      ) {
        return;
      }
      if (!state.teachingKeyboardMinimized) return;
      state.setTeachingKeyboardMinimized(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [chromeVisible, minimized]);
}
