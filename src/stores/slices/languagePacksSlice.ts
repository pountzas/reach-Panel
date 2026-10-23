import type { StateCreator } from "zustand";
import type { AppStore, LanguagePacksSlice } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { notify } from "../../lib/notify";
import { defaultLanguagePackId, getLanguagePackById } from "../../lib/language";
import type { LanguagePack } from "../../lib/language/types";
import { DEFAULT_LANGUAGE_AGE_BAND } from "../../lib/language/types";
import { clearGreekPendingAccent } from "../storeShared";

export const createLanguagePacksSlice: StateCreator<
  AppStore,
  [],
  [],
  LanguagePacksSlice
> = (set, get) => ({
  customLanguagePacks: [],
  languagePackId: null,
  loadCustomLanguagePacks: async () => {
    try {
      const packs = await invoke<LanguagePack[]>(
        "cmd_list_custom_language_packs",
      );
      set({
        customLanguagePacks: Array.isArray(packs)
          ? packs.filter((pack) => typeof pack.id === "string")
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
});
