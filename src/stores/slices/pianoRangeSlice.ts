import type { StateCreator } from "zustand";
import type { AppStore, PianoRangeSlice } from "../types";
import { songPianoRangeFit } from "../../lib/music/songs";

export const createPianoRangeSlice: StateCreator<
  AppStore,
  [],
  [],
  PianoRangeSlice
> = (_set, get) => ({
  fitPianoRangeForSong: async (song) => {
    const fit = songPianoRangeFit(song);
    if (fit) {
      await get().updateSettings({
        synthesizerOctaveCount: fit.octaveCount,
        synthesizerStartOctave: fit.startOctave,
      });
    }
  },
});
