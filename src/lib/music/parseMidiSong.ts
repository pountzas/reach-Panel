import { Midi } from "@tonejs/midi";
import {
  buildImportedSong,
  bytesFromBase64,
  onsetsToNoteEvents,
  pickDensestMonophonicTrack,
  type ImportedMusicSong,
  type MusicTrackCandidate,
} from "./importTypes";

function midiToPitch(midi: number): string | null {
  if (!Number.isFinite(midi)) return null;
  const rounded = Math.round(midi);
  if (rounded < 12 || rounded > 127) return null;
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ] as const;
  const name = names[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function parseMidiSongs(
  contentBase64: string,
  options: { sourcePath?: string; fallbackTitle: string },
): ImportedMusicSong[] {
  const bytes = bytesFromBase64(contentBase64);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const midi = new Midi(buffer);
  const tempoBpm = midi.header.tempos[0]?.bpm ?? 120;
  const ppq = midi.header.ppq || 480;

  const tracks: MusicTrackCandidate[] = midi.tracks.map((track, index) => {
    const events = track.notes.map((note) => {
      const pitch = midiToPitch(note.midi) ?? "C4";
      const onsetBeats = note.ticks / ppq;
      const durationBeats = Math.max(0.05, note.durationTicks / ppq);
      return { onsetBeats, durationBeats, pitch };
    });
    const trackName = track.name.trim();
    return {
      id: `track-${index}`,
      label: trackName.length > 0 ? trackName : `Track ${index + 1}`,
      notes: onsetsToNoteEvents(events),
    };
  });

  const chosen = pickDensestMonophonicTrack(tracks);
  if (!chosen) {
    throw new Error("MIDI file contained no playable melody track");
  }

  const midiTitle = midi.name.trim();
  const title = midiTitle.length > 0 ? midiTitle : options.fallbackTitle;
  return [
    buildImportedSong({
      baseId: "midi",
      title,
      tempoBpm,
      notes: chosen.notes,
      sourcePath: options.sourcePath,
    }),
  ];
}
