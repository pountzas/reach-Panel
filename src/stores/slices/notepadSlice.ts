import type { StateCreator } from "zustand";
import type { AppStore, NotepadSlice } from "../types";
import {
  clearGreekPendingAccent,
  freeWriteModeFromState,
} from "../storeShared";
import {
  clampFreeWriteZoom,
  clonePdfAnnotationDoc,
  isFreeWriteCaptureActive,
} from "../../lib/teaching";
import { greekComposeEnabled, processCharacterInput } from "../../lib/keyboardCharacterInput";
import { applyGreekLayoutTranslation } from "../../lib/layoutKeyTranslation";
import { syncTeachingSuggestions } from "../lib/teachingSuggestions";

export const createNotepadSlice: StateCreator<
  AppStore,
  [],
  [],
  NotepadSlice
> = (set, get) => ({
  freeWriteNotepadInput: (ch) => {
    if (!isFreeWriteCaptureActive(freeWriteModeFromState(get()))) return;
    const state = get();
    if (state.freeWriteFocus === "pdfText") {
      const textId = state.freeWriteSelectedTextId;
      if (!textId) return;
      let nextBody = "";
      get().applyFreeWriteAnnotationUpdater(
        (doc) => {
          const next = clonePdfAnnotationDoc(doc);
          for (const page of Object.values(next.pages)) {
            const box = page.texts.find((t) => t.id === textId);
            if (box) {
              box.body = `${box.body}${ch}`;
              nextBody = box.body;
              break;
            }
          }
          return next;
        },
        { pushUndo: false },
      );
      syncTeachingSuggestions({ get, set, buffer: nextBody });
      return;
    }
    const greek = greekComposeEnabled({
      typingLanguage: state.settings.typingLanguage,
      keyboardLayout: state.keyboardLayout,
      languageLessonActive: true,
      lessonLanguage:
        state.settings.typingLanguage === "el"
          ? "el"
          : state.settings.languageLessonLanguage,
    });
    const text = state.settings.freeWriteNotepadText ?? "";
    const result = processCharacterInput(text, state.greekPendingAccent, ch, {
      greekCompose: greek,
    });
    set({
      greekPendingAccent: result.pendingAccent,
      typedBuffer: result.buffer,
    });
    void get().updateSettings({ freeWriteNotepadText: result.buffer });
    void get().loadSuggestions();
  },
  freeWriteNotepadBackspace: () => {
    if (!isFreeWriteCaptureActive(freeWriteModeFromState(get()))) return;
    const state = get();
    if (state.freeWriteFocus === "pdfText") {
      const textId = state.freeWriteSelectedTextId;
      if (!textId) return;
      if (state.greekPendingAccent) {
        set(clearGreekPendingAccent());
        return;
      }
      let nextBody = "";
      get().applyFreeWriteAnnotationUpdater(
        (doc) => {
          const next = clonePdfAnnotationDoc(doc);
          for (const page of Object.values(next.pages)) {
            const box = page.texts.find((t) => t.id === textId);
            if (box) {
              box.body = box.body.slice(0, -1);
              nextBody = box.body;
              break;
            }
          }
          return next;
        },
        { pushUndo: false },
      );
      syncTeachingSuggestions({ get, set, buffer: nextBody });
      return;
    }
    if (state.greekPendingAccent) {
      set(clearGreekPendingAccent());
      return;
    }
    const text = state.settings.freeWriteNotepadText ?? "";
    if (!text) return;
    const next = text.slice(0, -1);
    set({ typedBuffer: next });
    void get().updateSettings({ freeWriteNotepadText: next });
    void get().loadSuggestions();
  },
  applyFreeWriteLayoutTranslation: (translation, options) => {
    if (!isFreeWriteCaptureActive(freeWriteModeFromState(get()))) return;
    const state = get();
    if (state.freeWriteFocus === "pdfText") {
      const textId = state.freeWriteSelectedTextId;
      if (!textId) return;
      const greek = greekComposeEnabled({
        typingLanguage: state.settings.typingLanguage,
        keyboardLayout: state.keyboardLayout,
        languageLessonActive: true,
        lessonLanguage:
          state.settings.typingLanguage === "el"
            ? "el"
            : state.settings.languageLessonLanguage,
      });
      let currentBody = "";
      for (const page of Object.values(state.freeWriteAnnotationDoc.pages)) {
        const box = page.texts.find((t) => t.id === textId);
        if (box) {
          currentBody = box.body;
          break;
        }
      }
      const result = applyGreekLayoutTranslation(
        currentBody,
        state.greekPendingAccent,
        translation,
        {
          physicalKey: options?.physicalKey,
          shift: options?.shift,
          fallbackOutput: options?.fallbackOutput,
          greekCompose: greek,
        },
      );
      set({ greekPendingAccent: result.pending });
      get().applyFreeWriteAnnotationUpdater(
        (doc) => {
          const next = clonePdfAnnotationDoc(doc);
          for (const page of Object.values(next.pages)) {
            const box = page.texts.find((t) => t.id === textId);
            if (box) {
              box.body = result.buffer;
              break;
            }
          }
          return next;
        },
        { pushUndo: false },
      );
      syncTeachingSuggestions({ get, set, buffer: result.buffer });
      return;
    }
    const greek = greekComposeEnabled({
      typingLanguage: state.settings.typingLanguage,
      keyboardLayout: state.keyboardLayout,
      languageLessonActive: true,
      lessonLanguage:
        state.settings.typingLanguage === "el"
          ? "el"
          : state.settings.languageLessonLanguage,
    });
    const text = state.settings.freeWriteNotepadText ?? "";
    const result = applyGreekLayoutTranslation(
      text,
      state.greekPendingAccent,
      translation,
      {
        physicalKey: options?.physicalKey,
        shift: options?.shift,
        fallbackOutput: options?.fallbackOutput,
        greekCompose: greek,
      },
    );
    set({
      greekPendingAccent: result.pending,
      typedBuffer: result.buffer,
    });
    void get().updateSettings({ freeWriteNotepadText: result.buffer });
    void get().loadSuggestions();
  },
  setFreeWriteNotepadText: (text) => {
    void get().updateSettings({ freeWriteNotepadText: text });
  },
  clearFreeWriteNotepad: () => {
    void get().updateSettings({ freeWriteNotepadText: "" });
  },
  setFreeWriteNotepadZoom: (zoom) => {
    void get().updateSettings({
      freeWriteNotepadZoom: clampFreeWriteZoom(zoom),
    });
  },
  setFreeWriteNotepadWrap: (wrap) => {
    void get().updateSettings({ freeWriteNotepadWrap: wrap });
  },
  setFreeWriteNotepadLineNumbers: (on) => {
    void get().updateSettings({ freeWriteNotepadLineNumbers: on });
  },
});
