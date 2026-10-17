import type { StateCreator } from "zustand";
import type { AppStore, TeachingSlice } from "../types";
import {
  dropTeachingSuggestionPrefix,
  emitTeachingSession,
  emptyLanguageLessonState,
  initLanguageLessonState,
} from "../storeShared";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getSongById } from "../../lib/music/songs";
import { shouldDelegateAppModeToMain, TEACHING_LESSON_REQUEST_EVENT } from "../../lib/appModeLayout";
import type { TeachingLessonRequest } from "../../lib/appModeLayout";
import {
  isTeachingKeyboardChromeVisible,
  nextTeachingKeyboardMinimizeState,
} from "../../lib/teaching/teachingKeyboardMinimize";

const TEACHING_KEYBOARD_MINIMIZE_RESET = nextTeachingKeyboardMinimizeState({
  teachingKeyboardMinimized: false,
  teachingKeyboardAutoFocus: false,
  action: { type: "reset" },
});

export const createTeachingSlice: StateCreator<
  AppStore,
  [],
  [],
  TeachingSlice
> = (set, get) => ({
  musicTeachingEnabled: false,
  teachingLesson: "language",
  languageSubjectTab: "spelling",
  freeWriteFocus: "notepad",
  teachingKeyboardMinimized: false,
  teachingKeyboardAutoFocus: false,
  enableMusicTeaching: async () => {
    const {
      settings,
      musicTeachingEnabled,
      musicSongId,
      importedSongs,
      teachingLesson,
      languagePackId,
    } = get();
    if (musicTeachingEnabled) return;
    set({
      musicTeachingEnabled: true,
      musicNoteIndex: 0,
      musicSongId: musicSongId ?? "twinkle",
      ...(teachingLesson === "language"
        ? initLanguageLessonState(
            settings,
            languagePackId,
            get().customLanguagePacks,
          )
        : emptyLanguageLessonState()),
    });
    const song = getSongById(get().musicSongId, importedSongs);
    if (song) {
      await get().fitPianoRangeForSong(song);
    }
    void get().syncWindowFocusable();
  },
  disableMusicTeaching: async () => {
    if (!get().musicTeachingEnabled) {
      return;
    }
    dropTeachingSuggestionPrefix(set);
    set({
      musicTeachingEnabled: false,
      musicNoteIndex: 0,
      musicPlaybackActive: false,
      ...emptyLanguageLessonState(),
      ...TEACHING_KEYBOARD_MINIMIZE_RESET,
    });
    await emitTeachingSession(get);
    void get().syncWindowFocusable();
  },
  setTeachingLesson: (lesson) => {
    const prev = get().teachingLesson;
    const nextState =
      lesson === "language" && get().musicTeachingEnabled
        ? initLanguageLessonState(
            get().settings,
            get().languagePackId,
            get().customLanguagePacks,
          )
        : prev === "language"
          ? emptyLanguageLessonState()
          : {};
    const chromeStillVisible = isTeachingKeyboardChromeVisible({
      musicTeachingEnabled: get().musicTeachingEnabled,
      teachingLesson: lesson,
    });
    set({
      teachingLesson: lesson,
      ...nextState,
      ...(chromeStillVisible ? {} : TEACHING_KEYBOARD_MINIMIZE_RESET),
    });
    void get().syncWindowFocusable();
    if (shouldDelegateAppModeToMain(WebviewWindow.getCurrent().label)) {
      void emit(TEACHING_LESSON_REQUEST_EVENT, {
        lesson,
      } satisfies TeachingLessonRequest);
      return;
    }
    void emitTeachingSession(get);
  },
  setTeachingKeyboardMinimized: (minimized) => {
    set(
      nextTeachingKeyboardMinimizeState({
        teachingKeyboardMinimized: get().teachingKeyboardMinimized,
        teachingKeyboardAutoFocus: get().teachingKeyboardAutoFocus,
        action: { type: "setMinimized", value: minimized },
      }),
    );
  },
  setTeachingKeyboardAutoFocus: (autoFocus) => {
    set(
      nextTeachingKeyboardMinimizeState({
        teachingKeyboardMinimized: get().teachingKeyboardMinimized,
        teachingKeyboardAutoFocus: get().teachingKeyboardAutoFocus,
        action: { type: "setAutoFocus", value: autoFocus },
      }),
    );
  },
  toggleTeachingKeyboardMinimized: () => {
    get().setTeachingKeyboardMinimized(!get().teachingKeyboardMinimized);
  },
  toggleTeachingKeyboardAutoFocus: () => {
    get().setTeachingKeyboardAutoFocus(!get().teachingKeyboardAutoFocus);
  },
  applyTeachingSession: (payload) => {
    set({
      musicTeachingEnabled: payload.musicTeachingEnabled,
      teachingLesson: payload.teachingLesson,
      settings: {
        ...get().settings,
        keyboardSectionMode: payload.keyboardSectionMode,
      },
    });
  },
  broadcastTeachingSession: async () => {
    await emitTeachingSession(get);
  },
  setLanguageSubjectTab: (tab) => {
    if (tab !== "spelling" && get().languageLessonPlaying) {
      get().stopLanguageLessonPlayback();
    }
    if (tab !== get().languageSubjectTab) {
      dropTeachingSuggestionPrefix(set);
    }
    set({
      languageSubjectTab: tab,
      freeWriteFocus: tab === "freeWrite" ? "notepad" : get().freeWriteFocus,
    });
    void get().syncWindowFocusable();
  },
  setFreeWriteFocus: (focus) => {
    if (focus !== get().freeWriteFocus) {
      dropTeachingSuggestionPrefix(set);
    }
    // Leaving the PDF for notepad exits text-edit mode (pointer + no capture).
    if (
      focus === "notepad" &&
      (get().freeWritePdfTool === "text" || get().freeWriteSelectedTextId)
    ) {
      set({
        freeWriteFocus: "notepad",
        freeWritePdfTool: "pointer",
        freeWriteSelectedTextId: null,
      });
      void get().syncWindowFocusable();
      return;
    }
    set({ freeWriteFocus: focus });
    void get().syncWindowFocusable();
  },
});
