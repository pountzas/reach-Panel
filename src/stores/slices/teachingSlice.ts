import type { StateCreator } from "zustand";
import type { AppStore, TeachingSlice } from "../types";
import {
  emitTeachingSession,
  emptyLanguageLessonState,
  initLanguageLessonState,
  greekComposeContextFromState,
  languageLessonModeFromState,
  freeWriteModeFromState,
  teachingPdfFileName,
  clearGreekPendingAccent,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { BUILT_IN_SONGS, getSongById, songPianoRangeFit } from "../../lib/music/songs";
import type { ImportedMusicSong } from "../../lib/music/importTypes";
import { parseMusicFilePayload } from "../../lib/music/parseMusicFile";
import type { MusicFilePayload } from "../../lib/music/parseMusicFile";
import { isImportedMusicSong } from "../../lib/music/parseJsonSong";
import { notify } from "../../lib/notify";
import { shouldDelegateAppModeToMain, TEACHING_LESSON_REQUEST_EVENT } from "../../lib/appModeLayout";
import type { TeachingLessonRequest } from "../../lib/appModeLayout";
import { currentSpellAnswer, defaultLanguagePackId, getLanguagePackById, isLanguageLessonActive, isLanguageLessonSpellingActive, languageAnswersMatch } from "../../lib/language";
import {
  clampFreeWriteZoom,
  clearTeachingPdf,
  clonePdfAnnotationDoc,
  createUndoStack,
  emptyPdfAnnotationDoc,
  isFreeWriteCaptureActive,
  migrateToSingleTeachingPdf,
  parsePdfAnnotationJson,
  replaceTeachingPdf,
  serializePdfAnnotationJson,
  suggestedExportFileName,
} from "../../lib/teaching";
import type { TeachingPdfEntry } from "../../lib/teaching";
import { t as translate } from "../../i18n";

const SAVE_DEBOUNCE_MS = 400;
let freeWriteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let freeWriteUndoStack = createUndoStack(50);
let freeWriteAnnotationsPath: string | null = null;

function resetFreeWriteUndo(): void {
  freeWriteUndoStack = createUndoStack(50);
}
import { greekComposeEnabled, processCharacterInput } from "../../lib/keyboardCharacterInput";
import { applyGreekLayoutTranslation } from "../../lib/layoutKeyTranslation";
import type { LanguagePack } from "../../lib/language/types";
import { DEFAULT_LANGUAGE_AGE_BAND } from "../../lib/language/types";

export const createTeachingSlice: StateCreator<
  AppStore,
  [],
  [],
  TeachingSlice
> = (set, get) => ({
  musicTeachingEnabled: false,
  musicSongId: "twinkle",
  musicNoteIndex: 0,
  musicPlaybackActive: false,
  teachingLesson: "language",
  importedSongs: [],
  customLanguagePacks: [],
  languagePackId: null,
  languageTaskIndex: 0,
  languageInputBuffer: "",
  languageAnswerIncorrect: false,
  languageLessonPlaying: false,
  languageListAuthoringActive: false,
  languageListAuthoringField: "title",
  languageListAuthoringHandlers: null,
  languageSubjectTab: "spelling",
  freeWriteFocus: "notepad",
  teachingPdfLibrary: [],
  freeWriteActivePdfId: null,
  freeWritePdfTool: "pen",
  freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
  freeWriteSelectedTextId: null,
  freeWriteAnnotationDirty: false,
  freeWriteUndoDepth: 0,
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
      const fit = songPianoRangeFit(song);
      if (fit) {
        await get().updateSettings({
          synthesizerOctaveCount: fit.octaveCount,
          synthesizerStartOctave: fit.startOctave,
        });
      }
    }
    void get().syncWindowFocusable();
  },
  disableMusicTeaching: async () => {
    if (!get().musicTeachingEnabled) {
      return;
    }
    set({
      musicTeachingEnabled: false,
      musicNoteIndex: 0,
      musicPlaybackActive: false,
      ...emptyLanguageLessonState(),
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
    set({ teachingLesson: lesson, ...nextState });
    void get().syncWindowFocusable();
    if (shouldDelegateAppModeToMain(WebviewWindow.getCurrent().label)) {
      void emit(TEACHING_LESSON_REQUEST_EVENT, {
        lesson,
      } satisfies TeachingLessonRequest);
      return;
    }
    void emitTeachingSession(get);
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
  setMusicSongId: async (songId) => {
    const song = getSongById(songId, get().importedSongs);
    if (!song) return;
    set({ musicSongId: songId, musicNoteIndex: 0, musicPlaybackActive: false });
    const fit = songPianoRangeFit(song);
    if (fit) {
      await get().updateSettings({
        synthesizerOctaveCount: fit.octaveCount,
        synthesizerStartOctave: fit.startOctave,
      });
    }
  },
  restartMusicLesson: () => {
    set({ musicNoteIndex: 0, musicPlaybackActive: false });
  },
  reportMusicKeyPlayed: (keyId) => {
    const {
      musicTeachingEnabled,
      musicPlaybackActive,
      musicSongId,
      musicNoteIndex,
      importedSongs,
    } = get();
    if (!musicTeachingEnabled || musicPlaybackActive) return;
    const song = getSongById(musicSongId, importedSongs);
    if (!song) return;
    if (musicNoteIndex >= song.notes.length) return;
    if (song.notes[musicNoteIndex]?.pitch !== keyId) return;
    set({ musicNoteIndex: musicNoteIndex + 1 });
  },
  startMusicPlayback: () => {
    if (!get().musicTeachingEnabled) return;
    const song = getSongById(get().musicSongId, get().importedSongs);
    if (!song || song.notes.length === 0) return;
    set({ musicPlaybackActive: true, musicNoteIndex: 0 });
  },
  stopMusicPlayback: () => {
    if (!get().musicPlaybackActive) return;
    set({ musicPlaybackActive: false });
  },
  setMusicPlaybackNoteIndex: (index) => {
    if (!get().musicPlaybackActive) return;
    set({ musicNoteIndex: index });
  },
  finishMusicPlayback: () => {
    if (!get().musicPlaybackActive) return;
    set({ musicPlaybackActive: false, musicNoteIndex: 0 });
  },
  loadImportedSongs: async () => {
    try {
      const songs = await invoke<ImportedMusicSong[]>(
        "cmd_list_imported_songs",
      );
      set({
        importedSongs: Array.isArray(songs)
          ? songs.filter((song) => song && typeof song.id === "string")
          : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  importMusicSongsFromFile: async () => {
    try {
      const path = await invoke<string | null>("cmd_pick_music_song_file");
      if (!path) return;
      const payload = await invoke<MusicFilePayload>("cmd_read_music_file", {
        path,
      });
      const songs = await parseMusicFilePayload(payload);
      for (const song of songs) {
        await invoke("cmd_upsert_imported_song", { song });
      }
      await get().loadImportedSongs();
      const last = songs[songs.length - 1];
      if (last) {
        await get().setMusicSongId(last.id);
      }
      notify.success(
        songs.length === 1
          ? `Imported “${songs[0]!.title}”`
          : `Imported ${songs.length} songs`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  deleteImportedSong: async (id) => {
    const song = get().importedSongs.find((entry) => entry.id === id);
    if (!song || !isImportedMusicSong(song)) return;
    try {
      get().stopMusicPlayback();
      await invoke("cmd_delete_imported_song", { id });
      await get().loadImportedSongs();
      if (get().musicSongId === id) {
        await get().setMusicSongId(BUILT_IN_SONGS[0]?.id ?? "twinkle");
      }
      notify.success(`Deleted “${song.title}”`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  loadCustomLanguagePacks: async () => {
    try {
      const packs = await invoke<LanguagePack[]>(
        "cmd_list_custom_language_packs",
      );
      set({
        customLanguagePacks: Array.isArray(packs)
          ? packs.filter((pack) => pack && typeof pack.id === "string")
          : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  createCustomLanguagePack: async (pack) => {
    try {
      await invoke("cmd_upsert_custom_language_pack", { pack });
      await get().loadCustomLanguagePacks();
      get().setLanguagePackId(pack.id);
      notify.success(pack.title);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  deleteCustomLanguagePack: async (id) => {
    const pack = get().customLanguagePacks.find((entry) => entry.id === id);
    if (!pack) return;
    try {
      await invoke("cmd_delete_custom_language_pack", { id });
      await get().loadCustomLanguagePacks();
      if (get().languagePackId === id) {
        const { settings } = get();
        const band =
          settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
        const language = settings.languageLessonLanguage ?? "el";
        get().setLanguagePackId(defaultLanguagePackId(band, language));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  setLanguagePackId: (id) => {
    if (!getLanguagePackById(id, get().customLanguagePacks)) return;
    set({
      languagePackId: id,
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying: false,
      ...clearGreekPendingAccent(),
    });
  },
  restartLanguageLesson: () => {
    set({
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying: false,
      ...clearGreekPendingAccent(),
    });
  },
  startLanguageLessonPlayback: () => {
    const state = get();
    if (!isLanguageLessonActive(languageLessonModeFromState(state))) return;
    const pack = getLanguagePackById(
      state.languagePackId,
      state.customLanguagePacks,
    );
    if (!pack || pack.tasks.length === 0) return;
    set({
      languageLessonPlaying: true,
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      ...clearGreekPendingAccent(),
    });
    void get().syncWindowFocusable();
  },
  stopLanguageLessonPlayback: () => {
    if (!get().languageLessonPlaying) return;
    set({ languageLessonPlaying: false });
    void get().syncWindowFocusable();
  },
  setLanguageListAuthoringActive: (active) => {
    set({
      languageListAuthoringActive: active,
      ...(active
        ? {
            languageLessonPlaying: false,
            languageListAuthoringField: "title" as const,
          }
        : {
            languageListAuthoringField: "title" as const,
            languageListAuthoringHandlers: null,
          }),
    });
    void get().syncWindowFocusable();
  },
  setLanguageListAuthoringField: (field) => {
    set({ languageListAuthoringField: field });
  },
  registerLanguageListAuthoringHandlers: (handlers) => {
    set({ languageListAuthoringHandlers: handlers });
  },
  languageKeyInput: (ch, options) => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get())))
      return;

    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = processCharacterInput(
      state.languageInputBuffer,
      state.greekPendingAccent,
      ch,
      { physicalKey: options?.physicalKey, greekCompose: greek },
    );
    set({
      languageInputBuffer: result.buffer,
      greekPendingAccent: result.pendingAccent,
      languageAnswerIncorrect: false,
    });
  },
  languageBackspace: () => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get())))
      return;
    set((state) => {
      if (state.greekPendingAccent) {
        return {
          ...clearGreekPendingAccent(),
          languageAnswerIncorrect: false,
        };
      }
      return {
        languageInputBuffer: state.languageInputBuffer.slice(0, -1),
        languageAnswerIncorrect: false,
      };
    });
  },
  checkLanguageAnswer: () => {
    const state = get();
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(state)))
      return;
    const pack = getLanguagePackById(
      state.languagePackId,
      state.customLanguagePacks,
    );
    if (!pack) return;
    const expected = currentSpellAnswer(pack, state.languageTaskIndex);
    if (!expected) return;
    const ignoreCase = state.settings.languageLessonIgnoreCase !== false;
    const ignoreTones = state.settings.languageLessonIgnoreTones !== false;
    if (
      !languageAnswersMatch(
        state.languageInputBuffer,
        expected,
        pack.lessonLanguage,
        { ignoreCase, ignoreTones },
      )
    ) {
      set({ languageAnswerIncorrect: true });
      return;
    }
    set({
      languageTaskIndex: state.languageTaskIndex + 1,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying:
        state.languageTaskIndex + 1 >= pack.tasks.length
          ? false
          : state.languageLessonPlaying,
      ...clearGreekPendingAccent(),
    });
  },
  setLanguageSubjectTab: (tab) => {
    if (tab !== "spelling" && get().languageLessonPlaying) {
      get().stopLanguageLessonPlayback();
    }
    set({
      languageSubjectTab: tab,
      freeWriteFocus: tab === "freeWrite" ? "notepad" : get().freeWriteFocus,
    });
    void get().syncWindowFocusable();
  },
  setFreeWriteFocus: (focus) => {
    set({ freeWriteFocus: focus });
    void get().syncWindowFocusable();
  },
  freeWriteNotepadInput: (ch) => {
    if (!isFreeWriteCaptureActive(freeWriteModeFromState(get()))) return;
    const state = get();
    if (state.freeWriteFocus === "pdfText") {
      const textId = state.freeWriteSelectedTextId;
      if (!textId) return;
      get().applyFreeWriteAnnotationUpdater(
        (doc) => {
          const next = clonePdfAnnotationDoc(doc);
          for (const page of Object.values(next.pages)) {
            const box = page.texts.find((t) => t.id === textId);
            if (box) {
              box.body = `${box.body}${ch}`;
              break;
            }
          }
          return next;
        },
        { pushUndo: false },
      );
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
    set({ greekPendingAccent: result.pendingAccent });
    void get().updateSettings({ freeWriteNotepadText: result.buffer });
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
      get().applyFreeWriteAnnotationUpdater(
        (doc) => {
          const next = clonePdfAnnotationDoc(doc);
          for (const page of Object.values(next.pages)) {
            const box = page.texts.find((t) => t.id === textId);
            if (box) {
              box.body = box.body.slice(0, -1);
              break;
            }
          }
          return next;
        },
        { pushUndo: false },
      );
      return;
    }
    if (state.greekPendingAccent) {
      set(clearGreekPendingAccent());
      return;
    }
    const text = state.settings.freeWriteNotepadText ?? "";
    if (!text) return;
    void get().updateSettings({ freeWriteNotepadText: text.slice(0, -1) });
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
    set({ greekPendingAccent: result.pending });
    void get().updateSettings({ freeWriteNotepadText: result.buffer });
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
  loadTeachingPdfLibrary: async () => {
    try {
      const raw = await invoke<TeachingPdfEntry[]>(
        "cmd_list_teaching_pdfs",
      );
      const filtered = Array.isArray(raw)
        ? raw.filter(
            (e) => e && typeof e.id === "string" && typeof e.path === "string",
          )
        : [];
      const { entries, didMigrate } = migrateToSingleTeachingPdf(filtered);
      if (didMigrate) {
        await invoke("cmd_save_teaching_pdfs", { entries });
      }
      const kept = entries[0] ?? null;
      const lastId = get().settings.freeWriteLastPdfId ?? null;
      const freeWriteActivePdfId =
        kept == null
          ? null
          : lastId === kept.id
            ? lastId
            : kept.id;
      set({ teachingPdfLibrary: entries, freeWriteActivePdfId });
      if (kept && lastId !== kept.id) {
        await get().updateSettings({ freeWriteLastPdfId: kept.id });
      }
      if (!kept && lastId) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
      await get().loadFreeWriteAnnotations(kept?.path ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  pickTeachingPdf: async () => {
    try {
      await get().flushFreeWriteAnnotations();
      const path = await invoke<string | null>("cmd_pick_teaching_pdf");
      if (!path) return;
      const existing = get().teachingPdfLibrary.find((e) => e.path === path);
      const entry: TeachingPdfEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        title: teachingPdfFileName(path),
        path,
        lastOpenedAt: new Date().toISOString(),
      };
      const teachingPdfLibrary = replaceTeachingPdf(entry);
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      set({
        teachingPdfLibrary,
        freeWriteActivePdfId: entry.id,
        freeWritePdfTool: "pen",
      });
      await get().updateSettings({ freeWriteLastPdfId: entry.id });
      await get().loadFreeWriteAnnotations(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  closeTeachingPdf: async () => {
    try {
      await get().flushFreeWriteAnnotations();
      const teachingPdfLibrary = clearTeachingPdf();
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      freeWriteAnnotationsPath = null;
      resetFreeWriteUndo();
      set({
        teachingPdfLibrary,
        freeWriteActivePdfId: null,
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWritePdfTool: "pen",
        freeWriteFocus:
          get().freeWriteFocus === "pdf" || get().freeWriteFocus === "pdfText"
            ? "notepad"
            : get().freeWriteFocus,
      });
      if (get().settings.freeWriteLastPdfId) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  setFreeWritePdfTool: (tool) => {
    set({
      freeWritePdfTool: tool,
      freeWriteSelectedTextId:
        tool === "text" ? get().freeWriteSelectedTextId : null,
      freeWriteFocus: tool === "text" ? get().freeWriteFocus : "pdf",
    });
  },
  setFreeWriteSelectedTextId: (id) => {
    set({
      freeWriteSelectedTextId: id,
      freeWriteFocus: id ? "pdfText" : "pdf",
      freeWritePdfTool: id ? "text" : get().freeWritePdfTool,
    });
    void get().syncWindowFocusable();
  },
  loadFreeWriteAnnotations: async (path) => {
    if (freeWriteSaveTimer) {
      clearTimeout(freeWriteSaveTimer);
      freeWriteSaveTimer = null;
    }
    resetFreeWriteUndo();
    freeWriteAnnotationsPath = path;
    if (!path) {
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
      });
      return;
    }
    try {
      const result = await invoke<{ json: string }>(
        "cmd_read_teaching_reach_annotations",
        { path },
      );
      const doc = parsePdfAnnotationJson(result.json);
      set({
        freeWriteAnnotationDoc: doc,
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWritePdfTool: "pen",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
      });
    }
  },
  scheduleSaveFreeWriteAnnotations: () => {
    if (freeWriteSaveTimer) clearTimeout(freeWriteSaveTimer);
    freeWriteSaveTimer = setTimeout(() => {
      freeWriteSaveTimer = null;
      void get().flushFreeWriteAnnotations();
    }, SAVE_DEBOUNCE_MS);
  },
  flushFreeWriteAnnotations: async () => {
    if (freeWriteSaveTimer) {
      clearTimeout(freeWriteSaveTimer);
      freeWriteSaveTimer = null;
    }
    const state = get();
    if (!state.freeWriteAnnotationDirty || !freeWriteAnnotationsPath) return;
    try {
      const result = await invoke<{
        reachPath: string;
        appearanceWarning?: string | null;
      }>("cmd_write_teaching_reach_annotations", {
        path: freeWriteAnnotationsPath,
        json: serializePdfAnnotationJson(state.freeWriteAnnotationDoc),
      });
      set({ freeWriteAnnotationDirty: false });
      if (result.appearanceWarning) {
        notify.info(result.appearanceWarning);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  exportTeachingReachPdf: async (from, to) => {
    const state = get();
    const active =
      state.teachingPdfLibrary.find((e) => e.id === state.freeWriteActivePdfId) ??
      state.teachingPdfLibrary[0] ??
      null;
    if (!active?.path) {
      notify.error(translate(state.settings.uiLanguage, "freeWritePdfEmpty"));
      return;
    }
    try {
      await get().flushFreeWriteAnnotations();
      const suggestedName = suggestedExportFileName(active.path, from, to);
      const destPath = await invoke<string | null>(
        "cmd_pick_teaching_reach_export_path",
        { suggestedName },
      );
      if (!destPath) return;
      const result = await invoke<{
        destPath: string;
        appearanceWarning?: string | null;
      }>("cmd_export_teaching_reach_pdf", {
        sourcePath: active.path,
        fromPage: from,
        toPage: to,
        destPath,
      });
      notify.success(
        translate(state.settings.uiLanguage, "freeWritePdfExportSuccess"),
      );
      if (result.appearanceWarning) {
        notify.info(result.appearanceWarning);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  clearAllFreeWriteAnnotations: async () => {
    const path = freeWriteAnnotationsPath;
    if (!path) {
      resetFreeWriteUndo();
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
      });
      return true;
    }
    try {
      if (freeWriteSaveTimer) {
        clearTimeout(freeWriteSaveTimer);
        freeWriteSaveTimer = null;
      }
      await invoke("cmd_delete_teaching_reach_pdf", { path });
      resetFreeWriteUndo();
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteFocus:
          get().freeWriteFocus === "pdfText" ? "pdf" : get().freeWriteFocus,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
      return false;
    }
  },
  applyFreeWriteAnnotationUpdater: (updater, options) => {
    const current = get().freeWriteAnnotationDoc;
    const next = updater(clonePdfAnnotationDoc(current));
    const pushUndo = options?.pushUndo !== false;
    if (pushUndo) {
      const snapshot = clonePdfAnnotationDoc(options?.undoFrom ?? current);
      freeWriteUndoStack.push({
        undo: () => {
          set({
            freeWriteAnnotationDoc: snapshot,
            freeWriteAnnotationDirty: true,
            freeWriteUndoDepth: freeWriteUndoStack.size(),
          });
          get().scheduleSaveFreeWriteAnnotations();
        },
      });
    }
    set({
      freeWriteAnnotationDoc: next,
      freeWriteAnnotationDirty: true,
      freeWriteUndoDepth: freeWriteUndoStack.size(),
    });
    get().scheduleSaveFreeWriteAnnotations();
  },
  undoFreeWriteAnnotation: () => {
    freeWriteUndoStack.undo();
    set({ freeWriteUndoDepth: freeWriteUndoStack.size() });
  },
});
