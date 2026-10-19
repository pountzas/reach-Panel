import type { StateCreator } from "zustand";
import type { AppStore, PartituresSlice } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { BUILT_IN_SONGS, getSongById } from "../../lib/music/songs";
import type { ImportedMusicSong } from "../../lib/music/importTypes";
import { parseMusicFilePayload } from "../../lib/music/parseMusicFile";
import type { MusicFilePayload } from "../../lib/music/parseMusicFile";
import { isImportedMusicSong } from "../../lib/music/parseJsonSong";
import { notify } from "../../lib/notify";

export const createPartituresSlice: StateCreator<
  AppStore,
  [],
  [],
  PartituresSlice
> = (set, get) => ({
  musicSongId: "twinkle",
  importedSongs: [],
  setMusicSongId: async (songId) => {
    const song = getSongById(songId, get().importedSongs);
    if (!song) return;
    set({ musicSongId: songId, musicNoteIndex: 0, musicPlaybackActive: false });
    await get().fitPianoRangeForSong(song);
  },
  loadImportedSongs: async () => {
    try {
      const songs = await invoke<ImportedMusicSong[]>(
        "cmd_list_imported_songs",
      );
      set({
        importedSongs: Array.isArray(songs)
          ? songs.filter((song) => typeof song.id === "string")
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
      const last = songs.length > 0 ? songs[songs.length - 1] : undefined;
      if (last) {
        await get().setMusicSongId(last.id);
      }
      notify.success(
        songs.length === 1
          ? `Imported “${songs[0].title}”`
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
});
