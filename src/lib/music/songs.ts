import { requiredOctaveCount } from "./pianoKeys";
import type { SynthOctaveCount } from "./octaveCount";

/**
 * Built-in beginner melodies for teaching mode (v1).
 * Extension point: later loaders (MIDI / MusicXML) can map into this shape.
 */
export type MusicNoteEvent = {
  /** Scientific pitch id matching piano keys, e.g. "C4", "G#4". */
  pitch: string;
  /** Duration in quarter-note beats (1 = quarter, 2 = half, 0.5 = eighth). */
  beats: number;
};

export type MusicSong = {
  id: string;
  title: string;
  composer?: string;
  /** Tempo for demo playback (quarter notes per minute). */
  tempoBpm: number;
  notes: MusicNoteEvent[];
};

function n(pitch: string, beats: number): MusicNoteEvent {
  return { pitch, beats };
}

export const BUILT_IN_SONGS: MusicSong[] = [
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    composer: "Traditional / Mozart",
    tempoBpm: 100,
    notes: [
      n("C4", 1),
      n("C4", 1),
      n("G4", 1),
      n("G4", 1),
      n("A4", 1),
      n("A4", 1),
      n("G4", 2),
      n("F4", 1),
      n("F4", 1),
      n("E4", 1),
      n("E4", 1),
      n("D4", 1),
      n("D4", 1),
      n("C4", 2),
      n("G4", 1),
      n("G4", 1),
      n("F4", 1),
      n("F4", 1),
      n("E4", 1),
      n("E4", 1),
      n("D4", 2),
      n("G4", 1),
      n("G4", 1),
      n("F4", 1),
      n("F4", 1),
      n("E4", 1),
      n("E4", 1),
      n("D4", 2),
      n("C4", 1),
      n("C4", 1),
      n("G4", 1),
      n("G4", 1),
      n("A4", 1),
      n("A4", 1),
      n("G4", 2),
      n("F4", 1),
      n("F4", 1),
      n("E4", 1),
      n("E4", 1),
      n("D4", 1),
      n("D4", 1),
      n("C4", 2),
    ],
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy",
    composer: "Beethoven",
    tempoBpm: 110,
    notes: [
      n("E4", 1),
      n("E4", 1),
      n("F4", 1),
      n("G4", 1),
      n("G4", 1),
      n("F4", 1),
      n("E4", 1),
      n("D4", 1),
      n("C4", 1),
      n("C4", 1),
      n("D4", 1),
      n("E4", 1),
      n("E4", 1.5),
      n("D4", 0.5),
      n("D4", 2),
      n("E4", 1),
      n("E4", 1),
      n("F4", 1),
      n("G4", 1),
      n("G4", 1),
      n("F4", 1),
      n("E4", 1),
      n("D4", 1),
      n("C4", 1),
      n("C4", 1),
      n("D4", 1),
      n("E4", 1),
      n("D4", 1.5),
      n("C4", 0.5),
      n("C4", 2),
    ],
  },
  {
    id: "eine-kleine",
    title: "Eine kleine Nachtmusik",
    composer: "Mozart",
    tempoBpm: 120,
    notes: [
      n("G4", 0.5),
      n("D5", 0.5),
      n("G4", 0.5),
      n("D5", 0.5),
      n("G4", 0.5),
      n("D5", 0.5),
      n("G4", 0.5),
      n("B4", 0.5),
      n("D5", 1),
      n("C5", 0.5),
      n("A4", 0.5),
      n("F#4", 0.5),
      n("A4", 0.5),
      n("D5", 0.5),
      n("C5", 0.5),
      n("A4", 0.5),
      n("F#4", 0.5),
      n("G4", 0.5),
      n("D5", 0.5),
      n("G4", 0.5),
      n("D5", 0.5),
      n("G4", 0.5),
      n("D5", 0.5),
      n("G4", 0.5),
      n("B4", 0.5),
      n("D5", 1),
      n("C5", 0.5),
      n("A4", 0.5),
      n("F#4", 1),
      n("G4", 2),
    ],
  },
  {
    id: "hot-cross-buns",
    title: "Hot Cross Buns",
    composer: "Traditional",
    tempoBpm: 96,
    notes: [
      n("E4", 1),
      n("D4", 1),
      n("C4", 2),
      n("E4", 1),
      n("D4", 1),
      n("C4", 2),
      n("C4", 0.5),
      n("C4", 0.5),
      n("C4", 0.5),
      n("C4", 0.5),
      n("D4", 0.5),
      n("D4", 0.5),
      n("D4", 0.5),
      n("D4", 0.5),
      n("E4", 1),
      n("D4", 1),
      n("C4", 2),
    ],
  },
];

export function getSongById(
  id: string | null | undefined,
  importedSongs: MusicSong[] = [],
): MusicSong | null {
  if (!id) return null;
  return (
    BUILT_IN_SONGS.find((song) => song.id === id) ??
    importedSongs.find((song) => song.id === id) ??
    null
  );
}

export function listSelectableSongs(importedSongs: MusicSong[]): {
  builtIn: MusicSong[];
  imported: MusicSong[];
} {
  return { builtIn: BUILT_IN_SONGS, imported: importedSongs };
}

export function songPitches(song: MusicSong): string[] {
  return song.notes.map((note) => note.pitch);
}

export function songRequiredOctaveCount(song: MusicSong): SynthOctaveCount {
  return requiredOctaveCount(songPitches(song)) ?? 4;
}

/** Seconds for one quarter-note beat at the song tempo. */
export function songBeatSeconds(song: MusicSong): number {
  return 60 / Math.max(30, song.tempoBpm);
}
