import type { MusicNoteEvent, MusicSong } from "./songs";
import { noteIdToMidi, parseNoteId } from "./pianoKeys";

export type ImportedMusicSong = MusicSong & {
  source: "imported";
  sourcePath?: string;
  importedAt: string;
};

export type MusicTrackCandidate = {
  id: string;
  label: string;
  notes: MusicNoteEvent[];
};

export type ParsedMusicImport = {
  title: string;
  composer?: string;
  tempoBpm: number;
  tracks: MusicTrackCandidate[];
};

const PITCH_RE = /^[A-G]#?\d+$/;

export function isValidPitch(pitch: string): boolean {
  return PITCH_RE.test(pitch) && parseNoteId(pitch) != null;
}

export function normalizeBeats(beats: number): number | null {
  if (!Number.isFinite(beats) || beats <= 0) return null;
  const rounded = Math.round(beats * 1000) / 1000;
  return rounded > 0 ? rounded : null;
}

/** Collapse simultaneous pitches to the highest one for monophonic teaching. */
export function flattenChordToTop(pitches: string[]): string | null {
  if (pitches.length === 0) return null;
  let best = pitches[0]!;
  let bestMidi = noteIdToMidi(best) ?? -1;
  for (let i = 1; i < pitches.length; i++) {
    const pitch = pitches[i]!;
    const midi = noteIdToMidi(pitch);
    if (midi == null) continue;
    if (midi > bestMidi) {
      best = pitch;
      bestMidi = midi;
    }
  }
  return bestMidi >= 0 ? best : null;
}

/**
 * Convert absolute onset times (in beats) + durations into a sequential note list.
 * Spacing until the next onset (including rests) becomes each note's `beats`.
 */
export function onsetsToNoteEvents(
  events: Array<{ onsetBeats: number; durationBeats: number; pitch: string }>,
): MusicNoteEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.onsetBeats - b.onsetBeats);

  const groups: Array<{ onset: number; pitches: string[]; duration: number }> = [];
  for (const event of sorted) {
    if (!isValidPitch(event.pitch)) continue;
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.onset - event.onsetBeats) < 1e-4) {
      last.pitches.push(event.pitch);
      last.duration = Math.max(last.duration, event.durationBeats);
    } else {
      groups.push({
        onset: event.onsetBeats,
        pitches: [event.pitch],
        duration: event.durationBeats,
      });
    }
  }

  const notes: MusicNoteEvent[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    const pitch = flattenChordToTop(group.pitches);
    if (!pitch) continue;
    const nextOnset = groups[i + 1]?.onset;
    const slot =
      nextOnset != null
        ? Math.max(group.duration, nextOnset - group.onset)
        : group.duration;
    const beats = normalizeBeats(slot);
    if (beats == null) continue;
    notes.push({ pitch, beats });
  }
  return notes;
}

/** Prefer densest monophonic track: most notes after chord flattening. */
export function pickDensestMonophonicTrack(
  tracks: MusicTrackCandidate[],
): MusicTrackCandidate | null {
  let best: MusicTrackCandidate | null = null;
  let bestScore = -1;
  for (const track of tracks) {
    if (track.notes.length === 0) continue;
    const score = track.notes.length;
    if (score > bestScore) {
      best = track;
      bestScore = score;
    }
  }
  return best;
}

export function buildImportedSong(options: {
  baseId: string;
  title: string;
  composer?: string;
  tempoBpm: number;
  notes: MusicNoteEvent[];
  sourcePath?: string;
}): ImportedMusicSong {
  const id = `imported-${options.baseId}-${Date.now().toString(36)}`;
  return {
    id,
    title: options.title.trim() || "Imported song",
    composer: options.composer?.trim() || undefined,
    tempoBpm: Math.max(30, Math.min(300, Math.round(options.tempoBpm) || 120)),
    notes: options.notes,
    source: "imported",
    sourcePath: options.sourcePath,
    importedAt: new Date().toISOString(),
  };
}

export function fileExtension(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function fileStem(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function bytesFromBase64(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function textFromBase64(contentBase64: string): string {
  const bytes = bytesFromBase64(contentBase64);
  return new TextDecoder("utf-8").decode(bytes);
}
