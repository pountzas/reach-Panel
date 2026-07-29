import type { MusicNoteEvent, MusicSong } from "./songs";
import {
  buildImportedSong,
  isValidPitch,
  normalizeBeats,
  type ImportedMusicSong,
} from "./importTypes";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseNoteEvent(value: unknown): MusicNoteEvent | null {
  const record = asRecord(value);
  if (!record) return null;
  const pitch = typeof record.pitch === "string" ? record.pitch.trim() : "";
  const beatsRaw = typeof record.beats === "number" ? record.beats : Number(record.beats);
  if (!isValidPitch(pitch)) return null;
  const beats = normalizeBeats(beatsRaw);
  if (beats == null) return null;
  return { pitch, beats };
}

function parseSongObject(
  value: unknown,
  fallbackTitle: string,
  sourcePath?: string,
): ImportedMusicSong | null {
  const record = asRecord(value);
  if (!record) return null;
  const notesRaw = record.notes;
  if (!Array.isArray(notesRaw)) return null;
  const notes: MusicNoteEvent[] = [];
  for (const item of notesRaw) {
    const note = parseNoteEvent(item);
    if (note) notes.push(note);
  }
  if (notes.length === 0) return null;

  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : fallbackTitle;
  const composer =
    typeof record.composer === "string" && record.composer.trim()
      ? record.composer.trim()
      : undefined;
  const tempoBpm =
    typeof record.tempoBpm === "number"
      ? record.tempoBpm
      : Number(record.tempoBpm) || 120;
  const baseId =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)
      : "json";

  return buildImportedSong({
    baseId: baseId || "json",
    title,
    composer,
    tempoBpm,
    notes,
    sourcePath,
  });
}

/** Parse one or more MusicSong-shaped JSON documents into imported songs. */
export function parseJsonSongs(
  text: string,
  options: { sourcePath?: string; fallbackTitle: string },
): ImportedMusicSong[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON song file");
  }

  const out: ImportedMusicSong[] = [];
  const push = (value: unknown, index: number) => {
    const song = parseSongObject(
      value,
      index > 0 ? `${options.fallbackTitle} ${index + 1}` : options.fallbackTitle,
      options.sourcePath,
    );
    if (song) out.push(song);
  };

  if (Array.isArray(data)) {
    data.forEach((item, index) => push(item, index));
  } else {
    const record = asRecord(data);
    if (record && Array.isArray(record.songs)) {
      record.songs.forEach((item, index) => push(item, index));
    } else {
      push(data, 0);
    }
  }

  if (out.length === 0) {
    throw new Error("JSON file contained no valid songs");
  }
  return out;
}

export function isImportedMusicSong(song: MusicSong): song is ImportedMusicSong {
  return (song as ImportedMusicSong).source === "imported";
}
