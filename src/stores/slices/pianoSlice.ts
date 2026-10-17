import type { StateCreator } from "zustand";
import type { AppStore, PianoSlice } from "../types";
import { getSongById } from "../../lib/music/songs";

export const createPianoSlice: StateCreator<AppStore, [], [], PianoSlice> = (
  set,
  get,
) => ({
  musicNoteIndex: 0,
  musicPlaybackActive: false,
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
});
