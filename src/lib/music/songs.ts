import { requiredOctaveCount } from "./pianoKeys";
import type { SynthOctaveCount } from "./octaveCount";

/**
 * Built-in beginner melodies for teaching mode (v1).
 * Extension point: later loaders (MIDI / MusicXML) can map into this shape.
 */
export type MusicSong = {
  id: string;
  title: string;
  composer?: string;
  /** Scientific pitch ids matching piano keys, e.g. "C4", "G#4". */
  notes: string[];
};

export const BUILT_IN_SONGS: MusicSong[] = [
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    composer: "Traditional / Mozart",
    notes: [
      "C4",
      "C4",
      "G4",
      "G4",
      "A4",
      "A4",
      "G4",
      "F4",
      "F4",
      "E4",
      "E4",
      "D4",
      "D4",
      "C4",
      "G4",
      "G4",
      "F4",
      "F4",
      "E4",
      "E4",
      "D4",
      "G4",
      "G4",
      "F4",
      "F4",
      "E4",
      "E4",
      "D4",
      "C4",
      "C4",
      "G4",
      "G4",
      "A4",
      "A4",
      "G4",
      "F4",
      "F4",
      "E4",
      "E4",
      "D4",
      "D4",
      "C4",
    ],
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy",
    composer: "Beethoven",
    notes: [
      "E4",
      "E4",
      "F4",
      "G4",
      "G4",
      "F4",
      "E4",
      "D4",
      "C4",
      "C4",
      "D4",
      "E4",
      "E4",
      "D4",
      "D4",
      "E4",
      "E4",
      "F4",
      "G4",
      "G4",
      "F4",
      "E4",
      "D4",
      "C4",
      "C4",
      "D4",
      "E4",
      "D4",
      "C4",
      "C4",
    ],
  },
  {
    id: "eine-kleine",
    title: "Eine kleine Nachtmusik",
    composer: "Mozart",
    notes: [
      "G4",
      "D5",
      "G4",
      "D5",
      "G4",
      "D5",
      "G4",
      "B4",
      "D5",
      "C5",
      "A4",
      "D5",
      "C5",
      "A4",
      "G4",
      "D5",
      "G4",
      "D5",
      "G4",
      "D5",
      "G4",
      "B4",
      "D5",
      "C5",
      "A4",
      "F#4",
      "G4",
    ],
  },
  {
    id: "hot-cross-buns",
    title: "Hot Cross Buns",
    composer: "Traditional",
    notes: [
      "E4",
      "D4",
      "C4",
      "E4",
      "D4",
      "C4",
      "C4",
      "C4",
      "D4",
      "D4",
      "E4",
      "D4",
      "C4",
    ],
  },
];

export function getSongById(id: string | null | undefined): MusicSong | null {
  if (!id) return null;
  return BUILT_IN_SONGS.find((song) => song.id === id) ?? null;
}

export function songRequiredOctaveCount(song: MusicSong): SynthOctaveCount {
  return requiredOctaveCount(song.notes) ?? 4;
}
